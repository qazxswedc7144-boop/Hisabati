import {
  DATABASE_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../../database/schemaVersion';

/**
 * Extracts and resolves the backup schema version from metadata.
 *
 * Rules:
 * 1. If metadata.backupSchemaVersion is an integer, use it.
 * 2. Else if metadata.schemaVersion is an integer, use it as a legacy version.
 * 3. Otherwise, treat as version 1.
 */
export function getBackupSchemaVersion(metadata: any): number {
  if (!metadata || typeof metadata !== 'object') {
    return 1;
  }

  if (
    typeof metadata.backupSchemaVersion === 'number' &&
    Number.isInteger(metadata.backupSchemaVersion)
  ) {
    return metadata.backupSchemaVersion;
  }

  if (
    typeof metadata.schemaVersion === 'number' &&
    Number.isInteger(metadata.schemaVersion)
  ) {
    return metadata.schemaVersion;
  }

  return 1;
}

/**
 * Migrates a V1 backup payload to V2 format in memory.
 * Pure metadata-only migration. Does not touch financial data or database.
 */
export function migrateBackupV1ToV2(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }

  if (!payload.metadata || typeof payload.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload);

  migrated.metadata.backupSchemaVersion = 2;
  migrated.metadata.schemaVersion = 2;

  return migrated;
}

/**
 * Migrates a V2 backup payload to V3 format in memory.
 * Pure metadata-only migration. Sets databaseSchemaVersion to 6 and financialFormatVersion to 1 if not present.
 */
export function migrateBackupV2ToV3(payload: any): any {
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload)');
  }

  if (!payload.metadata || typeof payload.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  const migrated = structuredClone(payload);

  migrated.metadata.backupSchemaVersion = 3;

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

  migrated.metadata.schemaVersion = 3;

  return migrated;
}

/**
 * Validates, gate-checks, and sequentially migrates a raw backup payload to the current BACKUP_SCHEMA_VERSION.
 * Operates strictly in memory with zero database interactions.
 */
export async function migrateBackupPayload(payload: any): Promise<any> {
  // 1. Verify payload is a valid object
  if (!payload || typeof payload !== 'object') {
    throw new Error('هيكل ملف النسخة الاحتياطية غير صالح (Invalid Payload Object)');
  }

  // 2. Verify metadata existence
  if (!payload.metadata || typeof payload.metadata !== 'object') {
    throw new Error('بيانات النسخة الاحتياطية الوصفية غير موجودة (Metadata Missing)');
  }

  // 3. Create independent clone to prevent mutating original object
  let migrated = structuredClone(payload);

  // 4. Discover version
  const version = getBackupSchemaVersion(migrated.metadata);

  // 5. Future Version Rejection
  if (version > BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Backup schema version ${version} is newer than the supported version ${BACKUP_SCHEMA_VERSION}. Please update Hisabati before restoring this backup.`
    );
  }

  // Preserve original schema version for cryptographic integrity validation if migrating from legacy
  if (version < BACKUP_SCHEMA_VERSION && migrated.metadata.originalSchemaVersion === undefined) {
    migrated.metadata.originalSchemaVersion = version;
  }

  // 6. If Version === 1: V1 -> V2
  if (version === 1) {
    migrated = migrateBackupV1ToV2(migrated);
  }

  // 7. If Version <= 2: V2 -> V3
  if (version <= 2) {
    migrated = migrateBackupV2ToV3(migrated);
  }

  // If already Version 3, ensure default fields exist
  if (version === 3) {
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

  // 8. Ensure final result: backupSchemaVersion === BACKUP_SCHEMA_VERSION
  if (migrated.metadata.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('فشل ترحيل النسخة الاحتياطية إلى الإصدار المطلوب (Backup Migration Incomplete)');
  }

  // 9. Return migrated payload
  return migrated;
}
