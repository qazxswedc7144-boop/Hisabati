/**
 * Cloud Sync Engine for Hisabati.
 * Manages local mutation queues, conflict detection, idempotent replication,
 * tombstone tracking to prevent record resurrection, best-effort automatic background
 * synchronization with exponential backoff, and financial data integrity preservation.
 */

import { db, getDb } from '../database/db';
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
  CloudSyncStatePayload,
  EncryptedSyncContainer,
} from '@/shared/types';
import { getDeviceId, getDeviceName } from '../utils/deviceId';
import { googleDriveService } from './googleDrive.service';
import { transactionEngine } from './transactionEngine.service';
import { integrityService } from './integrity.service';
import { decimalToMinor } from '../money/converter';
import { resolveRequiredCurrency, isSupportedCurrency } from '../money/currency';
import { SyncContextRegistry } from './syncContext';
import { encryptBackupPayload, decryptBackupPayload, calculateSHA256 } from '../utils/crypto';

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
    const activeDb = getDb();

    return await activeDb.transaction('rw', activeDb.settings, async () => {
      const existing = await activeDb.settings.get(SETTINGS_SYNC_LOCK);
      
      if (existing && existing.value) {
        const lock = existing.value as { expiresAt: number; tabId: string; deviceId: string };
        // If lock is still valid and owned by someone else
        if (lock.expiresAt > now && lock.tabId !== TAB_INSTANCE_ID) {
          return false;
        }
      }

      // Acquire or renew lock
      await activeDb.settings.put({
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
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.settings, async () => {
      const existing = await activeDb.settings.get(SETTINGS_SYNC_LOCK);
      const val = existing?.value as { tabId?: string } | undefined;
      if (val && val.tabId === TAB_INSTANCE_ID) {
        await activeDb.settings.delete(SETTINGS_SYNC_LOCK);
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
      // 1. Fetch remote sync state file if exists (Step A)
      const files = await googleDriveService.listFiles();
      const syncFile = files.find((f) => f.name === SYNC_STATE_FILE);

      let remoteData: any = null;
      let remoteRevisionAtStart = 0;

      if (syncFile) {
        const downloaded = await googleDriveService.downloadJsonFile<EncryptedSyncContainer | CloudSyncStatePayload>(syncFile.id);

        if (downloaded?.isEncrypted === true && typeof downloaded.data === 'string' && typeof downloaded.iv === 'string') {
          try {
            const decrypted = await decryptBackupPayload(downloaded.data, downloaded.iv);
            remoteData = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
          } catch (decryptErr: any) {
            console.error('[Sync] فشل فك تشفير ملف المزامنة:', decryptErr?.message);
            throw new Error('فشل فك تشفير ملف المزامنة. قد يكون الملف تالفًا أو مُشفَّرًا بمفتاح جهاز آخر.');
          }
        } else if (downloaded && typeof downloaded === 'object') {
          remoteData = downloaded;
          (remoteData as any).__needsEncryptionUpgrade = true;
        }
        
        remoteRevisionAtStart = remoteData?.revision || 0;
      }

      // SYNC-07: Local Metadata Check
      const metaEntry = await db.settings.get(SETTINGS_SYNC_METADATA);
      const localMeta = (metaEntry?.value as Record<string, any>) || { lastRevision: 0 };

      // 2. Prepare Local Tombstones
      const localDeletes = await db.syncQueue.where('operation').equals('DELETE').toArray();
      const permTombEntry = await db.settings.get('hisabati_permanent_tombstones');
      const permanentTombstones: Array<{ id: string; entityType: string; deletedAt: string }> =
        permTombEntry && Array.isArray(permTombEntry.value) ? permTombEntry.value : [];

      const localTombstoneIds = new Set<string>(permanentTombstones.map(pt => pt.id));
      for (const d of localDeletes) {
        localTombstoneIds.add(d.entityId);
        if (!permanentTombstones.some((pt) => pt.id === d.entityId)) {
          permanentTombstones.push({ id: d.entityId, entityType: d.entityType, deletedAt: d.createdAt });
        }
      }

      // 3. Process Remote Changes (Pull Phase)
      SyncContextRegistry.beginSyncApply();
      try {
        if (remoteData) {
          // SYNC-08: Validate and Sanitize Remote Data
          this.sanitizeRemoteData(remoteData);

          // Handle Remote Tombstones
          if (Array.isArray(remoteData.tombstones)) {
            for (const remTomb of remoteData.tombstones) {
              if (localTombstoneIds.has(remTomb.id)) continue;
              localTombstoneIds.add(remTomb.id);
              permanentTombstones.push({ id: remTomb.id, entityType: remTomb.entityType, deletedAt: remTomb.deletedAt });
              
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

          // Persist tombstones early
          await db.settings.put({
            id: 'hisabati_permanent_tombstones',
            key: 'hisabati_permanent_tombstones',
            value: permanentTombstones,
            updatedAt: new Date().toISOString(),
          });

          // Merge Settings, Accounts, Transactions
          const localAccounts = await db.accounts.toArray();
          const localAccMap = new Map(localAccounts.map(a => [a.id, a]));
          
          // Merge Settings
          if (Array.isArray(remoteData.settings)) {
            const localSettingsMap = new Map((await db.settings.toArray()).map(s => [s.key, s]));
            for (const remSet of remoteData.settings) {
              if (!SETTINGS_WHITELIST.includes(remSet.key)) continue;
              const local = localSettingsMap.get(remSet.key);
              if (!local || new Date(remSet.updatedAt || 0) > new Date(local.updatedAt || 0)) {
                await db.settings.put(remSet);
              }
            }
          }

          // Merge Accounts
          const { accountService } = await import('./account.service');
          for (const remAcc of remoteData.accounts) {
            if (localTombstoneIds.has(remAcc.id)) continue;
            const local = localAccMap.get(remAcc.id);
            try {
              if (!local) {
                await accountService.createAccount({ ...remAcc, operationId: remAcc.id }, { isRemote: true });
                pulledCount++;
              } else if (remAcc.updatedAt > local.updatedAt) {
                await accountService.updateAccount(remAcc.id, remAcc, { isRemote: true });
                pulledCount++;
              }
            } catch (err: any) {
              this.logAudit('MALFORMED_DATA_REJECTED', `فشل دمج الحساب: ${err.message}. ID: ${remAcc.id}`, false);
            }
          }

          // Refresh localAccMap after pull so transactions can resolve currency correctly
          const refreshedAccounts = await db.accounts.toArray();
          localAccMap.clear();
          refreshedAccounts.forEach(a => localAccMap.set(a.id, a));

          // Merge Transactions
          const localTransactions = await db.transactions.toArray();
          const localTrxMap = new Map(localTransactions.map(t => [t.id, t]));
          const localOpIdMap = new Map(localTransactions.filter(t => !!t.operationId).map(t => [t.operationId!, t]));
          const systemCurrencySetting = await db.settings.get('currency');

          for (const remTrx of remoteData.transactions) {
            if (localTombstoneIds.has(remTrx.id)) continue;

            // Financial Validation (SYNC-08)
            try {
              const accountObj = localAccMap.get(remTrx.accountId);
              const resolvedCurrency = resolveRequiredCurrency({
                transactionCurrency: remTrx.currency,
                accountCurrency: accountObj?.currency,
                systemCurrency: systemCurrencySetting?.value as string | undefined,
              });

              if (remTrx.amountMinor === undefined && remTrx.amount !== undefined) {
                remTrx.amountMinor = decimalToMinor(remTrx.amount, resolvedCurrency);
              }
              if (!remTrx.currency) remTrx.currency = resolvedCurrency;

              if (remTrx.amountMinor === undefined || !Number.isInteger(remTrx.amountMinor)) {
                throw new Error('قيمة amountMinor غير صالحة');
              }
            } catch (err: any) {
              this.logAudit('MALFORMED_DATA_REJECTED', `تم تجاهل حركة مالية: ${err.message}. ID: ${remTrx.id}`, false);
              continue;
            }

            const localMatch = localTrxMap.get(remTrx.id) || (remTrx.operationId ? localOpIdMap.get(remTrx.operationId) : undefined);

            try {
              if (!localMatch) {
                await transactionEngine.createTransaction({ ...remTrx, operationId: remTrx.operationId || `remote_${remTrx.id}` }, undefined, { isRemote: true });
                pulledCount++;
              } else {
                const hasConflict = localMatch.amountMinor !== remTrx.amountMinor || localMatch.type !== remTrx.type || localMatch.accountId !== remTrx.accountId;
                if (hasConflict) {
                  newlyDetectedConflicts.push({
                    id: 'cf_' + remTrx.id,
                    entityType: 'transaction',
                    entityId: remTrx.id,
                    localVersion: { title: `محلي (${localMatch.amount})`, updatedAt: localMatch.updatedAt || '', data: localMatch },
                    remoteVersion: { title: `سحابي (${remTrx.amount})`, updatedAt: remTrx.updatedAt || '', data: remTrx },
                    detectedAt: new Date().toISOString(),
                    resolved: false,
                  });
                } else if (remTrx.updatedAt > (localMatch.updatedAt || '')) {
                  await transactionEngine.updateTransaction(localMatch.id, remTrx, undefined, { isRemote: true });
                  pulledCount++;
                }
              }
            } catch (err: any) {
              console.error(`[SyncEngine] Transaction merge failed for ${remTrx.id}:`, err);
              this.logAudit('MALFORMED_DATA_REJECTED', `فشل دمج الحركة المالية: ${err.message}. ID: ${remTrx.id}`, false);
            }
          }
        }
      } finally {
        SyncContextRegistry.endSyncApply();
      }

      // 4. Recover Stale Processing/Prepared Items (SYNC-06)
      const staleItems = await db.syncQueue.where('status').anyOf('processing', 'prepared', 'uploaded').toArray();
      for (const item of staleItems) {
        await db.syncQueue.update(item.id, { status: 'pending', updatedAt: new Date().toISOString() });
      }

      // 5. Transition Local Pending to 'prepared' (Step B)
      inFlightPendingItems = await db.syncQueue.where('status').equals('pending').sortBy('createdAt');
      pushedCount = inFlightPendingItems.length;

      for (const item of inFlightPendingItems) {
        await db.syncQueue.update(item.id, { status: 'prepared' });
      }

      // 6. SYNC-07: Final Revision Race Check (Step C - Fresh Remote Fetch)
      if (syncFile) {
        const freshFiles = await googleDriveService.listFiles();
        const freshSyncFile = freshFiles.find(f => f.name === SYNC_STATE_FILE);
        const freshRevision = freshSyncFile?.metadata?.revision ?? 0;
        
        if (freshRevision > remoteRevisionAtStart) {
          throw new Error('تعذر الرفع: تم تحديث البيانات السحابية بواسطة جهاز آخر أثناء المعالجة المحلية. يرجى المحاولة مرة أخرى.');
        }
      }

      // 7. Push Updated State (Step D)
      const nextRevision = Math.max(remoteRevisionAtStart, localMeta.lastRevision) + (pushedCount > 0 ? 1 : 0);
      
      const updatedAccounts = (await db.accounts.toArray()).filter(a => !localTombstoneIds.has(a.id));
      const updatedTransactions = (await db.transactions.toArray()).filter(t => !localTombstoneIds.has(t.id));
      const syncableSettings = (await db.settings.toArray()).filter(s => SETTINGS_WHITELIST.includes(s.key));

      // Financial Hardening (PUSH): Ensure all pushed transactions have amountMinor
      const systemCurrencySetting = await db.settings.get('currency');
      const systemCurrency = (systemCurrencySetting?.value as string) || 'YER';
      const accountsMap = new Map(updatedAccounts.map(a => [a.id, a]));
      
      const sanitizedTransactions = updatedTransactions.map(t => {
        if (t.amountMinor !== undefined && Number.isInteger(t.amountMinor)) return t;
        const acc = accountsMap.get(t.accountId);
        const currency = t.currency || acc?.currency || systemCurrency;
        
        let minor = undefined;
        try {
          minor = decimalToMinor(t.amount || 0, currency);
        } catch {
          // If currency invalid, leave amountMinor as undefined (handled by later guards or pushed as is for manual repair)
        }

        return {
          ...t,
          currency,
          amountMinor: minor
        };
      });

      const newCloudState = {
        revision: nextRevision,
        version: 1,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
        lastModified: new Date().toISOString(),
        accounts: updatedAccounts,
        transactions: sanitizedTransactions,
        tombstones: permanentTombstones.map(pt => ({ id: pt.id, entityType: pt.entityType, deletedAt: pt.deletedAt })),
        settings: syncableSettings,
      };

      const encryptedContainer = await this.buildEncryptedSyncContainer(newCloudState);
      const expectedContainerHash = encryptedContainer.isEncrypted && typeof encryptedContainer.iv === 'string' && typeof encryptedContainer.data === 'string'
        ? await calculateSHA256(encryptedContainer.iv + encryptedContainer.data)
        : await calculateSHA256(JSON.stringify(encryptedContainer));

      const uploadMeta = { accountCount: updatedAccounts.length, transactionCount: updatedTransactions.length, revision: nextRevision, isEncrypted: true };

      // Transition to 'uploaded' state before network call
      for (const item of inFlightPendingItems) {
        await db.syncQueue.update(item.id, { status: 'uploaded' });
      }

      if (syncFile) {
        await googleDriveService.updateJsonFile(syncFile.id, SYNC_STATE_FILE, encryptedContainer, uploadMeta);
      } else {
        await googleDriveService.uploadJsonFile(SYNC_STATE_FILE, encryptedContainer, uploadMeta);
      }

      // 8. Remote Acknowledgment & Readback Verification (Upload Acknowledgment & Container Hash Integrity)
      const targetFileId = syncFile ? syncFile.id : (await googleDriveService.listFiles()).find(f => f.name === SYNC_STATE_FILE)?.id;
      if (!targetFileId) {
        throw new Error('فشل تأكيد الرفع: لم يتم العثور على ملف المزامنة على Google Drive بعد الرفع.');
      }

      const downloadedReadback = await googleDriveService.downloadJsonFile<EncryptedSyncContainer | CloudSyncStatePayload>(targetFileId);
      let readbackData: CloudSyncStatePayload | null = null;
      let readbackContainerHash = '';

      if (downloadedReadback && typeof downloadedReadback === 'object' && 'isEncrypted' in downloadedReadback && downloadedReadback.isEncrypted === true && typeof downloadedReadback.data === 'string' && typeof downloadedReadback.iv === 'string') {
        readbackContainerHash = await calculateSHA256(downloadedReadback.iv + downloadedReadback.data);
        if (readbackContainerHash !== expectedContainerHash) {
          throw new Error('فشل تأكيد الرفع والتحقق من النزاهة (Container Hash Mismatch): بصمة الحاوية المشفرة المقروءة لا تطابق الحمولة المُرسَلة.');
        }
        try {
          const decrypted = await decryptBackupPayload(downloadedReadback.data, downloadedReadback.iv);
          readbackData = typeof decrypted === 'string' ? JSON.parse(decrypted) : decrypted;
        } catch (decryptErr: unknown) {
          const errMsg = decryptErr instanceof Error ? decryptErr.message : String(decryptErr);
          throw new Error('فشل فك تشفير النسخة المقروءة أثناء التحقق: ' + errMsg);
        }
      } else if (downloadedReadback && typeof downloadedReadback === 'object' && 'revision' in downloadedReadback) {
        readbackData = downloadedReadback as CloudSyncStatePayload;
        readbackContainerHash = await calculateSHA256(JSON.stringify(downloadedReadback));
        if (readbackContainerHash !== expectedContainerHash) {
          throw new Error('فشل تأكيد الرفع والتحقق من النزاهة (Container Hash Mismatch): بصمة الحاوية المقروءة لا تطابق الحمولة المُرسَلة.');
        }
      }

      if (!readbackData) {
        throw new Error('فشل تأكيد الرفع: ملف المزامنة المقروء غير صالح أو تالف.');
      }

      const readbackRevision = readbackData.revision ?? 0;
      const readbackAccountCount = Array.isArray(readbackData.accounts) ? readbackData.accounts.length : -1;
      const readbackTransactionCount = Array.isArray(readbackData.transactions) ? readbackData.transactions.length : -1;

      if (
        readbackRevision !== nextRevision ||
        readbackAccountCount !== updatedAccounts.length ||
        readbackTransactionCount !== updatedTransactions.length
      ) {
        console.log('DEBUG READBACK CHECK:', {
            readbackRevision, nextRevision,
            readbackAccountCount, updatedAccountLength: updatedAccounts.length,
            readbackTransactionCount, updatedTransactionLength: updatedTransactions.length
        });
        throw new Error(
          `فشل تأكيد الرفع والتحقق من النزاهة (Readback Integrity): عدم تطابق المراجعة أو محتوى الحالة المقروءة (المراجعة: ${readbackRevision}/${nextRevision}، الحسابات: ${readbackAccountCount}/${updatedAccounts.length}، الحركات: ${readbackTransactionCount}/${updatedTransactions.length}).`
        );
      }

      for (const item of inFlightPendingItems) {
        await db.syncQueue.update(item.id, { status: 'acknowledged' });
      }

      // 9. Atomic Completion (Step E)
      const activeDb = getDb();
      await activeDb.transaction('rw', [activeDb.syncQueue, activeDb.settings], async () => {
        for (const item of inFlightPendingItems) {
          await activeDb.syncQueue.update(item.id, { status: 'completed' });
        }
        await activeDb.settings.put({
          id: SETTINGS_SYNC_METADATA,
          key: SETTINGS_SYNC_METADATA,
          value: { ...localMeta, lastRevision: nextRevision, lastSyncTime: new Date().toISOString(), status: 'synced' },
          updatedAt: new Date().toISOString()
        });
      });

      // Housekeeping
      await this.logAudit('SYNC_SUCCESS', `اكتملت المزامنة بنجاح (وارد: ${pulledCount}، صادر: ${pushedCount})`, true);
      await transactionEngine.recalculateAllBalances();
      await integrityService.auditIntegrity();
      
      // Merge Conflicts
      const existingPersisted = (await this.getPersistedConflicts()).filter(c => !c.resolved);
      const activeConflicts = [...existingPersisted, ...newlyDetectedConflicts];
      await this.savePersistedConflicts(activeConflicts);

      const finalStatus: SyncStatusType = activeConflicts.length > 0 ? 'conflict' : 'synced';
      await this.notifyStatusAtomic(finalStatus);

      return { success: true, conflicts: activeConflicts, message: 'تمت المزامنة بنجاح', pulledCount, pushedCount };

    } catch (err: any) {
      // Revert processing/prepared/uploaded to pending with retry increment
      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.syncQueue, async () => {
        for (const item of inFlightPendingItems) {
          const nextRetry = (item.retryCount || 0) + 1;
          const nextStatus = nextRetry >= MAX_RETRIES ? 'failed' : 'pending';
          await activeDb.syncQueue.update(item.id, { retryCount: nextRetry, status: nextStatus, lastError: err?.message || 'فشلت المزامنة' });
        }
      });
      await this.logAudit('SYNC_FAILED', `فشلت المزامنة: ${err?.message || 'خطأ غير معروف'}`, false);
      await this.notifyStatusAtomic('error');
      throw err;
    } finally {
      this.isSyncing = false;
    }
  }

  private sanitizeRemoteData(data: any): void {
    if (!data || typeof data !== 'object') throw new Error('بيانات سحابية غير صالحة');
    if (!Array.isArray(data.accounts)) data.accounts = [];
    if (!Array.isArray(data.transactions)) data.transactions = [];
    if (!Array.isArray(data.settings)) data.settings = [];
    if (!Array.isArray(data.tombstones)) data.tombstones = [];

    data.accounts = data.accounts.filter((a: any) => {
      const isValid = a && a.id && a.name;
      if (!isValid) this.logAudit('MALFORMED_DATA_REJECTED', `حساب غير صالح. ID: ${a?.id || 'مجهول'}`, false);
      return isValid;
    });

    data.transactions = data.transactions.filter((t: any) => {
      const isValid = t && t.id && t.accountId && typeof t.amount === 'number' && !isNaN(t.amount);
      if (!isValid) this.logAudit('MALFORMED_DATA_REJECTED', `حركة مالية غير صالحة. ID: ${t?.id || 'مجهول'}`, false);
      return isValid;
    });

    data.settings = data.settings.filter((s: any) => {
      const isAllowed = s && s.key && SETTINGS_WHITELIST.includes(s.key);
      if (!isAllowed) {
        if (s?.key) this.logAudit('MALFORMED_DATA_REJECTED', `إعداد غير مصرح به: ${s.key}`, false);
        return false;
      }
      const isValidType = typeof s.value === 'string' || typeof s.value === 'number' || typeof s.value === 'boolean';
      if (!isValidType) this.logAudit('MALFORMED_DATA_REJECTED', `قيمة إعداد غير صالحة: ${s.key}`, false);
      return isValidType;
    });
  }

  /**
   * SYNC-ENCRYPT-01: Wrap plain sync state in AES-GCM-256 container.
   * Format V2: { isEncrypted, algorithm, iv, data, version }
   */
  private async buildEncryptedSyncContainer(plainState: any): Promise<any> {
    const { cipherText, iv } = await encryptBackupPayload(plainState);
    return {
      isEncrypted: true,
      algorithm: 'AES-GCM-256',
      iv,
      data: cipherText,
      version: 2,
    };
  }

  /**
   * SYNC-06: Atomic Status Transitions
   */
  private async notifyStatusAtomic(status: SyncStatusType): Promise<void> {
    try {
      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.settings, async () => {
        const metaEntry = await activeDb.settings.get(SETTINGS_SYNC_METADATA);
        const localMeta = (metaEntry?.value as Record<string, any>) || { lastRevision: 0 };
        
        await activeDb.settings.put({
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

    if (tenantDbManager.getIsSwitching()) {
      // Defer if switching
      if (this.autoSyncTimer) clearTimeout(this.autoSyncTimer);
      this.autoSyncTimer = setTimeout(() => this.processQueueBestEffort(), 500);
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
        if (tenantDbManager.getIsSwitching()) return;
        
        try {
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
        } catch {
          // Silent fail for background retry if DB locked
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
      SyncContextRegistry.beginSyncApply();
      try {
        if (conflict.entityType === 'transaction') {
          const { db } = await import('../database/db');
          const existingTrx = await db.transactions.get(conflict.entityId);

          if (existingTrx) {
            const currentStatus = existingTrx.status || 'posted';

            if (currentStatus === 'posted' || currentStatus === 'reversed') {
              throw new Error(
                `لا يمكن حل التعارض المالي على قيد بحالة ${currentStatus ? currentStatus.toUpperCase() : ''} تلقائيًا. ` +
                `يتطلب مراجعة يدوية وإنشاء قيد عكسي.`
              );
            }
          }

          // [SYNC-08 FIX]: Go through TransactionEngine to ensure audit, snapshot, and amountMinor validation
          await transactionEngine.updateTransaction(conflict.entityId, conflict.remoteVersion.data, undefined, { isRemote: true });
        } else if (conflict.entityType === 'account') {
          const { accountService } = await import('./account.service');
          await accountService.updateAccount(conflict.entityId, conflict.remoteVersion.data, { isRemote: true });
        }
      } finally {
        SyncContextRegistry.endSyncApply();
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
