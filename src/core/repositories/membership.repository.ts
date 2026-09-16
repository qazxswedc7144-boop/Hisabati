import { OrganizationMembership } from '@/shared/types/tenant.types';

/**
 * MembershipRepository: Interface for Cloud Membership data access.
 * Implementation will be added in P1.2-C.
 */
export interface MembershipRepository {
  getByUserAndOrg(userId: string, orgId: string): Promise<OrganizationMembership | null>;
  listByUser(userId: string): Promise<OrganizationMembership[]>;
  listByOrg(orgId: string): Promise<OrganizationMembership[]>;
  add(membership: OrganizationMembership): Promise<void>;
  update(userId: string, orgId: string, updates: Partial<OrganizationMembership>): Promise<void>;
  remove(userId: string, orgId: string): Promise<void>;
}
