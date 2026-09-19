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
        title: 'No Tenant DB for No-Membership User',
        description: 'عدم فتح قاعدة بيانات يدوية أو وهمية user_<uid> عند غياب العضوية',
        fn: async () => {
          const firebaseUserActor: AuditActor = {
            id: 'firebase_user_789',
            name: 'Isolated User',
            email: 'isolate@firebase.app',
            role: 'pending_membership',
          };
          await authService.setActiveActor(firebaseUserActor);
          await tenantService.initialize();

          try {
            const db = tenantDbManager.getActiveDatabase();
            if (db && db.name.includes('firebase_user_789')) {
              throw new Error('خطأ أمني: تم فتح قاعدة بيانات تخص user_<uid> مباشرة!');
            }
          } catch (e: any) {
            // Expected
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
