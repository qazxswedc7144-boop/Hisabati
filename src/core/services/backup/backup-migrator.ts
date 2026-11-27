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
import { Account, Transaction, SettingsEntry, CurrencyCode } from '@/shared/types';
import { decimalToMinor, minorToDecimal } from '../../money/converter';
import { calculateBackupPayloadHash } from '../../utils/crypto';

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
  // Preserve V5 scalar totals solely for validating the original V5 integrity hash.
  migrated.metadata.legacyTotalDebitSum = migrated.metadata.totalDebitSum;
  migrated.metadata.legacyTotalCreditSum = migrated.metadata.totalCreditSum;

  // 1. Resolve currencies and fill missing amountMinor/currentBalanceMinor
  const settings = Array.isArray(migrated.settings) ? migrated.settings : [];
  const systemCurrency = (settings.find(s => s.key === 'currency')?.value as CurrencyCode) || 'YER';

  if (Array.isArray(migrated.accounts)) {
    migrated.accounts = migrated.accounts.map((a) => {
      const currency = (a.currency as CurrencyCode) || systemCurrency;
      const amountMinor = (typeof a.currentBalanceMinor === 'number' && isFinite(a.currentBalanceMinor))
        ? a.currentBalanceMinor
        : decimalToMinor(a.currentBalance || 0, currency as string);
      
      return {
        ...a,
        archived: a.archived ? 1 : 0,
        currency: currency as CurrencyCode,
        currentBalanceMinor: amountMinor,
      } as Account;
    });
  }

  const accountsMap = new Map((migrated.accounts || []).map(a => [a.id, a]));

  const currencyTotals: Record<string, {
    totalDebitMinor: number;
    totalCreditMinor: number;
    totalDebit: number;
    totalCredit: number;
  }> = {};
  const ensureCurrencyTotals = (currency: string) => {
    if (!currencyTotals[currency]) {
      currencyTotals[currency] = {
        totalDebitMinor: 0,
        totalCreditMinor: 0,
        totalDebit: 0,
        totalCredit: 0,
      };
    }
    return currencyTotals[currency];
  };
  if (Array.isArray(migrated.transactions)) {
    migrated.transactions = migrated.transactions.map(t => {
      const acc = accountsMap.get(t.accountId);
      const currency = (t.currency as CurrencyCode) || (acc?.currency as CurrencyCode) || systemCurrency;

      const minor = (typeof t.amountMinor === 'number' && isFinite(t.amountMinor))
        ? t.amountMinor
        : decimalToMinor(t.amount || 0, currency as string);

      const status = t.status || 'posted';
      if (status === 'posted') {
        const totals = ensureCurrencyTotals(currency);
        if (t.type === 'debit') totals.totalDebitMinor += minor;
        else if (t.type === 'credit') totals.totalCreditMinor += minor;
      }

      return {
        ...t,
        currency: currency as CurrencyCode,
        amountMinor: minor,
        status,
      } as Transaction;
    });
  }

  if (Object.keys(currencyTotals).length === 0) ensureCurrencyTotals(systemCurrency);

  for (const [currency, totals] of Object.entries(currencyTotals)) {
    totals.totalDebit = minorToDecimal(totals.totalDebitMinor, currency);
    totals.totalCredit = minorToDecimal(totals.totalCreditMinor, currency);
  }
  migrated.metadata.currencyTotals = currencyTotals;
  const singleCurrencyTotals = Object.keys(currencyTotals).length === 1
    ? currencyTotals[Object.keys(currencyTotals)[0]]
    : undefined;
  if (singleCurrencyTotals) {
    migrated.metadata.totalDebitMinor = singleCurrencyTotals.totalDebitMinor;
    migrated.metadata.totalCreditMinor = singleCurrencyTotals.totalCreditMinor;
    migrated.metadata.totalDebitSum = singleCurrencyTotals.totalDebit;
    migrated.metadata.totalCreditSum = singleCurrencyTotals.totalCredit;
  } else {
    delete migrated.metadata.totalDebitMinor;
    delete migrated.metadata.totalCreditMinor;
    delete migrated.metadata.totalDebitSum;
    delete migrated.metadata.totalCreditSum;
  }
  migrated.metadata.backupSchemaVersion = 6;
  migrated.metadata.schemaVersion = 6;
  migrated.metadata.databaseSchemaVersion = DATABASE_SCHEMA_VERSION;

  return migrated;
}

/**
 * V6 -> V7: preserve old V6 hash inputs, then replace ambiguous scalar totals
 * with integrity-hashed currency-specific totals.
 */
export function migrateBackupV6ToV7(payload: unknown): BackupPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }
  const p = payload as Record<string, unknown>;
  if (!p.metadata || typeof p.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload) as BackupPayload;
  const originalVersion = migrated.metadata.originalSchemaVersion;
  if (originalVersion === 6) {
    migrated.metadata.legacyTotalDebitSum = migrated.metadata.totalDebitSum;
    migrated.metadata.legacyTotalCreditSum = migrated.metadata.totalCreditSum;
    migrated.metadata.legacyTotalDebitMinor = migrated.metadata.totalDebitMinor;
    migrated.metadata.legacyTotalCreditMinor = migrated.metadata.totalCreditMinor;
  }

  const settings = Array.isArray(migrated.settings) ? migrated.settings : [];
  const systemCurrency = (settings.find(setting => setting.key === 'currency')?.value as CurrencyCode) || 'YER';
  const accountsMap = new Map((migrated.accounts || []).map(account => [account.id, account]));
  const currencyTotals: Record<string, {
    totalDebitMinor: number;
    totalCreditMinor: number;
    totalDebit: number;
    totalCredit: number;
  }> = {};

  const ensureCurrencyTotals = (currency: string) => {
    if (!currencyTotals[currency]) {
      currencyTotals[currency] = {
        totalDebitMinor: 0,
        totalCreditMinor: 0,
        totalDebit: 0,
        totalCredit: 0,
      };
    }
    return currencyTotals[currency];
  };

  for (const trx of migrated.transactions || []) {
    const status = trx.status || 'posted';
    if (status !== 'posted') continue;
    const account = accountsMap.get(trx.accountId);
    const currency = (trx.currency as CurrencyCode) || (account?.currency as CurrencyCode) || systemCurrency;
    const amountMinor = typeof trx.amountMinor === 'number' && Number.isSafeInteger(trx.amountMinor)
      ? Math.abs(trx.amountMinor)
      : Math.abs(decimalToMinor(trx.amount || 0, currency));
    const totals = ensureCurrencyTotals(currency);
    if (trx.type === 'debit') totals.totalDebitMinor += amountMinor;
    else if (trx.type === 'credit') totals.totalCreditMinor += amountMinor;
    if (!Number.isSafeInteger(totals.totalDebitMinor) || !Number.isSafeInteger(totals.totalCreditMinor)) {
      throw new Error(`إجماليات النسخة الاحتياطية تجاوزت النطاق الآمن للعملة ${currency}`);
    }
  }

  if (Object.keys(currencyTotals).length === 0) ensureCurrencyTotals(systemCurrency);
  for (const [currency, totals] of Object.entries(currencyTotals)) {
    totals.totalDebit = minorToDecimal(totals.totalDebitMinor, currency);
    totals.totalCredit = minorToDecimal(totals.totalCreditMinor, currency);
  }

  migrated.metadata.currencyTotals = currencyTotals;
  const singleCurrencyTotals = Object.keys(currencyTotals).length === 1
    ? currencyTotals[Object.keys(currencyTotals)[0]]
    : undefined;
  if (singleCurrencyTotals) {
    migrated.metadata.totalDebitSum = singleCurrencyTotals.totalDebit;
    migrated.metadata.totalCreditSum = singleCurrencyTotals.totalCredit;
    migrated.metadata.totalDebitMinor = singleCurrencyTotals.totalDebitMinor;
    migrated.metadata.totalCreditMinor = singleCurrencyTotals.totalCreditMinor;
  } else {
    delete migrated.metadata.totalDebitSum;
    delete migrated.metadata.totalCreditSum;
    delete migrated.metadata.totalDebitMinor;
    delete migrated.metadata.totalCreditMinor;
  }

  migrated.metadata.backupSchemaVersion = 7;
  migrated.metadata.schemaVersion = 7;
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

  if (getBackupSchemaVersion(migrated.metadata) === 6) {
    migrated = migrateBackupV6ToV7(migrated);
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

  // Final Invariant: Ensure all settings have id matching their key for repository access
  if (Array.isArray(migrated.settings)) {
    migrated.settings = migrated.settings.map(s => ({
      ...s,
      id: s.key // Critical: SettingsRepository.get(key) uses db.settings.get(key)
    }));
  }

  if (migrated.metadata.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('فشل ترحيل النسخة الاحتياطية إلى الإصدار المطلوب (Backup Migration Incomplete)');
  }

  // The caller verifies the original hash before migration. Re-sign only payloads
  // actually migrated from an older version; never bless a malformed current V7 hash.
  if (migrated.metadata.originalSchemaVersion !== undefined) {
    migrated.metadata.integrityHash = await calculateBackupPayloadHash(migrated);
  }
  return migrated;
}
