import { OrganizationRole, CapabilityLease } from '@/shared/types/tenant.types';
import { ServerMembershipVerifier } from './ServerMembershipVerifier';

/**
 * ServerLeaseIssuer: Server-side authoritative asymmetric signing for Capability Leases.
 * 
 * Security Architecture:
 * - Private Key resides EXCLUSIVELY on the server (never exposed to browser, production bundle, or VITE_* env).
 * - Signs lease payloads using ECDSA P-256 with SHA-256.
 * - Browser receives only signed leases and verifies them using the corresponding Public Key.
 */
export class ServerLeaseIssuer {
  private static privateKey: CryptoKey | null = null;
  private static publicKey: CryptoKey | null = null;
  private static publicKeyJwk: JsonWebKey | null = null;
  private static isInitialized = false;

  /**
   * Initializes or loads the server-side signing keypair.
   */
  public static async initialize(): Promise<void> {
    if (this.isInitialized && this.privateKey && this.publicKey) {
      return;
    }

    try {
      const cryptoLib = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : (await import('crypto')).webcrypto;
      
      const keyPair = await cryptoLib.subtle.generateKey(
        {
          name: 'ECDSA',
          namedCurve: 'P-256',
        },
        true,
        ['sign', 'verify']
      );

      this.privateKey = keyPair.privateKey;
      this.publicKey = keyPair.publicKey;
      this.publicKeyJwk = await cryptoLib.subtle.exportKey('jwk', keyPair.publicKey);
      this.isInitialized = true;
    } catch (err) {
      console.error('ServerLeaseIssuer: Failed to generate cryptographic keypair:', err);
      throw new Error('KEY_GENERATION_FAILED');
    }
  }

  public static async getPublicKeyJwk(): Promise<JsonWebKey> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.publicKeyJwk!;
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

  /**
   * Issues and cryptographically signs a Capability Lease on the server.
   */
  public static async issueLease(params: {
    organizationId: string;
    verifiedUid: string;
    verifiedRole: OrganizationRole;
    verifiedPermissions: string[];
    verificationRevision?: number;
    durationMs?: number;
  }): Promise<CapabilityLease> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const now = Date.now();
    const duration = params.durationMs ?? 24 * 60 * 60 * 1000; // 24 hours
    const leaseId = `lease_${params.organizationId}_${params.verifiedUid}_${now}`;

    const draftLease = {
      leaseId,
      organizationId: params.organizationId,
      verifiedUid: params.verifiedUid,
      verifiedRole: params.verifiedRole,
      verifiedPermissions: [...params.verifiedPermissions],
      issuedAt: now,
      expiresAt: now + duration,
      verificationRevision: params.verificationRevision ?? 1,
      isRevoked: false,
      issuer: 'hisabati-auth-server',
      audience: params.organizationId,
    };

    const canonical = this.buildCanonicalPayload(draftLease);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(canonical);

    const cryptoLib = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : (await import('crypto')).webcrypto;
    const signatureBuffer = await cryptoLib.subtle.sign(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' },
      },
      this.privateKey!,
      dataBuffer
    );

    // Convert signature ArrayBuffer to base64 string for integrityHash / signature transport
    const signatureBase64 = Buffer.from(signatureBuffer).toString('base64');

    return {
      ...draftLease,
      integrityHash: signatureBase64,
    };
  }
}
