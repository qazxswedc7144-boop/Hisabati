import { tenantDbManager } from '../database/TenantDatabaseManager';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { Organization, OrganizationMembership } from '@/shared/types/tenant.types';
import { authService } from './rbac/AuthService.service';

/**
 * TenantService: Orchestrates organization switching and tenant context management.
 */
export class TenantService {
  private static instance: TenantService;

  private constructor() {}

  public static getInstance(): TenantService {
    if (!TenantService.instance) {
      TenantService.instance = new TenantService();
    }
    return TenantService.instance;
  }

  /**
   * Initializes the tenant context based on current auth state.
   */
  public async initialize(): Promise<void> {
    const store = useTenantStore.getState();
    store.setLoading(true);

    try {
      const actor = authService.getActiveActor();
      
      if (actor.id === 'user_local_default') {
        // Local Mode
        await this.switchToLocalMode();
      } else {
        // Cloud Mode - In P1.2-B we might not have real memberships yet
        // For now, we simulate finding the first membership or staying in 'no membership' state
        // This will be expanded in P1.2-C
        store.setContext({
          isLocalMode: false,
          authMembershipStatus: 'membership_unknown',
        });
        
        // Default to a temporary local DB for the user until org is selected
        await tenantDbManager.openTenantDatabase(`user_${actor.id}`);
      }
    } catch (error: any) {
      store.setError(error.message);
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Switches to Local Mode (Default behavior)
   */
  public async switchToLocalMode(): Promise<void> {
    const store = useTenantStore.getState();
    
    // 1. Open local database
    await tenantDbManager.openTenantDatabase('local');
    
    // 2. Update store
    store.setContext({
      activeOrganization: {
        id: 'local',
        name: 'المؤسسة المحلية',
        ownerId: 'user_local_default',
        status: 'active',
        settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      currentMembership: {
        organizationId: 'local',
        userId: 'user_local_default',
        role: 'owner',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isLocalMode: true,
      authMembershipStatus: 'offline_cached',
    });
  }

  /**
   * Switches the active organization.
   * Handles DB switching and state cleanup.
   */
  public async switchOrganization(org: Organization, membership: OrganizationMembership): Promise<void> {
    const store = useTenantStore.getState();
    store.setLoading(true);

    try {
      // 1. Close current DB and open new one
      await tenantDbManager.openTenantDatabase(org.id);

      // 2. Update Context
      store.setContext({
        activeOrganization: org,
        currentMembership: membership,
        isLocalMode: false,
        authMembershipStatus: 'online_verified', // Should be verified via API in reality
      });

      // 3. Cleanup other stores (optional, but good practice)
      // Example: useAccountStore.getState().reset();
      
      console.log(`TenantService: Successfully switched to organization ${org.name}`);
    } catch (error: any) {
      store.setError(error.message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }
}

export const tenantService = TenantService.getInstance();
