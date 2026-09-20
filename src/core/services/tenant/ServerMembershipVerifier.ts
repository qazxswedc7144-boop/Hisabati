import { FirebaseTokenVerifier, FirebaseTokenVerificationError } from '../firebase/FirebaseTokenVerifier';
import { Organization, OrganizationMembership, AuthMembershipStatus } from '@/shared/types/tenant.types';
import { UserRole } from '@/shared/types/rbac.types';
import { rbacGuard } from '../rbac/RBACGuard.service';
import { db as firestoreDb } from '@/core/database/firebase';
import { doc, getDoc } from 'firebase/firestore';

export interface VerifyMembershipRequest {
  idToken: string;
  organizationId: string;
  // Intentionally inspected only to log/detect spoofing attempts, NEVER trusted
  clientClaimedUid?: string;
  clientClaimedRole?: string;
  clientClaimedPermissions?: string[];
}

export interface VerifyMembershipResponse {
  success: boolean;
  verifiedByBackend: boolean;
  verifiedUid?: string;
  organization?: Organization;
  membership?: OrganizationMembership;
  authMembershipStatus: AuthMembershipStatus;
  verificationRevision?: number;
  error?: {
    code: string;
    messageAr: string;
    details?: string;
  };
}

/**
 * ServerMembershipVerifier: Decouples Authentication from Authorization.
 * - Authenticated Firebase Identity != Tenant Member / Owner.
 * - Source of truth is strictly verified Firestore documents.
 * - Zero trust for client-sent uid, role, or permissions.
 */
export class ServerMembershipVerifier {
  // Test/Mock data storage for deterministic headless testing
  private static testOrganizations: Map<string, Organization> = new Map();
  private static testMemberships: Map<string, OrganizationMembership> = new Map(); // key: `${orgId}:${userId}`

  public static registerTestOrganization(org: Organization): void {
    this.testOrganizations.set(org.id, org);
  }

  public static registerTestMembership(membership: OrganizationMembership): void {
    this.testMemberships.set(`${membership.organizationId}:${membership.userId}`, membership);
  }

  public static clearTestData(): void {
    this.testOrganizations.clear();
    this.testMemberships.clear();
  }

  /**
   * Authoritative server-side verification.
   */
  public static async verifyMembership(
    request: VerifyMembershipRequest
  ): Promise<VerifyMembershipResponse> {
    const { idToken, organizationId, clientClaimedUid, clientClaimedRole } = request;

    // 1. Sanitize Organization ID
    if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
      return {
        success: false,
        verifiedByBackend: false,
        authMembershipStatus: 'authenticated_no_membership',
        error: {
          code: 'ORGANIZATION_ID_INVALID',
          messageAr: 'معرف المؤسسة غير صالح أو مفقود.',
        },
      };
    }

    const cleanOrgId = organizationId.trim();

    // 2. Cryptographic Token Verification (Authenticity & Expiry)
    let verifiedUid: string;
    let verifiedEmail: string | undefined;
    let verifiedName: string | undefined;

    try {
      const claims = await FirebaseTokenVerifier.verifyIdToken(idToken);
      verifiedUid = claims.uid;
      verifiedEmail = claims.email;
      verifiedName = claims.name;
    } catch (err: any) {
      const code = err instanceof FirebaseTokenVerificationError ? err.code : 'TOKEN_INVALID';
      const messageAr =
        err instanceof FirebaseTokenVerificationError
          ? err.message
          : 'فشل التحقق من رمز الدخول السحابي.';

      return {
        success: false,
        verifiedByBackend: false,
        authMembershipStatus: 'authenticated_no_membership',
        error: {
          code,
          messageAr,
          details: err?.details,
        },
      };
    }

    // 3. Security Audit: Anti-Spoofing check
    if (clientClaimedUid && clientClaimedUid !== verifiedUid) {
      console.warn(
        `[Security Warning] Client attempted UID spoofing. Claimed: ${clientClaimedUid.slice(0, 15)}, Verified: ${verifiedUid.slice(0, 15)}`
      );
    }

    // 4. Fetch Organization from authoritative repository/Firestore
    const org = await this.fetchOrganization(cleanOrgId);
    if (!org) {
      return {
        success: false,
        verifiedByBackend: false,
        verifiedUid,
        authMembershipStatus: 'authenticated_no_membership',
        error: {
          code: 'ORGANIZATION_NOT_FOUND',
          messageAr: 'المؤسسة المطلوبة غير مسجلة في النظام.',
        },
      };
    }

    if (org.status !== 'active') {
      return {
        success: false,
        verifiedByBackend: false,
        verifiedUid,
        authMembershipStatus: 'authenticated_no_membership',
        error: {
          code: 'ORGANIZATION_SUSPENDED',
          messageAr: 'هذه المؤسسة معلقة أو مؤرشفة حالياً ولا يمكن الوصول إليها.',
        },
      };
    }

    // 5. Fetch Membership document from authoritative repository/Firestore
    const membership = await this.fetchMembership(cleanOrgId, verifiedUid);
    if (!membership) {
      return {
        success: false,
        verifiedByBackend: false,
        verifiedUid,
        authMembershipStatus: 'authenticated_no_membership',
        error: {
          code: 'MEMBERSHIP_NOT_FOUND',
          messageAr: 'المستخدم لا يمتلك عضوية مسجلة داخل هذه المؤسسة.',
        },
      };
    }

    // 6. Inspect Membership Status
    if (membership.status === 'suspended' || (membership as any).status === 'revoked') {
      return {
        success: false,
        verifiedByBackend: false,
        verifiedUid,
        authMembershipStatus: 'membership_suspended',
        error: {
          code: 'MEMBERSHIP_SUSPENDED',
          messageAr: 'عضوية المستخدم في هذه المؤسسة معلقة أو تم تجميدها.',
        },
      };
    }

    if (membership.status !== 'active') {
      return {
        success: false,
        verifiedByBackend: false,
        verifiedUid,
        authMembershipStatus: 'pending_server_verification',
        error: {
          code: 'MEMBERSHIP_INACTIVE',
          messageAr: 'عضوية المستخدم قيد المراجعة وليست نشطة بعد.',
        },
      };
    }

    // 7. Extract Verified Role & Permissions strictly from verified membership
    const validRoles: UserRole[] = ['owner', 'admin', 'accountant', 'employee', 'viewer'];
    const verifiedRole: UserRole = validRoles.includes(membership.role) ? membership.role : 'viewer';

    if (clientClaimedRole && clientClaimedRole !== verifiedRole) {
      console.warn(
        `[Security Warning] Client attempted Role spoofing for org ${cleanOrgId}. Claimed: ${clientClaimedRole}, Verified: ${verifiedRole}`
      );
    }

    if (request.clientClaimedPermissions && request.clientClaimedPermissions.length > 0) {
      console.warn(
        `[Security Warning] Client attempted Permission spoofing for org ${cleanOrgId}. Client claimed permissions ignored: [${request.clientClaimedPermissions.join(', ')}]`
      );
    }

    const verifiedPermissions =
      membership.permissions && membership.permissions.length > 0
        ? membership.permissions
        : rbacGuard.getRolePermissions(verifiedRole);

    const verifiedMembership: OrganizationMembership = {
      ...membership,
      role: verifiedRole,
      status: 'active',
      permissions: verifiedPermissions,
      updatedAt: new Date().toISOString(),
    };

    const verificationRevision =
      (membership as any).verificationRevision ??
      (membership.updatedAt ? new Date(membership.updatedAt).getTime() : 1);

    return {
      success: true,
      verifiedByBackend: true,
      verifiedUid,
      organization: org,
      membership: verifiedMembership,
      authMembershipStatus: 'online_verified',
      verificationRevision,
    };
  }

  /**
   * Fetches organization from test store or Firestore
   */
  private static async fetchOrganization(orgId: string): Promise<Organization | null> {
    // 1. Check test repository first
    if (this.testOrganizations.has(orgId)) {
      return this.testOrganizations.get(orgId)!;
    }

    // 2. Query Firestore if online SDK is initialized
    if (firestoreDb) {
      try {
        const orgRef = doc(firestoreDb, 'organizations', orgId);
        const snapshot = await getDoc(orgRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          return {
            id: snapshot.id,
            name: data.name || 'مؤسسة غير مسمية',
            ownerId: data.ownerId || '',
            status: data.status || 'active',
            settings: data.settings || { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn(`ServerMembershipVerifier: Failed to fetch organization ${orgId} from Firestore:`, err);
      }
    }

    return null;
  }

  /**
   * Fetches membership from test store or Firestore
   * Path: organizations/{orgId}/members/{userId}
   */
  private static async fetchMembership(
    orgId: string,
    userId: string
  ): Promise<OrganizationMembership | null> {
    const key = `${orgId}:${userId}`;

    // 1. Check test repository first
    if (this.testMemberships.has(key)) {
      return this.testMemberships.get(key)!;
    }

    // 2. Query Firestore if online SDK is initialized
    if (firestoreDb) {
      try {
        const memberRef = doc(firestoreDb, 'organizations', orgId, 'members', userId);
        const snapshot = await getDoc(memberRef);
        if (snapshot.exists()) {
          const data = snapshot.data();
          return {
            organizationId: orgId,
            userId,
            role: data.role || 'viewer',
            status: data.status || 'active',
            permissions: data.permissions,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
            invitedBy: data.invitedBy,
          };
        }
      } catch (err) {
        console.warn(
          `ServerMembershipVerifier: Failed to fetch membership for org ${orgId}, user ${userId}:`,
          err
        );
      }
    }

    return null;
  }
}
