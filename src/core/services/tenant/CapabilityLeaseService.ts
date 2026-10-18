import { CapabilityLease, LeaseValidationResult, OrganizationRole } from '@/shared/types/tenant.types';
import { calculateSHA256 } from '@/core/utils/crypto';

/**
 * CapabilityLeaseService:
 * Manages tamper-resistant, cryptographically verified Offline Capability Leases.
 * 
 * P0 Security Hardening:
 * - Eliminates static client-side salts.
 * - Enforces authoritative issuance tracking and runtime cryptographic binding.
 * - Applies Fail-Closed: any local payload tampering (role, permissions, org, uid, expiration) or unverified persistent lease is instantly rejected.
 */
export class CapabilityLeaseService {
  private static instance: CapabilityLeaseService;
  
  public static readonly DEFAULT_DURATION_MS = 24 * 60 * 60 * 1000; // 24 Hours
  
  // Runtime volatile cryptographic secret (never stored in localStorage, prevents static salt forging)
  private runtimeSecret: string = '';

  // In-memory registry of active authoritative leases (key: `${orgId}:${uid}`)
  private memoryLeases: Map<string, CapabilityLease> = new Map();

  // Revocation tombstone registry (key: `${orgId}:${uid}`)
  private revokedLeases: Set<string> = new Set();

  private constructor() {
    this.generateRuntimeSecret();
  }

  private generateRuntimeSecret(): void {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
      const array = new Uint8Array(32);
      window.crypto.getRandomValues(array);
      this.runtimeSecret = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } else {
      this.runtimeSecret = Math.random().toString(36) + Date.now().toString(36);
    }
  }

  public static getInstance(): CapabilityLeaseService {
    if (!CapabilityLeaseService.instance) {
      CapabilityLeaseService.instance = new CapabilityLeaseService();
    }
    return CapabilityLeaseService.instance;
  }

  /**
   * Generates a deterministic canonical payload string for hashing.
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
    ].join('|');
  }

  /**
   * Generates cryptographic integrity hash of the canonical payload bound with runtime secret.
   */
  public async computeIntegrityHash(lease: Omit<CapabilityLease, 'integrityHash'>): Promise<string> {
    const canonical = CapabilityLeaseService.buildCanonicalPayload(lease);
    return await calculateSHA256(`${canonical}|${this.runtimeSecret}`);
  }

  /**
   * Issues a new Capability Lease following verified server-side response.
   * STRICT: Can only be called by authoritative server-verified workflows.
   */
  public async createLease(params: {
    organizationId: string;
    verifiedUid: string;
    verifiedRole: OrganizationRole;
    verifiedPermissions: string[];
    verificationRevision?: number;
    durationMs?: number;
  }): Promise<CapabilityLease> {
    const now = Date.now();
    const duration = params.durationMs ?? CapabilityLeaseService.DEFAULT_DURATION_MS;
    const leaseId = `lease_${params.organizationId}_${params.verifiedUid}_${now}`;

    const draftLease: Omit<CapabilityLease, 'integrityHash'> = {
      leaseId,
      organizationId: params.organizationId,
      verifiedUid: params.verifiedUid,
      verifiedRole: params.verifiedRole,
      verifiedPermissions: [...params.verifiedPermissions],
      issuedAt: now,
      expiresAt: now + duration,
      verificationRevision: params.verificationRevision ?? 1,
      isRevoked: false,
    };

    const integrityHash = await this.computeIntegrityHash(draftLease);

    const fullLease: CapabilityLease = {
      ...draftLease,
      integrityHash,
    };

    const key = `${params.organizationId}:${params.verifiedUid}`;
    this.memoryLeases.set(key, fullLease);
    this.revokedLeases.delete(key);

    // Save to local storage if available in browser
    this.saveToPersistentStorage(key, fullLease);

    return fullLease;
  }

  /**
   * Validates a Capability Lease against expiration, user/org binding, and cryptographic integrity.
   * Enforces Fail-Closed and tamper resistance against local payload modification.
   */
  public async validateLease(
    lease: CapabilityLease | null | undefined,
    context: {
      currentUid: string;
      targetOrgId: string;
      now?: number;
    }
  ): Promise<LeaseValidationResult> {
    if (!lease || !lease.leaseId || !lease.integrityHash) {
      return {
        valid: false,
        code: 'LEASE_NOT_FOUND',
        messageAr: 'لم يتم العثور على تصريح Capability Lease صالح.',
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

    // 5. Authoritative Issuance & Tamper Check (Fail-Closed)
    const authoritative = this.memoryLeases.get(key) || this.readFromPersistentStorage(key);
    if (!authoritative) {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'فشل التحقق: التصريح غير مسجل في السجل الموثق (Fail-Closed).',
      };
    }

    if (lease.verifiedRole !== authoritative.verifiedRole) {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'تم اكتشاف تلاعب محلي في دور المستخدم (Role Tampered).',
      };
    }

    const presentedPerms = [...(lease.verifiedPermissions || [])].sort().join(',');
    const authPerms = [...(authoritative.verifiedPermissions || [])].sort().join(',');
    if (presentedPerms !== authPerms) {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'تم اكتشاف تلاعب محلي في صلاحيات العضوية (Permissions Tampered).',
      };
    }

    if (lease.expiresAt > authoritative.expiresAt) {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'تم اكتشاف تمديد غير مسموح به في صلاحية التصريح.',
      };
    }

    // 6. Cryptographic Integrity Validation
    const draft: Omit<CapabilityLease, 'integrityHash'> = {
      leaseId: lease.leaseId,
      organizationId: lease.organizationId,
      verifiedUid: lease.verifiedUid,
      verifiedRole: lease.verifiedRole,
      verifiedPermissions: lease.verifiedPermissions,
      issuedAt: lease.issuedAt,
      expiresAt: lease.expiresAt,
      verificationRevision: lease.verificationRevision,
      isRevoked: lease.isRevoked,
    };

    const expectedHash = await this.computeIntegrityHash(draft);
    if (expectedHash !== lease.integrityHash) {
      return {
        valid: false,
        code: 'LEASE_INTEGRITY_FAILED',
        messageAr: 'فشل فحص نزاهة التصريح: تم اكتشاف تلاعب محلي في البصمة الرقمية.',
      };
    }

    return {
      valid: true,
      lease,
    };
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
   * Revokes a lease immediately (e.g., when membership is suspended or revoked).
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
   * Revokes all leases for an organization (e.g., if organization is suspended).
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

  /**
   * Helper: clear all leases (useful for test resets).
   */
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
      // Ignore storage errors in restricted contexts
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
      // Ignore parse/read errors
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
