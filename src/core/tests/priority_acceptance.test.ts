import { describe, it, expect, vi, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { notificationService } from '../services/messaging/notification.service';
import { reminderService } from '../services/messaging/reminder.service';
import { toMinor, fromMinor } from '../utils/money.utils';
import { getDb } from '../database/db';
import { tenantDbManager } from '../database/TenantDatabaseManager';

// Mocking some dependencies
vi.mock('@/core/utils/deviceId', () => ({
  getDeviceId: () => 'test-device',
  getDeviceName: () => 'Test Phone'
}));

vi.mock('@/core/services/rbac/RBACGuard.service', () => ({
  rbacGuard: {
    getActiveActor: () => ({ id: 'user_1' })
  }
}));

describe('Priority 1: Acceptance Tests (T-B, T-E, T-F, T-G)', () => {
  beforeEach(async () => {
    await tenantDbManager.openTenantDatabase('test_priority_org');
    const db = getDb();
    await db.inAppNotifications.clear();
    vi.restoreAllMocks();
  });

  it('T-B: Idempotency atomic - Parallel createNotification', async () => {
    const dto = {
      title: 'Parallel Test',
      body: 'Testing parallel creation',
      type: 'reminder' as any,
      relatedEntityId: 'ent_tb',
    };
    
    // Parallel calls should only result in 1 record because of transaction-based lookup+add
    const results = await Promise.all([
      notificationService.createNotification(dto),
      notificationService.createNotification(dto),
      notificationService.createNotification(dto)
    ]);
    
    const db = getDb();
    const count = await db.inAppNotifications.count();
    
    expect(count).toBe(1);
    expect(results[0].id).toBe(results[1].id);
    expect(results[1].id).toBe(results[2].id);
  });

  it('T-F: Money utils - Currency precision verification', () => {
    // SAR: 2 decimals
    expect(toMinor(10.55, 'SAR')).toBe(1055);
    expect(fromMinor(1055, 'SAR')).toBe(10.55);

    // KWD: 3 decimals
    expect(toMinor(1.234, 'KWD')).toBe(1234);
    expect(fromMinor(1234, 'KWD')).toBe(1.234);

    // JPY: 0 decimals
    expect(toMinor(1500, 'JPY')).toBe(1500);
    expect(fromMinor(1500, 'JPY')).toBe(1500);

    // YER: 0 decimals (per Hisabati config)
    expect(toMinor(50000, 'YER')).toBe(50000);
    expect(fromMinor(50000, 'YER')).toBe(50000);
    
    // USD: 2 decimals
    expect(toMinor(99.99, 'USD')).toBe(9999);
  });

  it('T-G: iOS Safari PWA Standalone check', () => {
    const originalNavigator = global.navigator;
    const originalUserAgent = global.navigator.userAgent;
    const originalWindow = (global as any).window;

    // 1. iOS + NOT standalone = unsupported
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      configurable: true
    });
    (global.navigator as any).standalone = false;
    // Mock window to have Notification
    (global as any).window = { Notification: function() {} };
    
    expect(notificationService.isWebNotificationSupported()).toBe(false);

    // 2. iOS + Standalone = supported
    (global.navigator as any).standalone = true;
    expect(notificationService.isWebNotificationSupported()).toBe(true);

    // 3. Android/Desktop = supported
    Object.defineProperty(global.navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      configurable: true
    });
    expect(notificationService.isWebNotificationSupported()).toBe(true);

    // Clean up
    (global as any).window = originalWindow;
    Object.defineProperty(global.navigator, 'userAgent', { value: originalUserAgent, configurable: true });
    (global.navigator as any).standalone = (originalNavigator as any).standalone;
  });

  it('T-E: Debounce refresh - Spy on fetchDueDebtsAlerts', async () => {
    // We'll test the store directly
    const { useMessagingStore } = await import('@/shared/stores/messagingStore');
    const store = useMessagingStore.getState();
    
    // Spy on reminderService
    const spy = vi.spyOn(reminderService, 'getDueDebtAlerts');
    
    // Trigger multiple times rapidly
    await Promise.all([
      store.fetchDueDebtsAlerts(7),
      store.fetchDueDebtsAlerts(7),
      store.fetchDueDebtsAlerts(7)
    ]);
    
    // If debounced/locked, it should only be called once
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('T-H: Backup Integrity - debts inclusion & transaction safety', async () => {
    const { backupService } = await import('@/core/services/backup.service');
    const db = getDb();
    
    // 1. Seed a debt
    await db.debts.add({
      id: 'debt_test_1',
      accountId: 'acc_priority_1',
      amountMinor: 100000,
      paidMinor: 0,
      remainingMinor: 100000,
      dueDate: '2026-10-10',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    
    // 2. Generate backup
    const payload = await backupService.generateBackupPayload({ internal: true });
    
    // 3. Verify debts inclusion
    expect(payload.debts).toBeDefined();
    expect(payload.debts?.some(d => d.id === 'debt_test_1')).toBe(true);
    
    // 4. Verify integrity hash (crypto check)
    const { verifyBackupIntegrityHash } = await import('@/core/utils/crypto');
    const isValid = await verifyBackupIntegrityHash(payload);
    expect(isValid).toBe(true);
  });
});
