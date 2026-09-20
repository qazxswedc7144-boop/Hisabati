import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountService } from '../services/account.service';
import { db } from '../database/db';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { SyncConflictItem } from '@/shared/types';

describe('Sync Engine Hardening Part 1: Lifecycle & Structural Integrity', () => {
  let inMemoryCloudFile: any = null;
  const originalListFiles = googleDriveService.listFiles;
  const originalDownload = googleDriveService.downloadJsonFile;
  const originalUpload = googleDriveService.uploadJsonFile;
  const originalUpdate = googleDriveService.updateJsonFile;
  const originalIsConnected = googleDriveService.isConnected;

  beforeEach(async () => {
    // Initialize Tenant for Test
    await tenantService.initialize();
    useTenantStore.getState().setContext({
      activeOrganization: { id: 'test_org', name: 'Test Org' } as any,
      activeBranch: { id: 'test_branch', name: 'Test Branch' } as any
    });

    await db.transactions.clear();
    await db.accounts.clear();
    await db.syncQueue.clear();
    await db.settings.clear();
    inMemoryCloudFile = null;

    vi.restoreAllMocks();

    vi.spyOn(googleDriveService, 'isConnected').mockReturnValue(true);
    vi.spyOn(googleDriveService, 'listFiles').mockImplementation(async () => {
      if (inMemoryCloudFile) {
        return [{ id: 'f1', name: 'hisabati_sync_state.json', mimeType: 'application/json' }];
      }
      return [];
    });
    vi.spyOn(googleDriveService, 'downloadJsonFile').mockImplementation(async () => inMemoryCloudFile);
    vi.spyOn(googleDriveService, 'uploadJsonFile').mockImplementation(async (name, content) => {
      const meta = await db.settings.get('hisabati_sync_metadata');
      if (meta?.value?.status !== 'syncing') throw new Error('Sync status not correctly set to syncing in DB during upload');
      inMemoryCloudFile = JSON.parse(JSON.stringify(content));
      return { id: 'f1', name };
    });
    vi.spyOn(googleDriveService, 'updateJsonFile').mockImplementation(async (id, name, content) => {
      const meta = await db.settings.get('hisabati_sync_metadata');
      if (meta?.value?.status !== 'syncing') throw new Error('Sync status not correctly set to syncing in DB during update');
      inMemoryCloudFile = JSON.parse(JSON.stringify(content));
      return { id, name };
    });
  });

  it('SYNC-05: Distributed Lock survives in DB settings', async () => {
    const updateSpy = vi.spyOn(googleDriveService, 'updateJsonFile').mockImplementation(async (id, name, content) => {
      const lock = await db.settings.get('hisabati_sync_lock');
      if (!lock || !lock.value) throw new Error('Lock not found in DB during sync');
      inMemoryCloudFile = JSON.parse(JSON.stringify(content));
      return { id, name };
    });

    await syncEngine.performFullSync();
    
    const lockAfter = await db.settings.get('hisabati_sync_lock');
    expect(lockAfter).toBeUndefined();
  });

  it('SYNC-06: Atomic status transitions in DB', async () => {
    await syncEngine.performFullSync();
    // Verification is implicit in the mocks which throw if status isn't 'syncing' during Drive ops
  });

  it('SYNC-07: Remote revision detection and safety', async () => {
    // Establish base
    await syncEngine.performFullSync();
    const meta = await db.settings.get('hisabati_sync_metadata');
    const firstRevision = meta?.value?.lastRevision;
    expect(firstRevision).toBeDefined();

    // Simulate remote moving ahead
    inMemoryCloudFile.revision = firstRevision + 5;
    
    const res = await syncEngine.performFullSync();
    expect(res.success).toBe(true);

    const secondMeta = await db.settings.get('hisabati_sync_metadata');
    expect(secondMeta?.value?.lastRevision).toBeGreaterThanOrEqual(inMemoryCloudFile.revision);
  });

  it('SYNC-08: Conflict resolution routes through Financial Boundary', async () => {
    const acc = await accountService.createAccount({ name: 'Conflict Test Acc', currency: 'YER' });
    const trxId = 'trx_conflict_boundary';
    
    const conflict: SyncConflictItem = {
      id: 'cf_1',
      entityType: 'transaction',
      entityId: trxId,
      localVersion: { 
        title: 'L', 
        updatedAt: '2026-01-01T00:00:00Z', 
        data: { 
          id: trxId, 
          accountId: acc.id, 
          amount: 100,
          amountMinor: 100,
          currency: 'YER',
          type: 'debit',
          date: '2026-01-01',
          operationId: 'op_1'
        } 
      },
      remoteVersion: { 
        title: 'R', 
        updatedAt: '2026-01-02T00:00:00Z', 
        data: { 
          id: trxId, 
          accountId: acc.id,
          type: 'debit',
          amount: 500,
          amountMinor: 500,
          currency: 'YER',
          date: '2026-01-01',
          operationId: 'op_1'
        } 
      },
      detectedAt: 'now',
      resolved: false
    };

    // Use transactionEngine to ensure it exists with all side effects
    await transactionEngine.createTransaction({
      accountId: acc.id,
      type: 'debit',
      amount: 100,
      amountMinor: 100,
      operationId: 'op_1',
      date: '2026-01-01'
    });
    
    // The conflict local data might have a different ID if we used transactionEngine. 
    // Let's force the ID for test purposes
    const actualLocal = (await db.transactions.where('operationId').equals('op_1').first())!;
    conflict.entityId = actualLocal.id;
    conflict.localVersion.data.id = actualLocal.id;
    conflict.remoteVersion.data.id = actualLocal.id;

    await syncEngine.resolveConflict(conflict, 'remote');

    const updatedTrx = await db.transactions.get(actualLocal.id);
    expect(updatedTrx?.amountMinor).toBe(500);
    
    const updatedAcc = await db.accounts.get(acc.id);
    expect(updatedAcc?.currentBalanceMinor).toBe(500);
  });
});
