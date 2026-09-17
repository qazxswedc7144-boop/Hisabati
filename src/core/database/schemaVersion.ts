/**
 * CHANGELOG
 * - 1.5: Updated DATABASE_SCHEMA_VERSION to 8 and BACKUP_SCHEMA_VERSION to 4.
 * - 1.5: Added MIN_SUPPORTED_* version constants for backward compatibility enforcement.
 */

export const DATABASE_SCHEMA_VERSION = 8;
export const BACKUP_SCHEMA_VERSION = 4;
export const FINANCIAL_FORMAT_VERSION = 1;

export const MIN_SUPPORTED_BACKUP_VERSION = 1;
export const MIN_SUPPORTED_DATABASE_VERSION = 1;

export const SCHEMA_COMPATIBILITY = {
  database: DATABASE_SCHEMA_VERSION,
  backup: BACKUP_SCHEMA_VERSION,
  financial: FINANCIAL_FORMAT_VERSION,
  minSupportedBackup: MIN_SUPPORTED_BACKUP_VERSION,
} as const;
