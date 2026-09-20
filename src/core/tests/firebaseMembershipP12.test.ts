import { authService } from '../services/rbac/AuthService.service';
import { tenantService } from '../services/TenantService';
import { tenantDbManager } from '../database/TenantDatabaseManager';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { rbacGuard } from '../services/rbac/RBACGuard.service';
import { AuditActor } from '@/shared/types';

export interface SecurityTestResultItem {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface SecurityTestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: SecurityTestResultItem[];
}

export class FirebaseMembershipP12TestSuite {
  public static async runAll(): Promise<SecurityTestSuiteSummary> {
    const startTime = performance.now();
    const results: SecurityTestResultItem[] = [];

    const testCases: Array<{
      id: string;
      title: string;
      description: string;
      fn: () => Promise<void>;
    }> = [
      // A) Firebase authenticated user -> must NOT automatically become owner
      {
        id: 'P1.2-A',
        title: 'Firebase Auth != Owner',
        description: 'المستخدم المصادق عبر Firebase لا يصبح مالكاً تلقائياً',
        fn: async () => {
          const firebaseUserActor: AuditActor = {
            id: 'firebase_user_123',
            name: 'Test Firebase User',
            email: 'test@firebase.app',
            role: 'pending_membership',
          };
          await authService.setActiveActor(firebaseUserActor);
          const actor = authService.getActiveActor();
          if (actor.role === 'owner') {
            throw new Error('خطأ أمني: المستخدم المصادق عبر Firebase حصل على دور owner تلقائياً!');
          }
          if (actor.role !== 'pending_membership' && actor.role !== 'authenticated_no_membership') {
            throw new Error(`دور غير متوقع للمستخدم المصادق: ${actor.role}`);
          }
        },
      },

      // B) Firebase authenticated user without Membership -> authenticated_no_membership
      {
        id: 'P1.2-B',
        title: 'Authenticated Without Membership State',
        description: 'المستخدم المصادق بدون عضوية تكون حالته authenticated_no_membership',
        fn: async () => {
          const firebaseUserActor: AuditActor = {
            id: 'firebase_user_456',
            name: 'No Membership User',
            email: 'nomem@firebase.app',
            role: 'pending_membership',
          };
          await authService.setActiveActor(firebaseUserActor);
          await tenantService.initialize();

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'authenticated_no_membership') {
            throw new Error(`حالة العضوية المتوقعة authenticated_no_membership، وجد: ${store.authMembershipStatus}`);
          }
          if (store.activeOrganization !== null || store.currentMembership !== null) {
            throw new Error('يجب ألا يتم إنشاء منظمة أو عضوية افتراضية للمستخدم بدون عضوية');
          }
        },
      },

      // C) authenticated_no_membership -> must NOT open user_<uid> Tenant DB
      {
        id: 'P1.2-C',
        title: 'No Tenant DB for No-Membership User (Strict Assertion)',
        description: 'التحقق الصارم من عدم إنشاء أو فتح أي قاعدة بيانات Tenant للمستخدم غير المصرح له والتحقق من عدم وجود قاعدة بيانات firebase_user_*',
        fn: async () => {
          const firebaseUserActor: AuditActor = {
            id: 'firebase_user_789',
            name: 'Isolated User',
            email: 'isolate@firebase.app',
            role: 'pending_membership',
          };
          await authService.setActiveActor(firebaseUserActor);
          await tenantService.initialize();

          // 1. Strict assertion: getActiveDatabase() must throw exactly the uninitialized error.
          // Any other error or absence of error fails the test (not considered success).
          let dbError: any = null;
          try {
            tenantDbManager.getActiveDatabase();
          } catch (e: any) {
            dbError = e;
          }

          if (!dbError) {
            throw new Error('فشل أمني خطير: تم السماح بالوصول لقاعدة البيانات أو فتحها لمستخدم بلا عضوية دون رمي استثناء!');
          }

          if (dbError.message !== 'لم يتم تهيئة قاعدة بيانات المؤسسة بعد') {
            throw new Error(`فشل الاختبار بسبب خطأ غير متوقع بدلاً من خطأ عدم التهيئة المحمية: ${dbError.message}`);
          }

          // 2. Explicitly verify that no unauthorized tenant database of type 'firebase_user_*' exists or was opened
          if (typeof indexedDB !== 'undefined' && typeof indexedDB.databases === 'function') {
            const dbs = await indexedDB.databases();
            const unauthorizedDb = dbs.find(db => db.name && (db.name.includes('firebase_user_789') || db.name.includes('firebase_user')));
            if (unauthorizedDb) {
              throw new Error(`فشل أمني حرج: وُجدت قاعدة بيانات غير مصرح بها من نوع firebase_user_*: ${unauthorizedDb.name}`);
            }
          }

          // 3. Verify store state is strictly unassigned
          const store = useTenantStore.getState();
          if (store.activeOrganization !== null || store.currentMembership !== null) {
            throw new Error('فشل أمني: تم تسريب أو إنشاء سياق منظمة أو عضوية لمستخدم Firebase غير المالك لعضوية موثقة');
          }
        },
      },

      // D) authenticated_no_membership -> must NOT receive organization role/permissions
      {
        id: 'P1.2-D',
        title: 'Zero Permissions for Unassigned Role',
        description: 'المستخدم بدون عضوية لا يحصل على أي صلاحيات تنفيذية',
        fn: async () => {
          const canCreateAccount = rbacGuard.hasPermission('authenticated_no_membership', 'accounts:create');
          const canManageTeam = rbacGuard.hasPermission('pending_membership', 'team:manage_members');
          const canReadReports = rbacGuard.hasPermission('unknown', 'reports:read');

          if (canCreateAccount || canManageTeam || canReadReports) {
            throw new Error('خطأ أمني: دور غير معين يمتلك صلاحيات مالية أو إدارية!');
          }
        },
      },

      // E) local/demo actor -> must not modify the role of the real Firebase authenticated identity
      {
        id: 'P1.2-E',
        title: 'Local/Demo Actor Isolation',
        description: 'التبديل بين المستخدم المحلي ومستخدم الـ Firebase يتم عزله تماماً',
        fn: async () => {
          await tenantService.switchToLocalMode();
          const localActor = authService.getActiveActor();
          if (localActor.id !== 'user_local_default' || localActor.role !== 'owner') {
            throw new Error('فشل إعداد المستخدم المحلي');
          }

          const fbActor: AuditActor = {
            id: 'fb_real_user',
            name: 'Real Firebase User',
            role: 'pending_membership',
            email: 'real@firebase.app',
          };
          await authService.setActiveActor(fbActor);
          await tenantService.initialize();

          const current = authService.getActiveActor();
          if (current.id !== 'fb_real_user' || current.role === 'owner') {
            throw new Error('اختلاط الصلاحيات بين المستخدم المحلي ومستخدم Firebase');
          }
        },
      },

      // F) Existing valid Membership -> preserves ability to resolve Organization + Role
      {
        id: 'P1.2-F',
        title: 'Preserve Valid Membership Resolution',
        description: 'العضوية والمنظمة الصالحة تحافظ على قدرتها في استرجاع السياق والصلاحيات',
        fn: async () => {
          const mockOrg = {
            id: 'org_valid_999',
            name: 'Valid Enterprise Org',
            ownerId: 'fb_member_user',
            status: 'active' as const,
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          const mockMembership = {
            organizationId: 'org_valid_999',
            userId: 'fb_member_user',
            role: 'admin' as const,
            status: 'active' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await tenantService.switchOrganization(mockOrg, mockMembership);
          const store = useTenantStore.getState();

          if (store.activeOrganization?.id !== 'org_valid_999' || store.currentMembership?.role !== 'admin') {
            throw new Error('فشل الحفاظ على سياق العضوية والمنظمة الصالحة');
          }

          await tenantService.switchToLocalMode();
        },
      },

      // G) Expired Token Rejection -> rejects expired token immediately, prevents tenant DB opening
      {
        id: 'P1.2-G',
        title: 'Expired Token Rejection',
        description: 'رفض رمز الدخول منتهي الصلاحية فوراً ومنع فتح أو إنشاء قاعدة بيانات الـ Tenant',
        fn: async () => {
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');
          const expiredToken = FirebaseTokenVerifier.createTestToken(
            { uid: 'usr_expired_1' },
            { expired: true }
          );

          let errorThrown = false;
          try {
            await tenantService.verifyAndSwitchOrganization(expiredToken, 'org_target_any');
          } catch (e: any) {
            errorThrown = true;
            if (!e.message.includes('انتهت صلاحية') && !e.message.includes('TOKEN_EXPIRED')) {
              throw new Error(`رسالة الخطأ غير متوقعة للرمز المنتهي: ${e.message}`);
            }
          }

          if (!errorThrown) {
            throw new Error('خطأ أمني حرج: تم قبول رمز دخول منتهي الصلاحية دون إطلاق استثناء!');
          }

          // Verify Tenant DB was NOT opened
          let dbError = false;
          try {
            tenantDbManager.getActiveDatabase();
          } catch {
            dbError = true;
          }
          if (!dbError) {
            throw new Error('خطأ أمني: تم فتح قاعدة بيانات لمستخدم برمز منتهي!');
          }

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'authenticated_no_membership') {
            throw new Error(`حالة العضوية غير صحيحة بعد فشل الرمز: ${store.authMembershipStatus}`);
          }
        },
      },

      // H) Malformed / Tampered Token Rejection
      {
        id: 'P1.2-H',
        title: 'Tampered Token Rejection',
        description: 'رفض الرموز التالفة أو ذات التوقيع المزور فوراً ومنع الوصول للنظام',
        fn: async () => {
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');
          const tamperedToken = FirebaseTokenVerifier.createTestToken(
            { uid: 'usr_attacker_sig' },
            { invalidSignature: true }
          );

          let errorThrown = false;
          try {
            await tenantService.verifyAndSwitchOrganization(tamperedToken, 'org_target_sec');
          } catch {
            errorThrown = true;
          }

          if (!errorThrown) {
            throw new Error('خطأ أمني حرج: تم قبول رمز بتوقيع مزور أو غير صالح!');
          }

          // Verify Tenant DB was NOT opened
          try {
            tenantDbManager.getActiveDatabase();
            throw new Error('خطأ أمني: قاعدة البيانات مفتوحة بعد رفض الرمز التالف!');
          } catch (e: any) {
            if (e.message !== 'لم يتم تهيئة قاعدة بيانات المؤسسة بعد') {
              throw e;
            }
          }
        },
      },

      // I) Project ID Mismatch Rejection
      {
        id: 'P1.2-I',
        title: 'Project ID Mismatch Rejection',
        description: 'رفض الرموز الصادرة لمشروع Firebase خارجي أو مختلف عن مشروع التطبيق',
        fn: async () => {
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');
          const foreignToken = FirebaseTokenVerifier.createTestToken(
            { uid: 'usr_foreign_project' },
            { wrongProject: true }
          );

          let errorThrown = false;
          try {
            await tenantService.verifyAndSwitchOrganization(foreignToken, 'org_target_proj');
          } catch (e: any) {
            errorThrown = true;
            if (!e.message.includes('مشروع') && !e.message.includes('PROJECT')) {
              throw new Error(`رسالة الخطأ غير ملائمة لعدم تطابق المشروع: ${e.message}`);
            }
          }

          if (!errorThrown) {
            throw new Error('خطأ أمني: تم قبول رمز صادر لمشروع Firebase خارجي!');
          }
        },
      },

      // J) Client Spoofing Prevention -> Server enforces Firestore role, completely ignoring client claims
      {
        id: 'P1.2-J',
        title: 'Client Spoofing Prevention (Enforce Firestore Role)',
        description: 'إحباط محاولة انتحال دور المالك أو انتحال UID وتثبيت ما يقرره السجل الخادمي الموثق',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const realUid = 'usr_real_accountant_44';
          const orgId = 'org_spoof_test_100';

          // Register in authoritative server/Firestore mock
          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Spoof Resistant Org',
            ownerId: 'legit_owner_001',
            status: 'active',
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: realUid,
            role: 'viewer', // Authoritative role is strictly VIEWER
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Attacker signs in with realUid, but in client request claims role: 'owner' and uid: 'fake_victim'
          const token = FirebaseTokenVerifier.createTestToken({ uid: realUid });
          await tenantService.verifyAndSwitchOrganization(token, orgId, {
            clientClaimedRole: 'owner',
            clientClaimedUid: 'fake_victim_user_99',
          });

          // Assertions
          const activeActor = authService.getActiveActor();
          if (activeActor.role === 'owner') {
            throw new Error('فشل أمني خطير: نجح العميل في انتحال دور Owner بدلاً من دوره الحقيقي في Firestore!');
          }
          if (activeActor.role !== 'viewer') {
            throw new Error(`دور غير متوقع للفاعل: ${activeActor.role} (المتوقع viewer)`);
          }
          if (activeActor.id !== realUid) {
            throw new Error(`تم قبول UID المنتحل: ${activeActor.id} بدلاً من UID الحقيقي: ${realUid}`);
          }

          const store = useTenantStore.getState();
          if (store.currentMembership?.role !== 'viewer') {
            throw new Error('تم تسريب الدور المنتحل إلى سياق العضوية في الـ Store!');
          }

          await tenantService.switchToLocalMode();
        },
      },

      // K) Suspended Organization Rejection
      {
        id: 'P1.2-K',
        title: 'Suspended Organization Rejection',
        description: 'رفض الدخول لمؤسسة معلقة أو مؤرشفة ومنع فتح قاعدة بياناتها',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const uid = 'usr_suspended_org_user';
          const orgId = 'org_suspended_77';

          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Suspended Firm',
            ownerId: 'some_owner',
            status: 'suspended', // Suspended
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: uid,
            role: 'admin',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          const token = FirebaseTokenVerifier.createTestToken({ uid });

          let errorThrown = false;
          try {
            await tenantService.verifyAndSwitchOrganization(token, orgId);
          } catch (e: any) {
            errorThrown = true;
            if (!e.message.includes('معلقة') && !e.message.includes('SUSPENDED')) {
              throw new Error(`رسالة الخطأ غير متوقعة للمؤسسة المعلقة: ${e.message}`);
            }
          }

          if (!errorThrown) {
            throw new Error('خطأ أمني: تم السماح بالتبديل لمؤسسة معلقة!');
          }

          // Verify Tenant DB was NOT opened
          try {
            tenantDbManager.getActiveDatabase();
            throw new Error('خطأ أمني: قاعدة البيانات مفتوحة لمؤسسة معلقة!');
          } catch (e: any) {
            if (e.message !== 'لم يتم تهيئة قاعدة بيانات المؤسسة بعد') {
              throw e;
            }
          }
        },
      },

      // L) Suspended Membership Handling -> sets membership_suspended and isolates DB
      {
        id: 'P1.2-L',
        title: 'Suspended Membership Handling',
        description: 'ضبط حالة العضوية إلى membership_suspended للمستخدم المعلق ومنع فتح DB',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const uid = 'usr_suspended_member_55';
          const orgId = 'org_active_for_suspended_mem';

          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Active Corp',
            ownerId: 'owner_boss',
            status: 'active',
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: uid,
            role: 'accountant',
            status: 'suspended', // Suspended member
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          const token = FirebaseTokenVerifier.createTestToken({ uid });

          let errorThrown = false;
          try {
            await tenantService.verifyAndSwitchOrganization(token, orgId);
          } catch {
            errorThrown = true;
          }

          if (!errorThrown) {
            throw new Error('خطأ أمني: تم السماح للمستخدم المعلق بالدخول!');
          }

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'membership_suspended') {
            throw new Error(`حالة العضوية المتوقعة membership_suspended، وجد: ${store.authMembershipStatus}`);
          }

          const actor = authService.getActiveActor();
          if (actor.role !== 'authenticated_no_membership') {
            throw new Error(`دور الفاعل يجب أن يكون خالي الصلاحيات، وجد: ${actor.role}`);
          }
        },
      },

      // M) Authenticated User Without Membership in Target Org
      {
        id: 'P1.2-M',
        title: 'No Membership in Target Org',
        description: 'مستخدم مسجل في Firebase لكنه لا يملك عضوية في المؤسسة المستهدفة',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const uid = 'usr_stranger_without_membership';
          const orgId = 'org_private_vault';

          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Private Vault Org',
            ownerId: 'vault_owner',
            status: 'active',
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Notice: No membership registered for uid in orgId!
          const token = FirebaseTokenVerifier.createTestToken({ uid });

          let errorThrown = false;
          try {
            await tenantService.verifyAndSwitchOrganization(token, orgId);
          } catch {
            errorThrown = true;
          }

          if (!errorThrown) {
            throw new Error('خطأ أمني: تم السماح لمستخدم بلا عضوية بالدخول إلى مؤسسة أخرى!');
          }

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'authenticated_no_membership') {
            throw new Error(`الحالة المتوقعة authenticated_no_membership، وجد: ${store.authMembershipStatus}`);
          }
        },
      },

      // N) Authoritative Server-Verified Switch Success
      {
        id: 'P1.2-N',
        title: 'Authoritative Server-Verified Switch Success',
        description: 'توثيق العضوية والمنظمة بنجاح واعتماد حالة online_verified وفتح Tenant DB',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const uid = 'usr_verified_pro_88';
          const orgId = 'org_verified_enterprise_88';

          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Enterprise Verified Co',
            ownerId: 'enterprise_owner',
            status: 'active',
            settings: { currency: 'SAR', language: 'ar', timezone: 'Asia/Riyadh' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: uid,
            role: 'accountant',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          const token = FirebaseTokenVerifier.createTestToken({ uid });

          const result = await tenantService.verifyAndSwitchOrganization(token, orgId);

          if (!result.success || !result.verifiedByBackend) {
            throw new Error('فشلت نتيجة التحقق الخادمي للعضوية الصالحة');
          }

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'online_verified') {
            throw new Error(`الحالة المتوقعة online_verified، وجد: ${store.authMembershipStatus}`);
          }
          if (store.activeOrganization?.id !== orgId) {
            throw new Error('معرف المؤسسة النشطة غير مطابق للمؤسسة الموثقة');
          }
          if (store.currentMembership?.role !== 'accountant') {
            throw new Error('دور العضوية غير مطابق للدور الموثق خادمياً');
          }

          // Verify Tenant DB is properly open and accessible
          const activeDb = tenantDbManager.getActiveDatabase();
          if (!activeDb || activeDb.name !== `hisabati_db_${orgId}`) {
            throw new Error(`قاعدة بيانات الـ Tenant المفتوحة غير صحيحة: ${activeDb?.name}`);
          }

          // Verify active actor permissions
          const actor = authService.getActiveActor();
          if (actor.role !== 'accountant' || actor.id !== uid) {
            throw new Error('لم يتم تعيين الفاعل النشط بالهوية والدور الموثق');
          }

          await tenantService.switchToLocalMode();
        },
      },

      // O) Token String Leakage & Console Hygiene Check
      {
        id: 'P1.2-O',
        title: 'Token String Leakage Prevention',
        description: 'التحقق الصارم من عدم تسريب نص Token السري في رسائل الخطأ أو الحالة أو الكونسول',
        fn: async () => {
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');
          const secretTestToken = FirebaseTokenVerifier.createTestToken(
            { uid: 'usr_secret_leak_test' },
            { expired: true }
          );

          try {
            await tenantService.verifyAndSwitchOrganization(secretTestToken, 'org_secret_test');
          } catch (e: any) {
            const errorStr = String(e?.message || e);
            if (errorStr.includes(secretTestToken)) {
              throw new Error('فشل أمني جسيم: تم تسريب الرمز السري Token داخل نص الاستثناء!');
            }
          }

          const store = useTenantStore.getState();
          if (store.error && store.error.includes(secretTestToken)) {
            throw new Error('فشل أمني جسيم: تم تسريب الرمز السري Token داخل Store.error!');
          }
        },
      },

      // P1.2-K-PERM) Client Permission Spoofing Prevention
      {
        id: 'P1.2-K-PERM',
        title: 'Client Permission Spoofing Prevention',
        description: 'تجاهل أي صلاحيات يدعيها العميل خادمياً والاعتماد الحصري على الصلاحيات الموثقة',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const uid = 'usr_perm_spoofer';
          const orgId = 'org_perm_check';

          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Perm Check Org',
            ownerId: 'owner_perm',
            status: 'active',
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: uid,
            role: 'viewer',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          const token = FirebaseTokenVerifier.createTestToken({ uid });

          const result = await ServerMembershipVerifier.verifyMembership({
            idToken: token,
            organizationId: orgId,
            clientClaimedPermissions: ['database:export', 'admin:manage_users', 'reports:delete'],
          });

          if (!result.success || !result.membership) {
            throw new Error('فشل التحقق');
          }

          const verifiedPerms = result.membership.permissions || [];
          if (verifiedPerms.includes('admin:manage_users') || verifiedPerms.includes('database:export')) {
            throw new Error('خرق أمني: تم قبول صلاحيات مزيفة مرسلة من العميل!');
          }
        },
      },

      // P1.2-L) Valid Offline Lease -> Allowed within lease scope
      {
        id: 'P1.2-L-LEASE-VALID',
        title: 'Valid Offline Lease -> Allowed within lease scope',
        description: 'السماح بالوصول دون اتصال فقط في حدود مدة ونطاق الـ Capability Lease الصالحة',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_lease_valid';
          const orgId = 'org_lease_scope';

          const lease = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: uid,
            verifiedRole: 'accountant',
            verifiedPermissions: ['accounts:read', 'transactions:create'],
            verificationRevision: 1,
            durationMs: 60 * 60 * 1000,
          });

          const res = await capabilityLeaseService.validateLease(lease, {
            currentUid: uid,
            targetOrgId: orgId,
          });

          if (!res.valid) {
            throw new Error('فشل التحقق من التصريح الصالح');
          }

          const switchRes = await tenantService.switchWithOfflineLease(orgId, uid, lease);
          if (!switchRes.success) {
            throw new Error('فشل التبديل باستخدام التصريح المحلي الصالح');
          }

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'offline_cached') {
            throw new Error(`الحالة المتوقعة offline_cached، وجد: ${store.authMembershipStatus}`);
          }

          const actor = authService.getActiveActor();
          if (actor.role !== 'accountant' || actor.id !== uid) {
            throw new Error('دور الفاعل غير مطابق للتصريح المعتمد');
          }

          await tenantService.switchToLocalMode();
        },
      },

      // P1.2-M) Expired Capability Lease -> Reject
      {
        id: 'P1.2-M-LEASE-EXP',
        title: 'Expired Capability Lease -> Reject',
        description: 'رفض التصريح منتهي الصلاحية ومنع فتح قاعدة بيانات المؤسسة دون اتصال',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_lease_expired';
          const orgId = 'org_expired_scope';

          const expiredLease = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: uid,
            verifiedRole: 'accountant',
            verifiedPermissions: ['accounts:read'],
            verificationRevision: 1,
            durationMs: -10 * 60 * 1000,
          });

          const res = await capabilityLeaseService.validateLease(expiredLease, {
            currentUid: uid,
            targetOrgId: orgId,
          });

          if (res.valid) {
            throw new Error('خرق أمني: تم قبول تصريح منتهي الصلاحية!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_EXPIRED') {
            throw new Error(`رمز الخطأ المتوقع LEASE_EXPIRED، وجد: ${errCode}`);
          }

          let threw = false;
          try {
            await tenantService.switchWithOfflineLease(orgId, uid, expiredLease);
          } catch {
            threw = true;
          }

          if (!threw) {
            throw new Error('يجب رمي خطأ ومنع التبديل عند انتهاء صلاحية الـ Lease');
          }
        },
      },

      // P1.2-N) Tampered Capability Lease -> Reject
      {
        id: 'P1.2-N-LEASE-TAMPER',
        title: 'Tampered Capability Lease -> Reject',
        description: 'اكتشاف أي تلاعب في hash أو محتوى الـ Lease ورفضه فورياً',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_lease_tamper';
          const orgId = 'org_tamper_scope';

          const validLease = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: uid,
            verifiedRole: 'viewer',
            verifiedPermissions: ['accounts:read'],
            verificationRevision: 1,
          });

          const tamperedLease = {
            ...validLease,
            integrityHash: 'deadbeef_tampered_hash_12345',
          };

          const res = await capabilityLeaseService.validateLease(tamperedLease, {
            currentUid: uid,
            targetOrgId: orgId,
          });

          if (res.valid) {
            throw new Error('خرق أمني: تم قبول تصريح متلاعب في بصمته الرقمية!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_INTEGRITY_FAILED' && errCode !== 'LEASE_TAMPERED') {
            throw new Error(`رمز الخطأ المتوقع LEASE_INTEGRITY_FAILED، وجد: ${errCode}`);
          }
        },
      },

      // P1.2-O) Lease for another UID -> Reject
      {
        id: 'P1.2-O-LEASE-WRONG-UID',
        title: 'Lease for Another UID -> Reject',
        description: 'رفض استخدام تصريح صادر لمستخدم آخر لمنع انتحال الهوية دون اتصال',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const victimUid = 'usr_alice';
          const attackerUid = 'usr_bob';
          const orgId = 'org_corp';

          const leaseAlice = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: victimUid,
            verifiedRole: 'owner',
            verifiedPermissions: ['admin:all'],
            verificationRevision: 1,
          });

          const res = await capabilityLeaseService.validateLease(leaseAlice, {
            currentUid: attackerUid,
            targetOrgId: orgId,
          });

          if (res.valid) {
            throw new Error('خرق أمني: تم قبول تصريح يخص مستخدماً آخر!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_UID_MISMATCH') {
            throw new Error(`رمز الخطأ المتوقع LEASE_UID_MISMATCH، وجد: ${errCode}`);
          }
        },
      },

      // P1.2-P) Lease for another Organization -> Reject
      {
        id: 'P1.2-P-LEASE-WRONG-ORG',
        title: 'Lease for Another Organization -> Reject',
        description: 'منع استخدام تصريح لمؤسسة A لفتح بيانات مؤسسة B',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_charlie';
          const orgA = 'org_retail_a';
          const orgB = 'org_vault_b';

          const leaseA = await capabilityLeaseService.createLease({
            organizationId: orgA,
            verifiedUid: uid,
            verifiedRole: 'admin',
            verifiedPermissions: ['admin:all'],
            verificationRevision: 1,
          });

          const res = await capabilityLeaseService.validateLease(leaseA, {
            currentUid: uid,
            targetOrgId: orgB,
          });

          if (res.valid) {
            throw new Error('خرق أمني: تم قبول تصريح لمؤسسة أخرى!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_ORG_MISMATCH') {
            throw new Error(`رمز الخطأ المتوقع LEASE_ORG_MISMATCH، وجد: ${errCode}`);
          }
        },
      },

      // P1.2-Q) Locally modified permissions -> Reject
      {
        id: 'P1.2-Q-LEASE-MOD-PERMS',
        title: 'Locally Modified Permissions in Lease -> Reject',
        description: 'منع ترقية الصلاحيات محلياً باكتشاف عدم تطابق التوقيع الرقمي للـ Lease',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_escalator_perms';
          const orgId = 'org_secure_bank';

          const normalLease = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: uid,
            verifiedRole: 'viewer',
            verifiedPermissions: ['accounts:read'],
            verificationRevision: 1,
          });

          const escalatedLease = {
            ...normalLease,
            verifiedPermissions: ['accounts:read', 'admin:super_delete', 'money:transfer'],
          };

          const res = await capabilityLeaseService.validateLease(escalatedLease, {
            currentUid: uid,
            targetOrgId: orgId,
          });

          if (res.valid) {
            throw new Error('خرق أمني جسيم: تم قبول تصريح تم حقن صلاحيات إضافية فيه محلياً!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_INTEGRITY_FAILED' && errCode !== 'LEASE_TAMPERED') {
            throw new Error(`رمز الخطأ المتوقع LEASE_INTEGRITY_FAILED، وجد: ${errCode}`);
          }
        },
      },

      // P1.2-R) Locally modified role -> Reject
      {
        id: 'P1.2-R-LEASE-MOD-ROLE',
        title: 'Locally Modified Role in Lease -> Reject',
        description: 'منع ترقية الدور من viewer إلى owner محلياً داخل الـ Lease',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_role_escalator';
          const orgId = 'org_gov_dept';

          const viewerLease = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: uid,
            verifiedRole: 'viewer',
            verifiedPermissions: ['accounts:read'],
            verificationRevision: 1,
          });

          const hackedLease = {
            ...viewerLease,
            verifiedRole: 'owner' as any,
          };

          const res = await capabilityLeaseService.validateLease(hackedLease, {
            currentUid: uid,
            targetOrgId: orgId,
          });

          if (res.valid) {
            throw new Error('خرق أمني جسيم: تم قبول ترقية الدور إلى owner محلياً!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_INTEGRITY_FAILED' && errCode !== 'LEASE_TAMPERED') {
            throw new Error(`رمز الخطأ المتوقع LEASE_INTEGRITY_FAILED، وجد: ${errCode}`);
          }
        },
      },

      // P1.2-S) Locally extended expiration -> Reject
      {
        id: 'P1.2-S-LEASE-EXTEND-EXP',
        title: 'Locally Extended Expiration in Lease -> Reject',
        description: 'منع تمديد تاريخ انتهاء التصريح محلياً دون الرجوع للخادم',
        fn: async () => {
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');
          const uid = 'usr_exp_extender';
          const orgId = 'org_finite_term';

          const lease = await capabilityLeaseService.createLease({
            organizationId: orgId,
            verifiedUid: uid,
            verifiedRole: 'employee',
            verifiedPermissions: ['invoices:create'],
            verificationRevision: 1,
            durationMs: 60 * 1000,
          });

          const extendedLease = {
            ...lease,
            expiresAt: lease.expiresAt + 10 * 365 * 24 * 60 * 60 * 1000,
          };

          const res = await capabilityLeaseService.validateLease(extendedLease, {
            currentUid: uid,
            targetOrgId: orgId,
          });

          if (res.valid) {
            throw new Error('خرق أمني: تم قبول تمديد تاريخ الصلاحية محلياً!');
          }
          const errCode = (res as any).code;
          if (errCode !== 'LEASE_INTEGRITY_FAILED' && errCode !== 'LEASE_TAMPERED') {
            throw new Error(`رمز الخطأ المتوقع LEASE_INTEGRITY_FAILED، وجد: ${errCode}`);
          }
        },
      },

      // P1.2-T) Reconnection after Membership suspension -> Access revoked
      {
        id: 'P1.2-T-RECONNECT-REVOKE',
        title: 'Reconnection after Membership Suspension -> Access Revoked',
        description: 'إلغاء التصريح وإغلاق قاعدة بيانات المؤسسة فور إعادة الاتصال إذا تم تعليق العضوية خادمياً',
        fn: async () => {
          const { ServerMembershipVerifier } = await import('../services/tenant/ServerMembershipVerifier');
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');
          const { capabilityLeaseService } = await import('../services/tenant/CapabilityLeaseService');

          const uid = 'usr_reconnect_fired';
          const orgId = 'org_revocation_test';

          ServerMembershipVerifier.registerTestOrganization({
            id: orgId,
            name: 'Revocation Test Org',
            ownerId: 'owner_boss',
            status: 'active',
            settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: uid,
            role: 'accountant',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          const token = FirebaseTokenVerifier.createTestToken({ uid });
          await tenantService.verifyAndSwitchOrganization(token, orgId);

          const storedLease = await capabilityLeaseService.getStoredLease(orgId, uid);
          if (!storedLease) {
            throw new Error('لم يتم إصدار تصريح محلي عند التحقق الناجح');
          }

          // Server updates membership to 'suspended'
          ServerMembershipVerifier.registerTestMembership({
            organizationId: orgId,
            userId: uid,
            role: 'accountant',
            status: 'suspended',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });

          // Reconnects and reverifies
          const reverifyRes = await tenantService.reverifyWithServer(token);
          if (reverifyRes.success !== false || !reverifyRes.revoked) {
            throw new Error('كان يجب إبطال العضوية عند تعليقها على الخادم');
          }

          const revokedLease = await capabilityLeaseService.getStoredLease(orgId, uid);
          if (revokedLease !== null) {
            throw new Error('يجب حذف أو إبطال الـ Lease المخزن عند تعليق العضوية خادمياً');
          }

          const store = useTenantStore.getState();
          if (store.authMembershipStatus !== 'membership_suspended') {
            throw new Error(`الحالة المتوقعة membership_suspended، وجد: ${store.authMembershipStatus}`);
          }

          let threwOnDbAccess = false;
          try {
            tenantDbManager.getActiveDatabase();
          } catch {
            threwOnDbAccess = true;
          }
          if (!threwOnDbAccess) {
            throw new Error('يجب إغلاق قاعدة بيانات المؤسسة ومنع الوصول إليها فور تعليق العضوية');
          }

          await tenantService.switchToLocalMode();
        },
      },

      // P1.2-U) Failed verification -> Tenant DB remains closed
      {
        id: 'P1.2-U-FAILED-VERIF-CLOSED',
        title: 'Failed Verification -> Tenant DB Remains Closed',
        description: 'التأكد من بقاء قاعدة بيانات المؤسسة مغلقة تماماً عند فشل التحقق الخادمي',
        fn: async () => {
          const { FirebaseTokenVerifier } = await import('../services/firebase/FirebaseTokenVerifier');

          const badToken = FirebaseTokenVerifier.createTestToken(
            { uid: 'usr_fail_closed' },
            { expired: true }
          );

          try {
            await tenantService.verifyAndSwitchOrganization(badToken, 'org_forbidden_vault');
          } catch {
            // Expected failure
          }

          let threw = false;
          try {
            tenantDbManager.getActiveDatabase();
          } catch {
            threw = true;
          }

          if (!threw) {
            throw new Error('خرق أمني: قاعدة البيانات بقيت مفتوحة رغم فشل التحقق الخادمي!');
          }

          await tenantService.switchToLocalMode();
        },
      },

      // P1.2-W) No Unauthorized Tenant Database Created
      {
        id: 'P1.2-W-NO-UNAUTH-DB',
        title: 'No Unauthorized Tenant Database Created',
        description: 'التحقق الصارم من عدم فتح أي قاعدة بيانات لمؤسسة دون ترخيص رسمي TenantAccessGrant',
        fn: async () => {
          let rejected = false;
          try {
            await tenantDbManager.openTenantDatabase('org_unauthorized_direct_attempt');
          } catch (e: any) {
            if (e.message.includes('تم رفض فتح قاعدة بيانات المؤسسة')) {
              rejected = true;
            }
          }

          if (!rejected) {
            throw new Error('خرق أمني: نجح استدعاء openTenantDatabase دون تصريح رسمي TenantAccessGrant!');
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

    // Ensure database and state are restored to local mode after tests
    try {
      await tenantService.switchToLocalMode();
    } catch (e) {
      console.warn('Failed to restore local mode after P1.2 tests', e);
    }

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      durationMs: performance.now() - startTime,
      results,
    };
  }
}
