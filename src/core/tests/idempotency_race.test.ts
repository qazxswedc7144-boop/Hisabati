import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { notificationService } from '../services/messaging/notification.service';
import { getDb } from '../database/db';

describe('Notification Idempotency Race Condition Test', () => {
  beforeEach(async () => {
    const db = getDb();
    await db.inAppNotifications.clear();
  });

  it('should only save one notification when multiple parallel calls are made with same idempotency key', async () => {
    const dto = {
      title: 'Test Alert',
      body: 'This is a test',
      type: 'reminder' as any,
      relatedEntityId: 'acc_123',
    };

    // Simulate parallel calls
    const promises = [
      notificationService.createNotification(dto),
      notificationService.createNotification(dto),
      notificationService.createNotification(dto),
    ];

    const results = await Promise.all(promises);
    
    const db = getDb();
    const count = await db.inAppNotifications.count();
    
    expect(count).toBe(1);
    expect(results[0].id).toBe(results[1].id);
    expect(results[1].id).toBe(results[2].id);
  });
});
