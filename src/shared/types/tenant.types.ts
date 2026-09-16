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
  | 'membership_suspended';

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
