/**
 * Cloud Sync Engine for Hisabati.
 * Manages local mutation queues, conflict detection, idempotent replication,
 * tombstone tracking to prevent record resurrection, best-effort automatic background
 * synchronization with exponential backoff, and financial data integrity preservation.
 */

import { db } from '../database/db';
import { tenantDbManager } from '../database/TenantDatabaseManager';
const SETTINGS_WHITELIST = ["currency", "appLanguage", "themeMode", "dateFormat", "invoiceDefaultNotes", "businessName", "businessPhone", "businessAddress", "businessTaxId"];

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

const TAB_INSTANCE_ID = 'tab_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
const SYNC_STATE_FILE = 'hisabati_sync_state.json';
const SETTINGS_SYNC_LOCK = 'hisabati_sync_lock';
const SETTINGS_SYNC_CONFLICTS = 'hisabati_active_conflicts';
const SETTINGS_SYNC_METADATA = 'hisabati_sync_metadata';
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
    // Initialize status from DB on next tick
    setTimeout(() => this.refreshSyncStatusFromDb(), 0);
  }

  private async refreshSyncStatusFromDb(): Promise<void> {
    if (tenantDbManager.getIsSwitching()) {
      // Retry in 100ms if still switching
      setTimeout(() => this.refreshSyncStatusFromDb(), 100);
      return;
    }
    try {
      const meta = await db.settings.get(SETTINGS_SYNC_METADATA);
      const val = meta?.value as Record<string, any> | undefined;
      if (val?.status) {
        this.notifyStatus(val.status as SyncStatusType);
      }
    } catch {
      // Safely ignore if DB not ready
    }
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
    this.getPersistedConflicts().then((conflicts) => listener(conflicts));
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

  public async getPersistedConflicts(): Promise<SyncConflictItem[]> {
    try {
      const entry = await db.settings.get(SETTINGS_SYNC_CONFLICTS);
      if (entry && Array.isArray(entry.value)) {
        return entry.value;
      }
      return this.inMemoryConflicts;
    } catch {
      return this.inMemoryConflicts;
    }
  }

  private async savePersistedConflicts(conflicts: SyncConflictItem[]): Promise<void> {
    this.inMemoryConflicts = conflicts;
    try {
      await db.settings.put({
        id: SETTINGS_SYNC_CONFLICTS,
        key: SETTINGS_SYNC_CONFLICTS,
        value: conflicts,
        updatedAt: new Date().toISOString(),
      });
    } catch {
      // Non-blocking
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

  private async acquireDistributedLock(): Promise<boolean> {
    const leaseTimeMs = 45000; // 45 second lease
    const now = Date.now();
    const deviceId = getDeviceId();

    return await db.transaction('rw', db.settings, async () => {
      const existing = await db.settings.get(SETTINGS_SYNC_LOCK);
      
      if (existing && existing.value) {
        const lock = existing.value as { expiresAt: number; tabId: string; deviceId: string };
        // If lock is still valid and owned by someone else
        if (lock.expiresAt > now && lock.tabId !== TAB_INSTANCE_ID) {
          return false;
        }
      }

      // Acquire or renew lock
      await db.settings.put({
        id: SETTINGS_SYNC_LOCK,
        key: SETTINGS_SYNC_LOCK,
        value: {
          deviceId,
          tabId: TAB_INSTANCE_ID,
          expiresAt: now + leaseTimeMs,
        },
        updatedAt: new Date().toISOString(),
      });
      return true;
    });
  }

  private async releaseDistributedLock(): Promise<void> {
    await db.transaction('rw', db.settings, async () => {
      const existing = await db.settings.get(SETTINGS_SYNC_LOCK);
      const val = existing?.value as { tabId?: string } | undefined;
      if (val && val.tabId === TAB_INSTANCE_ID) {
        await db.settings.delete(SETTINGS_SYNC_LOCK);
      }
    });
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
    // 0. RBAC Guard: assert sync:manage
    const { rbacGuard } = await import('./rbac/RBACGuard.service');
    await rbacGuard.assertPermission('sync:manage', {
      targetType: 'system',
      details: 'بدء عملية المزامنة اليدوية',
    });

    const currentConflicts = await this.getPersistedConflicts();
    if (this.isSyncing) {
      return { success: false, conflicts: currentConflicts, message: 'عملية مزامنة أخرى جارية حالياً', pulledCount: 0, pushedCount: 0 };
    }

    const lockedMsg = 'قفل المزامنة الموزع نشط على جهاز أو تبويب آخر. يرجى الانتظار قليلاً.';

    if (typeof navigator !== 'undefined' && navigator.locks) {
      let result: any = null;
      let lockAcquired = false;
      await navigator.locks.request('hisabati_sync_distributed_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) return;
        lockAcquired = true;
        // Even with Web Locks, we still check DB lock for cross-device/persistent safety
        const dbLock = await this.acquireDistributedLock();
        if (!dbLock) {
          lockAcquired = false;
          return;
        }
        try {
          result = await this._performFullSyncInternal();
        } finally {
          await this.releaseDistributedLock();
        }
      });
      if (!lockAcquired) {
        return { success: false, conflicts: currentConflicts, message: lockedMsg, pulledCount: 0, pushedCount: 0 };
      }
      return result;
    }

    // Fallback for older browsers
    if (!(await this.acquireDistributedLock())) {
      return { success: false, conflicts: currentConflicts, message: lockedMsg, pulledCount: 0, pushedCount: 0 };
    }
    try {
      return await this._performFullSyncInternal();
    } finally {
      await this.releaseDistributedLock();
    }
  }

private async _performFullSyncInternal(): Promise<{
    success: boolean;
    conflicts: SyncConflictItem[];
    message: string;
    pulledCount: number;
    pushedCount: number;
  }> {
    const currentConflicts = await this.getPersistedConflicts();
    if (this.isSyncing) {
      return { success: false, conflicts: currentConflicts, message: 'عملية مزامنة أخرى جارية حالياً', pulledCount: 0, pushedCount: 0 };
    }

    if (!googleDriveService.isConnected()) {
      return { success: false, conflicts: currentConflicts, message: 'يرجى ربط حساب Google Drive أولاً', pulledCount: 0, pushedCount: 0 };
    }

    const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!isOnline) {
      this.notifyStatus('offline');
      return { success: false, conflicts: currentConflicts, message: 'الجهاز غير متصل بالإنترنت', pulledCount: 0, pushedCount: 0 };
    }

    this.isSyncing = true;
    await this.notifyStatusAtomic('syncing');
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
        revision: number;
        version: number;
        deviceId: string;
        lastModified: string;
        accounts: Account[];
        transactions: Transaction[];
        tombstones?: SyncTombstone[];
        settings?: any[];
      } | null = null;

      if (syncFile) {
        remoteData = await googleDriveService.downloadJsonFile(syncFile.id);
      }

      // SYNC-07: Revision Safety Logic
      const metaEntry = await db.settings.get(SETTINGS_SYNC_METADATA);
      const localMeta = (metaEntry?.value as Record<string, any>) || { lastRevision: 0 };
      const remoteRevision = remoteData?.revision || 0;

      // If remote has a higher revision, it means another device pushed.
      // This is expected in a healthy sync (we pull then push).
      // But if we have local pending changes AND remote has moved, 
      // we must pull and integrate remote changes before we can push our own.
      
      const localPendingCount = await db.syncQueue.where('status').equals('pending').count();
      
      if (remoteRevision < localMeta.lastRevision && localPendingCount === 0) {
        // This could happen if remote was reset or rolled back. 
        // We warn but proceed to "fix" the cloud with our current state if we are the authority.
        await this.logAudit('SYNC_START', `تحذير: المراجعة السحابية (${remoteRevision}) أقدم من المحلية (${localMeta.lastRevision})`, true);
      }

      // 2. Load Local Tombstones & Permanent Delete Markers
      const localDeletes = await db.syncQueue
        .where('operation')
        .equals('DELETE')
        .toArray();

      const permTombEntry = await db.settings.get('hisabati_permanent_tombstones');
      const permanentTombstones: Array<{ id: string; entityType: string; deletedAt: string }> =
        permTombEntry && Array.isArray(permTombEntry.value) ? permTombEntry.value : [];

      const localTombstoneIds = new Set<string>();
      // Add permanent delete markers (never expire)
      for (const pt of permanentTombstones) {
        localTombstoneIds.add(pt.id);
      }
      // Add local queue deletes and ensure they are in permanent tombstones
      for (const d of localDeletes) {
        localTombstoneIds.add(d.entityId);
        if (!permanentTombstones.some((pt) => pt.id === d.entityId)) {
          permanentTombstones.push({ id: d.entityId, entityType: d.entityType, deletedAt: d.createdAt });
        }
      }

      // 3. Process Remote Tombstones (deletions from another device)
      if (remoteData?.tombstones && Array.isArray(remoteData.tombstones)) {
        for (const remTomb of remoteData.tombstones) {
          localTombstoneIds.add(remTomb.id);
          if (!permanentTombstones.some((pt) => pt.id === remTomb.id)) {
            permanentTombstones.push({ id: remTomb.id, entityType: remTomb.entityType, deletedAt: remTomb.deletedAt });
          }
          if (remTomb.entityType === 'transaction') {
            const exists = await db.transactions.get(remTomb.id);
            if (exists) {
              await transactionEngine.deleteTransaction(remTomb.id, undefined, { isRemote: true });
              pulledCount++;
            }
          } else if (remTomb.entityType === 'account') {
            const exists = await db.accounts.get(remTomb.id);
            if (exists) {
              const { accountService } = await import('./account.service');
              await accountService.deleteAccount(remTomb.id, true, false, { isRemote: true });
              pulledCount++;
            }
          }
        }
      }

      // Persist accumulated permanent tombstones
      await db.settings.put({
        id: 'hisabati_permanent_tombstones',
        key: 'hisabati_permanent_tombstones',
        value: permanentTombstones,
        updatedAt: new Date().toISOString(),
      });

      // Remote State Validation (SYNC-07)
      if (remoteData) {
        if (!Array.isArray(remoteData.accounts)) remoteData.accounts = [];
        if (!Array.isArray(remoteData.transactions)) remoteData.transactions = [];
        if (!Array.isArray(remoteData.tombstones)) remoteData.tombstones = [];
        if (!Array.isArray(remoteData.settings)) remoteData.settings = [];
        






        // Basic schema checks to prevent poisoning
        remoteData.accounts = remoteData.accounts.filter((a: any) => {
          const isValid = a && typeof a === 'object' && a.id && a.name;
          if (!isValid) this.logAudit('MALFORMED_DATA_REJECTED', `حساب غير صالح في البيانات السحابية. ID: ${a?.id || 'مجهول'}`, false);
          return isValid;
        });
        remoteData.transactions = remoteData.transactions.filter((t: any) => {
          const isValid = t && typeof t === 'object' && t.id && t.accountId && typeof t.amount === 'number' && !isNaN(t.amount);
          if (!isValid) this.logAudit('MALFORMED_DATA_REJECTED', `معاملة غير صالحة في البيانات السحابية. ID: ${t?.id || 'مجهول'}`, false);
          return isValid;
        });
        remoteData.settings = remoteData.settings.filter((s: any) => {
          const isValid = s && typeof s === 'object' && s.id && s.key && SETTINGS_WHITELIST.includes(s.key);
          if (!isValid) {
            if (s?.key) this.logAudit('MALFORMED_DATA_REJECTED', `إعداد غير صالح أو غير مصرح به في البيانات السحابية. Key: ${s.key}`, false);
          }
          return isValid;
        });
      }

      // 4. If remote data exists, merge safe additions and detect conflicts
      if (remoteData && Array.isArray(remoteData.accounts) && Array.isArray(remoteData.transactions)) {
        // Merge Settings (SYNC-04)
        if (remoteData.settings && remoteData.settings.length > 0) {
          const localSettingsMap = new Map((await db.settings.toArray()).map(s => [s.key, s]));
          for (const remSet of remoteData.settings) {
             if (!SETTINGS_WHITELIST.includes(remSet.key)) continue;
             if (typeof remSet.value !== "string" && typeof remSet.value !== "number" && typeof remSet.value !== "boolean") { this.logAudit("MALFORMED_DATA_REJECTED", `قيمة إعداد غير صالحة. Key: ${remSet.key}`, false); continue; }
             const local = localSettingsMap.get(remSet.key);
             if (!local || new Date(remSet.updatedAt || 0) > new Date(local.updatedAt || 0)) {
               await db.settings.put(remSet);
             }
          }
        }

        const localAccounts = await db.accounts.toArray();
        const localTransactions = await db.transactions.toArray();

        const localAccMap = new Map(localAccounts.map((a) => [a.id, a]));
        const localTrxMap = new Map(localTransactions.map((t) => [t.id, t]));
        const localOpIdMap = new Map(localTransactions.filter((t) => !!t.operationId).map((t) => [t.operationId!, t]));

        // Merge Remote Accounts (skipping tombstoned accounts)
        const { accountService } = await import('./account.service');
        for (const remAcc of remoteData.accounts) {
          if (localTombstoneIds.has(remAcc.id)) {
            continue; // Do not resurrect deleted account
          }

          const local = localAccMap.get(remAcc.id);
          if (!local) {
            await accountService.createAccount({
              ...remAcc,
              operationId: remAcc.id // Use entity ID as operationId for idempotency
            }, { isRemote: true });
            pulledCount++;
          } else if (remAcc.updatedAt > local.updatedAt) {
            await accountService.updateAccount(remAcc.id, remAcc, { isRemote: true });
            pulledCount++;
          }
        }

        // Merge Remote Transactions (skipping tombstoned transactions)
        for (const remTrx of remoteData.transactions) {
          if (localTombstoneIds.has(remTrx.id)) {
            continue; // Do not resurrect deleted transaction (SYNC-09)
          }

          // Ensure amountMinor is canonical (SYNC-05)
          if (!remTrx.currency || typeof remTrx.currency !== 'string') {
             await this.logAudit('MALFORMED_DATA_REJECTED', `تم تجاهل عملية مالية قادمة من السحابة بسبب غياب العملة الصحيحة. ID: ${remTrx.id}`, false);
             continue; // REJECT
          }
          if (remTrx.amountMinor === undefined && remTrx.amount !== undefined) {
            remTrx.amountMinor = decimalToMinor(remTrx.amount, remTrx.currency);
          }
          if (remTrx.amountMinor === undefined || isNaN(remTrx.amountMinor)) {
             await this.logAudit('MALFORMED_DATA_REJECTED', `تم تجاهل عملية مالية قادمة من السحابة بسبب قيمة amountMinor غير صالحة. ID: ${remTrx.id}`, false);
             continue; // REJECT
          }

          const existingById = localTrxMap.get(remTrx.id);
          const existingByOp = remTrx.operationId ? localOpIdMap.get(remTrx.operationId) : undefined;
          const localMatch = existingById || existingByOp;

          if (!localMatch) {
            // Safe remote insertion through Financial Boundary
            await transactionEngine.createTransaction({
              ...remTrx,
              operationId: remTrx.operationId || `remote_${remTrx.id}`
            }, undefined, { isRemote: true });
            pulledCount++;
          } else {
            // Critical Financial Conflict Evaluation (SYNC-06, SYNC-07)
            const localAmount = Number(localMatch.amount);
            const remoteAmount = Number(remTrx.amount);
            const localMinor = Number(localMatch.amountMinor ?? localAmount);
            const remoteMinor = Number(remTrx.amountMinor ?? remoteAmount);

            const hasFinancialConflict =
              localMinor !== remoteMinor ||
              localAmount !== remoteAmount ||
              localMatch.type !== remTrx.type ||
              localMatch.accountId !== remTrx.accountId;

            // [SYNC-06 FIX]: Be more aggressive in protecting local data from blind overwrites.
            if (hasFinancialConflict) {
              // Meaningful financial conflict detected: NEVER resolve by blind Last-Write-Wins!
              // Preserve both versions cleanly
              newlyDetectedConflicts.push({
                id: 'cf_' + remTrx.id,
                entityType: 'transaction',
                entityId: remTrx.id,
                localVersion: {
                  title: `المعاملة محلياً (${localMatch.amount} ${localMatch.type === 'debit' ? 'لك' : 'عليك'})`,
                  updatedAt: localMatch.updatedAt || '',
                  data: localMatch,
                },
                remoteVersion: {
                  title: `المعاملة في السحابة (${remTrx.amount} ${remTrx.type === 'debit' ? 'لك' : 'عليك'})`,
                  updatedAt: remTrx.updatedAt || '',
                  data: remTrx,
                },
                detectedAt: new Date().toISOString(),
                resolved: false,
              });
              // We DO NOT update the local record here. Local "wins" in the DB for now until user resolves.
            } else if (remTrx.updatedAt > (localMatch.updatedAt || '')) {
              // Safe non-financial metadata update through Financial Boundary
              await transactionEngine.updateTransaction(localMatch.id, remTrx, undefined, { isRemote: true });
              pulledCount++;
            }
          }
        }
      }

      // 4.5. Recover Stale Processing Items (SYNC-01)
      // Since we hold the exclusive multi-tab lock, any item currently in 'processing'
      // belongs to a crashed or aborted previous sync attempt. We revert them to 'pending'.
      const staleProcessingItems = await db.syncQueue
        .where('status')
        .equals('processing')
        .toArray();
      
      for (const stale of staleProcessingItems) {
        await db.syncQueue.update(stale.id!, {
          status: 'pending',
          updatedAt: new Date().toISOString()
        } as any);
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

      // 6. Build Combined Tombstones Array (Permanent delete markers are retained indefinitely without 60-day expiry pruning)
      const combinedTombstonesMap = new Map<string, SyncTombstone>();
      for (const pt of permanentTombstones) {
        combinedTombstonesMap.set(pt.id, {
          id: pt.id,
          entityType: pt.entityType as any,
          deletedAt: pt.deletedAt,
        });
      }
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
      const combinedTombstones = Array.from(combinedTombstonesMap.values());

      // 7. Push Updated State to Google Drive
      const updatedAccounts = (await db.accounts.toArray()).filter(
        (a) => !localTombstoneIds.has(a.id)
      );
      const updatedTransactions = (await db.transactions.toArray()).filter(
        (t) => !localTombstoneIds.has(t.id)
      );

      const localSettings = await db.settings.toArray();
      const syncableSettings = localSettings.filter(s => SETTINGS_WHITELIST.includes(s.key));

      // SYNC-07: Increment revision for push
      const nextRevision = Math.max(remoteRevision, localMeta.lastRevision) + (pushedCount > 0 ? 1 : 0);

      const newCloudState = {
        revision: nextRevision,
        version: 1,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        lastModified: new Date().toISOString(),
        accounts: updatedAccounts,
        transactions: updatedTransactions.map((t) => ({
          ...t,
          amountMinor: t.amountMinor !== undefined ? t.amountMinor : decimalToMinor(t.amount, t.currency),
        })),
        tombstones: combinedTombstones,
        settings: syncableSettings,
      };

      // In-place safe update: patch existing file or upload new
      if (syncFile) {
        try {
          // Double check remote revision hasn't moved while we were merging
          // In a high-concurrency env we'd use etags, but for GDrive we rely on our tab-locks and sequential push.
          await googleDriveService.updateJsonFile(syncFile.id, SYNC_STATE_FILE, newCloudState, {
            accountCount: updatedAccounts.length,
            transactionCount: updatedTransactions.length,
            revision: nextRevision
          });
        } catch (err: any) {
          // Fallback: upload new if patch fails (e.g. file gone)
          await googleDriveService.uploadJsonFile(SYNC_STATE_FILE, newCloudState, {
            accountCount: updatedAccounts.length,
            transactionCount: updatedTransactions.length,
            revision: nextRevision
          });
          if (syncFile.id) await googleDriveService.deleteFile(syncFile.id).catch(() => {});
        }
      } else {
        await googleDriveService.uploadJsonFile(SYNC_STATE_FILE, newCloudState, {
          accountCount: updatedAccounts.length,
          transactionCount: updatedTransactions.length,
          revision: nextRevision
        });
      }

      // 8. POST-UPLOAD SUCCESS: Mark items as completed & update local revision
      await db.transaction('rw', [db.syncQueue, db.settings], async () => {
        for (const item of inFlightPendingItems) {
          await db.syncQueue.update(item.id, { status: 'completed' });
        }
        await db.settings.put({
          id: SETTINGS_SYNC_METADATA,
          key: SETTINGS_SYNC_METADATA,
          value: {
            ...localMeta,
            lastRevision: nextRevision,
            lastSyncTime: new Date().toISOString(),
            status: 'synced'
          },
          updatedAt: new Date().toISOString()
        });
      });

      // Keep recent completed items to prevent database growth
      const allCompleted = await db.syncQueue.where('status').equals('completed').toArray();
      if (allCompleted.length > 80) {
        const sorted = allCompleted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const toDelete = sorted.slice(0, allCompleted.length - 50);
        for (const d of toDelete) {
          if (d.id) await db.syncQueue.delete(d.id);
        }
      }

      // 9. Prune Old Sync Audit Logs (SYNC-06)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      await db.syncAuditLogs.where('timestamp').below(thirtyDaysAgo).delete();

      // 10. Recalculate local balances & audit
      await transactionEngine.recalculateAllBalances();
      await integrityService.auditIntegrity();

      // 10. Merge and Persist Conflicts
      const existingPersisted = (await this.getPersistedConflicts()).filter((c) => !c.resolved);
      const mergedConflictsMap = new Map<string, SyncConflictItem>();
      existingPersisted.forEach((c) => mergedConflictsMap.set(c.id, c));
      newlyDetectedConflicts.forEach((c) => mergedConflictsMap.set(c.id, c));
      const activeConflicts = Array.from(mergedConflictsMap.values());
      await this.savePersistedConflicts(activeConflicts);

      const lastSyncStr = new Date().toISOString();
      // SYNC-05: Move metadata to DB
      await db.settings.put({
        id: 'hisabati_last_sync_time',
        key: 'hisabati_last_sync_time',
        value: lastSyncStr,
        updatedAt: lastSyncStr
      });

      await this.logAudit(
        'SYNC_SUCCESS',
        `اكتملت المزامنة بنجاح (وارد: ${pulledCount}، صادر: ${pushedCount}، تعارضات: ${activeConflicts.length})`,
        true
      );

      const finalStatus: SyncStatusType = activeConflicts.length > 0 ? 'conflict' : 'synced';
      await this.notifyStatusAtomic(finalStatus);
      if (activeConflicts.length > 0) {
        if (newlyDetectedConflicts.length > 0) {
          await this.logAudit(
            'CONFLICT_DETECTED',
            `تم رصد ${newlyDetectedConflicts.length} تعارضات مالية جديدة تحتاج للمراجعة والحل`,
            false
          );
        }
        this.notifyConflicts(activeConflicts);
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
      await db.transaction('rw', db.syncQueue, async () => {
        for (const item of inFlightPendingItems) {
          const nextRetry = (item.retryCount || 0) + 1;
          const nextStatus = nextRetry >= MAX_RETRIES ? 'failed' : 'pending';
          await db.syncQueue.update(item.id, {
            retryCount: nextRetry,
            status: nextStatus,
            lastError: err?.message || 'فشلت المزامنة',
          });
        }
      });

      await this.logAudit('SYNC_FAILED', `فشلت المزامنة: ${err?.message || 'خطأ غير معروف'}`, false);
      await this.notifyStatusAtomic('error');
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * SYNC-06: Atomic Status Transitions
   */
  private async notifyStatusAtomic(status: SyncStatusType): Promise<void> {
    try {
      await db.transaction('rw', db.settings, async () => {
        const metaEntry = await db.settings.get(SETTINGS_SYNC_METADATA);
        const localMeta = (metaEntry?.value as Record<string, any>) || { lastRevision: 0 };
        
        await db.settings.put({
          id: SETTINGS_SYNC_METADATA,
          key: SETTINGS_SYNC_METADATA,
          value: { ...localMeta, status },
          updatedAt: new Date().toISOString()
        });
      });
    } catch (err) {
      console.warn('Failed to update sync status atomically:', err);
    }

    this.notifyStatus(status);
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
   * SYNC-08: Ensures all remote writes go through the Transaction Engine/Boundary.
   */
  public async resolveConflict(conflict: SyncConflictItem, choice: 'local' | 'remote'): Promise<void> {
    if (choice === 'remote' && conflict.remoteVersion?.data) {
      if (conflict.entityType === 'transaction') {
        // [SYNC-08 FIX]: Go through TransactionEngine to ensure audit, snapshot, and amountMinor validation
        await transactionEngine.updateTransaction(conflict.entityId, conflict.remoteVersion.data, undefined, { isRemote: true });
      } else if (conflict.entityType === 'account') {
        const { accountService } = await import('./account.service');
        await accountService.updateAccount(conflict.entityId, conflict.remoteVersion.data, { isRemote: true });
      }
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
    const remaining = (await this.getPersistedConflicts()).filter((c) => c.id !== conflict.id);
    await this.savePersistedConflicts(remaining);
    this.notifyConflicts(remaining);

    if (remaining.length === 0) {
      await this.notifyStatusAtomic('synced');
    }

    await this.logAudit('CONFLICT_RESOLVED', `تم حل التعارض (${conflict.id}) باختيار النسخة: ${choice}`, true);
  }
}

export const syncEngine = new SyncEngine();
