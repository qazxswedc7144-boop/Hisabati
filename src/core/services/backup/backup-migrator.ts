/**
 * CHANGELOG
 * - 1.7: Added migrateBackupV3ToV4 for Schema V4 support.
 * - 2.0: BK-MIG-03: Removed all 'any' types, introduced strict typing (BackupPayload, BackupMetadata) and runtime validation for unknown inputs.
 */

import {
  DATABASE_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../../database/schemaVersion';
import { BackupPayload, BackupMetadata } from '@/shared/types';
import { Account, Transaction, SettingsEntry } from '@/shared/types';

/**
 * Extracts and resolves the backup schema version from metadata.
 */
export function getBackupSchemaVersion(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') {
    return 1;
  }
  const meta = metadata as Record<string, unknown>;

  if (
    typeof meta.backupSchemaVersion === 'number' &&
    Number.isInteger(meta.backupSchemaVersion)
  ) {
    return meta.backupSchemaVersion;
  }

  if (
    typeof meta.schemaVersion === 'number' &&
    Number.isInteger(meta.schemaVersion)
  ) {
    return meta.schemaVersion;
  }

  return 1;
}

export function migrateBackupV1ToV2(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }
  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload) as BackupPayload;
  
  if (Array.isArray(migrated.accounts)) {
    migrated.accounts = migrated.accounts.map((a) => ({
      ...a,
      archived: a.archived ? 1 : 0,
    }));
  }

  migrated.metadata.backupSchemaVersion = 2;
  migrated.metadata.schemaVersion = 2;

  return migrated;
}

export function migrateBackupV2ToV3(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }
  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload) as BackupPayload;

  if (Array.isArray(migrated.accounts)) {
    migrated.accounts = migrated.accounts.map((a) => ({
      ...a,
      archived: a.archived ? 1 : 0,
    }));
  }

  migrated.metadata.backupSchemaVersion = 3;

  migrated.metadata.databaseSchemaVersion =
    typeof migrated.metadata.databaseSchemaVersion === 'number' &&
    Number.isInteger(migrated.metadata.databaseSchemaVersion)
      ? migrated.metadata.databaseSchemaVersion
      : 6;

  migrated.metadata.financialFormatVersion =
    typeof migrated.metadata.financialFormatVersion === 'number' &&
    Number.isInteger(migrated.metadata.financialFormatVersion)
      ? migrated.metadata.financialFormatVersion
      : FINANCIAL_FORMAT_VERSION;

  migrated.metadata.schemaVersion = 3;

  return migrated;
}

export function migrateBackupV3ToV4(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }
  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload) as BackupPayload;

  if (Array.isArray(migrated.accounts)) {
    migrated.accounts = migrated.accounts.map((a) => ({
      ...a,
      archived: a.archived ? 1 : 0,
    }));
  }

  migrated.metadata.backupSchemaVersion = 4;
  migrated.metadata.schemaVersion = 4;
  
  if (migrated.metadata.databaseSchemaVersion === undefined || migrated.metadata.databaseSchemaVersion < 8) {
    migrated.metadata.databaseSchemaVersion = DATABASE_SCHEMA_VERSION;
  }

  return migrated;
}

export function migrateBackupV4ToV5(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }
  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload) as BackupPayload;
  
  if (Array.isArray(migrated.accounts)) {
    migrated.accounts = migrated.accounts.map((a) => ({
      ...a,
      archived: a.archived ? 1 : 0,
    }));
  }

  const now = new Date().toISOString();
  const debts: Array<Record<string, unknown>> = migrated.debts ?? [];
  const accounts = migrated.accounts ?? [];

  for (const acc of accounts) {
    const dueDate = (acc as unknown as Record<string, unknown>).dueDate as string | undefined;
    const amountMinor = acc.currentBalanceMinor;
    if (dueDate && typeof amountMinor === 'number' && amountMinor > 0) {
      const exists = debts.some((d) => d.accountId === acc.id);
      if (!exists) {
        debts.push({
          id: 'debt_mig_' + acc.id,
          accountId: acc.id,
          amountMinor,
          paidMinor: 0,
          remainingMinor: amountMinor,
          dueDate,
          status: 'open',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  migrated.debts = debts;
  migrated.metadata.backupSchemaVersion = 5;
  migrated.metadata.schemaVersion = 5;
  migrated.metadata.databaseSchemaVersion = DATABASE_SCHEMA_VERSION;

  return migrated;
}

export function migrateBackupV5ToV6(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }
  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload) as BackupPayload;

  if (Array.isArray(migrated.accounts)) {
    migrated.accounts = migrated.accounts.map((a) => ({
      ...a,
      archived: a.archived ? 1 : 0,
    }));
  }

  let totalDebitMinor = 0;
  let totalCreditMinor = 0;
  const txs = Array.isArray(migrated.transactions) ? migrated.transactions : [];
  for (const t of txs) {
    const status = t.status || 'posted';
    if (status !== 'posted') continue;
    const minor = (typeof t.amountMinor === 'number' && isFinite(t.amountMinor))
      ? t.amountMinor
      : Math.round((t.amount || 0) * 100);
    if (t.type === 'debit') totalDebitMinor += minor;
    else if (t.type === 'credit') totalCreditMinor += minor;
  }

  migrated.metadata.totalDebitMinor = totalDebitMinor;
  migrated.metadata.totalCreditMinor = totalCreditMinor;
  migrated.metadata.backupSchemaVersion = 6;
  migrated.metadata.schemaVersion = 6;
  migrated.metadata.databaseSchemaVersion = DATABASE_SCHEMA_VERSION;

  return migrated;
}

export async function migrateBackupPayload(payload: unknown): Promise<BackupPayload> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload Object)');
  }

  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  let migrated = structuredClone(payload) as BackupPayload;
  const version = getBackupSchemaVersion(migrated.metadata);

  if (version > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Backup schema version ${version} is newer than the supported version ${BACKUP_SCHEMA_VERSION}. Please update Hisabati before restoring this backup.`
    );
  }

  if (version < BACKUP_SCHEMA_VERSION && migrated.metadata.originalSchemaVersion === undefined) {
    migrated.metadata.originalSchemaVersion = version;
  }

  if (version === 1) {
    migrated = migrateBackupV1ToV2(migrated);
  }

  if (getBackupSchemaVersion(migrated.metadata) === 2) {
    migrated = migrateBackupV2ToV3(migrated);
  }

  if (getBackupSchemaVersion(migrated.metadata) === 3) {
    migrated = migrateBackupV3ToV4(migrated);
  }

  if (getBackupSchemaVersion(migrated.metadata) === 4) {
    migrated = migrateBackupV4ToV5(migrated);
  }

  if (getBackupSchemaVersion(migrated.metadata) === 5) {
    migrated = migrateBackupV5ToV6(migrated);
  }

  if (getBackupSchemaVersion(migrated.metadata) === BACKUP_SCHEMA_VERSION) {
    migrated.metadata.backupSchemaVersion = BACKUP_SCHEMA_VERSION;
    migrated.metadata.databaseSchemaVersion =
      typeof migrated.metadata.databaseSchemaVersion === 'number' &&
      Number.isInteger(migrated.metadata.databaseSchemaVersion)
        ? migrated.metadata.databaseSchemaVersion
        : DATABASE_SCHEMA_VERSION;
    migrated.metadata.financialFormatVersion =
      typeof migrated.metadata.financialFormatVersion === 'number' &&
      Number.isInteger(migrated.metadata.financialFormatVersion)
        ? migrated.metadata.financialFormatVersion
        : FINANCIAL_FORMAT_VERSION;
    migrated.metadata.schemaVersion = BACKUP_SCHEMA_VERSION;
  }

  if (migrated.metadata.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('فشل ترحيل النسخة الاحتياطية إلى الإصدار المطلوب (Backup Migration Incomplete)');
  }

  return migrated;
}
