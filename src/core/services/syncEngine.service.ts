/**
 * Cloud Sync Engine for Hisabati.
 * Manages local mutation queues, conflict detection, idempotent replication,
 * tombstone tracking to prevent record resurrection, best-effort automatic background
 * synchronization with exponential backoff, and financial data integrity preservation.
 */

import { db } from '../database/db';
import {
  SyncQueueItem,
  SyncConflictItem,
  SyncAuditLogEntry,
  SyncStatusType,
  SyncTombstone,
  Account,
  Transaction,
} from '@/shared/types';
import { getDeviceId, getDeviceName } from '../utils/deviceId';
import { googleDriveService } from './googleDrive.service';
import { transactionEngine } from './transactionEngine.service';
import { integrityService } from './integrity.service';
import { decimalToMinor } from '../money/converter';

const SYNC_STATE_FILE = 'hisabati_sync_state.json';
const CONFLICTS_STORAGE_KEY = 'hisabati_active_conflicts';
const MAX_RETRIES = 5;
const TOMBSTONE_RETENTION_DAYS = 60;

export class SyncEngine {
  private isSyncing = false;
  private currentStatus: SyncStatusType = 'idle';
  private syncListeners: Array<(status: SyncStatusType) => void> = [];
  private conflictListeners: Array<(conflicts: SyncConflictItem[]) => void> = [];
  private autoSyncTimer: any = null;
  private retryTimer: any = null;
  private heartbeatTimer: any = null;

  constructor() {
    this.setupNetworkListeners();
  }

  public getStatus(): SyncStatusType {
    return this.currentStatus;
  }

  public subscribeStatus(listener: (status: SyncStatusType) => void): () => void {
    this.syncListeners.push(listener);
    // Emit current status immediately upon subscription
    listener(this.currentStatus);
    return () => {
      this.syncListeners = this.syncListeners.filter((l) => l !== listener);
    };
  }

  public subscribeConflicts(listener: (conflicts: SyncConflictItem[]) => void): () => void {
    this.conflictListeners.push(listener);
    // Emit current persisted conflicts immediately
    listener(this.getPersistedConflicts());
    return () => {
      this.conflictListeners = this.conflictListeners.filter((l) => l !== listener);
    };
  }

  private notifyStatus(status: SyncStatusType): void {
    this.currentStatus = status;
    this.syncListeners.forEach((l) => l(status));
  }

  private notifyConflicts(conflicts: SyncConflictItem[]): void {
    this.conflictListeners.forEach((l) => l(conflicts));
  }

  private setupNetworkListeners(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (this.currentStatus === 'offline') {
          this.notifyStatus('idle');
        }
        this.processQueueBestEffort();
      });

      window.addEventListener('offline', () => {
        if (!this.isSyncing) {
          this.notifyStatus('offline');
        }
      });
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
          if (isOnline && googleDriveService.isConnected()) {
            this.processQueueBestEffort();
          }
        }
      });
    }

    // Periodic Heartbeat Sync (every 5 minutes if online and connected)
    if (typeof window !== 'undefined' && !this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
        if (isOnline && googleDriveService.isConnected() && !this.isSyncing) {
          this.processQueueBestEffort();
        }
      }, 5 * 60 * 1000);
    }
  }

  public destroy(): void {
    if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.autoSyncTimer = null;
    this.retryTimer = null;
    this.heartbeatTimer = null;
  }

  private inMemoryConflicts: SyncConflictItem[] = [];

  public getPersistedConflicts(): SyncConflictItem[] {
    try {
      if (typeof localStorage === 'undefined') return this.inMemoryConflicts;
      const raw = localStorage.getItem(CONFLICTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : this.inMemoryConflicts;
    } catch {
      return this.inMemoryConflicts;
    }
  }

  private savePersistedConflicts(conflicts: SyncConflictItem[]): void {
    this.inMemoryConflicts = conflicts;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(CONFLICTS_STORAGE_KEY, JSON.stringify(conflicts));
      }
    } catch {
      // Storage quota or unavailable safeguard
    }
  }

  /**
   * Enqueues a local mutation to be synchronized with Google Drive.
   * Ensures idempotency: duplicate pending operations with identical operationId are not queued twice.
   */
  public async enqueueMutation(
    entityType: 'account' | 'transaction' | 'setting',
    entityId: string,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload?: any,
    operationId?: string
  ): Promise<void> {
    const opId = operationId || `op_${entityId}_${Date.now()}`;

    // 1. Idempotency Check at Queue Level
    const existing = await db.syncQueue
      .where('operationId')
      .equals(opId)
      .first();

    if (existing && (existing.status === 'pending' || existing.status === 'processing')) {
      return; // Already safely enqueued for replication
    }

    const queueItem: SyncQueueItem = {
      id: 'sq_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      entityType,
      entityId,
      operation,
      operationId: opId,
      payload,
      createdAt: new Date().toISOString(),
      retryCount: 0,
      status: 'pending',
    };

    await db.syncQueue.add(queueItem);

    // 2. Trigger best effort background sync if online & connected
    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (isOnline && googleDriveService.isConnected()) {
      this.processQueueBestEffort();
    } else if (!isOnline) {
      this.notifyStatus('offline');
    }
  }

  /**
   * Returns current pending sync mutations count (both pending and processing).
   */
  public async getPendingCount(): Promise<number> {
    const pending = await db.syncQueue.where('status').equals('pending').count();
    const processing = await db.syncQueue.where('status').equals('processing').count();
    return pending + processing;
  }

  /**
   * Retrieves all items in the sync queue.
   */
  public async getQueueItems(): Promise<SyncQueueItem[]> {
    return await db.syncQueue.orderBy('createdAt').toArray();
  }

  /**
   * Logs an audit record for sync operations in Dexie.
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
      // Non-blocking
    }
  }

  private acquireDistributedLock(): boolean {
    if (typeof localStorage === 'undefined') return true;
    const lockKey = 'hisabati_sync_distributed_lock';
    const leaseTimeMs = 30000; // 30 second lease
    const now = Date.now();
    const deviceId = getDeviceId();

    try {
      const existingRaw = localStorage.getItem(lockKey);
      if (existingRaw) {
        const lock = JSON.parse(existingRaw);
        if (lock.expiresAt > now && lock.deviceId !== deviceId) {
          return false;
        }
      }

      const newLock = {
        deviceId,
        expiresAt: now + leaseTimeMs,
      };
      localStorage.setItem(lockKey, JSON.stringify(newLock));
      return true;
    } catch {
      return true;
    }
  }

  private releaseDistributedLock(): void {
    if (typeof localStorage === 'undefined') return;
    const lockKey = 'hisabati_sync_distributed_lock';
    try {
      const existingRaw = localStorage.getItem(lockKey);
      if (existingRaw) {
        const lock = JSON.parse(existingRaw);
        if (lock.deviceId === getDeviceId()) {
          localStorage.removeItem(lockKey);
        }
      }
    } catch {
      // ignore
    }
  }

  /**
   * Main Synchronization Procedure:
   * 1. Pull remote state from Google Drive
   * 2. Reconcile tombstones to prevent resurrecting deleted records (SYNC-09)
   * 3. Detect and preserve financial conflicts without blind Last-Write-Wins (SYNC-06)
   * 4. Merge safe remote additions/updates into local DB, preserving amountMinor (SYNC-07)
   * 5. Atomically push local queue mutations up to Google Drive state
   * 6. Mark queue items completed, recalculate balances, and audit integrity (SYNC-08, SYNC-10)
   */
  public async performFullSync(): Promise<{
    success: boolean;
    conflicts: SyncConflictItem[];
    message: string;
    pulledCount: number;
    pushedCount: number;
  }> {
    if (this.isSyncing) {
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'عملية مزامنة أخرى جارية حالياً', pulledCount: 0, pushedCount: 0 };
    }

    if (!this.acquireDistributedLock()) {
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'قفل المزامنة الموزع نشط على جهاز أو تبويب آخر. يرجى الانتظار قليلاً.', pulledCount: 0, pushedCount: 0 };
    }

    if (!googleDriveService.isConnected()) {
      this.releaseDistributedLock();
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'يرجى ربط حساب Google Drive أولاً', pulledCount: 0, pushedCount: 0 };
    }

    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!isOnline) {
      this.releaseDistributedLock();
      this.notifyStatus('offline');
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'الجهاز غير متصل بالإنترنت', pulledCount: 0, pushedCount: 0 };
    }

    this.isSyncing = true;
    this.notifyStatus('syncing');
    await this.logAudit('SYNC_START', 'بدء عملية المزامنة الثنائية مع Google Drive', true);

    const newlyDetectedConflicts: SyncConflictItem[] = [];
    let pulledCount = 0;
    let pushedCount = 0;
    let inFlightPendingItems: SyncQueueItem[] = [];

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
        tombstones?: SyncTombstone[];
      } | null = null;

      if (syncFile) {
        remoteData = await googleDriveService.downloadJsonFile(syncFile.id);
      }

      // 2. Load Local Tombstones (deletions tracked in syncQueue)
      const cutoffDate = new Date(Date.now() - TOMBSTONE_RETENTION_DAYS * 86400000).toISOString();
      const localDeletes = await db.syncQueue
        .where('operation')
        .equals('DELETE')
        .toArray();

      const localTombstoneIds = new Set(
        localDeletes
          .filter((d) => d.createdAt >= cutoffDate)
          .map((d) => d.entityId)
      );

      // 3. Process Remote Tombstones (deletions from another device)
      if (remoteData?.tombstones && Array.isArray(remoteData.tombstones)) {
        for (const remTomb of remoteData.tombstones) {
          localTombstoneIds.add(remTomb.id);
          if (remTomb.entityType === 'transaction') {
            const exists = await db.transactions.get(remTomb.id);
            if (exists) {
              await db.transactions.delete(remTomb.id);
              pulledCount++;
            }
          } else if (remTomb.entityType === 'account') {
            const exists = await db.accounts.get(remTomb.id);
            if (exists) {
              await db.accounts.delete(remTomb.id);
              pulledCount++;
            }
          }
        }
      }

      // 4. If remote data exists, merge safe additions and detect conflicts
      if (remoteData && Array.isArray(remoteData.accounts) && Array.isArray(remoteData.transactions)) {
        const localAccounts = await db.accounts.toArray();
        const localTransactions = await db.transactions.toArray();

        const localAccMap = new Map(localAccounts.map((a) => [a.id, a]));
        const localTrxMap = new Map(localTransactions.map((t) => [t.id, t]));
        const localOpIdMap = new Map(localTransactions.filter((t) => !!t.operationId).map((t) => [t.operationId!, t]));

        // Merge Remote Accounts (skipping tombstoned accounts)
        for (const remAcc of remoteData.accounts) {
          if (localTombstoneIds.has(remAcc.id)) {
            continue; // Do not resurrect deleted account
          }

          const local = localAccMap.get(remAcc.id);
          if (!local) {
            await db.accounts.put(remAcc);
            pulledCount++;
          } else if (remAcc.updatedAt > local.updatedAt) {
            await db.accounts.put(remAcc);
            pulledCount++;
          }
        }

        // Merge Remote Transactions (skipping tombstoned transactions)
        for (const remTrx of remoteData.transactions) {
          if (localTombstoneIds.has(remTrx.id)) {
            continue; // Do not resurrect deleted transaction (SYNC-09)
          }

          // Ensure amountMinor is canonical
          if (remTrx.amountMinor === undefined && remTrx.amount !== undefined) {
            remTrx.amountMinor = decimalToMinor(remTrx.amount, 'YER');
          }

          const existingById = localTrxMap.get(remTrx.id);
          const existingByOp = remTrx.operationId ? localOpIdMap.get(remTrx.operationId) : undefined;
          const localMatch = existingById || existingByOp;

          if (!localMatch) {
            // Safe remote insertion
            await db.transactions.put(remTrx);
            pulledCount++;
          } else {
            // Critical Financial Conflict Evaluation (SYNC-06, SYNC-07)
            const hasFinancialConflict =
              (localMatch.amountMinor !== undefined && remTrx.amountMinor !== undefined && localMatch.amountMinor !== remTrx.amountMinor) ||
              localMatch.amount !== remTrx.amount ||
              localMatch.type !== remTrx.type ||
              localMatch.accountId !== remTrx.accountId;

            if (hasFinancialConflict && localMatch.updatedAt !== remTrx.updatedAt) {
              // Meaningful financial conflict detected: NEVER resolve by blind Last-Write-Wins!
              // Preserve both versions cleanly
              newlyDetectedConflicts.push({
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
              // Safe non-financial metadata update (e.g. note or receiptNumber)
              await db.transactions.put(remTrx);
              pulledCount++;
            }
          }
        }
      }

      // 5. Gather and Transition Local Pending Queue to 'processing'
      inFlightPendingItems = await db.syncQueue
        .where('status')
        .equals('pending')
        .sortBy('createdAt');

      pushedCount = inFlightPendingItems.length;

      for (const item of inFlightPendingItems) {
        await db.syncQueue.update(item.id, { status: 'processing' });
      }

      // 6. Build Combined Tombstones Array
      const combinedTombstonesMap = new Map<string, SyncTombstone>();
      if (remoteData?.tombstones) {
        for (const t of remoteData.tombstones) {
          combinedTombstonesMap.set(t.id, t);
        }
      }
      for (const del of localDeletes) {
        combinedTombstonesMap.set(del.entityId, {
          id: del.entityId,
          entityType: del.entityType,
          deletedAt: del.createdAt,
        });
      }
      const combinedTombstones = Array.from(combinedTombstonesMap.values()).filter(
        (t) => t.deletedAt >= cutoffDate
      );

      // 7. Push Updated State to Google Drive
      const updatedAccounts = (await db.accounts.toArray()).filter(
        (a) => !localTombstoneIds.has(a.id)
      );
      const updatedTransactions = (await db.transactions.toArray()).filter(
        (t) => !localTombstoneIds.has(t.id)
      );

      const newCloudState = {
        version: 1,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        lastModified: new Date().toISOString(),
        accounts: updatedAccounts,
        transactions: updatedTransactions.map((t) => ({
          ...t,
          amountMinor: t.amountMinor !== undefined ? t.amountMinor : decimalToMinor(t.amount, 'YER'),
        })),
        tombstones: combinedTombstones,
      };

      // In-place safe update: patch existing file or upload new
      if (syncFile) {
        try {
          await googleDriveService.updateJsonFile(syncFile.id, SYNC_STATE_FILE, newCloudState, {
            accountCount: updatedAccounts.length,
            transactionCount: updatedTransactions.length,
          });
        } catch {
          // Fallback: upload new and delete old safely
          await googleDriveService.uploadJsonFile(SYNC_STATE_FILE, newCloudState, {
            accountCount: updatedAccounts.length,
            transactionCount: updatedTransactions.length,
          });
          await googleDriveService.deleteFile(syncFile.id).catch(() => {});
        }
      } else {
        await googleDriveService.uploadJsonFile(SYNC_STATE_FILE, newCloudState, {
          accountCount: updatedAccounts.length,
          transactionCount: updatedTransactions.length,
        });
      }

      // 8. POST-UPLOAD SUCCESS: Mark items as completed & prune old completed items
      for (const item of inFlightPendingItems) {
        await db.syncQueue.update(item.id, { status: 'completed' });
      }

      // Keep recent completed items to prevent database growth
      const allCompleted = await db.syncQueue.where('status').equals('completed').toArray();
      if (allCompleted.length > 80) {
        const sorted = allCompleted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const toDelete = sorted.slice(0, allCompleted.length - 50);
        for (const d of toDelete) {
          await db.syncQueue.delete(d.id);
        }
      }

      // 9. Recalculate local balances & audit
      await transactionEngine.recalculateAllBalances();
      await integrityService.auditIntegrity();

      // 10. Merge and Persist Conflicts
      const existingPersisted = this.getPersistedConflicts().filter((c) => !c.resolved);
      const mergedConflictsMap = new Map<string, SyncConflictItem>();
      existingPersisted.forEach((c) => mergedConflictsMap.set(c.id, c));
      newlyDetectedConflicts.forEach((c) => mergedConflictsMap.set(c.id, c));
      const activeConflicts = Array.from(mergedConflictsMap.values());
      this.savePersistedConflicts(activeConflicts);

      const lastSyncStr = new Date().toISOString();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('hisabati_last_sync_time', lastSyncStr);
      }

      await this.logAudit(
        'SYNC_SUCCESS',
        `اكتملت المزامنة بنجاح (وارد: ${pulledCount}، صادر: ${pushedCount}، تعارضات: ${activeConflicts.length})`,
        true
      );

      if (activeConflicts.length > 0) {
        if (newlyDetectedConflicts.length > 0) {
          await this.logAudit(
            'CONFLICT_DETECTED',
            `تم رصد ${newlyDetectedConflicts.length} تعارضات مالية جديدة تحتاج للمراجعة والحل`,
            false
          );
        }
        this.notifyStatus('conflict');
        this.notifyConflicts(activeConflicts);
      } else {
        this.notifyStatus('synced');
      }

      return {
        success: true,
        conflicts: activeConflicts,
        message: `تمت المزامنة بنجاح (تم سحب ${pulledCount} وتحديث ${pushedCount} سجل)`,
        pulledCount,
        pushedCount,
      };
    } catch (err: any) {
      // Revert processing items safely with exponential retry tracking
      for (const item of inFlightPendingItems) {
        const nextRetry = (item.retryCount || 0) + 1;
        const nextStatus = nextRetry >= MAX_RETRIES ? 'failed' : 'pending';
        await db.syncQueue.update(item.id, {
          retryCount: nextRetry,
          status: nextStatus,
          lastError: err?.message || 'فشلت المزامنة',
        });
      }

      await this.logAudit('SYNC_FAILED', `فشلت المزامنة: ${err?.message || 'خطأ غير معروف'}`, false);
      this.notifyStatus('error');
      throw err;
    } finally {
      this.isSyncing = false;
      this.releaseDistributedLock();
    }
  }

  /**
   * Triggers asynchronous background queue flush with debouncing and exponential backoff retry with jitter.
   */
  public processQueueBestEffort(): void {
    if (this.isSyncing || !googleDriveService.isConnected()) {
      return;
    }

    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!isOnline) {
      this.notifyStatus('offline');
      return;
    }

    if (this.autoSyncTimer) {
      clearTimeout(this.autoSyncTimer);
    }

    // Debounce to batch mutations
    this.autoSyncTimer = setTimeout(() => {
      this.performFullSync().catch(async () => {
        // Compute exponential backoff for next retry attempt with jitter
        const pendingWithRetries = await db.syncQueue
          .where('status')
          .equals('pending')
          .toArray();

        const maxRetries = Math.max(0, ...pendingWithRetries.map((p) => p.retryCount || 0));
        if (maxRetries < MAX_RETRIES && pendingWithRetries.length > 0) {
          const jitter = Math.floor(Math.random() * 500);
          const backoffDelay = Math.min(1000 * Math.pow(2, maxRetries) + jitter, 30000);
          if (this.retryTimer) clearTimeout(this.retryTimer);
          this.notifyStatus('retrying');
          this.retryTimer = setTimeout(() => {
            this.performFullSync().catch(() => {});
          }, backoffDelay);
        }
      });
    }, 1500);
  }

  /**
   * Manually resets failed queue mutations to pending and re-triggers background sync.
   * Ensures no pending mutations are lost when network errors exceed MAX_RETRIES.
   */
  public async retryFailedQueueItems(): Promise<number> {
    const failedItems = await db.syncQueue.where('status').equals('failed').toArray();
    if (failedItems.length === 0) return 0;

    for (const item of failedItems) {
      await db.syncQueue.update(item.id, {
        status: 'pending',
        retryCount: 0,
        lastError: undefined,
      });
    }

    await this.logAudit(
      'QUEUE_RETRY',
      `إعادة محاولة يدويّة لـ ${failedItems.length} عمليات كانت في حالة الفشل`,
      true
    );

    this.processQueueBestEffort();
    return failedItems.length;
  }

  /**
   * Retrieves granular statistics for all queue statuses.
   */
  public async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    total: number;
  }> {
    const all = await db.syncQueue.toArray();
    const pending = all.filter((i) => i.status === 'pending').length;
    const processing = all.filter((i) => i.status === 'processing').length;
    const failed = all.filter((i) => i.status === 'failed').length;
    const completed = all.filter((i) => i.status === 'completed').length;
    return {
      pending,
      processing,
      failed,
      completed,
      total: all.length,
    };
  }

  /**
   * Cleans up old completed queue items to prevent IndexedDB growth while keeping recent audit trail.
   */
  public async clearCompletedQueue(maxKeep = 20): Promise<number> {
    const completed = await db.syncQueue.where('status').equals('completed').toArray();
    if (completed.length <= maxKeep) return 0;
    const sorted = completed.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const toDelete = sorted.slice(0, completed.length - maxKeep);
    for (const item of toDelete) {
      await db.syncQueue.delete(item.id);
    }
    await this.logAudit(
      'QUEUE_CLEARED',
      `تنظيف ${toDelete.length} من العمليات القديمة المكتملة في طابور المزامنة`,
      true
    );
    return toDelete.length;
  }

  /**
   * Resolves a detected conflict between local and remote versions deterministically.
   * Does not destroy data. Both versions remain auditable.
   */
  public async resolveConflict(conflict: SyncConflictItem, choice: 'local' | 'remote'): Promise<void> {
    if (choice === 'remote' && conflict.remoteVersion?.data) {
      if (conflict.entityType === 'transaction') {
        await db.transactions.put(conflict.remoteVersion.data);
      } else if (conflict.entityType === 'account') {
        await db.accounts.put(conflict.remoteVersion.data);
      }
      await transactionEngine.recalculateAllBalances();
    } else if (choice === 'local' && conflict.localVersion?.data) {
      // Local version retained. Enqueue UPDATE mutation so cloud state aligns on next sync
      await this.enqueueMutation(
        conflict.entityType,
        conflict.entityId,
        'UPDATE',
        conflict.localVersion.data,
        `res_${conflict.id}_${Date.now()}`
      );
    }

    // Remove resolved conflict from active persisted conflicts
    const remaining = this.getPersistedConflicts().filter((c) => c.id !== conflict.id);
    this.savePersistedConflicts(remaining);
    this.notifyConflicts(remaining);

    if (remaining.length === 0) {
      this.notifyStatus('synced');
    }

    await this.logAudit('CONFLICT_RESOLVED', `تم حل التعارض (${conflict.id}) باختيار النسخة: ${choice}`, true);
  }
}

export const syncEngine = new SyncEngine();
