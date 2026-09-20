/**
 * Phase P1.2: Tenant & Membership Architecture Types
 */

import { UserRole } from './rbac.types';

export type OrganizationRole = UserRole;

export type MembershipStatus = 'active' | 'suspended' | 'pending';

export type OrganizationStatus = 'active' | 'suspended' | 'archived';

export type AuthMembershipStatus = 
  | 'online_verified' 
  | 'offline_cached' 
  | 'offline_expired' 
  | 'membership_unknown' 
  | 'membership_suspended'
  | 'authenticated_no_membership'
  | 'pending_server_verification';

export interface CapabilityLease {
  leaseId: string;
  organizationId: string;
  verifiedUid: string;
  verifiedRole: OrganizationRole;
  verifiedPermissions: string[];
  issuedAt: number;     // Unix timestamp ms
  expiresAt: number;    // Unix timestamp ms
  verificationRevision: number;
  integrityHash: string; // Cryptographic HMAC / SHA-256 digest of canonical fields
  isRevoked?: boolean;
}

export type LeaseErrorCode =
  | 'LEASE_NOT_FOUND'
  | 'LEASE_REVOKED'
  | 'LEASE_EXPIRED'
  | 'LEASE_UID_MISMATCH'
  | 'LEASE_ORG_MISMATCH'
  | 'LEASE_INTEGRITY_FAILED'
  | 'LEASE_ROLE_TAMPERED'
  | 'LEASE_PERMISSIONS_TAMPERED'
  | 'LEASE_REVISION_MISMATCH'
  | 'LEASE_MALFORMED';

export type LeaseValidationResult =
  | { valid: true; lease: CapabilityLease }
  | { valid: false; code: LeaseErrorCode; messageAr: string };

export interface OrganizationSettings {
  currency: string;
  language: string;
  timezone: string;
  fiscalYearStart?: string;
  [key: string]: any;
}

export interface Organization {
  id: string;
  name: string;
  ownerId: string;
  status: OrganizationStatus;
  settings: OrganizationSettings;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface OrganizationMembership {
  // Path: organizations/{organizationId}/members/{userId}
  // So organizationId and userId are the primary keys
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: MembershipStatus;
  permissions?: string[];
  invitedBy?: string;
  createdAt: string;
  updatedAt: string;
  suspendedAt?: string;
  revokedAt?: string;
}

export interface TenantContext {
  activeOrganization: Organization | null;
  availableOrganizations: Organization[];
  currentMembership: OrganizationMembership | null;
  authMembershipStatus: AuthMembershipStatus;
  isLocalMode: boolean;
  isOffline: boolean;
  lastVerifiedAt?: string;
}

export interface LocalTenantContext extends TenantContext {
  isLocalMode: true;
}
