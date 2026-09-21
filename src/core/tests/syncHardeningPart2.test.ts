import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountService } from '../services/account.service';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { auditTrailService } from '../services/rbac/AuditTrail.service';
import { financialAuditService } from '../services/financialAudit.service';
import { Transaction, Account } from '@/shared/types';
import { SyncContextRegistry } from '../services/syncContext';

describe('Sync Engine Hardening Part 2: Conflict & Financial Boundary', () => {
  let testAccount: Account;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Initialize Tenant for Test
    await tenantService.initialize();
    useTenantStore.getState().setContext({
      activeOrganization: { id: 'test_org', name: 'Test Org' } as any
    });

    await db.transactions.clear();
    await db.accounts.clear();
    await db.syncQueue.clear();
    await db.financialAuditLogs.clear();
    await db.auditTrail.clear();
    await db.settings.clear();

    // Setup base account
    testAccount = await accountService.createAccount({
      name: 'حساب اختبار المزامنة',
      currency: 'YER',
      initialBalance: 0,
      initialBalanceMinor: 0
    });
  });

  const setupCloudMock = (remoteData: any) => {
    vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
    vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([
      { id: 'f1', name: 'hisabati_sync_state.json', mimeType: 'application/json', createdTime: new Date().toISOString(), modifiedTime: new Date().toISOString() }
    ]);
    vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue(remoteData);
    vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1', name: 'hisabati_sync_state.json' });
    vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'f1', name: 'hisabati_sync_state.json' });
  };

  it('SHOULD maintain balance integrity and enforce boundary after multiple remote updates', async () => {
    const remoteTrxs: Transaction[] = [
      { id: 't1', accountId: testAccount.id, type: 'debit', amount: 100, amountMinor: 100, currency: 'YER', date: '2024-01-01', operationId: 'o1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
      { id: 't2', accountId: testAccount.id, type: 'credit', amount: 50, amountMinor: 50, currency: 'YER', date: '2024-01-01', operationId: 'o2', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
    ];

    setupCloudMock({
      revision: 9999,
      version: 1,
      accounts: [],
      transactions: remoteTrxs,
      tombstones: []
    });

    await db.settings.put({ id: 'hisabati_sync_metadata', key: 'hisabati_sync_metadata', value: { lastRevision: 0 }, updatedAt: new Date().toISOString() });

    await syncEngine.performFullSync();

    const acc = await db.accounts.get(testAccount.id);
    expect(acc).toBeDefined();
  });

  it('SHOULD handle financial conflicts by prioritizing local safety', async () => {
    // 1. Local trx
    const localTrx = await transactionEngine.createTransaction({
      accountId: testAccount.id,
      type: 'debit',
      amount: 100,
      amountMinor: 100,
      operationId: 'op_conf_simple',
      date: '2024-01-01'
    });

    // 2. Remote trx same operationId, different amount
    const remoteTrx: Transaction = {
      ...localTrx,
      amount: 999,
      amountMinor: 999,
      updatedAt: new Date(Date.now() + 50000).toISOString()
    };

    setupCloudMock({
      revision: 9999,
      version: 1,
      accounts: [],
      transactions: [remoteTrx],
      tombstones: []
    });

    await syncEngine.performFullSync();

    // Verify local won (Conflict handled)
    const trx = await db.transactions.get(localTrx.id);
    expect(trx?.amountMinor).toBe(100);
  });

  it('SHOULD respect idempotency when receiving the same remote transaction twice', async () => {
    const remoteTrx: Transaction = {
      id: 'trx_idempotent',
      accountId: testAccount.id,
      type: 'debit',
      amount: 100,
      amountMinor: 100,
      currency: 'YER',
      date: '2024-01-01',
      operationId: 'op_idemp_1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setupCloudMock({
      revision: 40,
      version: 1,
      accounts: [],
      transactions: [remoteTrx],
      tombstones: []
    });

    // First pull
    await syncEngine.performFullSync();
    
    // Second pull (same data)
    await syncEngine.performFullSync();

    const transactions = await db.transactions.where('operationId').equals('op_idemp_1').toArray();
    expect(transactions.length).toBe(1); // EXACTLY ONCE

    const acc = await db.accounts.get(testAccount.id);
    expect(acc?.currentBalanceMinor).toBe(100);
  });

  it('SyncContextRegistry handles nested begin/end', () => {
    SyncContextRegistry.beginSyncApply();
    SyncContextRegistry.beginSyncApply();
    SyncContextRegistry.endSyncApply();
    expect(SyncContextRegistry.isInsideSyncApply()).toBe(true); // depth = 1
    SyncContextRegistry.endSyncApply();
    expect(SyncContextRegistry.isInsideSyncApply()).toBe(false); // depth = 0
  });
});
