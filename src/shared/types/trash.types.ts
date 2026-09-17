/**
 * CHANGELOG
 * - 0.3: Redesigned TrashItem structure. Removed data.transactions (Accounting Principle: Transactions are never deleted).
 * - 0.3: Added status, snapshot, audit fields, and checksum.
 * 
 * تحذير: هذا التغيير يكسر التوافق مع بيانات سلة المهملات القديمة.
 */

import { Account } from './account.types';

export type TrashEntityType = 'account' | 'transaction';
export type TrashStatus = 'deleted' | 'restored' | 'purged';

export const TRASH_RETENTION_DAYS = 60;

export interface TrashItem {
  id: string; // Trash record unique ID
  entityType: TrashEntityType;
  entityId: string; // Original entity ID
  
  // Snapshot of the entity at the time of deletion
  snapshot: {
    account?: Account;
    // Note: transactions themselves are never moved to trash, 
    // but we might store metadata if needed in future.
  };

  status: TrashStatus;
  
  // Audit details
  deletedAt: string;
  deletedBy?: string;
  reason?: string;
  reasonCode?: string;
  
  expiresAt: string; // deletedAt + TRASH_RETENTION_DAYS
  
  restoredAt?: string;
  restoredBy?: string;
  
  purgedAt?: string;
  purgedBy?: string;

  checksum?: string; // Integrity check for the trash record
  metadata?: Record<string, any>;
}
