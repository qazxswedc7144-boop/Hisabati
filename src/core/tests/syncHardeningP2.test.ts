import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../database/db';
import { syncEngine, SyncEngine } from '../services/syncEngine.service';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';

vi.mock('../services/googleDrive.service', () => {
  return {
    googleDriveService: {
      isConnected: vi.fn(),
      getAccessToken: vi.fn(),
      listFiles: vi.fn(),
      downloadJsonFile: vi.fn(),
      uploadJsonFile: vi.fn(),
      updateJsonFile: vi.fn(),
      deleteFile: vi.fn(),
      getOrCreateAppFolder: vi.fn(),
    },
  };
});

describe('Sync Engine Hardening P2 - State Machine & Revisions', () => {
  beforeEach(async () => {
    await tenantService.initialize();
    useTenantStore.getState().setContext({
      activeOrganization: { id: 'local', name: 'Local Org' } as any
    });

    await db.accounts.clear();
    await db.transactions.clear();
    await db.syncQueue.clear();
    await db.syncAuditLogs.clear();
    await db.settings.clear();
    
    // Mock navigator.locks
    let locked = false;
    Object.defineProperty(global, "navigator", { value: {
        ...global.navigator,
        onLine: true,
        locks: {
          request: async (name: string, options: any, callback: any) => {
            if (locked && options.ifAvailable) return null;
            locked = true;
            try { return await callback({ name }); } finally { locked = false; }
          }
        }
    }, writable: true, configurable: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('SYNC-06: Hardened State Machine & Recovery', () => {
    it('should recover prepared/uploaded items back to pending on next sync start', async () => {
      // 1. Setup items in various intermediate states
      await db.syncQueue.bulkAdd([
        { id: 'item_1', status: 'prepared', entityType: 'account', entityId: 'a1', operation: 'CREATE', createdAt: '2023-01-01', operationId: 'op1', retryCount: 0 },
        { id: 'item_2', status: 'uploaded', entityType: 'account', entityId: 'a2', operation: 'CREATE', createdAt: '2023-01-02', operationId: 'op2', retryCount: 0 },
      ] as any);

      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([]);
      vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'f1' } as any);

      // 2. Perform sync. Recovery logic should move them to pending then process them normally.
      await syncEngine.performFullSync();

      const items = await db.syncQueue.toArray();
      expect(items.every(i => i.status === 'completed')).toBe(true);
    });
  });

  describe('SYNC-07: Revision Race Protection', () => {
    it('should throw error if remote revision changes during local processing', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      
      // Mock listFiles to return revision 1 initially
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValueOnce([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any
      ]);
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({ revision: 1, accounts: [], transactions: [] });

      // Add a pending item so it triggers a push
      await db.syncQueue.add({ id: 'q1', status: 'pending', entityType: 'account', entityId: 'a1', operation: 'CREATE', createdAt: '2023-01-01', operationId: 'op1', retryCount: 0 });

      // Mock listFiles again to return revision 2 (race condition)
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 2 } } as any
      ]);

      await expect(syncEngine.performFullSync()).rejects.toThrow(/تم تحديث البيانات السحابية بواسطة جهاز آخر/);
      
      const item = await db.syncQueue.get('q1');
      expect(item?.status).toBe('pending');
      expect(item?.retryCount).toBe(1);
    });
  });

  describe('SYNC-08: Financial Boundary Verification', () => {
    it('should reject remote transactions with invalid amountMinor', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([{ name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any]);
      
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
        revision: 1,
        accounts: [{ id: 'acc1', name: 'Acc 1', currency: 'USD', updatedAt: new Date().toISOString() }],
        transactions: [
          { id: 'trx_invalid', accountId: 'acc1', amount: 100, amountMinor: 100.5, currency: 'USD', date: '2023-01-01', type: 'debit', updatedAt: new Date().toISOString() }, // amountMinor must be integer
          { id: 'trx_missing_minor', accountId: 'acc1', amount: 50, currency: 'USD', date: '2023-01-01', type: 'debit', updatedAt: new Date().toISOString() } // should be accepted as we can derive it
        ]
      });

      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1' } as any);

      await syncEngine.performFullSync();

      const acc = await db.accounts.get('acc1');
      expect(acc).toBeDefined();

      const trxInvalid = await db.transactions.where('operationId').equals('remote_trx_invalid').first();
      const trxValid = await db.transactions.where('operationId').equals('remote_trx_missing_minor').first();

      const logs = await db.syncAuditLogs.toArray();
      const malformedLogs = logs.filter(l => l.action === 'MALFORMED_DATA_REJECTED');
      
      if (!trxValid) {
        console.log('SYNC QUEUE:', JSON.stringify(await db.syncQueue.toArray(), null, 2));
        console.log('TRANSACTIONS:', JSON.stringify(await db.transactions.toArray(), null, 2));
      }

      expect(trxInvalid).toBeUndefined();
      expect(trxValid).toBeDefined();
      expect(trxValid?.amountMinor).toBe(5000);
      expect(malformedLogs.length).toBeGreaterThan(0);
    });
  });

  describe('SYNC-09: Upload Acknowledgment & Readback Hardening', () => {
    it('should reject completion if remote acknowledgment revision is lagging', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      
      // Initial listFiles returns revision 1
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValueOnce([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any
      ]);
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({ revision: 1, accounts: [], transactions: [] });

      await db.syncQueue.add({ id: 'q_ack', status: 'pending', entityType: 'account', entityId: 'a1', operation: 'CREATE', createdAt: '2023-01-01', operationId: 'op_ack', retryCount: 0 });

      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1' } as any);

      // Subsequent listFiles (for race check and ack readback) returns lagging revision 1 instead of 2
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any
      ]);

      await expect(syncEngine.performFullSync()).rejects.toThrow(/فشل تأكيد الرفع/);

      const item = await db.syncQueue.get('q_ack');
      expect(item?.status).not.toBe('completed');
    });

    it('should prevent tombstone resurrection during sync pull', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      
      // Add permanent tombstone for account 'acc_deleted'
      await db.settings.put({
        id: 'hisabati_permanent_tombstones',
        key: 'hisabati_permanent_tombstones',
        value: [{ id: 'acc_deleted', entityType: 'account', deletedAt: '2023-01-01' }],
        updatedAt: new Date().toISOString()
      });

      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any
      ]);

      // Remote data tries to recreate 'acc_deleted'
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
        revision: 1,
        accounts: [{ id: 'acc_deleted', name: 'Resurrected Account', currency: 'USD', updatedAt: new Date().toISOString() }],
        transactions: []
      });

      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1' } as any);

      await syncEngine.performFullSync();

      const acc = await db.accounts.get('acc_deleted');
      expect(acc).toBeUndefined(); // Tombstone protected against resurrection
    });
  });

  describe('SYNC-10: Deterministic Revision Race & Readback Integrity Closure', () => {
    it('should execute deterministic call count revision race test and abort write without updating remote file', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);

      let listCallCount = 0;
      vi.spyOn(googleDriveService, 'listFiles').mockImplementation(async () => {
        listCallCount++;
        if (listCallCount === 1) {
          return [{ name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any];
        } else {
          return [{ name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 2 } } as any];
        }
      });

      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({ revision: 1, accounts: [], transactions: [] });
      const updateSpy = vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1' } as any);

      await db.syncQueue.add({
        id: 'q_det_race',
        status: 'pending',
        entityType: 'account',
        entityId: 'acc_det',
        operation: 'CREATE',
        createdAt: '2023-01-01',
        operationId: 'op_det_race',
        retryCount: 0
      });

      await expect(syncEngine.performFullSync()).rejects.toThrow(/تم تحديث البيانات السحابية بواسطة جهاز آخر/);
      expect(updateSpy).not.toHaveBeenCalled();

      const item = await db.syncQueue.get('q_det_race');
      expect(item?.status).toBe('pending');
      expect(item?.retryCount).toBe(1);
    });

    it('should fail readback integrity if revision matches but content account/transaction counts do not match', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);

      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any
      ]);

      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValueOnce({ revision: 1, accounts: [], transactions: [] });

      await db.syncQueue.add({
        id: 'q_content_mismatch',
        status: 'pending',
        entityType: 'account',
        entityId: 'acc_m1',
        operation: 'CREATE',
        createdAt: '2023-01-01',
        operationId: 'op_content_mismatch',
        retryCount: 0
      });

      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1' } as any);

      // Readback returns revision 2 (correct revision) but empty accounts array when local had 1 account created
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValueOnce({
        revision: 2,
        accounts: [], // mismatch
        transactions: []
      });

      await expect(syncEngine.performFullSync()).rejects.toThrow(/فشل تأكيد الرفع والتحقق من النزاهة/);

      const item = await db.syncQueue.get('q_content_mismatch');
      expect(item?.status).not.toBe('completed');
    });

    it('should prevent completion on readback network error', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);

      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([
        { name: 'hisabati_sync_state.json', id: 'f1', metadata: { revision: 1 } } as any
      ]);
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValueOnce({ revision: 1, accounts: [], transactions: [] });
      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'f1' } as any);

      vi.spyOn(googleDriveService, 'downloadJsonFile').mockRejectedValueOnce(new Error('Network failure during readback'));

      await db.syncQueue.add({
        id: 'q_readback_err',
        status: 'pending',
        entityType: 'account',
        entityId: 'acc_err',
        operation: 'CREATE',
        createdAt: '2023-01-01',
        operationId: 'op_readback_err',
        retryCount: 0
      });

      await expect(syncEngine.performFullSync()).rejects.toThrow();

      const item = await db.syncQueue.get('q_readback_err');
      expect(item?.status).not.toBe('completed');
    });
  });
});

