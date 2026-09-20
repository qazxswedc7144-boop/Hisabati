import { describe, it, expect, beforeAll } from 'vitest';
import 'fake-indexeddb/auto';
import { getDb } from '../database/db';
import { backupService } from '../services/backup.service';
import { tenantDbManager } from '../database/TenantDatabaseManager';

describe('T-COMPAT: Backup Compatibility Tests', () => {
  beforeAll(async () => {
    await tenantDbManager.openTenantDatabase('compat_test');
    const db = getDb();
    await db.accounts.clear();
  });

  it('T-COMPAT: V4 backup with archived=true restores correctly as 1', async () => {
    const oldBackup = {
      metadata: {
        backupId: 'bck_old_123',
        backupSchemaVersion: 2,
        appVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        deviceId: 'test_dev',
        accountCount: 1,
        transactionCount: 0
      },
      accounts: [
        { 
          id: 'acc_old_archived', 
          name: 'Old Archived Account', 
          archived: true, // Legacy boolean
          currentBalance: 0,
          currentBalanceMinor: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        { 
          id: 'acc_old_active', 
          name: 'Old Active Account', 
          archived: false, // Legacy boolean
          currentBalance: 0,
          currentBalanceMinor: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      ],
      transactions: [],
      settings: [],
      debts: []
    };

    // We skip safety backup and internal checks for this test
    const result = await backupService.restoreFromPayload(oldBackup, 'replace', { skipSafetyBackup: true, internal: true });
    expect(result.success).toBe(true);

    const db = getDb();
    const acc1 = await db.accounts.get('acc_old_archived');
    const acc2 = await db.accounts.get('acc_old_active');

    console.log('Restored acc_old_archived.archived:', acc1?.archived);
    console.log('Restored acc_old_active.archived:', acc2?.archived);

    expect(acc1?.archived).toBe(1);
    expect(acc2?.archived).toBe(0);
  });
});
