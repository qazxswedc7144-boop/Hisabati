/**
 * Cloud Sync Engine for Hisabati.
 * Manages local mutation queues, conflict detection, idempotent replication,
 * best-effort automatic background synchronization, and network backoff.
 */

import { db } from '../database/db';
import {
  SyncQueueItem,
  SyncConflictItem,
  SyncAuditLogEntry,
  SyncStatusType,
  Account,
  Transaction,
} from '@/shared/types';
import { getDeviceId, getDeviceName } from '../utils/deviceId';
import { googleDriveService } from './googleDrive.service';
import { transactionEngine } from './transactionEngine.service';
import { integrityService } from './integrity.service';

const SYNC_STATE_FILE = 'hisabati_sync_state.json';
const MAX_RETRIES = 5;

export class SyncEngine {
  private isSyncing = false;
  private syncListeners: Array<(status: SyncStatusType) => void> = [];
  private conflictListeners: Array<(conflicts: SyncConflictItem[]) => void> = [];
  private autoSyncTimer: any = null;

  constructor() {
    this.setupNetworkListeners();
  }

  public subscribeStatus(listener: (status: SyncStatusType) => void): () => void {
    this.syncListeners.push(listener);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  public subscribeConflicts(listener: (conflicts: SyncConflictItem[]) => void): () => void {
    this.conflictListeners.push(listener);
    return () => {
      this.conflictListeners = this.conflictListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatus(status: SyncStatusType): void {
    this.syncListeners.forEach((l) => l(status));
  }

  private notifyConflicts(conflicts: SyncConflictItem[]): void {
    this.conflictListeners.forEach((l) => l(conflicts));
  }

  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        // Auto trigger sync if connected
        this.processQueueBestEffort();
      });
    }
  }

  /**
   * Enqueues a local mutation to be synchronized with Google Drive.
   */
  public async enqueueMutation(
    entityType: 'account' | 'transaction' | 'setting',
    entityId: string,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload?: any,
    operationId?: string
  ): Promise<void> {
    const queueItem: SyncQueueItem = {
      id: 'sq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      entityType,
      entityId,
      operation,
      operationId: operationId || `op_${entityId}_${Date.now()}`,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };

    await db.syncQueue.add(queueItem);

    // Trigger best effort sync if online
    if (navigator.onLine && googleDriveService.isConnected()) {
      this.processQueueBestEffort();
    }
  }

  /**
   * Returns current pending sync mutations count.
   */
  public async getPendingCount(): Promise<number> {
    return await db.syncQueue.where('status').equals('pending').count();
  }

  /**
   * Logs an audit record for sync operations.
   */
  public async logAudit(
    action: SyncAuditLogEntry['action'],
    details: string,
    success: boolean
  ): Promise<void> {
    const entry: SyncAuditLogEntry = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      action,
      details,
      deviceId: getDeviceId(),
      timestamp: new Date().toISOString(),
      success,
    };
    try {
      await db.syncAuditLogs.add(entry);
    } catch {
      // ignore
    }
  }

  /**
   * Main Synchronization Procedure:
   * 1. Pull remote state from Google Drive
   * 2. Detect and handle conflicts
   * 3. Merge safe remote additions/updates/tombstones into local DB
   * 4. Push local queue mutations up to Google Drive state
   * 5. Recalculate financial balances and verify integrity
   */
  public async performFullSync(): Promise<{
    success: boolean;
    conflicts: SyncConflictItem[];
    message: string;
    pulledCount: number;
    pushedCount: number;
  }> {
    if (this.isSyncing) {
      return { success: false, conflicts: [], message: 'عملية مزامنة أخرى جارية حالياً', pulledCount: 0, pushedCount: 0 };
    }

    if (!googleDriveService.isConnected()) {
      return { success: false, conflicts: [], message: 'يرجى ربط حساب Google Drive أولاً', pulledCount: 0, pushedCount: 0 };
    }

    this.isSyncing = true;
    this.notifyStatus('syncing');
    await this.logAudit('SYNC_START', 'بدء عملية المزامنة الثنائية مع Google Drive', true);

    const conflicts: SyncConflictItem[] = [];
    let pulledCount = 0;
    let pushedCount = 0;

    try {
      // 1. Fetch remote sync state file if exists
      const files = await googleDriveService.listFiles();
      const syncFile = files.find((f) => f.name === SYNC_STATE_FILE);

      let remoteData: {
        version: number;
        deviceId: string;
        lastModified: string;
        accounts: Account[];
        transactions: Transaction[];
      } | null = null;

      if (syncFile) {
        remoteData = await googleDriveService.downloadJsonFile(syncFile.id);
      }

      // 2. If remote data exists, merge into local database
      if (remoteData && Array.isArray(remoteData.accounts) && Array.isArray(remoteData.transactions)) {
        const localAccounts = await db.accounts.toArray();
        const localTransactions = await db.transactions.toArray();

        const localAccMap = new Map(localAccounts.map((a) => [a.id, a]));
        const localTrxMap = new Map(localTransactions.map((t) => [t.id, t]));
        const localOpIdMap = new Map(localTransactions.filter((t) => !!t.operationId).map((t) => [t.operationId!, t]));

        // Merge Remote Accounts
        for (const remAcc of remoteData.accounts) {
          const local = localAccMap.get(remAcc.id);
          if (!local) {
            // New account from remote device
            await db.accounts.put(remAcc);
            pulledCount++;
          } else {
            // Check conflict / updated timestamp
            if (remAcc.updatedAt > local.updatedAt) {
              await db.accounts.put(remAcc);
              pulledCount++;
            }
          }
        }

        // Merge Remote Transactions
        for (const remTrx of remoteData.transactions) {
          // Check for matching ID or matching OperationId (Idempotency)
          const existingById = localTrxMap.get(remTrx.id);
          const existingByOp = remTrx.operationId ? localOpIdMap.get(remTrx.operationId) : undefined;

          const localMatch = existingById || existingByOp;

          if (!localMatch) {
            // Safe remote insertion
            await db.transactions.put(remTrx);
            pulledCount++;
          } else {
            // Check if amounts or critical attributes conflict while both edited concurrently
            if (localMatch.updatedAt !== remTrx.updatedAt) {
              if (localMatch.amount !== remTrx.amount || localMatch.type !== remTrx.type) {
                // Meaningful financial conflict detected
                conflicts.push({
                  id: 'cf_' + remTrx.id,
                  entityType: 'transaction',
                  entityId: remTrx.id,
                  localVersion: {
                    title: `المعاملة محلياً (${localMatch.amount} ${localMatch.type === 'debit' ? 'لك' : 'عليك'})`,
                    updatedAt: localMatch.updatedAt,
                    data: localMatch,
                  },
                  remoteVersion: {
                    title: `المعاملة في السحابة (${remTrx.amount} ${remTrx.type === 'debit' ? 'لك' : 'عليك'})`,
                    updatedAt: remTrx.updatedAt,
                    data: remTrx,
                  },
                  detectedAt: new Date().toISOString(),
                  resolved: false,
                });
              } else if (remTrx.updatedAt > localMatch.updatedAt) {
                await db.transactions.put(remTrx);
                pulledCount++;
              }
            }
          }
        }
      }

      // 3. Process Pending Local Queue
      const pendingItems = await db.syncQueue.where('status').equals('pending').toArray();
      pushedCount = pendingItems.length;

      // Mark items as completed
      for (const item of pendingItems) {
        await db.syncQueue.update(item.id, { status: 'completed' });
      }

      // 4. Push updated state back to Google Drive
      const updatedAccounts = await db.accounts.toArray();
      const updatedTransactions = await db.transactions.toArray();

      const newCloudState = {
        version: 1,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        lastModified: new Date().toISOString(),
        accounts: updatedAccounts,
        transactions: updatedTransactions,
      };

      // Upload or replace sync file in Google Drive
      if (syncFile) {
        await googleDriveService.deleteFile(syncFile.id).catch(() => {});
      }
      await googleDriveService.uploadJsonFile(SYNC_STATE_FILE, newCloudState, {
        accountCount: updatedAccounts.length,
        transactionCount: updatedTransactions.length,
      });

      // 5. Recalculate local balances & audit
      await transactionEngine.recalculateAllBalances();
      await integrityService.auditIntegrity();

      const lastSyncStr = new Date().toISOString();
      localStorage.setItem('hisabati_last_sync_time', lastSyncStr);

      await this.logAudit(
        'SYNC_SUCCESS',
        `اكتملت المزامنة بنجاح (وارد: ${pulledCount}، صادر: ${pushedCount}، تعارضات: ${conflicts.length})`,
        true
      );

      this.notifyStatus('synced');
      if (conflicts.length > 0) {
        this.notifyConflicts(conflicts);
      }

      return {
        success: true,
        conflicts,
        message: `تمت المزامنة بنجاح (تم سحب ${pulledCount} وتحديث ${pushedCount} سجل)`,
        pulledCount,
        pushedCount,
      };
    } catch (err: any) {
      await this.logAudit('SYNC_FAILED', `فشلت المزامنة: ${err?.message || 'خطأ غير معروف'}`, false);
      this.notifyStatus('error');
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Triggers asynchronous background queue flush without blocking caller.
   */
  public processQueueBestEffort(): void {
    if (this.isSyncing || !navigator.onLine || !googleDriveService.isConnected()) {
      return;
    }

    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
    }

    // Debounce to batch mutations
    this.autoSyncTimer = setTimeout(() => {
      this.performFullSync().catch((err) => {
        console.warn('Background sync warning:', err);
      });
    }, 2000);
  }

  /**
   * Resolves a detected conflict between local and remote versions.
   */
  public async resolveConflict(conflict: SyncConflictItem, choice: 'local' | 'remote'): Promise<void> {
    if (choice === 'remote' && conflict.remoteVersion?.data) {
      if (conflict.entityType === 'transaction') {
        await db.transactions.put(conflict.remoteVersion.data);
      } else if (conflict.entityType === 'account') {
        await db.accounts.put(conflict.remoteVersion.data);
      }
      await transactionEngine.recalculateAllBalances();
    }
    // If choice === 'local', local record is retained and will be pushed on next sync
    await this.logAudit('CONFLICT_RESOLVED', `تم حل التعارض (${conflict.id}) باختيار النسخة: ${choice}`, true);
  }
}

export const syncEngine = new SyncEngine();
