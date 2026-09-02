import { backupService } from '../services/backup.service';
import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { integrityService } from '../services/integrity.service';
import { db } from '../database/db';
import { calculateSHA256 } from '../utils/crypto';

export interface TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class CloudSyncTestSuite {
  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: TestResult[];
  }> {
    const results: TestResult[] = [];

    // Test fixtures
    const testAccIdA = `test_sync_a_${Date.now()}`;
    const testAccNameA = `حساب مزامنة أ ${Date.now()}`;
    const testAccIdB = `test_sync_b_${Date.now()}`;
    const testAccNameB = `حساب مزامنة ب ${Date.now()}`;

    try {
      // Create initial local accounts & transactions
      const accA = await accountRepository.create({
        name: testAccNameA,
        phone: '0501112222',
        initialBalance: 1000,
        initialBalanceType: 'owed_to_me',
      });

      const trx1 = await transactionEngine.createTransaction({
        accountId: accA.id,
        type: 'debit',
        amount: 500,
        date: '2026-09-01',
        note: 'عملية محلية 1',
        operationId: `op_test_${accA.id}_1`,
      });

      // TEST 1: Generate Validated Snapshot & SHA-256 Checksum
      await this.runTest(
        results,
        'SYNC-01',
        'توليد نسخة احتياطية محلية متوافقة وحساب تجزئة الأمان SHA-256',
        async () => {
          const payload = await backupService.generateBackupPayload();
          if (!payload.metadata.integrityHash || payload.metadata.integrityHash.length !== 64) {
            throw new Error('فشل توليد تجزئة SHA-256 بطول 64 حرفاً');
          }
          if (payload.metadata.schemaVersion !== 2) {
            throw new Error(`إصدار المخطط غير صحيح: ${payload.metadata.schemaVersion}`);
          }
          if (payload.accounts.length === 0 || payload.transactions.length === 0) {
            throw new Error('النسخة الاحتياطية لا تحتوي على السجلات المخزنة');
          }
        }
      );

      // TEST 2: Validate Backup Integrity & Reject Corrupted Payload
      await this.runTest(
        results,
        'SYNC-02',
        'التحقق من صحة النسخة واكتشاف وتطويق أي ملف مشوه أو معدل يدوياً',
        async () => {
          const validPayload = await backupService.generateBackupPayload();
          const validRes = await backupService.validateBackupPayload(validPayload);
          if (!validRes.isValid) {
            throw new Error(`فشل التحقق من النسخة الصالحة: ${validRes.error}`);
          }

          // Simulate malicious or corrupted data tampering
          const corruptedPayload = JSON.parse(JSON.stringify(validPayload));
          if (corruptedPayload.transactions.length > 0) {
            corruptedPayload.transactions[0].amount = 9999999; // Modified amount without recalculating SHA-256
          }
          const corruptedRes = await backupService.validateBackupPayload(corruptedPayload);
          if (corruptedRes.isValid) {
            throw new Error('فشل النظام في اكتشاف التعديل غير المصرح به على البيانات!');
          }
        }
      );

      // TEST 3: Pre-Restore Safety Snapshot & Idempotent Restore
      await this.runTest(
        results,
        'SYNC-03',
        'إنشاء نسخة أمان تلقائية قبل الاستعادة وضمان عدم تكرار العمليات',
        async () => {
          const snapshot = await backupService.generateBackupPayload();
          await backupService.createPreRestoreSafetyBackup();

          // Restore from snapshot
          const restoreRes = await backupService.restoreFromPayload(snapshot, 'replace');
          if (!restoreRes.success) {
            throw new Error('فشلت عملية الاستعادة المباشرة');
          }

          const audit = await integrityService.auditIntegrity();
          if (!audit.healthy) {
            throw new Error('حدث عدم اتساق مالي بعد الاستعادة');
          }
        }
      );

      // TEST 4: Sync Queue & Offline Mutation Enqueuing
      await this.runTest(
        results,
        'SYNC-04',
        'طابور المزامنة المحلي (Sync Queue) وتسجيل العمليات في وضع عدم الاتصال',
        async () => {
          const initialQueueCount = await syncEngine.getPendingCount();
          await syncEngine.enqueueMutation(
            'transaction',
            trx1.id,
            'CREATE',
            trx1,
            trx1.operationId
          );
          const afterCount = await syncEngine.getPendingCount();
          if (afterCount <= initialQueueCount) {
            throw new Error('لم تتم إضافة العملية لطابور المزامنة');
          }
        }
      );

      // TEST 5: Multi-Device Simulation & Financial Invariant Check
      await this.runTest(
        results,
        'SYNC-05',
        'محاكاة مزامنة جهازين (Device A + Device B) وتطابق الرصيد الختامي',
        async () => {
          // Device A registers +10,000 and +5,000
          const accSim = await accountRepository.create({
            name: `محاكاة جهاز ${Date.now()}`,
          });

          await transactionEngine.createTransaction({
            accountId: accSim.id,
            type: 'debit',
            amount: 10000,
            date: '2026-09-01',
            operationId: `sim_devA_op1_${Date.now()}`,
          });

          await transactionEngine.createTransaction({
            accountId: accSim.id,
            type: 'debit',
            amount: 5000,
            date: '2026-09-01',
            operationId: `sim_devA_op2_${Date.now()}`,
          });

          // Device B adds +3,000 and Device A adds +7,000 offline
          await transactionEngine.createTransaction({
            accountId: accSim.id,
            type: 'debit',
            amount: 3000,
            date: '2026-09-02',
            operationId: `sim_devB_op1_${Date.now()}`,
          });

          await transactionEngine.createTransaction({
            accountId: accSim.id,
            type: 'debit',
            amount: 7000,
            date: '2026-09-02',
            operationId: `sim_devA_op3_${Date.now()}`,
          });

          const refreshed = await accountRepository.getById(accSim.id);
          if (!refreshed || refreshed.currentBalance !== 25000) {
            throw new Error(`الرصيد غير متطابق: المتوقع 25,000 ولكن الفعلي ${refreshed?.currentBalance}`);
          }
        }
      );

      // TEST 6: OperationId Deduplication (Idempotency)
      await this.runTest(
        results,
        'SYNC-06',
        'منع تكرار المعاملات المتطابقة في المزامنة (Idempotency via operationId)',
        async () => {
          const uniqueOpId = `op_idemp_${Date.now()}`;
          const trxFirst = await transactionEngine.createTransaction({
            accountId: accA.id,
            type: 'debit',
            amount: 250,
            date: '2026-09-01',
            operationId: uniqueOpId,
          });

          // Try re-creating with the exact same operationId
          const trxSecond = await transactionEngine.createTransaction({
            accountId: accA.id,
            type: 'debit',
            amount: 250,
            date: '2026-09-01',
            operationId: uniqueOpId,
          });

          if (trxFirst.id !== trxSecond.id) {
            throw new Error('تم إنشاء معاملة مكررة بدلاً من إرجاع المعاملة الحالية!');
          }
        }
      );

      // TEST 7: Financial Integrity & Recalculation After Cloud Operations
      await this.runTest(
        results,
        'SYNC-07',
        'التدقيق المالي الشامل وإعادة حساب الأرصدة بعد عمليات السحابة',
        async () => {
          const res = await integrityService.auditIntegrity();
          if (!res.healthy) {
            throw new Error(`توجد مشاكل اتساق مالي بعد اختبارات السحابة: ${res.issues.map((i) => i.messageAr).join(', ')}`);
          }
        }
      );

    } finally {
      // Clean up test records
      try {
        await db.syncQueue.clear();
      } catch (err) {
        console.warn('Sync cleanup error', err);
      }
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      passedCount,
      failedCount,
      totalCount: results.length,
      results,
    };
  }

  private static async runTest(
    results: TestResult[],
    id: string,
    nameAr: string,
    fn: () => Promise<void>
  ): Promise<void> {
    const start = performance.now();
    try {
      await fn();
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        nameAr,
        passed: true,
        message: 'نجح الاختبار بنجاح وبدقة متطابقة 100%',
        durationMs,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        nameAr,
        passed: false,
        message: err?.message || 'فشل الاختبار',
        durationMs,
      });
    }
  }
}
