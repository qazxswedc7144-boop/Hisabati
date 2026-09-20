import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { db } from '../database/db';
import { syncEngine, SyncEngine } from '../services/syncEngine.service';
import { accountService } from '../services/account.service';
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
      clearAuth: vi.fn(),
    },
  };
});

describe('Phase 4 - Sync Hardening & Safety Tests', () => {
  beforeEach(async () => {
    await tenantService.initialize();
    useTenantStore.getState().setContext({
      activeOrganization: { id: 'local', name: 'Local Org' } as any,
      activeBranch: { id: 'main', name: 'Main Branch' } as any
    });

    await db.accounts.clear();
    await db.transactions.clear();
    await db.syncQueue.clear();
    await db.syncAuditLogs.clear();
    await db.settings.clear();
    localStorage.clear();
    
    // Mock navigator.locks
    let locked = false;
    Object.defineProperty(global, "navigator", { value: {
        ...global.navigator,
        onLine: true,
        locks: {
          request: async (name: string, options: any, callback: any) => {
            if (locked && options.ifAvailable) {
              return null;
                  }
            locked = true;
            try {
              return await callback({ name });
                    } finally {
              locked = false;
                  }
            }
        }
    }, writable: true, configurable: true });
  });

  afterEach(() => {
    (syncEngine as any).destroy?.();
    vi.restoreAllMocks();
    delete (global as any).navigator.locks;
  });

  describe('SYNC-01: Processing Zombies Recovery', () => {
    it('should recover stale processing items back to pending', async () => {
      await db.syncQueue.add({
        id: 'stale_1',
        entityType: 'account',
        entityId: 'acc_1',
        operation: 'CREATE',
        payload: { id: 'acc_1', name: 'Test' },
        operationId: 'op_acc_1',
        status: 'processing',
        retryCount: 0,
        createdAt: new Date().toISOString()
        });

      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([]);
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue(null);
      vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'file_1' } as any);

      await (syncEngine as any).performFullSync();
      
      const queue = await db.syncQueue.toArray();
      const item = queue.find(q => q.id === 'stale_1');
      expect(item?.status).toBe('completed'); 
    });
  });

  describe('SYNC-02: Account Delete Cascade', () => {
    it('should create tombstones for account and all child transactions when an account is deleted', async () => {
      const accId = 'acc_del_cascade';
      const trxId = 'trx_del_cascade';
      await db.accounts.add({ id: accId, name: 'To Delete', currentBalance: 0 } as any);
      await db.transactions.add({ id: trxId, accountId: accId, amount: 100 } as any);

      await accountService.deleteAccount(accId, true);

      const accCount = await db.accounts.count();
      const trxCount = await db.transactions.count();
      expect(accCount).toBe(0);
      expect(trxCount).toBe(0);

      const tombstonesSetting = await db.settings.get('hisabati_permanent_tombstones');
      expect(tombstonesSetting).toBeDefined();
      const list = tombstonesSetting?.value as Array<{id: string, entityType: string}>;
      
      const accTombstone = list.find(t => t.id === accId && t.entityType === 'account');
      const trxTombstone = list.find(t => t.id === trxId && t.entityType === 'transaction');
      
      expect(accTombstone).toBeDefined();
      expect(trxTombstone).toBeDefined();
    });
  });

  describe('SYNC-03: Multi-Tab Lock', () => {
    it('Two tabs cannot perform sync concurrently using Web Locks', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      
      // Delay the first sync to simulate concurrent second call
      vi.spyOn(googleDriveService, 'listFiles').mockImplementation(async () => {
        await new Promise(r => setTimeout(r, 100));
        return [];
        });
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue(null);
      vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'file_1' } as any);

      const engine1 = new SyncEngine();
      const engine2 = new SyncEngine();
      const promise1 = engine1.performFullSync();
      const promise2 = engine2.performFullSync();

      const [res1, res2] = await Promise.all([promise1, promise2]);
      
      // One must succeed, one must be blocked by the lock
      expect([res1.success, res2.success]).toContain(true);
      expect([res1.success, res2.success]).toContain(false);
      
      const failedRes = !res1.success ? res1 : res2;
      expect(failedRes.message).toContain('قفل المزامنة الموزع نشط');
    });
  });

  describe('SYNC-04: Settings Sync', () => {
    it('should reject unknown or sensitive settings on download', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([{ id: 'file_1', name: 'hisabati_sync_state.json' } as any]);
      
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
        version: 1,
        accounts: [],
        transactions: [],
        tombstones: [],
        settings: [
          { id: "currency", key: "currency", value: 'USD', updatedAt: new Date().toISOString() }, // allowed
          { id: "secret", key: "secret_token", value: 'evil', updatedAt: new Date().toISOString() }, // not allowed
          { id: "theme", key: "themeMode", value: { malicious: 'object' }, updatedAt: new Date().toISOString() } // invalid value type
        ]
        });

      vi.spyOn(googleDriveService, 'uploadJsonFile').mockResolvedValue({ id: 'file_1' } as any);
      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'file_1' } as any);

      await syncEngine.performFullSync();

      const localSettings = await db.settings.toArray();
      const hasCurrency = localSettings.some(s => s.key === 'currency');
      const hasSecret = localSettings.some(s => s.key === 'secret_token');
      const hasThemeMode = localSettings.some(s => s.key === 'themeMode');

      expect(hasCurrency).toBe(true);
      expect(hasSecret).toBe(false);
      expect(hasThemeMode).toBe(false);
      
      const logs = await db.syncAuditLogs.toArray();
      const malformedLogs = logs.filter(l => l.action === 'MALFORMED_DATA_REJECTED');
      expect(malformedLogs.length).toBeGreaterThan(0);
    });
  });

  describe('SYNC-05: Multi-Currency AmountMinor', () => {
    it('Missing currency never silently becomes YER and is rejected', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([{ id: 'file_1', name: 'hisabati_sync_state.json' } as any]);
      
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
        version: 1,
        accounts: [{ id: 'acc_1', name: 'Test', createdAt: new Date().toISOString() }],
        transactions: [{
          id: 'trx_missing_currency',
          accountId: 'acc_1',
          type: 'debit',
          amount: 100, // No currency
          date: '2023-01-01',
          updatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString()
            }],
        tombstones: [],
        settings: []
        });

      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'file_1' } as any);
      
      await syncEngine.performFullSync();

      const savedTrx = await db.transactions.get('trx_missing_currency');
      expect(savedTrx).toBeUndefined(); // REJECTED
      
      const logs = await db.syncAuditLogs.toArray();
      const malformedLogs = logs.filter(l => l.action === 'MALFORMED_DATA_REJECTED');
      expect(malformedLogs.length).toBeGreaterThan(0);
    });

    it('USD transaction uses USD logic and EUR uses EUR logic', async () => {
       const { googleDriveService } = await import('../services/googleDrive.service');
       vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
       vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([{ id: 'file_1', name: 'hisabati_sync_state.json' } as any]);
       vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
         version: 1,
         accounts: [{ id: 'acc_1', name: 'Test', createdAt: new Date().toISOString() }],
         transactions: [
           { id: 'trx_usd', accountId: 'acc_1', type: 'debit', amount: 100, currency: 'USD', createdAt: new Date().toISOString() },
           { id: 'trx_omr', accountId: 'acc_1', type: 'debit', amount: 100, currency: 'OMR', createdAt: new Date().toISOString() } // 3 decimal places
         ],
         });
       vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'file_1' } as any);

       await syncEngine.performFullSync();
       const trxUsd = await db.transactions.get('trx_usd');
       const trxOmr = await db.transactions.get('trx_omr');
       
       expect(trxUsd?.amountMinor).toBe(10000); // USD: 2 decimal places
       expect(trxOmr?.amountMinor).toBe(100000); // OMR: 3 decimal places
    });
  });

  describe('SYNC-06: Tombstone and Audit Log Growth', () => {
    it('Permanent Tombstone still protects deleted record after 365 days', async () => {
      // Setup permanent tombstone
      await db.settings.put({
        id: 'hisabati_permanent_tombstones',
        key: 'hisabati_permanent_tombstones',
        value: [{ id: "deleted_acc_1", entityType: "account", deletedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() }], updatedAt: new Date().toISOString()
        });

      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([{ id: 'file_1', name: 'hisabati_sync_state.json' } as any]);
      
      // Attempt to sync a record with that ID from remote
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
        version: 1,
        accounts: [{ id: 'deleted_acc_1', name: 'I am back!', createdAt: new Date().toISOString() }],
        transactions: []
        });
      vi.spyOn(googleDriveService, 'updateJsonFile').mockResolvedValue({ id: 'file_1' } as any);

      await syncEngine.performFullSync();

      const acc = await db.accounts.get('deleted_acc_1');
      expect(acc).toBeUndefined(); // Should be blocked by permanent tombstone
    });
  });

  describe('SYNC-07: Remote State Validation', () => {
    it('should filter out malformed transactions and accounts', async () => {
      const { googleDriveService } = await import('../services/googleDrive.service');
      vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
      vi.spyOn(googleDriveService, 'listFiles').mockResolvedValue([{ id: 'file_1', name: 'hisabati_sync_state.json' } as any]);
      
      vi.spyOn(googleDriveService, 'downloadJsonFile').mockResolvedValue({
        version: 1,
        accounts: [
          { id: 'acc_valid', name: 'Valid' },
          { id: 'acc_invalid_no_name' },
          null,
          "invalid_string"
        ],
        transactions: [
          { id: 'trx_valid', accountId: 'acc_valid', amount: 100, currency: 'USD' },
          { id: 'trx_invalid_no_account', amount: 100, currency: 'USD' },
          { id: 'trx_invalid_NaN', accountId: 'acc_valid', amount: NaN, currency: 'USD' },
          null
        ],
        tombstones: [],
        settings: []
        });
      
      let uploadedPayload: any;
      vi.spyOn(googleDriveService, 'updateJsonFile').mockImplementation(async (id, name, payload) => {
        uploadedPayload = payload;
        return { id: 'file_1' } as any;
        });

      await syncEngine.performFullSync();

      expect(uploadedPayload.accounts.length).toBe(1);
      expect(uploadedPayload.accounts[0].id).toBe('acc_valid');
      expect(uploadedPayload.transactions.length).toBe(1);
      expect(uploadedPayload.transactions[0].id).toBe('trx_valid');
      
      const logs = await db.syncAuditLogs.toArray();
      const malformedLogs = logs.filter(l => l.action === 'MALFORMED_DATA_REJECTED');
      expect(malformedLogs.length).toBeGreaterThan(0);
    });
  });
});
