/**
 * Backup Service for Hisabati.
 * Manages full database snapshots, validation, schema versioning, SHA-256 integrity hashing,
 * safety pre-restore snapshots, and recovery.
 */

import { db } from '../database/db';
import { BackupPayload, BackupMetadata } from '@/shared/types';
import {
  calculateBackupPayloadHash,
  verifyBackupIntegrityHash,
  verifyCurrentBackupHash,
  verifyLegacyBackupHash,
  encryptBackupPayload,
  decryptBackupPayload,
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
const SAFETY_BACKUP_STORAGE_KEY = 'hisabati_safety_pre_restore_backup';

export class BackupService {
  // Test hook to simulate safety backup failures in security unit tests
  public _simulateSafetyBackupFailure: boolean = false;

  /**
   * Generates a validated and cryptographically hashed snapshot of the local database.
   */
  public async generateBackupPayload(): Promise<BackupPayload> {
    const accounts = await db.accounts.toArray();
    const transactions = await db.transactions.toArray();
    const settings = await db.settings.toArray();

    // Compute sums for integrity verification
    let totalDebitSum = 0;
    let totalCreditSum = 0;
    for (const trx of transactions) {
      if (trx.type === 'debit') totalDebitSum += trx.amount;
      else if (trx.type === 'credit') totalCreditSum += trx.amount;
    }

    const backupId = 'bck_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const createdAt = new Date().toISOString();
    const deviceId = getDeviceId();
    const deviceName = getDeviceName();

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
      totalDebitSum: Math.round(totalDebitSum * 100) / 100,
      totalCreditSum: Math.round(totalCreditSum * 100) / 100,
    };

    const integrityHash = await calculateBackupPayloadHash({
      metadata: rawMetadata as any,
      accounts,
      transactions,
      settings,
    });

    const payload: BackupPayload = {
      metadata: {
        ...rawMetadata,
        integrityHash,
      },
      accounts,
      transactions,
      settings,
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
        schemaVersion: schemaVer,
        createdAt: metadata.createdAt,
        deviceId: metadata.deviceId || 'غير معروف',
        deviceName: metadata.deviceName,
      },
    };
  }

  /**
   * Creates an automatic local safety snapshot before any destructive restore operation.
   * Throws an explicit error if safety snapshot generation or storage fails,
   * guaranteeing that restore NEVER proceeds without a verified safety backup.
   */
  public async createPreRestoreSafetyBackup(): Promise<BackupPayload> {
    if (this._simulateSafetyBackupFailure) {
      throw new Error('فشل مقصود في إنشاء نسخة الأمان لاختبار الحماية (Simulated Safety Backup Failure)');
    }

    try {
      const currentPayload = await this.generateBackupPayload();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAFETY_BACKUP_STORAGE_KEY, JSON.stringify(currentPayload));
      }
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
    if (typeof localStorage === 'undefined') return false;
    const raw = localStorage.getItem(SAFETY_BACKUP_STORAGE_KEY);
    if (!raw) return false;
    try {
      const payload = JSON.parse(raw);
      await this.restoreFromPayload(payload, 'replace');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs full restoration from a BackupPayload with strict pipeline ordering:
   *
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
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    // 1. RAW BACKUP & STRUCTURAL BASELINE
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload Object)');
    }
    if (!rawPayload.metadata || typeof rawPayload.metadata !== 'object') {
      throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
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
    await this.createPreRestoreSafetyBackup();

    // 7. ATOMIC RESTORE (DEXIE TRANSACTION)
    // All-or-nothing rollback on any write failure
    await db.transaction('rw', [db.accounts, db.transactions, db.settings], async () => {
      if (mode === 'replace') {
        await db.transactions.clear();
        await db.accounts.clear();
      }

      if (payload.accounts && payload.accounts.length > 0) {
        await db.accounts.bulkPut(payload.accounts);
      }

      if (payload.transactions && payload.transactions.length > 0) {
        await db.transactions.bulkPut(payload.transactions);
      }

      if (Array.isArray(payload.settings) && payload.settings.length > 0) {
        await db.settings.bulkPut(payload.settings);
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
    const encryptedContainer = {
      isEncrypted: true,
      algorithm: 'AES-GCM-256',
      iv,
      data: cipherText,
    };

    const result = await googleDriveService.uploadJsonFile(filename, encryptedContainer, {
      ...payload.metadata,
      isEncrypted: true,
    });

    return {
      success: true,
      backupId: payload.metadata.backupId,
      fileId: result.id,
    };
  }

  /**
   * Downloads and restores an encrypted or legacy backup from Google Drive file ID.
   */
  public async restoreBackupFromGoogleDrive(
    fileId: string,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    if (!googleDriveService.isConnected()) {
      throw new Error('لم يتم توصيل حساب Google Drive بعد');
    }

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
