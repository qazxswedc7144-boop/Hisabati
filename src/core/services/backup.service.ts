/**
 * Backup Service for Hisabati.
 * Manages full database snapshots, validation, schema versioning, SHA-256 integrity hashing,
 * safety pre-restore snapshots, and recovery.
 */

import { db, getDb } from '../database/db';
import { BackupPayload, BackupMetadata } from '@/shared/types';
import {
  calculateBackupPayloadHash,
  verifyBackupIntegrityHash,
  verifyCurrentBackupHash,
  verifyLegacyBackupHash,
  encryptBackupPayload,
  decryptBackupPayload,
  getMasterKeyFingerprint,
} from '../utils/crypto';
import { getDeviceId, getDeviceName } from '../utils/deviceId';
import { integrityService } from './integrity.service';
import { transactionEngine } from './transactionEngine.service';
import { googleDriveService } from './googleDrive.service';
import {
  DATABASE_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../database/schemaVersion';
import {
  getBackupSchemaVersion,
  migrateBackupPayload,
} from './backup/backup-migrator';

const APP_VERSION = '2.0.0';

/**
 * SEC-07: Backup Payload Limits & Resource Exhaustion Defense
 * These bounds are mathematically aligned with the mobile/browser IndexedDB capacity
 * and memory constraints of Hisabati:
 * - MAX_BACKUP_ACCOUNTS: 10,000 accounts maximum (typical SME has 50 - 500 accounts)
 * - MAX_BACKUP_TRANSACTIONS: 100,000 transactions maximum (years of high-volume ledger)
 * - MAX_BACKUP_SETTINGS: 500 settings entries maximum
 * Exceeding these bounds indicates corrupted, malicious, or synthetic DoS payloads
 * and will be rejected immediately before costly migration or DB write transactions.
 */
export const MAX_BACKUP_ACCOUNTS = 10_000;
export const MAX_BACKUP_TRANSACTIONS = 100_000;
export const MAX_BACKUP_SETTINGS = 500;

import { rbacGuard } from './rbac/RBACGuard.service';

export class BackupService {
  // Test hook to simulate safety backup failures in security unit tests
  public _simulateSafetyBackupFailure: boolean = false;

  /**
   * Generates a validated and cryptographically hashed snapshot of the local database.
   * - 1.2: Added internal flag to skip RBAC for system-generated snapshots.
   * - 1.6: Included trash and auditTrail in payload.
   * - 2.1: Included keyFingerprint.
   */
  public async generateBackupPayload(options: { internal?: boolean } = {}): Promise<BackupPayload> {
    // 0. RBAC Guard: Skip if internal
    if (!options.internal) {
      await rbacGuard.assertPermission('backup:create', {
        targetType: 'backup',
        details: 'إنشاء نسخة احتياطية للبيانات',
      });
    }

    const accounts = await db.accounts.toArray();
    const transactions = await db.transactions.toArray();
    const settings = await db.settings.toArray();
    const trash = await db.trash.toArray(); // 1.6
    const auditTrail = await db.auditTrail.toArray(); // 1.6
    const debts = await db.debts.toArray(); // [1.6 T-A]

    // 1.4: Compute sums with fixed point precision
    let totalDebitSum = 0;
    let totalCreditSum = 0;
    for (const trx of transactions) {
      if (trx.type === 'debit') {
        totalDebitSum = Math.round((totalDebitSum + trx.amount) * 100) / 100;
      } else if (trx.type === 'credit') {
        totalCreditSum = Math.round((totalCreditSum + trx.amount) * 100) / 100;
      }
    }

    const backupId = 'bck_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const createdAt = new Date().toISOString();
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();
    const keyFingerprint = await getMasterKeyFingerprint(); // 2.1

    const rawMetadata: Omit<BackupMetadata, 'integrityHash'> = {
      backupSchemaVersion: BACKUP_SCHEMA_VERSION,
      databaseSchemaVersion: DATABASE_SCHEMA_VERSION,
      financialFormatVersion: FINANCIAL_FORMAT_VERSION,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      appVersion: APP_VERSION,
      backupId,
      deviceId,
      deviceName,
      createdAt,
      accountCount: accounts.length,
      transactionCount: transactions.length,
      totalDebitSum,
      totalCreditSum,
      keyFingerprint,
    };

    const integrityHash = await calculateBackupPayloadHash({
      metadata: rawMetadata as any,
      accounts,
      transactions,
      settings,
      trash,
      auditTrail,
      debts,
    });

    const payload: BackupPayload = {
      metadata: {
        ...rawMetadata,
        integrityHash,
      },
      accounts,
      transactions,
      settings,
      trash,
      auditTrail,
      debts,
    };

    return payload;
  }

  /**
   * Validates a backup payload structure, schema version, integrity hash, and entity references.
   * Performs exhaustive checks on metadata, versions, accounts, transactions, and settings.
   */
  public async validateBackupPayload(payload: any): Promise<{
    isValid: boolean;
    error?: string;
    details?: {
      accountCount: number;
      transactionCount: number;
      debtCount?: number;
      schemaVersion: number;
      createdAt: string;
      deviceId: string;
      deviceName?: string;
    };
  }> {
    if (!payload || typeof payload !== 'object') {
      return { isValid: false, error: 'هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload Structure)' };
    }

    const { metadata, accounts, transactions, settings } = payload;

    if (!metadata || typeof metadata !== 'object') {
      return { isValid: false, error: 'بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)' };
    }

    if (!Array.isArray(accounts) || !Array.isArray(transactions)) {
      return { isValid: false, error: 'الملف لا يحتوي على الحسابات أو المعاملات المطلوبة كقوائم صالحة' };
    }

    if (settings !== undefined && !Array.isArray(settings)) {
      return { isValid: false, error: 'هيكل الإعدادات في النسخة الاحتياطية غير صالح' };
    }

    if (payload.debts !== undefined && !Array.isArray(payload.debts)) {
      return { isValid: false, error: 'هيكل جدول الديون في النسخة الاحتياطية غير صالح (Debts must be an array)' };
    }

    // Required metadata fields
    if (!metadata.appVersion || typeof metadata.appVersion !== 'string') {
      return { isValid: false, error: 'إصدار التطبيق مفقود في البيانات الوصفية (appVersion missing)' };
    }
    if (!metadata.backupId || typeof metadata.backupId !== 'string') {
      return { isValid: false, error: 'معرف النسخة الاحتياطية مفقود في البيانات الوصفية (backupId missing)' };
    }
    if (!metadata.createdAt || typeof metadata.createdAt !== 'string' || isNaN(Date.parse(metadata.createdAt))) {
      return { isValid: false, error: 'تاريخ إنشاء النسخة الاحتياطية غير صالح (Invalid createdAt)' };
    }

    const schemaVer = getBackupSchemaVersion(metadata);
    if (!schemaVer || schemaVer > BACKUP_SCHEMA_VERSION) {
      return {
        isValid: false,
        error: `إصدار المخطط (${schemaVer || 0}) غير متوافق مع إصدار التطبيق الحالي (${BACKUP_SCHEMA_VERSION})`,
      };
    }

    // Check databaseSchemaVersion and financialFormatVersion if present
    if (
      metadata.databaseSchemaVersion !== undefined &&
      (typeof metadata.databaseSchemaVersion !== 'number' || metadata.databaseSchemaVersion > DATABASE_SCHEMA_VERSION)
    ) {
      return {
        isValid: false,
        error: `إصدار مخطط قاعدة البيانات غير مدعوم (${metadata.databaseSchemaVersion})`,
      };
    }

    if (
      metadata.financialFormatVersion !== undefined &&
      metadata.financialFormatVersion !== FINANCIAL_FORMAT_VERSION
    ) {
      return {
        isValid: false,
        error: `إصدار التنسيق المالي غير مدعوم (${metadata.financialFormatVersion})`,
      };
    }

    // 0.2: Reject V3+ backups if integrityHash is missing (Prevent Signature Stripping)
    // Exception: Allow missing hash if it was migrated from a legacy version (< 3)
    if (!metadata.integrityHash && schemaVer >= 3 && (metadata.originalSchemaVersion === undefined || metadata.originalSchemaVersion >= 3)) {
      return {
        isValid: false,
        error: 'النسخ الاحتياطية من الإصدار 3 فما فوق تتطلب توقيع سلامة البيانات (integrityHash missing)',
      };
    }

    // Verify SHA-256 Integrity Hash if present
    if (metadata.integrityHash) {
      const isHashValid = await verifyBackupIntegrityHash(payload, schemaVer);
      if (!isHashValid) {
        return {
          isValid: false,
          error: 'فشل التحقق من صحة التشفير والتجزئة (Integrity Hash Mismatch): قد يكون الملف تالفاً أو تم التعديل عليه يدوياً',
        };
      }
    }

    // Validate accounts: unique IDs, valid names, valid balances
    const accountIds = new Set<string>();
    for (const acc of accounts) {
      if (!acc || typeof acc !== 'object') {
        return { isValid: false, error: 'توجد بيانات حساب تالفة أو غير صالحة داخل النسخة' };
      }
      if (!acc.id || typeof acc.id !== 'string' || !acc.id.trim()) {
        return { isValid: false, error: 'يوجد حساب بمعرف مفقود أو غير صالح' };
      }
      if (accountIds.has(acc.id)) {
        return { isValid: false, error: `تكرار في معرفات الحسابات داخل النسخة (معرف مكرر: ${acc.id})` };
      }
      if (acc.archived !== true && acc.archived !== false && acc.archived !== 0 && acc.archived !== 1) {
        return { isValid: false, error: `قيمة archived غير صالحة للحساب ${acc.id}` };
      }
      accountIds.add(acc.id);

      if (!acc.name || typeof acc.name !== 'string' || !acc.name.trim()) {
        return { isValid: false, error: `اسم الحساب مفقود أو غير صالح للحساب (ID: ${acc.id})` };
      }

      const bal = acc.currentBalance !== undefined ? acc.currentBalance : acc.balance;
      if (bal !== undefined && (typeof bal !== 'number' || isNaN(bal) || !isFinite(bal))) {
        return { isValid: false, error: `رصيد غير صالح للحساب (ID: ${acc.id}): ${bal}` };
      }
    }

    // Validate transactions: unique IDs, valid accounts, valid amounts, types, dates
    const transactionIds = new Set<string>();
    for (const trx of transactions) {
      if (!trx || typeof trx !== 'object') {
        return { isValid: false, error: 'توجد بيانات معاملة تالفة أو غير صالحة داخل النسخة' };
      }
      if (!trx.id || typeof trx.id !== 'string' || !trx.id.trim()) {
        return { isValid: false, error: 'توجد معاملة بمعرف مفقود أو غير صالح' };
      }
      if (transactionIds.has(trx.id)) {
        return { isValid: false, error: `تكرار في معرفات المعاملات داخل النسخة (معرف مكرر: ${trx.id})` };
      }
      transactionIds.add(trx.id);

      if (!trx.accountId || typeof trx.accountId !== 'string' || !trx.accountId.trim()) {
        return { isValid: false, error: `معاملة بدون حساب مرتبط (ID: ${trx.id})` };
      }
      if (!accountIds.has(trx.accountId)) {
        return { isValid: false, error: `توجد معاملة تشير إلى حساب غير موجود بالنسخة (ID: ${trx.accountId})` };
      }
      if (typeof trx.amount !== 'number' || isNaN(trx.amount) || !isFinite(trx.amount) || trx.amount <= 0) {
        return { isValid: false, error: `مبلغ غير صالح في المعاملة (ID: ${trx.id}): ${trx.amount}` };
      }
      if (trx.type !== 'debit' && trx.type !== 'credit') {
        return { isValid: false, error: `نوع المعاملة غير صالح (ID: ${trx.id}): ${trx.type}` };
      }
      if (!trx.date || typeof trx.date !== 'string' || isNaN(Date.parse(trx.date))) {
        return { isValid: false, error: `تاريخ المعاملة غير صالح (ID: ${trx.id}): ${trx.date}` };
      }
    }

    return {
      isValid: true,
      details: {
        accountCount: accounts.length,
        transactionCount: transactions.length,
        debtCount: Array.isArray(payload.debts) ? payload.debts.length : 0,
        schemaVersion: schemaVer,
        createdAt: metadata.createdAt,
        deviceId: metadata.deviceId || 'غير معروف',
        deviceName: metadata.deviceName,
      },
    };
  }

  /**
   * Creates an automatic local safety snapshot before any destructive restore operation.
   * - 1.1: Moved from localStorage to Dexie safetyBackups table.
   */
  public async createPreRestoreSafetyBackup(): Promise<BackupPayload> {
    if (this._simulateSafetyBackupFailure) {
      throw new Error('فشل مقصود في إنشاء نسخة الأمان لاختبار الحماية (Simulated Safety Backup Failure)');
    }

    try {
      const currentPayload = await this.generateBackupPayload({ internal: true });
      const activeDb = getDb();
      
      await activeDb.safetyBackups.add({
        id: 'safety_' + Date.now(),
        payload: currentPayload,
        createdAt: new Date().toISOString(),
        type: 'automatic',
      });
      
      return currentPayload;
    } catch (err: any) {
      throw new Error(
        `فشل إنشاء نسخة الأمان الاحتياطية قبل الاستعادة (Safety Backup Failed): ${err?.message || 'تعذر حفظ لقطة الأمان'}`
      );
    }
  }

  /**
   * Restores data from the last emergency pre-restore safety backup if exists.
   */
  public async rollbackToSafetyBackup(): Promise<boolean> {
    try {
      const activeDb = getDb();
      const lastSafety = await activeDb.safetyBackups.orderBy('createdAt').reverse().first();
      
      if (!lastSafety || !lastSafety.payload) return false;
      
      await this.restoreFromPayload(lastSafety.payload, 'replace', { skipSafetyBackup: true, internal: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs full restoration from a BackupPayload with strict pipeline ordering:
   * 
   * 2.3 Merge Semantics:
   * - replace: Clears existing local data before inserting backup data.
   * - merge: Upserts records by ID. If ID exists locally, the backup version OVERWRITES local version (Backup Wins).
   *
   * Pipeline:
   * RAW BACKUP
   *     ↓
   * getBackupSchemaVersion()
   *     ↓
   * Future Version Gate (Rejected immediately before any DB mutation)
   *     ↓
   * Pre-Migration Integrity Hash Check (Legacy V1/V2 or Modern V3)
   *     ↓
   * migrateBackupPayload() (In-memory only)
   *     ↓
   * validateBackupPayload() (Exhaustive schema, entity, reference and financial validation)
   *     ↓
   * Pre-Restore Safety Backup (If fails, restore is blocked immediately)
   *     ↓
   * Atomic Restore (Dexie Transaction: all-or-nothing rollback)
   *     ↓
   * Post-Restore Integrity Audit & Balance Safety
   */
  public async restoreFromPayload(
    rawPayload: any,
    mode: 'replace' | 'merge' = 'replace',
    options: { skipSafetyBackup?: boolean; internal?: boolean } = {}
  ): Promise<{ success: boolean; message: string }> {
    // 0. RBAC Guard: assert backup:restore (Skip if internal)
    if (!options.internal) {
      await rbacGuard.assertPermission('backup:restore', {
        targetType: 'backup',
        details: `استعادة البيانات من نسخة احتياطية (النمط: ${mode === 'replace' ? 'استبدال كامل' : 'دمج'})`,
      });
    }

    // 1. RAW BACKUP & STRUCTURAL BASELINE
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload Object)');
    }
    if (!rawPayload.metadata || typeof rawPayload.metadata !== 'object') {
      throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
    }

    // SEC-07: Early Structure & Entity Volume Defense (Pre-Migration / Pre-Allocation Gate)
    // Validate arrays strictly and enforce hard boundaries before expensive hashing, migration, or DB mutation
    if (rawPayload.accounts !== undefined && !Array.isArray(rawPayload.accounts)) {
      throw new Error('قائمة الحسابات في ملف النسخة الاحتياطية غير صالحة (Accounts must be an array)');
    }
    if (rawPayload.transactions !== undefined && !Array.isArray(rawPayload.transactions)) {
      throw new Error('قائمة المعاملات في ملف النسخة الاحتياطية غير صالحة (Transactions must be an array)');
    }
    if (rawPayload.settings !== undefined && !Array.isArray(rawPayload.settings)) {
      throw new Error('قائمة الإعدادات في ملف النسخة الاحتياطية غير صالحة (Settings must be an array)');
    }

    const rawAccountsCount = Array.isArray(rawPayload.accounts) ? rawPayload.accounts.length : 0;
    const rawTrxCount = Array.isArray(rawPayload.transactions) ? rawPayload.transactions.length : 0;
    const rawSettingsCount = Array.isArray(rawPayload.settings) ? rawPayload.settings.length : 0;

    if (rawAccountsCount > MAX_BACKUP_ACCOUNTS) {
      throw new Error(
        `عدد الحسابات في النسخة الاحتياطية (${rawAccountsCount}) يتجاوز الحد الأقصى المسموح به (${MAX_BACKUP_ACCOUNTS}). تم إيقاف الاستعادة لحماية الذاكرة.`
      );
    }

    if (rawTrxCount > MAX_BACKUP_TRANSACTIONS) {
      throw new Error(
        `عدد المعاملات في النسخة الاحتياطية (${rawTrxCount}) يتجاوز الحد الأقصى المسموح به (${MAX_BACKUP_TRANSACTIONS}). تم إيقاف الاستعادة لحماية الذاكرة.`
      );
    }

    if (rawSettingsCount > MAX_BACKUP_SETTINGS) {
      throw new Error(
        `عدد عناصر الإعدادات في النسخة الاحتياطية (${rawSettingsCount}) يتجاوز الحد الأقصى المسموح به (${MAX_BACKUP_SETTINGS}). تم إيقاف الاستعادة لحماية الذاكرة.`
      );
    }

    // 2. FUTURE VERSION GATE
    const rawVersion = getBackupSchemaVersion(rawPayload.metadata);
    if (rawVersion > BACKUP_SCHEMA_VERSION) {
      throw new Error(
        `Backup schema version ${rawVersion} is newer than the supported version ${BACKUP_SCHEMA_VERSION}. Please update Hisabati before restoring this backup.`
      );
    }

    // 3. PRE-MIGRATION INTEGRITY HASH VALIDATION
    // Strategy: Legacy V1/V2 hashes must be verified against unmigrated raw payload,
    // guaranteeing cryptographic integrity before any data transformation.
    // 0.2: Reject V3+ if integrityHash is missing
    if (!rawPayload.metadata.integrityHash && rawVersion >= 3) {
      throw new Error('النسخ الاحتياطية من الإصدار 3 فما فوق تتطلب توقيع سلامة البيانات (integrityHash missing)');
    }

    if (rawPayload.metadata.integrityHash) {
      const isHashValid = await verifyBackupIntegrityHash(rawPayload, rawVersion);
      if (!isHashValid) {
        throw new Error(
          'فشل التحقق من صحة التشفير والتجزئة (Integrity Hash Mismatch): قد يكون الملف تالفاً أو تم التعديل عليه يدوياً'
        );
      }
    }

    // 4. MIGRATION (IN-MEMORY ONLY)
    const payload: BackupPayload = await migrateBackupPayload(rawPayload);

    // 5. MIGRATED PAYLOAD VALIDATION
    // Ensure migrated payload strictly adheres to all current schema rules
    const validation = await this.validateBackupPayload(payload);
    if (!validation.isValid) {
      throw new Error(validation.error || 'ملف النسخة الاحتياطية غير صالح');
    }

    // 6. PRE-RESTORE SAFETY BACKUP
    // Mandatory snapshot before ANY destructive DB mutation.
    // If safety backup fails, restore is aborted immediately!
    if (!options.skipSafetyBackup) {
      await this.createPreRestoreSafetyBackup();
    }

    const activeDb = getDb(); // 0.4: Stable database access

    // Capture existing local permanent tombstones before restore
    let existingPermTombstones: any[] = [];
    try {
      const entry = await activeDb.settings.get('hisabati_permanent_tombstones');
      if (entry && Array.isArray(entry.value)) {
        existingPermTombstones = entry.value;
      }
    } catch {}

    // 7. ATOMIC RESTORE (DEXIE TRANSACTION)
    // All-or-nothing rollback on any write failure
    await activeDb.transaction('rw', [activeDb.accounts, activeDb.transactions, activeDb.settings, activeDb.trash, activeDb.auditTrail, activeDb.debts], async () => {
      const txDb = getDb(); // Direct access within transaction

      if (mode === 'replace') {
        await txDb.transactions.clear();
        await txDb.accounts.clear();
        await txDb.trash.clear(); // 1.6
        await txDb.auditTrail.clear(); // 1.6
        await txDb.debts.clear(); // [1.6 T-A]
      }

      if (Array.isArray(payload.settings) && payload.settings.length > 0) {
        await txDb.settings.bulkPut(payload.settings);
      }

      // Merge existing local permanent tombstones with restored settings
      let restoredTombstones: any[] = [];
      const restoredTombEntry = await txDb.settings.get('hisabati_permanent_tombstones');
      if (restoredTombEntry && Array.isArray(restoredTombEntry.value)) {
        restoredTombstones = restoredTombEntry.value;
      }
      const mergedTombstonesMap = new Map<string, any>();
      existingPermTombstones.forEach((t) => mergedTombstonesMap.set(t.id, t));
      restoredTombstones.forEach((t) => mergedTombstonesMap.set(t.id, t));
      const finalTombstones = Array.from(mergedTombstonesMap.values());

      await txDb.settings.put({
        id: 'hisabati_permanent_tombstones',
        key: 'hisabati_permanent_tombstones',
        value: finalTombstones,
        updatedAt: new Date().toISOString(),
      });

      const tombstoneIds = new Set(finalTombstones.map((t) => t.id));

      if (payload.accounts && payload.accounts.length > 0) {
        // [2.2] Normalize archived boolean -> number (0/1) for compatibility with V1-V9 backups
        const normalizedAccounts = payload.accounts.map((a: any) => ({
          ...a,
          archived: a.archived === true ? 1 : a.archived === false ? 0 : a.archived,
        }));
        const validAccounts = normalizedAccounts.filter((a: any) => !tombstoneIds.has(a.id));
        if (validAccounts.length > 0) {
          await txDb.accounts.bulkPut(validAccounts);
        }
      }

      if (payload.transactions && payload.transactions.length > 0) {
        const validTransactions = payload.transactions.filter((t: any) => !tombstoneIds.has(t.id));
        if (validTransactions.length > 0) {
          await txDb.transactions.bulkPut(validTransactions);
        }
      }

      // 1.6: Restore trash and auditTrail
      if (Array.isArray(payload.trash) && payload.trash.length > 0) {
        await txDb.trash.bulkPut(payload.trash);
      }
      if (Array.isArray(payload.auditTrail) && payload.auditTrail.length > 0) {
        await txDb.auditTrail.bulkPut(payload.auditTrail);
      }
      if (Array.isArray(payload.debts) && payload.debts.length > 0) {
        await txDb.debts.bulkPut(payload.debts);
      }
    });

    // 8. POST-RESTORE BALANCE RECALCULATION & INTEGRITY AUDIT
    await transactionEngine.recalculateAllBalances();
    const integrityAudit = await integrityService.verifyFinancialIntegrity();
    if (!integrityAudit.valid && integrityAudit.inconsistencies.length > 0) {
      // Auto-heal balances if issues found
      await integrityService.autoFixAll();
    }

    return {
      success: true,
      message: `تمت الاستعادة بنجاح (${payload.accounts.length} حساب، ${payload.transactions.length} معاملة)`,
    };
  }

  /**
   * Uploads a fresh verified backup directly to Google Drive with AES-GCM 256 encryption.
   */
  public async uploadBackupToGoogleDrive(): Promise<{ success: boolean; backupId: string; fileId: string }> {
    if (!googleDriveService.isConnected()) {
      throw new Error('لم يتم توصيل حساب Google Drive بعد');
    }

    // Check financial integrity before upload
    const integrity = await integrityService.auditIntegrity();
    if (!integrity.healthy) {
      throw new Error('لا يمكن رفع النسخة الاحتياطية لأن قاعدة البيانات المحلية تحتوي على تعارضات أو أخطاء حسابية');
    }

    const payload = await this.generateBackupPayload();
    const nowIso = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `hisabati-backup-${nowIso}.enc.json`;

    // SEC-02: Encrypt backup payload with AES-GCM 256
    const { cipherText, iv } = await encryptBackupPayload(payload);
    
    // 2.2: Calculate containerHash for encrypted container
    const containerBuffer = new TextEncoder().encode(iv + cipherText);
    const containerHashBuffer = await crypto.subtle.digest('SHA-256', containerBuffer);
    const containerHash = Array.from(new Uint8Array(containerHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const encryptedContainer = {
      isEncrypted: true,
      algorithm: 'AES-GCM-256',
      iv,
      data: cipherText,
      containerHash, // 2.2
    };

    // 2.2: Shrunk metadata for Google Drive
    const driveMetadata = {
      backupSchemaVersion: payload.metadata.backupSchemaVersion,
      createdAt: payload.metadata.createdAt,
      accountCount: payload.metadata.accountCount,
      transactionCount: payload.metadata.transactionCount,
      isEncrypted: true,
      keyFingerprint: payload.metadata.keyFingerprint,
      containerHash,
    };

    const result = await googleDriveService.uploadJsonFile(filename, encryptedContainer, driveMetadata);

    return {
      success: true,
      backupId: payload.metadata.backupId,
      fileId: result.id,
    };
  }

  /**
   * Downloads and restores an encrypted or legacy backup from Google Drive file ID.
   * - 2.4: Added fileId regex validation and size check before download.
   */
  public async restoreBackupFromGoogleDrive(
    fileId: string,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    if (!googleDriveService.isConnected()) {
      throw new Error('لم يتم توصيل حساب Google Drive بعد');
    }

    // 2.4: Validate fileId format (Google Drive IDs are usually 33 chars of alphanumeric and underscores/hyphens)
    const driveIdRegex = /^[a-zA-Z0-9_-]{25,50}$/;
    if (!driveIdRegex.test(fileId)) {
      throw new Error('معرف الملف غير صالح (Invalid Google Drive File ID)');
    }

    // 2.4: Optional size check if metadata available (Resource Exhaustion Defense)
    // Note: googleDriveService.getFileInfo could be called here if needed.

    const rawData = await googleDriveService.downloadJsonFile<any>(fileId);
    let payload: BackupPayload;
    if (rawData && rawData.isEncrypted && rawData.data && rawData.iv) {
      payload = await decryptBackupPayload(rawData.data, rawData.iv);
    } else {
      payload = rawData as BackupPayload; // Legacy fallback
    }

    return await this.restoreFromPayload(payload, mode);
  }
}

export const backupService = new BackupService();
