const fs = require('fs');

let content = fs.readFileSync('src/core/services/syncEngine.service.ts', 'utf8');

// 1. Refactor performFullSync and add Web Locks API
const performFullSyncStartIdx = content.indexOf('public async performFullSync(): Promise<{');
const performFullSyncEndIdx = content.indexOf('  /**\n   * Triggers asynchronous background queue flush');
let performFullSyncBody = content.substring(performFullSyncStartIdx, performFullSyncEndIdx);

// Remove the distributed lock early exits from the body
performFullSyncBody = performFullSyncBody.replace(
`    if (!this.acquireDistributedLock()) {
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'قفل المزامنة الموزع نشط على جهاز أو تبويب آخر. يرجى الانتظار قليلاً.', pulledCount: 0, pushedCount: 0 };
    }`, ''
);
performFullSyncBody = performFullSyncBody.replace(
`    if (!googleDriveService.isConnected()) {
      this.releaseDistributedLock();
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'يرجى ربط حساب Google Drive أولاً', pulledCount: 0, pushedCount: 0 };
    }`,
`    if (!googleDriveService.isConnected()) {
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'يرجى ربط حساب Google Drive أولاً', pulledCount: 0, pushedCount: 0 };
    }`
);
performFullSyncBody = performFullSyncBody.replace(
`    if (!isOnline) {
      this.releaseDistributedLock();
      this.notifyStatus('offline');
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'الجهاز غير متصل بالإنترنت', pulledCount: 0, pushedCount: 0 };
    }`,
`    if (!isOnline) {
      this.notifyStatus('offline');
      return { success: false, conflicts: this.getPersistedConflicts(), message: 'الجهاز غير متصل بالإنترنت', pulledCount: 0, pushedCount: 0 };
    }`
);
performFullSyncBody = performFullSyncBody.replace(
`    } finally {
      this.isSyncing = false;
      this.releaseDistributedLock();
    }`,
`    } finally {
      this.isSyncing = false;
    }`
);

// Rename to _performFullSyncInternal
performFullSyncBody = performFullSyncBody.replace(
  'public async performFullSync(): Promise<{',
  'private async _performFullSyncInternal(): Promise<{'
);

const newPerformFullSync = `
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

    const lockedMsg = 'قفل المزامنة الموزع نشط على جهاز أو تبويب آخر. يرجى الانتظار قليلاً.';

    if (typeof navigator !== 'undefined' && navigator.locks) {
      let lockAcquired = false;
      let result: any = null;
      await navigator.locks.request('hisabati_sync_distributed_lock', { ifAvailable: true }, async (lock) => {
        if (!lock) return;
        lockAcquired = true;
        result = await this._performFullSyncInternal();
      });
      if (!lockAcquired) {
        return { success: false, conflicts: this.getPersistedConflicts(), message: lockedMsg, pulledCount: 0, pushedCount: 0 };
      }
      return result;
    }

    // Fallback for older browsers without Web Locks API
    if (!this.acquireDistributedLock()) {
      return { success: false, conflicts: this.getPersistedConflicts(), message: lockedMsg, pulledCount: 0, pushedCount: 0 };
    }
    try {
      return await this._performFullSyncInternal();
    } finally {
      this.releaseDistributedLock();
    }
  }

`;

content = content.substring(0, performFullSyncStartIdx) + newPerformFullSync + performFullSyncBody + content.substring(performFullSyncEndIdx);

// 2. Protect Incoming Settings
const settingsValidationStr = `
        // Basic schema checks to prevent poisoning
        remoteData.accounts = remoteData.accounts.filter((a: any) => {
          const isValid = a && typeof a === 'object' && a.id && a.name;
          if (!isValid) this.logAudit('MALFORMED_DATA_REJECTED', \`حساب غير صالح في البيانات السحابية. ID: \${a?.id || 'مجهول'}\`, false);
          return isValid;
        });
        remoteData.transactions = remoteData.transactions.filter((t: any) => {
          const isValid = t && typeof t === 'object' && t.id && t.accountId && typeof t.amount === 'number' && !isNaN(t.amount);
          if (!isValid) this.logAudit('MALFORMED_DATA_REJECTED', \`معاملة غير صالحة في البيانات السحابية. ID: \${t?.id || 'مجهول'}\`, false);
          return isValid;
        });
        remoteData.settings = remoteData.settings.filter((s: any) => {
          const isValid = s && typeof s === 'object' && s.id && s.key && SETTINGS_WHITELIST.includes(s.key);
          if (!isValid) {
            if (s?.key) this.logAudit('MALFORMED_DATA_REJECTED', \`إعداد غير صالح أو غير مصرح به في البيانات السحابية. Key: \${s.key}\`, false);
          }
          return isValid;
        });
`;
const oldSchemaChecks = `
        // Basic schema checks to prevent poisoning
        remoteData.accounts = remoteData.accounts.filter((a: any) => a && typeof a === 'object' && a.id && a.name);
        remoteData.transactions = remoteData.transactions.filter((t: any) => t && typeof t === 'object' && t.id && t.accountId && typeof t.amount === 'number' && !isNaN(t.amount));
        remoteData.settings = remoteData.settings.filter((s: any) => s && typeof s === 'object' && s.id && s.key);
`;

// wait, SETTINGS_WHITELIST is defined later in the file. I need to move it up or redefine it.
const SETTINGS_WHITELIST = `
      const SETTINGS_WHITELIST = [
        'currency', 'appLanguage', 'themeMode', 
        'dateFormat', 'invoiceDefaultNotes', 'businessName',
        'businessPhone', 'businessAddress', 'businessTaxId'
      ];
`;

content = content.replace(oldSchemaChecks, SETTINGS_WHITELIST + settingsValidationStr);

// Now in the "Merge Settings (SYNC-04)" block
const oldMergeSettings = `
        // Merge Settings (SYNC-04)
        if (remoteData.settings && remoteData.settings.length > 0) {
          const localSettingsMap = new Map((await db.settings.toArray()).map(s => [s.key, s]));
          for (const remSet of remoteData.settings) { 
             const local = localSettingsMap.get(remSet.key);
             if (!local || new Date(remSet.updatedAt || 0) > new Date(local.updatedAt || 0)) {
               await db.settings.put(remSet);
             }
          }
        }
`;
const newMergeSettings = `
        // Merge Settings (SYNC-04)
        if (remoteData.settings && remoteData.settings.length > 0) {
          const localSettingsMap = new Map((await db.settings.toArray()).map(s => [s.key, s]));
          for (const remSet of remoteData.settings) { 
             if (!SETTINGS_WHITELIST.includes(remSet.key)) continue;
             if (typeof remSet.value !== 'string' && typeof remSet.value !== 'number' && typeof remSet.value !== 'boolean') {
                 await this.logAudit('MALFORMED_DATA_REJECTED', \`قيمة إعداد غير صالحة. Key: \${remSet.key}\`, false);
                 continue;
             }
             const local = localSettingsMap.get(remSet.key);
             if (!local || new Date(remSet.updatedAt || 0) > new Date(local.updatedAt || 0)) {
               await db.settings.put(remSet);
             }
          }
        }
`;
content = content.replace(oldMergeSettings, newMergeSettings);


// 3. Remove Silent YER Fallback
const amountMinorUpdateStrOld = `
          // Ensure amountMinor is canonical (SYNC-05)
          if (remTrx.amountMinor === undefined && remTrx.amount !== undefined) {
            remTrx.amountMinor = decimalToMinor(remTrx.amount, remTrx.currency || 'YER');
          }
`;
const amountMinorUpdateStrNew = `
          // Ensure amountMinor is canonical (SYNC-05)
          if (!remTrx.currency || typeof remTrx.currency !== 'string') {
             await this.logAudit('MALFORMED_DATA_REJECTED', \`تم تجاهل عملية مالية قادمة من السحابة بسبب غياب العملة الصحيحة. ID: \${remTrx.id}\`, false);
             continue; // REJECT
          }
          if (remTrx.amountMinor === undefined && remTrx.amount !== undefined) {
            remTrx.amountMinor = decimalToMinor(remTrx.amount, remTrx.currency);
          }
          if (remTrx.amountMinor === undefined || isNaN(remTrx.amountMinor)) {
             await this.logAudit('MALFORMED_DATA_REJECTED', \`تم تجاهل عملية مالية قادمة من السحابة بسبب قيمة amountMinor غير صالحة. ID: \${remTrx.id}\`, false);
             continue; // REJECT
          }
`;
content = content.replace(amountMinorUpdateStrOld, amountMinorUpdateStrNew);

const amountMinorPushOld = `
        transactions: updatedTransactions.map((t) => ({
          ...t,
          amountMinor: t.amountMinor !== undefined ? t.amountMinor : decimalToMinor(t.amount, t.currency || 'YER'),
        })),
`;
const amountMinorPushNew = `
        transactions: updatedTransactions.map((t) => ({
          ...t,
          amountMinor: t.amountMinor !== undefined ? t.amountMinor : decimalToMinor(t.amount, t.currency),
        })),
`;
content = content.replace(amountMinorPushOld, amountMinorPushNew);

// Write back
fs.writeFileSync('src/core/services/syncEngine.service.ts', content);

console.log("Done");
