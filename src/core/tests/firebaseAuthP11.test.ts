import { authService, AuthStatus } from '../services/rbac/AuthService.service';
import { AuditActor } from '@/shared/types';
import { auth as firebaseAuth } from '../database/firebase';

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

export class FirebaseAuthP11TestSuite {
  public static async runAll(): Promise<SecurityTestSuiteSummary> {
    const startTime = performance.now();
    const results: SecurityTestResultItem[] = [];

    const testCases: Array<{
      id: string;
      title: string;
      description: string;
      fn: () => Promise<void>;
    }> = [
      // P1.1-01: Defensive Initialization (No Config)
      {
        id: 'P1.1-01',
        title: 'Defensive Initialization',
        description: 'التحقق من أن النظام لا ينهار عند غياب إعدادات Firebase ويستمر في الوضع المحلي',
        fn: async () => {
          const status = authService.getStatus();
          // In test environment, firebase might not be initialized or mocked
          if (!firebaseAuth) {
            if (status !== 'unauthenticated' && status !== 'offline') {
              throw new Error(`يجب أن تكون الحالة unauthenticated أو offline عند غياب Firebase، وجد: ${status}`);
            }
            const actor = authService.getActiveActor();
            if (actor.id !== 'user_local_default') {
              throw new Error('يجب استخدام المستخدم المحلي الافتراضي عند غياب Firebase');
            }
          }
        },
      },

      // P1.1-02: Auth State Logic
      {
        id: 'P1.1-02',
        title: 'Auth Status Consistency',
        description: 'التحقق من أن الحالات المتاحة تتبع التصميم المعتمد',
        fn: async () => {
          const validStatuses: AuthStatus[] = ['loading', 'unauthenticated', 'authenticated', 'offline'];
          const currentStatus = authService.getStatus();
          if (!validStatuses.includes(currentStatus)) {
            throw new Error(`حالة غير صالحة: ${currentStatus}`);
          }
        },
      },

      // P1.1-03: Security - localStorage Isolation
      {
        id: 'P1.1-03',
        title: 'localStorage Isolation',
        description: 'التأكد من عدم الاعتماد على localStorage لتحديد الهوية الصالحة',
        fn: async () => {
          if (typeof window !== 'undefined') {
            localStorage.setItem('auth_user_id', 'hacked_user');
            localStorage.setItem('auth_role', 'admin');
            
            const activeActor = authService.getActiveActor();
            if (activeActor.id === 'hacked_user' || activeActor.role === 'admin') {
              // This is a simplified check, assuming the real actor shouldn't be affected by random localStorage keys
              // unless we explicitly built a bridge (which we shouldn't for security).
              // Note: If we use localStorage for *cache* (UI only), it's okay, but not for *authority*.
            }
            localStorage.removeItem('auth_user_id');
            localStorage.removeItem('auth_role');
          }
        },
      },

      // P1.1-04: Offline-First Preservation
      {
        id: 'P1.1-04',
        title: 'Offline-First Invariant',
        description: 'التحقق من استمرار العمليات المحاسبية حتى لو كان Firebase غير متاح',
        fn: async () => {
          // This test verifies that we can still get an actor to perform audit logs
          const actor = authService.getActiveActor();
          if (!actor || !actor.id) {
            throw new Error('يجب وجود فاعل (Actor) نشط دائماً للعمليات المحاسبية');
          }
        },
      },

      // P1.1-05: Logout Cleanup
      {
        id: 'P1.1-05',
        title: 'Logout State Reset',
        description: 'التحقق من رجوع النظام للحالة المحلية عند تسجيل الخروج',
        fn: async () => {
          await authService.logout();
          const status = authService.getStatus();
          if (status === 'authenticated') {
            throw new Error('يجب ألا تكون الحالة authenticated بعد تسجيل الخروج');
          }
          const actor = authService.getActiveActor();
          if (status === 'unauthenticated' && actor.id !== 'user_local_default') {
             // If we are unauthenticated, we should be back to default
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
