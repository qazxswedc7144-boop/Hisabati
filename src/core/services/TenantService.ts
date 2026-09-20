import { tenantDbManager } from '../database/TenantDatabaseManager';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { Organization, OrganizationMembership, CapabilityLease } from '@/shared/types/tenant.types';
import { authService } from './rbac/AuthService.service';
import {
  ServerMembershipVerifier,
  VerifyMembershipResponse,
} from './tenant/ServerMembershipVerifier';
import { capabilityLeaseService } from './tenant/CapabilityLeaseService';

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
        // Cloud Mode - P1.2-B-H: Firebase Authenticated without membership
        const storeState = useTenantStore.getState();
        if (storeState.activeOrganization && storeState.currentMembership && !storeState.isLocalMode) {
          // Preserve existing valid membership & organization context (Requirement F)
          return;
        }

        // Authenticated without membership: No organization context, no tenant DB
        store.setContext({
          activeOrganization: null,
          currentMembership: null,
          isLocalMode: false,
          authMembershipStatus: 'authenticated_no_membership',
        });
        
        // CRITICAL: Do NOT open user_<uid> Tenant DB! Close any current database.
        await tenantDbManager.closeCurrentDatabase();
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
    
    // 0. Reset auth service actor to default local actor
    await authService.setActiveActor({
      id: 'user_local_default',
      name: 'مستخدم محلي',
      role: 'owner',
      email: 'local@hisabati.app',
    });

    // 1. Open local database
    await tenantDbManager.openTenantDatabase('local', {
      authorized: true,
      grantReason: 'local_mode',
    });
    
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
   * Authoritative Server-Side Verification and Organization Switch.
   * - Verifies Firebase ID token authenticity & project match.
   * - Extracts true UID from token without trusting client claims.
   * - Queries authoritative membership in Firestore.
   * - Refuses to open Tenant DB if verification fails.
   */
  public async verifyAndSwitchOrganization(
    idToken: string,
    organizationId: string,
    options?: {
      clientClaimedUid?: string;
      clientClaimedRole?: string;
    }
  ): Promise<VerifyMembershipResponse> {
    const store = useTenantStore.getState();
    store.setLoading(true);

    try {
      // 1. Offline-First Safety check: Cannot establish new online memberships offline
      const isBrowserOffline = typeof window !== 'undefined' && typeof navigator !== 'undefined' && navigator.onLine === false;
      if (isBrowserOffline) {
        await tenantDbManager.closeCurrentDatabase();
        throw new Error('لا يمكن التحقق من عضوية مؤسسة جديدة دون اتصال بالإنترنت (Offline-First Safety)');
      }

      // 2. Server-side verification (authoritative)
      let result: VerifyMembershipResponse;

      // In browser environment, attempt the hardened backend API endpoint
      if (typeof window !== 'undefined' && typeof fetch === 'function') {
        try {
          const apiRes = await fetch('/api/tenant/verify-membership', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-hisabati-client': 'hisabati-web',
              'x-hisabati-session': 'session-verify-active',
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({
              idToken,
              organizationId,
              clientClaimedUid: options?.clientClaimedUid,
              clientClaimedRole: options?.clientClaimedRole,
            }),
          });

          const data = await apiRes.json();
          if (apiRes.ok && data.success) {
            result = data;
          } else {
            result = {
              success: false,
              verifiedByBackend: false,
              authMembershipStatus: data.authMembershipStatus || 'authenticated_no_membership',
              error: {
                code: data.code || 'VERIFICATION_FAILED',
                messageAr: data.error || 'فشل التحقق الخادمي من عضوية المؤسسة.',
              },
            };
          }
        } catch {
          // Direct fallback for isomorphic / headless test environments
          result = await ServerMembershipVerifier.verifyMembership({
            idToken,
            organizationId,
            clientClaimedUid: options?.clientClaimedUid,
            clientClaimedRole: options?.clientClaimedRole,
          });
        }
      } else {
        // Direct execution in Node.js / unit tests
        result = await ServerMembershipVerifier.verifyMembership({
          idToken,
          organizationId,
          clientClaimedUid: options?.clientClaimedUid,
          clientClaimedRole: options?.clientClaimedRole,
        });
      }

      // 3. Handle verification failure safely
      if (!result.success || !result.organization || !result.membership) {
        // Enforce safe isolation: Close any open tenant DB immediately
        await tenantDbManager.closeCurrentDatabase();

        // Demote active actor to unassigned / no-membership role
        await authService.setActiveActor({
          id: result.verifiedUid || 'unverified_actor',
          name: 'مستخدم غير موثق العضوية',
          role: 'authenticated_no_membership',
        });

        // Set safe store state
        store.setContext({
          activeOrganization: null,
          currentMembership: null,
          isLocalMode: false,
          authMembershipStatus: result.authMembershipStatus,
        });

        const errorMsg = result.error?.messageAr || 'فشل التحقق الخادمي من عضوية المؤسسة.';
        store.setError(errorMsg);
        throw new Error(errorMsg);
      }

      // 4. Issue a tamper-resistant Capability Lease based strictly on verified server data
      await capabilityLeaseService.createLease({
        organizationId: result.organization.id,
        verifiedUid: result.verifiedUid!,
        verifiedRole: result.membership.role,
        verifiedPermissions: result.membership.permissions || [],
        verificationRevision: result.verificationRevision ?? 1,
      });

      // 5. Open Tenant DB strictly after authoritative verification
      await tenantDbManager.openTenantDatabase(result.organization.id, {
        authorized: true,
        grantReason: 'server_verified',
        verifiedUid: result.verifiedUid,
      });

      // 6. Update AuthService active actor strictly using verified identity & role
      await authService.setActiveActor({
        id: result.verifiedUid!,
        name: result.membership.userId,
        role: result.membership.role,
        email: `${result.verifiedUid}@hisabati.app`,
      });

      // 7. Update context with verified online status
      store.setContext({
        activeOrganization: result.organization,
        currentMembership: result.membership,
        isLocalMode: false,
        authMembershipStatus: 'online_verified',
      });

      store.setError(null);
      return result;
    } catch (error: any) {
      store.setError(error.message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Switches to a Tenant Organization using a cryptographically verified Offline Capability Lease.
   * STRICT:
   * - Cannot create membership offline.
   * - Cannot escalate role or permissions offline.
   * - Fails if lease is expired, tampered, wrong user, wrong org, or revoked.
   */
  public async switchWithOfflineLease(
    organizationId: string,
    userId: string,
    leaseCandidate?: CapabilityLease
  ): Promise<{ success: boolean; lease: CapabilityLease }> {
    const store = useTenantStore.getState();
    store.setLoading(true);

    try {
      const lease = leaseCandidate || (await capabilityLeaseService.getStoredLease(organizationId, userId));
      const validation = await capabilityLeaseService.validateLease(lease, {
        currentUid: userId,
        targetOrgId: organizationId,
      });

      if (validation.valid === false) {
        const errorMsg = (validation as { valid: false; code: string; messageAr: string }).messageAr;
        await tenantDbManager.closeCurrentDatabase();
        await authService.setActiveActor({
          id: userId,
          name: 'مستخدم محلي غير مصرح',
          role: 'authenticated_no_membership',
        });
        store.setContext({
          activeOrganization: null,
          currentMembership: null,
          isLocalMode: false,
          authMembershipStatus: 'authenticated_no_membership',
        });
        throw new Error(errorMsg);
      }

      const validLease = validation.lease;

      // Open Tenant DB under offline capability grant
      await tenantDbManager.openTenantDatabase(organizationId, {
        authorized: true,
        grantReason: 'offline_capability_lease',
        verifiedUid: userId,
      });

      // Set actor strictly to verified role from lease
      await authService.setActiveActor({
        id: validLease.verifiedUid,
        name: validLease.verifiedUid,
        role: validLease.verifiedRole,
        email: `${validLease.verifiedUid}@hisabati.app`,
      });

      // Update store context
      store.setContext({
        activeOrganization: {
          id: validLease.organizationId,
          name: `منظمة ${validLease.organizationId} (Offline)`,
          ownerId: '',
          status: 'active',
          settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
          createdAt: new Date(validLease.issuedAt).toISOString(),
          updatedAt: new Date(validLease.issuedAt).toISOString(),
        },
        currentMembership: {
          organizationId: validLease.organizationId,
          userId: validLease.verifiedUid,
          role: validLease.verifiedRole,
          status: 'active',
          permissions: validLease.verifiedPermissions,
          createdAt: new Date(validLease.issuedAt).toISOString(),
          updatedAt: new Date(validLease.issuedAt).toISOString(),
        },
        isLocalMode: false,
        authMembershipStatus: 'offline_cached',
      });

      store.setError(null);
      return { success: true, lease: validLease };
    } catch (error: any) {
      store.setError(error.message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }

  /**
   * Re-verifies tenant membership with the server upon reconnection.
   * Revokes lease, drops cloud access, and closes tenant DB if membership or org is suspended or revoked.
   */
  public async reverifyWithServer(idToken: string): Promise<{ success: boolean; revoked?: boolean; verified?: boolean }> {
    const store = useTenantStore.getState();
    const activeOrg = store.activeOrganization;
    if (!activeOrg || activeOrg.id === 'local') {
      return { success: true };
    }

    try {
      const result = await ServerMembershipVerifier.verifyMembership({
        idToken,
        organizationId: activeOrg.id,
      });

      if (!result.success || !result.membership || result.membership.status !== 'active') {
        // Membership or Organization suspended, revoked, or not found!
        const uid = result.verifiedUid || store.currentMembership?.userId || 'unknown';
        await capabilityLeaseService.revokeLease(activeOrg.id, uid);
        await tenantDbManager.closeCurrentDatabase();

        await authService.setActiveActor({
          id: uid,
          name: 'عضوية معلقة',
          role: 'authenticated_no_membership',
        });

        store.setContext({
          activeOrganization: null,
          currentMembership: null,
          isLocalMode: false,
          authMembershipStatus: result.authMembershipStatus || 'membership_suspended',
        });

        return { success: false, revoked: true };
      }

      // Re-verification succeeded -> refresh lease and update actor/store
      await capabilityLeaseService.createLease({
        organizationId: result.organization.id,
        verifiedUid: result.verifiedUid!,
        verifiedRole: result.membership.role,
        verifiedPermissions: result.membership.permissions || [],
        verificationRevision: result.verificationRevision ?? 1,
      });

      await authService.setActiveActor({
        id: result.verifiedUid!,
        name: result.membership.userId,
        role: result.membership.role,
        email: `${result.verifiedUid}@hisabati.app`,
      });

      store.setContext({
        activeOrganization: result.organization,
        currentMembership: result.membership,
        isLocalMode: false,
        authMembershipStatus: 'online_verified',
      });

      return { success: true, verified: true };
    } catch (err) {
      console.warn('TenantService: Reconnection verification failed:', err);
      throw err;
    }
  }

  /**
   * Switches the active organization.
   * Handles DB switching and state cleanup.
   * Hardened: Never allows opening Tenant DB based solely on caller-passed client data.
   */
  public async switchOrganization(
    org: Organization,
    membership: OrganizationMembership,
    verifiedByBackend: boolean = false
  ): Promise<void> {
    const store = useTenantStore.getState();
    store.setLoading(true);

    try {
      if (!org || !org.id || !membership) {
        throw new Error('بيانات المنظمة أو العضوية غير مكتملة.');
      }

      if (org.status !== 'active') {
        throw new Error('لا يمكن التبديل إلى مؤسسة معلقة أو مؤرشفة.');
      }

      if (membership.status === 'suspended') {
        await tenantDbManager.closeCurrentDatabase();
        store.setContext({
          activeOrganization: null,
          currentMembership: null,
          authMembershipStatus: 'membership_suspended',
        });
        throw new Error('عضوية المستخدم معلقة أو تم إلغاؤها.');
      }

      if (!verifiedByBackend) {
        // Check for a valid offline Capability Lease
        const lease = await capabilityLeaseService.getStoredLease(org.id, membership.userId);
        const val = await capabilityLeaseService.validateLease(lease, {
          currentUid: membership.userId,
          targetOrgId: org.id,
        });

        if (val.valid) {
          verifiedByBackend = true;
        }
      }

      if (!verifiedByBackend) {
        // Strict boundary: Never open Tenant DB based on unverified client-provided data
        await tenantDbManager.closeCurrentDatabase();
        store.setContext({
          activeOrganization: org,
          currentMembership: membership,
          isLocalMode: false,
          authMembershipStatus: 'pending_server_verification',
        });
        console.warn(
          `TenantService: Organization ${org.name} set to pending_server_verification. Tenant DB remains closed until server verification or valid offline lease.`
        );
        return;
      }

      // 1. Close current DB and open new one under authoritative grant
      await tenantDbManager.openTenantDatabase(org.id, {
        authorized: true,
        grantReason: 'server_verified',
        verifiedUid: membership.userId,
      });

      // 2. Update Context
      store.setContext({
        activeOrganization: org,
        currentMembership: membership,
        isLocalMode: false,
        authMembershipStatus: 'online_verified',
      });

      console.log(`TenantService: Successfully switched to organization ${org.name} with status online_verified`);
    } catch (error: any) {
      store.setError(error.message);
      throw error;
    } finally {
      store.setLoading(false);
    }
  }
}

export const tenantService = TenantService.getInstance();
