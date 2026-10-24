import { CapabilityLease } from '@/shared/types/tenant.types';

/**
 * LeaseCryptoShared:
 * Shared cryptographic utilities and canonical payload serialization for Capability Leases.
 * Server-authoritative signing (private key) is strictly isolated in ServerLeaseIssuer.
 * Client verification (public key) uses this shared utility.
 */
export class LeaseCryptoShared {
  private static publicKeyJwk: JsonWebKey | null = null;

  public static setPublicKeyJwk(jwk: JsonWebKey): void {
    LeaseCryptoShared.publicKeyJwk = jwk;
  }

  public static getPublicKeyJwk(): JsonWebKey | null {
    return LeaseCryptoShared.publicKeyJwk;
  }

  /**
   * Generates canonical payload string for signing/verification.
   */
  public static buildCanonicalPayload(lease: Omit<CapabilityLease, 'integrityHash'>): string {
    const sortedPerms = [...(lease.verifiedPermissions || [])].sort().join(',');
    return [
      lease.leaseId,
      lease.organizationId,
      lease.verifiedUid,
      lease.verifiedRole,
      sortedPerms,
      lease.issuedAt.toString(),
      lease.expiresAt.toString(),
      lease.verificationRevision.toString(),
      lease.issuer || 'hisabati-auth-server',
      lease.audience || lease.organizationId,
    ].join('|');
  }
}
