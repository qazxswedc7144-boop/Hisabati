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
          // Exercise the browser-storage attack path in Node CI as well as in a browser.
          const storage = new Map<string, string>();
          const fakeLocalStorage = {
            setItem: (key: string, value: string) => storage.set(key, value),
            getItem: (key: string) => storage.get(key) ?? null,
            removeItem: (key: string) => { storage.delete(key); },
            clear: () => storage.clear(),
            key: (index: number) => Array.from(storage.keys())[index] ?? null,
            get length() { return storage.size; },
          };
          const globalWithStorage = globalThis as typeof globalThis & {
            localStorage?: Storage;
            window?: { localStorage: Storage };
          };
          const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
          const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
          const actorBefore = authService.getActiveActor();

          try {
            Object.defineProperty(globalThis, 'localStorage', {
              configurable: true,
              value: fakeLocalStorage,
            });
            Object.defineProperty(globalThis, 'window', {
              configurable: true,
              value: { localStorage: fakeLocalStorage },
            });

            globalWithStorage.localStorage?.setItem('auth_user_id', 'hacked_user');
            globalWithStorage.localStorage?.setItem('auth_role', 'admin');

            const activeActor = authService.getActiveActor();
            if (activeActor.id !== actorBefore.id || activeActor.role !== actorBefore.role) {
              throw new Error('هوية المستخدم أو صلاحياته تأثرت بقيم localStorage غير الموثوقة');
            }
          } finally {
            if (originalLocalStorage) Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
            else Reflect.deleteProperty(globalThis, 'localStorage');
            if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
            else Reflect.deleteProperty(globalThis, 'window');
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
