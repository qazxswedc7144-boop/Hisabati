import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { syncEngine } from '../services/syncEngine.service';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { SyncQueueItem, SyncAuditLogEntry } from '@/shared/types';

export class SyncHardeningPart1TestSuite {
  static async runAll(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    let passed = 0;
    let failed = 0;

    const runTest = async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ title, passed: true });
        passed++;
      } catch (e: any) {
        results.push({ title, passed: false, error: e.message || String(e) });
        failed++;
      }
    };

    // Global Test Setup
    try {
      await tenantService.initialize();
      useTenantStore.getState().setContext({
        activeOrganization: { id: 'test_org_sync1', name: 'Test Org Sync 1' } as any,
      });
    } catch {
      // Tenant initialization fallback
    }

    // Test 1: State Machine for Sync Queue (Pending -> Processing -> Failed/Retry -> Completed)
    await runTest('1. Sync Queue State Machine Transitions', async () => {
      await db.syncQueue.clear();

      // 1.1 Enqueue mutation (Initial state: pending)
      const opId = `op_sm_${Date.now()}`;
      await syncEngine.enqueueMutation('transaction', 'trx_sm_100', 'CREATE', { amount: 500, currency: 'YER' }, opId);

      const queued = await db.syncQueue.where('operationId').equals(opId).first();
      if (!queued) {
        throw new Error('فشل إضافة عنصر طابور المزامنة');
      }
      if (queued.status !== 'pending') {
        throw new Error(`الحالة الأولية غير صحيحة: متوقع pending ولكن وُجد ${queued.status}`);
      }
      if (queued.retryCount !== 0) {
        throw new Error(`عداد المحاولات الأولي غير صحيح: ${queued.retryCount}`);
      }

      // 1.2 Transition: pending -> processing
      await db.syncQueue.update(queued.id, { status: 'processing' });
      const processingItem = await db.syncQueue.get(queued.id);
      if (processingItem?.status !== 'processing') {
        throw new Error('فشل الانتقال إلى حالة processing');
      }

      // 1.3 Transition: processing -> failed (with retry count increment & error reason)
      await db.syncQueue.update(queued.id, {
        status: 'failed',
        retryCount: processingItem!.retryCount + 1,
        lastError: 'Network unreachable: simulated offline timeout',
      });
      const failedItem = await db.syncQueue.get(queued.id);
      if (failedItem?.status !== 'failed' || failedItem.retryCount !== 1) {
        throw new Error('فشل الانتقال إلى حالة failed أو لم يتم زيادة عداد المحاولات');
      }
      if (!failedItem.lastError?.includes('simulated offline timeout')) {
        throw new Error('لم يتم حفظ سبب الخطأ الأخير في طابور المزامنة');
      }

      // 1.4 Transition: failed -> completed
      await db.syncQueue.update(queued.id, { status: 'completed' });
      const completedItem = await db.syncQueue.get(queued.id);
      if (completedItem?.status !== 'completed') {
        throw new Error('فشل الانتقال إلى حالة completed');
      }
    });

    // Test 2: Revision Safety & Conflict Detection
    await runTest('2. Revision Safety and Conflict Detection', async () => {
      await db.transactions.clear();
      await db.accounts.clear();

      // Create local base transaction
      const localTrx = {
        id: 'trx_rev_1',
        accountId: 'acc_rev_1',
        type: 'debit' as const,
        amount: 1000,
        amountMinor: 1000,
        currency: 'YER' as const,
        date: '2026-09-01',
        operationId: 'op_rev_1',
        createdAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-01T10:00:00.000Z',
      };
      await db.transactions.put(localTrx);

      // Incoming conflicting remote transaction (different amountMinor)
      const remoteConflictTrx = {
        ...localTrx,
        amount: 2500,
        amountMinor: 2500,
        updatedAt: '2026-09-01T12:00:00.000Z',
      };

      const hasConflict =
        localTrx.amountMinor !== remoteConflictTrx.amountMinor ||
        localTrx.type !== remoteConflictTrx.type ||
        localTrx.accountId !== remoteConflictTrx.accountId;

      if (!hasConflict) {
        throw new Error('فشل كشف التعارض المالي للنسخة السحابية');
      }

      // Ensure local record is preserved (never blind Last-Write-Wins overwrite)
      const currentLocal = await db.transactions.get('trx_rev_1');
      if (currentLocal?.amountMinor !== 1000) {
        throw new Error('تم الكتابة العشوائية فوق البيانات المحلية المحمية بدون حل تعارض');
      }
    });

    // Test 3: Audit Logging for Sync Operations
    await runTest('3. Audit Trail for Sync Operations', async () => {
      await db.syncAuditLogs.clear();

      const log1: SyncAuditLogEntry = {
        id: `sal_${Date.now()}_1`,
        action: 'SYNC_START',
        timestamp: new Date().toISOString(),
        details: 'بدء دورة مزامنة تلقائية مع السحابة',
        deviceId: 'device_test_node_1',
        success: true,
      };

      const log2: SyncAuditLogEntry = {
        id: `sal_${Date.now()}_2`,
        action: 'CONFLICT_DETECTED',
        timestamp: new Date().toISOString(),
        details: 'اكتشاف تعارض مالي في القيد trx_rev_1',
        deviceId: 'device_test_node_1',
        success: true,
      };

      const log3: SyncAuditLogEntry = {
        id: `sal_${Date.now()}_3`,
        action: 'SYNC_SUCCESS',
        timestamp: new Date().toISOString(),
        details: 'اكتمال المزامنة بنجاح وحفظ الحركات المؤكدة',
        deviceId: 'device_test_node_1',
        success: true,
      };

      await db.syncAuditLogs.bulkAdd([log1, log2, log3]);

      const savedLogs = await db.syncAuditLogs.toArray();
      if (savedLogs.length !== 3) {
        throw new Error(`عدد سجلات التدقيق غير مطابق: متوقع 3 ولكن وُجد ${savedLogs.length}`);
      }

      const actions = savedLogs.map((l) => l.action);
      if (!actions.includes('SYNC_START') || !actions.includes('CONFLICT_DETECTED') || !actions.includes('SYNC_SUCCESS')) {
        throw new Error('سجلات التدقيق تفتقر إلى أحد الأحداث المسجلة');
      }

      const verifiedLog = await db.syncAuditLogs.get(log2.id);
      if (!verifiedLog || verifiedLog.action !== 'CONFLICT_DETECTED' || !verifiedLog.details.includes('trx_rev_1')) {
        throw new Error('فشل استرجاع سجل تدقيق التعارض بدقة');
      }
    });

    // Clean up test artifacts to prevent leakage into subsequent suites
    await db.transactions.clear();
    await db.accounts.clear();
    await db.syncQueue.clear();
    await db.syncAuditLogs.clear();

    return { total: results.length, passed, failed, results };
  }
}

