import { Account } from './account.types';
import { Transaction } from './transaction.types';
import { SettingsEntry } from './settings.types';

export type SyncStatusType = 'idle' | 'syncing' | 'synced' | 'pending' | 'error' | 'offline';

export type SyncEntityType = 'account' | 'transaction' | 'setting';
export type SyncOperationType = 'CREATE' | 'UPDATE' | 'DELETE';

export interface SyncQueueItem {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  operation: SyncOperationType;
  operationId: string; // Idempotency key
  payload?: any;
  createdAt: string;
  retryCount: number;
  lastError?: string;
  status: 'pending' | 'processing' | 'failed' | 'completed';
}

export interface BackupMetadata {
  schemaVersion: number;
  appVersion: string;
  backupId: string;
  deviceId: string;
  deviceName?: string;
  createdAt: string;
  accountCount: number;
  transactionCount: number;
  totalDebitSum: number;
  totalCreditSum: number;
  integrityHash: string; // SHA-256 integrity checksum
  isEncrypted?: boolean;
}

export interface BackupPayload {
  metadata: BackupMetadata;
  accounts: Account[];
  transactions: Transaction[];
  settings: SettingsEntry[];
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  size?: number;
  createdTime: string;
  modifiedTime: string;
  metadata?: BackupMetadata;
}

export interface SyncConflictItem {
  id: string;
  entityType: SyncEntityType;
  entityId: string;
  localVersion: {
    title: string;
    updatedAt: string;
    data: any;
  };
  remoteVersion: {
    title: string;
    updatedAt: string;
    data: any;
  };
  detectedAt: string;
  resolved: boolean;
  resolutionChoice?: 'local' | 'remote' | 'merge';
}

export interface SyncAuditLogEntry {
  id: string;
  action: 'SYNC_START' | 'SYNC_SUCCESS' | 'SYNC_FAILED' | 'BACKUP_CREATED' | 'BACKUP_RESTORED' | 'CONFLICT_DETECTED' | 'CONFLICT_RESOLVED';
  timestamp: string;
  details: string;
  deviceId: string;
  success: boolean;
}

export interface CloudSyncState {
  isGoogleDriveConnected: boolean;
  googleUserEmail?: string;
  googleUserName?: string;
  lastSyncTime?: string;
  lastBackupTime?: string;
  syncStatus: SyncStatusType;
  pendingCount: number;
  autoSyncEnabled: boolean;
  autoBackupInterval: 'disabled' | 'daily' | 'weekly';
  conflicts: SyncConflictItem[];
}
