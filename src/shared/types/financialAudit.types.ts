import { AuditActor, AuditRiskLevel, UserRole } from './rbac.types';
import { CurrencyCode } from './common.types';

export type FinancialAuditEventType = 
  | 'TRANSACTION_CREATE'
  | 'TRANSACTION_UPDATE'
  | 'TRANSACTION_DELETE'
  | 'TRANSACTION_POST'
  | 'TRANSACTION_STATUS_CHANGE'
  | 'DOUBLE_ENTRY_CREATE'
  | 'ACCOUNT_RECALCULATION'
  | 'FINANCIAL_RESTORE'
  | 'SNAPSHOT_CREATE'
  | 'INTEGRITY_CHECK_FAILURE'
  | 'TAMPER_DETECTED';

export interface FinancialAuditEntry {
  id: string;                 // audit_seq_{sequenceNumber}
  sequenceNumber: number;     // Monotonic incrementing sequence
  timestamp: string;          // ISO
  eventType: FinancialAuditEventType;
  actor: AuditActor;          // Identity of who performed the action
  organizationId: string;     // Multi-tenancy grouping
  operationId?: string;       // Idempotency / Grouping ID
  
  // Entity reference
  targetType: 'transaction' | 'account' | 'snapshot' | 'system';
  targetId: string;
  
  // Financial metadata
  amountMinor?: number;       // Relevant amount for the operation
  currency?: CurrencyCode;
  
  // State references for EDIT/DELETE
  beforeState?: {
    amountMinor: number;
    accountId: string;
    type: 'debit' | 'credit';
    revision: string;         // Hash or version of the entity before change
  };
  afterState?: {
    amountMinor: number;
    accountId: string;
    type: 'debit' | 'credit';
    revision: string;         // Hash or version of the entity after change
  };
  
  // Integrity & Tamper Detection
  previousHash: string;       // SHA256 of the previous entry
  hash: string;               // SHA256(canonical(payload) + previousHash)
  
  metadata?: Record<string, any>;
}

export interface FinancialSnapshot {
  id: string;                 // snap_{timestamp}
  organizationId: string;
  createdAt: string;
  ledgerRevision: number;     // Last sequenceNumber from FinancialAuditEntry
  
  // Summary Data
  transactionCount: number;
  accountCount: number;
  totalDebitMinor: number;
  totalCreditMinor: number;
  
  // Detailed Balances (Mapping accountId -> amountMinor)
  balances: Record<string, number>;
  
  // Integrity
  integrityHash: string;      // SHA256 of all balances + ledgerRevision
  isValid: boolean;           // Verified during creation
}

export interface SnapshotVerificationResult {
  isMatch: boolean;
  mismatchedAccounts: string[];
  transactionCountDelta: number;
  messageAr: string;
  verifiedAt: string;
}

export interface AuditChainVerificationResult {
  isValid: boolean;
  totalEntries: number;
  tamperedEntryId?: string;
  messageAr: string;
  verifiedAt: string;
}
