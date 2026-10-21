import 'fake-indexeddb/auto';
import { capabilityLeaseService } from '../services/tenant/CapabilityLeaseService';
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

    const testCases: Array<{
      id: string;
      title: string;
      description: string;
      fn: () => Promise<void>;
    }> = [
      // 1. Lease valid + correct signature -> PASS
      {
        id: 'LEASE-01',
        title: 'Valid Lease with Correct Signature',
        description: 'التحقق من قبول تصريح صحيح وموقع بمهارة صالحة',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
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
            throw new Error(`Expected valid lease, got rejection: ${JSON.stringify(res)}`);
          }
        },
      },

      // 2. Change organizationId -> REJECT
      {
        id: 'LEASE-02',
        title: 'Tampered Organization ID',
        description: 'رفض التصريح عند تعديل organizationId محلياً',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_02',
            verifiedUid: 'user_test_02',
            verifiedRole: 'admin',
            verifiedPermissions: ['accounts:read'],
          });
          const tampered: CapabilityLease = { ...lease, organizationId: 'org_hacked' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_02',
            targetOrgId: 'org_hacked',
          });
          if (res.valid) {
            throw new Error('Security violation: Tampered organizationId was accepted!');
          }
        },
      },

      // 3. Change userId -> REJECT
      {
        id: 'LEASE-03',
        title: 'Tampered User ID',
        description: 'رفض التصريح عند تعديل verifiedUid محلياً',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_03',
            verifiedUid: 'user_real',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, verifiedUid: 'user_attacker' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_attacker',
            targetOrgId: 'org_test_03',
          });
          if (res.valid) {
            throw new Error('Security violation: Tampered verifiedUid was accepted!');
          }
        },
      },

      // 4. Change role -> REJECT
      {
        id: 'LEASE-04',
        title: 'Tampered Role (Privilege Escalation)',
        description: 'رفض التصريح عند محاولة ترقية الدور محلياً (من viewer إلى owner)',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_04',
            verifiedUid: 'user_viewer',
            verifiedRole: 'viewer',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, verifiedRole: 'owner' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_viewer',
            targetOrgId: 'org_test_04',
          });
          if (res.valid) {
            throw new Error('Security violation: Privilege escalation via role tampering was accepted!');
          }
        },
      },

      // 5. Change permissions -> REJECT
      {
        id: 'LEASE-05',
        title: 'Tampered Permissions',
        description: 'رفض التصريح عند تعديل قائمة الصلاحيات محلياً',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_05',
            verifiedUid: 'user_test_05',
            verifiedRole: 'accountant',
            verifiedPermissions: ['accounts:read'],
          });
          const tampered: CapabilityLease = { ...lease, verifiedPermissions: ['accounts:read', 'admin:manage_users', 'database:export'] };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_05',
            targetOrgId: 'org_test_05',
          });
          if (res.valid) {
            throw new Error('Security violation: Tampered permissions were accepted!');
          }
        },
      },

      // 6. Change capabilities -> REJECT
      {
        id: 'LEASE-06',
        title: 'Tampered Capabilities payload',
        description: 'رفض التصريح عند التلاعب بخصائص الحزمة محلياً',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_06',
            verifiedUid: 'user_test_06',
            verifiedRole: 'viewer',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, verificationRevision: 999 };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_06',
            targetOrgId: 'org_test_06',
          });
          if (res.valid) {
            throw new Error('Security violation: Tampered revision/capabilities was accepted!');
          }
        },
      },

      // 7. Change expiration -> REJECT
      {
        id: 'LEASE-07',
        title: 'Tampered Expiration Time',
        description: 'رفض التصريح عند تمديد وقت انتهاء الصلاحية محلياً',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_07',
            verifiedUid: 'user_test_07',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, expiresAt: Date.now() + 999999999 };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_07',
            targetOrgId: 'org_test_07',
          });
          if (res.valid) {
            throw new Error('Security violation: Tampered expiration time was accepted!');
          }
        },
      },

      // 8. Incorrect signature -> REJECT
      {
        id: 'LEASE-08',
        title: 'Incorrect Signature / Hash',
        description: 'رفض التصريح عند وضع بصمة رقمية وهمية أو معدلة',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_08',
            verifiedUid: 'user_test_08',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, integrityHash: 'hash_forged_deadbeef' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_08',
            targetOrgId: 'org_test_08',
          });
          if (res.valid) {
            throw new Error('Security violation: Forged signature/hash was accepted!');
          }
        },
      },

      // 9. Expired lease -> REJECT
      {
        id: 'LEASE-09',
        title: 'Expired Lease',
        description: 'رفض التصريح المنتهي الصلاحية',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_09',
            verifiedUid: 'user_test_09',
            verifiedRole: 'admin',
            verifiedPermissions: [],
            durationMs: -1000, // already expired
          });
          const res = await capabilityLeaseService.validateLease(lease, {
            currentUid: 'user_test_09',
            targetOrgId: 'org_test_09',
          });
          if (res.valid) {
            throw new Error('Security violation: Expired lease was accepted!');
          }
        },
      },

      // 10. Incorrect issuer -> REJECT
      {
        id: 'LEASE-10',
        title: 'Incorrect Issuer',
        description: 'رفض التصريح الصادر من جهة غير معتمدة',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_10',
            verifiedUid: 'user_test_10',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, issuer: 'malicious-attacker-server' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_10',
            targetOrgId: 'org_test_10',
          });
          if (res.valid) {
            throw new Error('Security violation: Lease with incorrect issuer was accepted!');
          }
        },
      },

      // 11. Audience incorrect -> REJECT
      {
        id: 'LEASE-11',
        title: 'Incorrect Audience',
        description: 'رفض التصريح الموجه لمؤسسة أخرى (Audience mismatch)',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_11_a',
            verifiedUid: 'user_test_11',
            verifiedRole: 'admin',
            verifiedPermissions: [],
          });
          const tampered: CapabilityLease = { ...lease, audience: 'org_test_11_b' };
          const res = await capabilityLeaseService.validateLease(tampered, {
            currentUid: 'user_test_11',
            targetOrgId: 'org_test_11_a',
          });
          if (res.valid) {
            throw new Error('Security violation: Audience mismatch lease was accepted!');
          }
        },
      },

      // 12. Payload missing or malformed -> REJECT
      {
        id: 'LEASE-12',
        title: 'Malformed or Missing Payload',
        description: 'رفض التصريح التالف أو الناقص الحقول الجوهرية',
        fn: async () => {
          const malformed = { leaseId: 'mal_1', organizationId: 'org' } as any;
          const res = await capabilityLeaseService.validateLease(malformed, {
            currentUid: 'user',
            targetOrgId: 'org',
          });
          if (res.valid) {
            throw new Error('Security violation: Malformed lease was accepted!');
          }
        },
      },

      // 13. Lease from localStorage manually modified -> REJECT
      {
        id: 'LEASE-13',
        title: 'Manually Modified Persistent Storage Lease',
        description: 'رفض التصريح المحفوظ محلياً إذا تم العبث به والتعديل اليدوي',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_13',
            verifiedUid: 'user_test_13',
            verifiedRole: 'viewer',
            verifiedPermissions: [],
          });

          // Simulate attacker modifying localStorage directly
          const key = 'hisabati_lease_org_test_13:user_test_13';
          const storedRaw = window.localStorage.getItem(key);
          if (storedRaw) {
            const parsed = JSON.parse(storedRaw);
            parsed.verifiedRole = 'owner'; // Privilege escalation attempt
            window.localStorage.setItem(key, JSON.stringify(parsed));
          }

          const res = await capabilityLeaseService.validateLease(JSON.parse(window.localStorage.getItem(key)!), {
            currentUid: 'user_test_13',
            targetOrgId: 'org_test_13',
          });

          if (res.valid) {
            throw new Error('Security violation: Manually modified localStorage lease was accepted!');
          }
        },
      },

      // 14. Lease from persistent storage manually modified (IndexedDB/Cache simulation) -> REJECT
      {
        id: 'LEASE-14',
        title: 'Persistent Storage Cache Integrity',
        description: 'التأكد من عدم موثوقية الـ persistence cache في حال عدم مطابقة الـ signature',
        fn: async () => {
          const lease = await capabilityLeaseService.createLease({
            organizationId: 'org_test_14',
            verifiedUid: 'user_test_14',
            verifiedRole: 'accountant',
            verifiedPermissions: ['accounts:read'],
          });

          // Clear memory lease to force read from persistent storage
          capabilityLeaseService.clearAll();
          // Put tampered data into localStorage
          const key = 'hisabati_lease_org_test_14:user_test_14';
          window.localStorage.setItem(key, JSON.stringify({
            ...lease,
            verifiedPermissions: ['accounts:read', 'database:delete', 'admin:manage_users']
          }));

          const fetched = await capabilityLeaseService.getStoredLease('org_test_14', 'user_test_14');
          const res = await capabilityLeaseService.validateLease(fetched, {
            currentUid: 'user_test_14',
            targetOrgId: 'org_test_14',
          });

          if (res.valid) {
            throw new Error('Security violation: Tampered persistent storage lease fetched and validated successfully!');
          }
        },
      },

      // 15. Attempt to create Lease from frontend without valid server signature -> REJECT
      {
        id: 'LEASE-15',
        title: 'Frontend Self-Issuance Prevention',
        description: 'منع الواجهة الأمامية من تصنيع تصريح صالح دون توثيق خادمي حقيقي',
        fn: async () => {
          // Attacker tries to construct a fake lease object manually in JS without computeIntegrityHash / server workflow
          const fakeLease: CapabilityLease = {
            leaseId: 'lease_fake_999',
            organizationId: 'org_secure',
            verifiedUid: 'attacker_uid',
            verifiedRole: 'owner',
            verifiedPermissions: ['*'],
            issuedAt: Date.now(),
            expiresAt: Date.now() + 86400000,
            verificationRevision: 1,
            integrityHash: 'fake_hash_12345',
          };

          const res = await capabilityLeaseService.validateLease(fakeLease, {
            currentUid: 'attacker_uid',
            targetOrgId: 'org_secure',
          });

          if (res.valid) {
            throw new Error('Security violation: Frontend self-manufactured lease was accepted!');
          }
        },
      },

      // 16. Offline Standalone mode correct -> PASS
      {
        id: 'LEASE-16',
        title: 'Offline Standalone Mode Integrity',
        description: 'التحقق من عمل وضع Offline Standalone بشكل طبيعي وصحيح دون إخلال بالأمان',
        fn: async () => {
          await tenantService.switchToLocalMode();
          const store = useTenantStore.getState();
          if (!store.isLocalMode || store.activeOrganization?.id !== 'local') {
            throw new Error('Offline Standalone mode failed to initialize properly.');
          }
        },
      },

      // 17. Cloud-sensitive capability without trusted lease -> FAIL CLOSED
      {
        id: 'LEASE-17',
        title: 'Cloud-Sensitive Capability Fail-Closed',
        description: 'التحقق من فشل العمليات الحساسة سحابياً بشكل مغلق (Fail-Closed) عند غياب التصريح الموثوق',
        fn: async () => {
          let intercepted = false;
          try {
            await tenantService.switchWithOfflineLease('org_nonexistent_secure', 'user_no_lease', {
              leaseId: 'nonexistent',
              organizationId: 'org_nonexistent_secure',
              verifiedUid: 'user_no_lease',
              verifiedRole: 'owner',
              verifiedPermissions: [],
              issuedAt: Date.now(),
              expiresAt: Date.now() + 1000,
              verificationRevision: 1,
              integrityHash: 'invalid_hash',
            });
          } catch (err: any) {
            if (err.message) {
              intercepted = true;
            }
          }

          if (!intercepted) {
            throw new Error('Security violation: Cloud-sensitive operation succeeded without trusted lease (Fail-Closed failure)!');
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
