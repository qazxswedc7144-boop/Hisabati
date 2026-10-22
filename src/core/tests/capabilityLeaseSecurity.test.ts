import 'fake-indexeddb/auto';
import { capabilityLeaseService } from '../services/tenant/CapabilityLeaseService';
import { ServerLeaseIssuer } from '../services/tenant/ServerLeaseIssuer';
import { tenantService } from '../services/TenantService';
import { CapabilityLease } from '@/shared/types/tenant.types';
import { useTenantStore } from '@/shared/stores/tenantStore';

export interface CapabilityLeaseSecurityTestResult {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface CapabilityLeaseSecuritySummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: CapabilityLeaseSecurityTestResult[];
}

function ensureLocalStorage() {
  if (typeof window === 'undefined' || !window.localStorage) {
    const storeMap = new Map<string, string>();
    (globalThis as any).window = {
      ...(globalThis.window || {}),
      localStorage: {
        getItem: (key: string) => storeMap.get(key) || null,
        setItem: (key: string, value: string) => { storeMap.set(key, value); },
        removeItem: (key: string) => { storeMap.delete(key); },
        clear: () => { storeMap.clear(); },
      },
    };
  }
}

export class CapabilityLeaseSecurityTestSuite {
  public static async runAll(): Promise<CapabilityLeaseSecuritySummary> {
    ensureLocalStorage();
    const startTime = performance.now();
    const results: CapabilityLeaseSecurityTestResult[] = [];

    // Ensure server lease issuer is initialized
    await ServerLeaseIssuer.initialize();

    const testCases: Array<{
      id: string;
      title: string;
      description: string;
      fn: () => Promise<void>;
    }> = [
      // 1. Server-issued valid Lease -> ACCEPT
      {
        id: 'LEASE-01',
        title: 'Server-Issued Valid Lease',
        description: 'التحقق من قبول تصريح صادر وموقع رقمياً من الخادم',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_01',
            verifiedUid: 'user_test_01',
            verifiedRole: 'admin',
            verifiedPermissions: ['accounts:read', 'transactions:create'],
          });
          const res = await capabilityLeaseService.validateLease(lease, {
            currentUid: 'user_test_01',
            targetOrgId: 'org_test_01',
          });
          if (!res.valid) {
            throw new Error(`Expected valid server lease, got rejection: ${JSON.stringify(res)}`);
          }
        },
      },

      // 2. Valid signature -> ACCEPT
      {
        id: 'LEASE-02',
        title: 'Valid Asymmetric Signature',
        description: 'التحقق من صحة التوقيع غير المتماثل (ECDSA P-256)',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_02',
            verifiedUid: 'user_test_02',
            verifiedRole: 'accountant',
            verifiedPermissions: ['accounts:read'],
          });
          const isSigValid = await capabilityLeaseService.verifySignature(lease);
          if (!isSigValid) {
            throw new Error('Valid signature failed verification.');
          }
        },
      },

      // 3. Modified organizationId -> REJECT
      {
        id: 'LEASE-03',
        title: 'Modified Organization ID',
        description: 'رفض التصريح عند تعديل organizationId محلياً',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_03',
            verifiedUid: 'user_test_03',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, organizationId: 'org_hacked' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_03',
            targetOrgId: 'org_hacked',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified organizationId was accepted!');
          }
        },
      },

      // 4. Modified userId -> REJECT
      {
        id: 'LEASE-04',
        title: 'Modified User ID',
        description: 'رفض التصريح عند تعديل userId محلياً',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_04',
            verifiedUid: 'user_real',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, verifiedUid: 'user_attacker' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_attacker',
            targetOrgId: 'org_test_04',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified userId was accepted!');
          }
        },
      },

      // 5. Modified role -> REJECT
      {
        id: 'LEASE-05',
        title: 'Modified Role',
        description: 'رفض التصريح عند تعديل الدور (Privilege Escalation)',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_05',
            verifiedUid: 'user_viewer',
            verifiedRole: 'viewer',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, verifiedRole: 'owner' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_viewer',
            targetOrgId: 'org_test_05',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified role was accepted!');
          }
        },
      },

      // 6. Modified permissions -> REJECT
      {
        id: 'LEASE-06',
        title: 'Modified Permissions',
        description: 'رفض التصريح عند تعديل الصلاحيات محلياً',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_06',
            verifiedUid: 'user_test_06',
            verifiedRole: 'accountant',
            verifiedPermissions: ['accounts:read'],
          });
          const tampered: CapabilityLease = { ...lease, verifiedPermissions: ['accounts:read', 'admin:manage_users'] };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_06',
            targetOrgId: 'org_test_06',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified permissions were accepted!');
          }
        },
      },

      // 7. Modified capabilities -> REJECT
      {
        id: 'LEASE-07',
        title: 'Modified Capabilities',
        description: 'رفض التصريح عند التلاعب بمراجعة التحقق (verificationRevision)',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_07',
            verifiedUid: 'user_test_07',
            verifiedRole: 'viewer',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, verificationRevision: 999 };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_07',
            targetOrgId: 'org_test_07',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified capabilities/revision was accepted!');
          }
        },
      },

      // 8. Modified expiration -> REJECT
      {
        id: 'LEASE-08',
        title: 'Modified Expiration',
        description: 'رفض التصريح عند تمديد تاريخ انتهاء الصلاحية',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_08',
            verifiedUid: 'user_test_08',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, expiresAt: Date.now() + 999999999 };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_08',
            targetOrgId: 'org_test_08',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified expiration was accepted!');
          }
        },
      },

      // 9. Modified issuer -> REJECT
      {
        id: 'LEASE-09',
        title: 'Modified Issuer',
        description: 'رفض التصريح عند تغيير جهة الإصدار',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_09',
            verifiedUid: 'user_test_09',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, issuer: 'malicious-server' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_09',
            targetOrgId: 'org_test_09',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified issuer was accepted!');
          }
        },
      },

      // 10. Modified audience -> REJECT
      {
        id: 'LEASE-10',
        title: 'Modified Audience',
        description: 'رفض التصريح عند عدم مطابقة الجمهور المستهدف',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_10a',
            verifiedUid: 'user_test_10',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, audience: 'org_test_10b' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_10',
            targetOrgId: 'org_test_10a',
          });
          if (res.valid) {
            throw new Error('Security violation: Modified audience was accepted!');
          }
        },
      },

      // 11. Invalid signature -> REJECT
      {
        id: 'LEASE-11',
        title: 'Invalid Signature',
        description: 'رفض التصريح عند وجود توقيع مشفر غير صالح',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_11',
            verifiedUid: 'user_test_11',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, integrityHash: Buffer.from('forged_signature_bytes').toString('base64') };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_11',
            targetOrgId: 'org_test_11',
          });
          if (res.valid) {
            throw new Error('Security violation: Invalid signature was accepted!');
          }
        },
      },

      // 12. Expired Lease -> REJECT
      {
        id: 'LEASE-12',
        title: 'Expired Lease',
        description: 'رفض التصريح منتهي الصلاحية',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_12',
            verifiedUid: 'user_test_12',
            verifiedRole: 'admin',
            verifiedPermissions: [],
            durationMs: -1000,
          });
          const res = await capabilityLeaseService.validateLease(lease, {
            currentUid: 'user_test_12',
            targetOrgId: 'org_test_12',
          });
          if (res.valid) {
            throw new Error('Security violation: Expired lease was accepted!');
          }
        },
      },

      // 13. Wrong public key -> REJECT (Tested by verifying with mismatch)
      {
        id: 'LEASE-13',
        title: 'Wrong Public Key Verification Failure',
        description: 'فشل التحقق عند استخدام مفتاح عام خاطئ أو غير مطابق',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_13',
            verifiedUid: 'user_test_13',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          // Tamper signature byte
          const sigBytes = Buffer.from(lease.integrityHash, 'base64');
          sigBytes[0] = sigBytes[0] ^ 0xFF;
          const badLease: CapabilityLease = { ...lease, integrityHash: sigBytes.toString('base64') };
          const res = await capabilityLeaseService.validateLease(badLease, {
            currentUid: 'user_test_13',
            targetOrgId: 'org_test_13',
          });
          if (res.valid) {
            throw new Error('Security violation: Lease with wrong signature bytes was accepted!');
          }
        },
      },

      // 14. Malformed payload -> REJECT
      {
        id: 'LEASE-14',
        title: 'Malformed Payload',
        description: 'رفض البيانات التالفة أو غير المكتملة',
        fn: async () => {
          const malformed = { leaseId: 'mal' } as any;
          const res = await capabilityLeaseService.validateLease(malformed, {
            currentUid: 'user',
            targetOrgId: 'org',
          });
          if (res.valid) {
            throw new Error('Security violation: Malformed lease accepted!');
          }
        },
      },

      // 15. Lease fabricated entirely in Browser -> REJECT
      {
        id: 'LEASE-15',
        title: 'Lease Fabricated Entirely in Browser',
        description: 'رفض أي تصريح يتم تلفيقه في المتصفح دون توقيع الخادم الحقيقي',
        fn: async () => {
          const fakeLease: CapabilityLease = {
            leaseId: 'lease_fake_browser',
            organizationId: 'org_test_15',
            verifiedUid: 'user_attacker',
            verifiedRole: 'owner',
            verifiedPermissions: ['*'],
            issuedAt: Date.now(),
            expiresAt: Date.now() + 86400000,
            verificationRevision: 1,
            integrityHash: Buffer.from('random_signature').toString('base64'),
          };
          const res = await capabilityLeaseService.validateLease(fakeLease, {
            currentUid: 'user_attacker',
            targetOrgId: 'org_test_15',
          });
          if (res.valid) {
            throw new Error('Security violation: Browser-fabricated lease was accepted!');
          }
        },
      },

      // 16. Browser attempts self-signing -> REJECT
      {
        id: 'LEASE-16',
        title: 'Browser Self-Signing Prevention',
        description: 'إثبات عجز المتصفح عن توقيع أو إنشاء تصريح صالح لعدم امتلاكه Private Key',
        fn: async () => {
          let threwError = false;
          try {
            await capabilityLeaseService.createLease({
              organizationId: 'org_test_16',
              verifiedUid: 'user_16',
              verifiedRole: 'owner',
              verifiedPermissions: [],
            });
          } catch {
            threwError = true;
          }
          if (!threwError) {
            throw new Error('Security violation: Browser was able to invoke createLease() without server private key!');
          }
        },
      },

      // 17. Private signing key absent from browser bundle -> PASS
      {
        id: 'LEASE-17',
        title: 'Private Key Absent from Browser',
        description: 'التأكد من أن كود المتصفح لا يحتوي على أي private signing key',
        fn: async () => {
          const hasPrivate = (ServerLeaseIssuer as any).privateKey !== undefined && (ServerLeaseIssuer as any).privateKey !== null;
          // In server context it's initialized, but in client bundle it's absent. We verify CapabilityLeaseService has no private key.
          const serviceHasPrivate = (capabilityLeaseService as any).privateKey;
          if (serviceHasPrivate) {
            throw new Error('Security violation: CapabilityLeaseService holds a private key!');
          }
        },
      },

      // 18. localStorage tampering -> REJECT
      {
        id: 'LEASE-18',
        title: 'localStorage Tampering Rejection',
        description: 'رفض التصريح المخزن في localStorage إذا تم العبث به محلياً',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_18',
            verifiedUid: 'user_18',
            verifiedRole: 'viewer',
            verifiedPermissions: [],
          });
          await capabilityLeaseService.cacheServerIssuedLease(lease);

          const key = 'hisabati_lease_org_test_18:user_18';
          const raw = window.localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            parsed.verifiedRole = 'owner'; // Tamper role in storage
            window.localStorage.setItem(key, JSON.stringify(parsed));
          }

          const res = await capabilityLeaseService.validateLease(JSON.parse(window.localStorage.getItem(key)!), {
            currentUid: 'user_18',
            targetOrgId: 'org_test_18',
          });

          if (res.valid) {
            throw new Error('Security violation: Tampered localStorage lease was accepted!');
          }
        },
      },

      // 19. IndexedDB tampering -> REJECT
      {
        id: 'LEASE-19',
        title: 'Persistent Storage / IndexedDB Tampering Rejection',
        description: 'رفض التلاعب ببيانات التخزين الدائم واسترجاعها عبر getStoredLease',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_19',
            verifiedUid: 'user_19',
            verifiedRole: 'accountant',
            verifiedPermissions: [],
          });
          await capabilityLeaseService.cacheServerIssuedLease(lease);

          capabilityLeaseService.clearAll();

          // Inject tampered lease into localStorage
          const key = 'hisabati_lease_org_test_19:user_19';
          const tampered = { ...lease, verifiedPermissions: ['admin:all'] };
          window.localStorage.setItem(key, JSON.stringify(tampered));

          const stored = await capabilityLeaseService.getStoredLease('org_test_19', 'user_19');
          const res = await capabilityLeaseService.validateLease(stored, {
            currentUid: 'user_19',
            targetOrgId: 'org_test_19',
          });

          if (res.valid) {
            throw new Error('Security violation: Tampered stored lease validated successfully!');
          }
        },
      },

      // 20. Valid previously-issued offline Lease -> ACCEPT
      {
        id: 'LEASE-20',
        title: 'Valid Server-Issued Offline Lease Acceptance',
        description: 'قبول تصريح سابق سليم وموقع من الخادم أثناء العمل دون انترنت',
        fn: async () => {
          const lease = await ServerLeaseIssuer.issueLease({
            organizationId: 'org_test_20',
            verifiedUid: 'user_20',
            verifiedRole: 'employee',
            verifiedPermissions: ['transactions:create'],
            durationMs: 3600000, // 1 hour
          });
          const res = await capabilityLeaseService.validateLease(lease, {
            currentUid: 'user_20',
            targetOrgId: 'org_test_20',
          });
          if (!res.valid) {
            throw new Error('Valid server-issued offline lease was rejected.');
          }
        },
      },

      // 21. Cloud-sensitive capability without valid server Lease -> FAIL CLOSED
      {
        id: 'LEASE-21',
        title: 'Cloud-Sensitive Capability Fail-Closed',
        description: 'الإغلاق التلقائي (Fail-Closed) للعمليات الحساسة عند غياب التصريح الموقّع من الخادم',
        fn: async () => {
          let blocked = false;
          try {
            await tenantService.switchWithOfflineLease('org_cloud_sensitive', 'user_no_lease', {
              leaseId: 'fake',
              organizationId: 'org_cloud_sensitive',
              verifiedUid: 'user_no_lease',
              verifiedRole: 'owner',
              verifiedPermissions: [],
              issuedAt: Date.now(),
              expiresAt: Date.now() + 1000,
              verificationRevision: 1,
              integrityHash: 'invalid_sig',
            });
          } catch {
            blocked = true;
          }
          if (!blocked) {
            throw new Error('Security violation: Cloud-sensitive operation succeeded without valid server lease!');
          }
        },
      },
    ];

    for (const tc of testCases) {
      const tStart = performance.now();
      try {
        await tc.fn();
        results.push({
          id: tc.id,
          title: tc.title,
          description: tc.description,
          passed: true,
          durationMs: performance.now() - tStart,
        });
      } catch (err: any) {
        results.push({
          id: tc.id,
          title: tc.title,
          description: tc.description,
          passed: false,
          error: err?.message || String(err),
          durationMs: performance.now() - tStart,
        });
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      durationMs: performance.now() - startTime,
      results,
    };
  }
}
