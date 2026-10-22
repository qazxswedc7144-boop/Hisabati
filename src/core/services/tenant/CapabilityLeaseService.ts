import { CapabilityLease, LeaseValidationResult, OrganizationRole } from '@/shared/types/tenant.types';
import { ServerLeaseIssuer } from './ServerLeaseIssuer';

/**
 * CapabilityLeaseService:
 * Manages cryptographically verified Server-Authoritative Capability Leases.
 * 
 * Security Architecture (P0 Server-Authoritative Asymmetric Hardening):
 * - NO browser signing authority: The browser NEVER possesses the private signing key.
 * - Server signs leases via ECDSA P-256 with SHA-256.
 * - Browser verifies leases using the public key (Verify-Only).
 * - Fail-Closed: any local tampering (role, permissions, org, uid, expiration, signature) is instantly rejected.
 */
export class CapabilityLeaseService {
  private static instance: CapabilityLeaseService;
  
  public static readonly DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours
  
  private publicKeyCache: CryptoKey | null = null;

  // In-memory registry of active verified leases (key: `${orgId}:${uid}`)
  private memoryLeases: Map<string, CapabilityLease> = new Map();

  // Revocation tombstone registry (key: `${orgId}:${uid}`)
  private revokedLeases: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): CapabilityLeaseService {
    if (!CapabilityLeaseService.instance) {
      CapabilityLeaseService.instance = new CapabilityLeaseService();
    }
    return CapabilityLeaseService.instance;
  }

  /**
   * Imports or retrieves the verification public key.
   */
  private async getVerificationKey(): Promise<CryptoKey> {
    if (this.publicKeyCache) {
      return this.publicKeyCache;
    }

    const jwk = await ServerLeaseIssuer.getPublicKeyJwk();
    const cryptoLib = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : (await import('crypto')).webcrypto;
    
    this.publicKeyCache = await cryptoLib.subtle.importKey(
      'jwk',
      jwk,
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true,
      ['verify']
    );

    return this.publicKeyCache;
  }

  /**
   * DISABLED on Client: Throws error to enforce Server-Authoritative Issuance.
   * Browser cannot manufacture a privileged valid lease.
   */
  public async createLease(_params: {
    organizationId: string;
    verifiedUid: string;
    verifiedRole: OrganizationRole;
    verifiedPermissions: string[];
    verificationRevision?: number;
    durationMs?: number;
  }): Promise<CapabilityLease> {
    throw new Error('SECURITY_VIOLATION: Browser lacks signing authority. Capability leases must be issued by the server.');
  }

  /**
   * Verifies cryptographic signature of a lease using the Public Key.
   */
  public async verifySignature(lease: CapabilityLease): Promise<boolean> {
    try {
      if (!lease || !lease.integrityHash) {
        return false;
      }

      const pubKey = await this.getVerificationKey();
      const canonical = ServerLeaseIssuer.buildCanonicalPayload(lease);
      const encoder = new TextEncoder();
      const dataBuffer = encoder.encode(canonical);

      // Convert base64 signature back to ArrayBuffer
      const signatureBuffer = Uint8Array.from(atob(lease.integrityHash), c => c.charCodeAt(0)).buffer;

      const cryptoLib = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : (await import('crypto')).webcrypto;
      const isValid = await cryptoLib.subtle.verify(
        {
          name: 'ECDSA',
          hash: { name: 'SHA-256' },
        },
        pubKey,
        signatureBuffer,
        dataBuffer
      );

      return isValid;
    } catch (err) {
      console.warn('CapabilityLeaseService: Signature verification error:', err);
      return false;
    }
  }

  /**
   * Validates a Capability Lease against expiration, user/org binding, and cryptographic asymmetric signature.
   * Enforces Fail-Closed and tamper resistance.
   */
  public async validateLease(
    lease: CapabilityLease | null | undefined,
    context: {
      currentUid: string;
      targetOrgId: string;
      now?: number;
    }
  ): Promise<LeaseValidationResult> {
    if (!lease || typeof lease !== 'object' || !lease.leaseId || !lease.organizationId || !lease.verifiedUid || !lease.verifiedRole || typeof lease.issuedAt !== 'number' || typeof lease.expiresAt !== 'number' || !lease.integrityHash) {
      return {
        valid: false,
        code: 'LEASE_MALFORMED',
        messageAr: 'بيانات التصريح غير صالحة أو تالفة (Malformed Payload).',
      };
    }

    if (lease.issuer && lease.issuer !== 'hisabati-auth-server') {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'جهة إصدار التصريح غير صالحة أو غير موثوقة (Invalid Issuer).',
      };
    }

    if (lease.audience && lease.audience !== context.targetOrgId) {
      return {
        valid: false,
        code: 'LEASE_ORG_MISMATCH',
        messageAr: 'جمهور التصريح (Audience) لا يتطابق مع المؤسسة المستهدفة.',
      };
    }

    const key = `${lease.organizationId}:${lease.verifiedUid}`;

    // 1. Check revocation registry
    if (lease.isRevoked || this.revokedLeases.has(key)) {
      return {
        valid: false,
        code: 'LEASE_REVOKED',
        messageAr: 'تم إبطال هذا التصريح المحلي بواسطة الخادم أو النظام الأمني.',
      };
    }

    // 2. Strict User UID check (prevent cross-user spoofing)
    if (lease.verifiedUid !== context.currentUid) {
      return {
        valid: false,
        code: 'LEASE_UID_MISMATCH',
        messageAr: 'التصريح يخص مستخدمًا آخر ولا يمكن استخدامه بواسطة الحساب الحالي.',
      };
    }

    // 3. Strict Organization check (prevent cross-org escalation)
    if (lease.organizationId !== context.targetOrgId) {
      return {
        valid: false,
        code: 'LEASE_ORG_MISMATCH',
        messageAr: 'التصريح يخص منظمة أخرى ولا ينطبق على المنظمة المطلوبة.',
      };
    }

    // 4. Expiration check
    const now = context.now ?? Date.now();
    if (now > lease.expiresAt) {
      return {
        valid: false,
        code: 'LEASE_EXPIRED',
        messageAr: 'انتهت صلاحية التصريح المحلي (Lease Expired). يرجى الاتصال بالإنترنت لإعادة التوثيق.',
      };
    }

    // 5. Cryptographic Asymmetric Signature Validation
    const isSignatureValid = await this.verifySignature(lease);
    if (!isSignatureValid) {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'فشل فحص التوقيع الرقمي الخادمي: التصريح مزيف أو تم التلاعب به محليًا.',
      };
    }

    return {
      valid: true,
      lease,
    };
  }

  /**
   * Registers and caches a server-issued lease in memory and persistent storage.
   */
  public async cacheServerIssuedLease(lease: CapabilityLease): Promise<void> {
    const key = `${lease.organizationId}:${lease.verifiedUid}`;
    this.memoryLeases.set(key, lease);
    this.revokedLeases.delete(key);
    this.saveToPersistentStorage(key, lease);
  }

  /**
   * Retrieves a stored lease for a specific user and organization.
   */
  public async getStoredLease(organizationId: string, userId: string): Promise<CapabilityLease | null> {
    const key = `${organizationId}:${userId}`;
    if (this.revokedLeases.has(key)) {
      return null;
    }

    if (this.memoryLeases.has(key)) {
      const lease = this.memoryLeases.get(key)!;
      if (lease.isRevoked) {
        return null;
      }
      return lease;
    }

    // Fallback: Read from persistent storage
    const stored = this.readFromPersistentStorage(key);
    if (stored && (stored.isRevoked || this.revokedLeases.has(key))) {
      return null;
    }
    return stored;
  }

  /**
   * Revokes a lease immediately.
   */
  public async revokeLease(organizationId: string, userId: string): Promise<void> {
    const key = `${organizationId}:${userId}`;
    this.revokedLeases.add(key);

    const existing = this.memoryLeases.get(key);
    if (existing) {
      existing.isRevoked = true;
    }
    this.memoryLeases.delete(key);

    this.removeFromPersistentStorage(key);
  }

  /**
   * Revokes all leases for an organization.
   */
  public async revokeAllLeasesForOrg(organizationId: string): Promise<void> {
    for (const [key, lease] of this.memoryLeases.entries()) {
      if (lease.organizationId === organizationId) {
        lease.isRevoked = true;
        this.revokedLeases.add(key);
        this.removeFromPersistentStorage(key);
      }
    }
  }

  public clearAll(): void {
    this.memoryLeases.clear();
    this.revokedLeases.clear();
  }

  private saveToPersistentStorage(key: string, lease: CapabilityLease): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(`hisabati_lease_${key}`, JSON.stringify(lease));
      }
    } catch {
      // Ignore
    }
  }

  private readFromPersistentStorage(key: string): CapabilityLease | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = window.localStorage.getItem(`hisabati_lease_${key}`);
        if (raw) {
          const parsed = JSON.parse(raw) as CapabilityLease;
          this.memoryLeases.set(key, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  }

  private removeFromPersistentStorage(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(`hisabati_lease_${key}`);
      }
    } catch {
      // Ignore
    }
  }
}

export const capabilityLeaseService = CapabilityLeaseService.getInstance();
