/**
 * Phase 8: RBAC, Teams & Tamper-Resistant Audit Trail Types
 */

export type UserRole = 'owner' | 'admin' | 'accountant' | 'employee' | 'viewer';

export type Permission =
  // Accounts
  | 'accounts:read'
  | 'accounts:create'
  | 'accounts:update'
  | 'accounts:delete'
  // Financial Transactions
  | 'transactions:read'
  | 'transactions:create'
  | 'transactions:update'
  | 'transactions:delete'
  // Smart Receipts & OCR
  | 'receipts:read'
  | 'receipts:create'
  | 'receipts:update'
  | 'receipts:convert'
  | 'receipts:delete'
  // Reports & Analytics
  | 'reports:read'
  | 'reports:export'
  // Audit Trail
  | 'audit:read'
  | 'audit:export'
  // Team Management
  | 'team:manage_members'
  | 'team:manage_roles'
  // Backups & Sync
  | 'backup:create'
  | 'backup:restore'
  | 'sync:manage'
  // AI Operations
  | 'ai:query'
  | 'ai:audit'
  // Settings
  | 'system:settings';

export type AuditAction =
  | 'TRANSACTION_CREATE'
  | 'TRANSACTION_UPDATE'
  | 'TRANSACTION_DELETE'
  | 'ACCOUNT_CREATE'
  | 'ACCOUNT_UPDATE'
  | 'ACCOUNT_DELETE'
  | 'RECEIPT_OCR_SCAN'
  | 'RECEIPT_DRAFT_UPDATE'
  | 'RECEIPT_CONVERT_POST'
  | 'AI_INVOICE_AUDIT'
  | 'AI_ACCOUNTANT_QUERY'
  | 'TEAM_MEMBER_INVITE'
  | 'TEAM_MEMBER_ROLE_CHANGE'
  | 'TEAM_MEMBER_REMOVE'
  | 'BACKUP_EXPORT'
  | 'BACKUP_RESTORE'
  | 'SECURITY_UNAUTHORIZED_ATTEMPT';

export type AuditRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AuditActor {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  ipAddress?: string;
}

export interface AuditTrailEntry {
  id: string;
  sequenceNumber: number;
  timestamp: string;
  actor: AuditActor;
  action: AuditAction;
  targetType: 'transaction' | 'account' | 'receipt' | 'team' | 'backup' | 'system' | 'ai';
  targetId: string;
  riskLevel: AuditRiskLevel;
  detailsAr: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  previousEntryHash: string;
  hash: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  activeTeamId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Team {
  id: string;
  name: string;
  ownerId: string;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: 'active' | 'suspended';
  joinedAt: string;
  lastActiveAt?: string;
}

export interface AuditIntegrityVerificationResult {
  isValid: boolean;
  totalEntries: number;
  tamperedEntryId?: string;
  tamperedIndex?: number;
  messageAr: string;
  verifiedAt: string;
}
