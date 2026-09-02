/**
 * Backup Service for Hisabati.
 * Manages full database snapshots, validation, schema versioning, SHA-256 integrity hashing,
 * safety pre-restore snapshots, and recovery.
 */

import { db } from '../database/db';
import { BackupPayload, BackupMetadata } from '@/shared/types';
import { calculateBackupPayloadHash } from '../utils/crypto';
import { getDeviceId, getDeviceName } from '../utils/deviceId';
import { integrityService } from './integrity.service';
import { transactionEngine } from './transactionEngine.service';
import { googleDriveService } from './googleDrive.service';

const CURRENT_SCHEMA_VERSION = 2;
const APP_VERSION = '2.0.0';
const SAFETY_BACKUP_STORAGE_KEY = 'hisabati_safety_pre_restore_backup';

export class BackupService {
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
      schemaVersion: CURRENT_SCHEMA_VERSION,
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

    if (!metadata || !Array.isArray(accounts) || !Array.isArray(transactions)) {
      return { isValid: false, error: 'الملف لا يحتوي على الحسابات أو المعاملات أو البيانات الوصفية المطلوبة' };
    }

    if (!metadata.schemaVersion || metadata.schemaVersion > CURRENT_SCHEMA_VERSION) {
      return {
        isValid: false,
        error: `إصدار المخطط (${metadata.schemaVersion || 0}) غير متوافق مع إصدار التطبيق الحالي (${CURRENT_SCHEMA_VERSION})`,
      };
    }

    // Verify SHA-256 Integrity Hash if present
    if (metadata.integrityHash) {
      const calculatedHash = await calculateBackupPayloadHash({
        metadata,
        accounts,
        transactions,
        settings: settings || [],
      });

      if (calculatedHash !== metadata.integrityHash) {
        return {
          isValid: false,
          error: 'فشل التحقق من صحة التشفير والتجزئة (Integrity Hash Mismatch): قد يكون الملف تالفاً أو تم التعديل عليه يدوياً',
        };
      }
    }

    // Validate Account ID references inside transactions
    const accountIds = new Set(accounts.map((a: any) => a.id));
    for (const trx of transactions) {
      if (!trx.id || !trx.accountId || typeof trx.amount !== 'number') {
        return { isValid: false, error: 'توجد معاملات مالية مفقودة البيانات أو غير مكتملة' };
      }
      if (!accountIds.has(trx.accountId)) {
        return { isValid: false, error: `توجد معاملة تشير إلى حساب غير موجود بالنسخة (ID: ${trx.accountId})` };
      }
    }

    return {
      isValid: true,
      details: {
        accountCount: accounts.length,
        transactionCount: transactions.length,
        schemaVersion: metadata.schemaVersion,
        createdAt: metadata.createdAt,
        deviceId: metadata.deviceId || 'غير معروف',
        deviceName: metadata.deviceName,
      },
    };
  }

  /**
   * Creates an automatic local safety snapshot before any destructive restore operation.
   */
  public async createPreRestoreSafetyBackup(): Promise<void> {
    try {
      const currentPayload = await this.generateBackupPayload();
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SAFETY_BACKUP_STORAGE_KEY, JSON.stringify(currentPayload));
      }
    } catch (err) {
      console.warn('Failed to store pre-restore safety backup in localStorage', err);
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
   * Performs full restoration from a validated BackupPayload with safety checks and financial re-computation.
   */
  public async restoreFromPayload(
    payload: BackupPayload,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    const validation = await this.validateBackupPayload(payload);
    if (!validation.isValid) {
      throw new Error(validation.error || 'ملف النسخة الاحتياطية غير صالح');
    }

    // 1. Create Pre-Restore Safety Snapshot
    await this.createPreRestoreSafetyBackup();

    // 2. Perform DB operations atomically
    await db.transaction('rw', db.accounts, db.transactions, db.settings, async () => {
      if (mode === 'replace') {
        await db.transactions.clear();
        await db.accounts.clear();
      }

      // Add or update accounts
      for (const acc of payload.accounts) {
        await db.accounts.put(acc);
      }

      // Add or update transactions
      for (const trx of payload.transactions) {
        await db.transactions.put(trx);
      }

      // Restore settings if present
      if (Array.isArray(payload.settings)) {
        for (const set of payload.settings) {
          await db.settings.put(set);
        }
      }
    });

    // 3. Post-Restore Financial Invariant Validation & Recalculation
    await transactionEngine.recalculateAllBalances();
    const integrityCheck = await integrityService.auditIntegrity();

    if (!integrityCheck.healthy && integrityCheck.issues.length > 0) {
      // Auto-heal balances if issues found
      await integrityService.autoFixAll();
    }

    return {
      success: true,
      message: `تمت الاستعادة بنجاح (${payload.accounts.length} حساب، ${payload.transactions.length} معاملة)`,
    };
  }

  /**
   * Uploads a fresh verified backup directly to Google Drive.
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
    const filename = `hisabati-backup-${nowIso}.json`;

    const result = await googleDriveService.uploadJsonFile(filename, payload, payload.metadata);

    return {
      success: true,
      backupId: payload.metadata.backupId,
      fileId: result.id,
    };
  }

  /**
   * Downloads and restores a backup from Google Drive file ID.
   */
  public async restoreBackupFromGoogleDrive(
    fileId: string,
    mode: 'replace' | 'merge' = 'replace'
  ): Promise<{ success: boolean; message: string }> {
    if (!googleDriveService.isConnected()) {
      throw new Error('لم يتم توصيل حساب Google Drive بعد');
    }

    const payload = await googleDriveService.downloadJsonFile<BackupPayload>(fileId);
    return await this.restoreFromPayload(payload, mode);
  }
}

export const backupService = new BackupService();
