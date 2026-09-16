import { Organization } from '@/shared/types/tenant.types';

/**
 * OrganizationRepository: Interface for Cloud Organization data access.
 * Implementation will be added in P1.2-C.
 */
export interface OrganizationRepository {
  getById(id: string): Promise<Organization | null>;
  listForUser(userId: string): Promise<Organization[]>;
  create(org: Partial<Organization>): Promise<Organization>;
  update(id: string, org: Partial<Organization>): Promise<void>;
  delete(id: string): Promise<void>;
}
