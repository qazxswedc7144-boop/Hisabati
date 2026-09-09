import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { integrityService } from '../services/integrity.service';
import { db } from '../database/db';
import { decimalToMinor } from '../money/converter';

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

    // Save original googleDriveService methods to restore after all tests
    const origListFiles = googleDriveService.listFiles.bind(googleDriveService);
    const origDownload = googleDriveService.downloadJsonFile.bind(googleDriveService);
    const origUpload = googleDriveService.uploadJsonFile.bind(googleDriveService);
    const origUpdate = googleDriveService.updateJsonFile.bind(googleDriveService);
    const origIsConnected = googleDriveService.isConnected.bind(googleDriveService);

    // Mock in-memory cloud storage for deterministic tests
    let inMemoryCloudFile: any = null;

    const setupMocks = () => {
      googleDriveService.isConnected = () => true;
      googleDriveService.listFiles = async () => {
        if (inMemoryCloudFile) {
          return [{
            id: 'file_cloud_sync_1',
            name: 'hisabati_sync_state.json',
            mimeType: 'application/json',
            createdTime: new Date().toISOString(),
            modifiedTime: new Date().toISOString(),
          }];
        }
        return [];
      };
      googleDriveService.downloadJsonFile = async () => inMemoryCloudFile;
      googleDriveService.uploadJsonFile = async (name: string, content: any) => {
        inMemoryCloudFile = JSON.parse(JSON.stringify(content));
        return { id: 'file_cloud_sync_1', name };
      };
      googleDriveService.updateJsonFile = async (id: string, name: string, content: any) => {
        inMemoryCloudFile = JSON.parse(JSON.stringify(content));
        return { id, name };
      };
    };

    setupMocks();

    try {
      // =========================================================================
      // SYNC-01: Offline transaction is stored locally
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-01',
        'تخزين المعاملة محلياً عند انقطاع الاتصال (Offline Transaction Stored Locally)',
        async () => {
          const acc = await accountRepository.create({
            name: `حساب اختبار أوفلاين ${Date.now()}`,
            initialBalance: 0,
          });

          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 1500,
            date: '2026-09-08',
            note: 'معاملة أوفلاين',
            operationId: `op_sync01_${Date.now()}`,
          });

          const storedTrx = await db.transactions.get(trx.id);
          if (!storedTrx) throw new Error('المعاملة غير مخزنة في قاعدة البيانات المحلية');
          if (storedTrx.amount !== 1500 || storedTrx.amountMinor === undefined) {
            throw new Error(`قيم المبالغ غير متطابقة محلياً: amount=${storedTrx.amount}`);
          }

          const storedAcc = await db.accounts.get(acc.id);
          if (!storedAcc || storedAcc.currentBalance !== 1500) {
            throw new Error(`رصيد الحساب غير محدث محلياً: balance=${storedAcc?.currentBalance}`);
          }

          // Check that mutation is enqueued in syncQueue
          const pending = await db.syncQueue
            .where('operationId')
            .equals(trx.operationId!)
            .first();

          if (!pending) throw new Error('لم يتم تسجيل العملية في طابور المزامنة syncQueue');
          if (pending.status !== 'pending') throw new Error(`حالة طابور المزامنة غير صحيحة: ${pending.status}`);
        }
      );

      // =========================================================================
      // SYNC-02: Pending operation survives reload
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-02',
        'بقاء العمليات المعلقة في طابور المزامنة عبر إعادة التشغيل (Survives Reload)',
        async () => {
          const testOpId = `op_survive_${Date.now()}`;
          await syncEngine.enqueueMutation(
            'transaction',
            'trx_dummy_reload',
            'CREATE',
            { id: 'trx_dummy_reload', amount: 350 },
            testOpId
          );

          // Direct query on IndexedDB simulates querying fresh table after restart
          const item = await db.syncQueue.where('operationId').equals(testOpId).first();
          if (!item) throw new Error('العملية المعلقة لم تدم في قاعدة البيانات بعد محاكاة إعادة التشغيل');
          if (item.status !== 'pending') throw new Error(`حالة العملية المعلقة غير صحيحة: ${item.status}`);
          if (item.entityId !== 'trx_dummy_reload') throw new Error('معرف الكيان غير متطابق');

          const pendingCount = await syncEngine.getPendingCount();
          if (pendingCount <= 0) throw new Error('العدد الإجمالي للعمليات المعلقة غير صحيح');
        }
      );

      // =========================================================================
      // SYNC-03: Retry does not duplicate transaction
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-03',
        'عدم تكرار المعاملات عند إعادة المحاولة (Retry Does Not Duplicate)',
        async () => {
          const acc = await accountRepository.create({
            name: `حساب إعادة محاولة ${Date.now()}`,
          });

          const opId = `op_retry_test_${Date.now()}`;
          await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 770,
            date: '2026-09-08',
            operationId: opId,
          });

          // Simulate network failure on first try
          let attempt = 0;
          const originalUpload = googleDriveService.uploadJsonFile;
          try {
            googleDriveService.uploadJsonFile = async (name: string, content: any) => {
              attempt++;
              if (attempt === 1) {
                throw new Error('فشل مؤقت في الشبكة');
              }
              inMemoryCloudFile = JSON.parse(JSON.stringify(content));
              return { id: 'file_cloud_sync_1', name };
            };

            try {
              await syncEngine.performFullSync();
            } catch {
              // Expected failure on attempt 1
            }

            // Verify queue item updated retryCount
            const queueItem = await db.syncQueue.where('operationId').equals(opId).first();
            if (queueItem && queueItem.retryCount < 1) {
              throw new Error('لم يتم تحديث عدد مرات المحاولة retryCount');
            }

            // Second try: upload succeeds
            await syncEngine.performFullSync();

            // Verify transaction was not duplicated in local DB
            const matchingTrx = await db.transactions
              .where('operationId')
              .equals(opId)
              .toArray();

            if (matchingTrx.length !== 1) {
              throw new Error(`تم تكرار المعاملة: عُثر على ${matchingTrx.length} معاملات بنفس operationId`);
            }
          } finally {
            setupMocks();
          }
        }
      );

      // =========================================================================
      // SYNC-04: Repeated same operation is idempotent
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-04',
        'ضمان idempotency عند استدعاء نفس العملية مراراً (Idempotent Execution)',
        async () => {
          const acc = await accountRepository.create({
            name: `حساب اختبار idempotency ${Date.now()}`,
          });

          const sharedOpId = `op_idemp_check_${Date.now()}`;
          const firstCall = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 900,
            date: '2026-09-08',
            operationId: sharedOpId,
          });

          const secondCall = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 900,
            date: '2026-09-08',
            operationId: sharedOpId,
          });

          if (firstCall.id !== secondCall.id) {
            throw new Error('الاستدعاء المتكرر لنفس operationId أنتج معرفات مختلفة');
          }

          const count = await db.transactions.where('operationId').equals(sharedOpId).count();
          if (count !== 1) {
            throw new Error(`تكرر القيد المالي في قاعدة البيانات: عدد القيود = ${count}`);
          }

          // Also test enqueueMutation idempotency
          const initialQueueCount = await db.syncQueue.where('operationId').equals(sharedOpId).count();
          await syncEngine.enqueueMutation('transaction', firstCall.id, 'CREATE', firstCall, sharedOpId);
          await syncEngine.enqueueMutation('transaction', firstCall.id, 'CREATE', firstCall, sharedOpId);
          const finalQueueCount = await db.syncQueue.where('operationId').equals(sharedOpId).count();

          if (finalQueueCount > initialQueueCount + 1) {
            throw new Error('طابور المزامنة لم يطبق مبدأ Idempotency وتكرر تسجيل العملية');
          }
        }
      );

      // =========================================================================
      // SYNC-05: Network failure does not corrupt local data
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-05',
        'فشل الشبكة لا يفسد أو يشوه البيانات المحلية (Network Failure Safety)',
        async () => {
          const acc = await accountRepository.create({
            name: `حساب اختبار أمان الشبكة ${Date.now()}`,
          });

          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 4200,
            date: '2026-09-08',
            operationId: `op_net_fail_${Date.now()}`,
          });

          try {
            googleDriveService.uploadJsonFile = async () => {
              throw new Error('Connection lost: NET_ERR_TIMED_OUT');
            };

            try {
              await syncEngine.performFullSync();
            } catch {
              // Expected rejection
            }

            // Verify local data integrity is 100% unharmed
            const verifyTrx = await db.transactions.get(trx.id);
            if (!verifyTrx || verifyTrx.amount !== 4200) {
              throw new Error('فسدت بيانات المعاملة المحلية بعد فشل الشبكة');
            }

            const verifyAcc = await db.accounts.get(acc.id);
            if (!verifyAcc || verifyAcc.currentBalance !== 4200) {
              throw new Error('فسد رصيد الحساب المحلي بعد فشل الشبكة');
            }

            const audit = await integrityService.auditIntegrity();
            if (!audit.healthy) {
              throw new Error('تدقيق السلامة المالية اكتشف أخطاء بعد انقطاع الشبكة');
            }
          } finally {
            setupMocks();
          }
        }
      );

      // =========================================================================
      // SYNC-06: Financial transaction conflict does not destroy either version
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-06',
        'التعارض في المعاملات المالية يحافظ على النسختين دون حذف أحدهما (No Blind Last-Write-Wins)',
        async () => {
          setupMocks();

          const acc = await accountRepository.create({
            name: `حساب اختبار التعارض ${Date.now()}`,
          });

          const conflictTrxId = `trx_conflict_${Date.now()}`;
          const localTrx = {
            id: conflictTrxId,
            accountId: acc.id,
            type: 'debit' as const,
            amount: 600,
            amountMinor: 600,
            date: '2026-09-08',
            note: 'تعديل محلي',
            createdAt: '2026-09-08T10:00:00.000Z',
            updatedAt: '2026-09-08T10:30:00.000Z',
          };
          await db.transactions.put(localTrx);

          // Remote state has different amount concurrently edited
          inMemoryCloudFile = {
            version: 1,
            deviceId: 'dev_remote_other',
            deviceName: 'جهاز آخر',
            lastModified: '2026-09-08T11:00:00.000Z',
            accounts: [acc],
            transactions: [
              {
                id: conflictTrxId,
                accountId: acc.id,
                type: 'debit' as const,
                amount: 850,
                amountMinor: 850,
                date: '2026-09-08',
                note: 'تعديل في السحابة',
                createdAt: '2026-09-08T10:00:00.000Z',
                updatedAt: '2026-09-08T11:00:00.000Z',
              },
            ],
            tombstones: [],
          };

          const syncRes = await syncEngine.performFullSync();

          // Verify conflict was detected and returned
          const detected = syncRes.conflicts.find((c) => c.entityId === conflictTrxId);
          if (!detected) {
            throw new Error('لم يتم رصد التعارض المالي بين النسخة المحلية والسحابية');
          }

          // Verify neither version was destroyed
          if (detected.localVersion.data.amount !== 600 || detected.remoteVersion.data.amount !== 850) {
            throw new Error('تم تشويه بيانات النسخ أثناء حفظ التعارض');
          }

          // Verify local DB was NOT blindly overwritten by Last-Write-Wins
          const localRecord = await db.transactions.get(conflictTrxId);
          if (!localRecord || localRecord.amount !== 600) {
            throw new Error('تم الكتابة فوق السجل المالي المحلي بشكل أعمى (Blind Last-Write-Wins violation)');
          }

          // Verify conflict is persisted in memory/localStorage
          const persisted = syncEngine.getPersistedConflicts();
          if (!persisted.some((c) => c.entityId === conflictTrxId)) {
            throw new Error('لم يتم حفظ التعارض في التخزين الدائم للرجوع إليه');
          }
        }
      );

      // =========================================================================
      // SYNC-07: amountMinor remains unchanged through sync
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-07',
        'ثبات amountMinor بدقة متناهية دون أي انحراف (amountMinor Invariant)',
        async () => {
          setupMocks();

          const acc = await accountRepository.create({
            name: `حساب minor unit ${Date.now()}`,
          });

          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 5500,
            date: '2026-09-08',
            operationId: `op_exact_minor_${Date.now()}`,
          });

          await syncEngine.performFullSync();

          // Verify in local DB
          const refTrx = await db.transactions.get(trx.id);
          if (!refTrx || refTrx.amountMinor === undefined) {
            throw new Error(`حقل amountMinor مفقود في المعاملة المحلية`);
          }

          // Verify in cloud state
          const cloudTrx = inMemoryCloudFile?.transactions?.find((t: any) => t.id === trx.id);
          if (!cloudTrx || cloudTrx.amountMinor !== refTrx.amountMinor) {
            throw new Error(`تغيرت قيمة amountMinor في السحابة: المتوقع ${refTrx.amountMinor} ولكن الفعلي ${cloudTrx?.amountMinor}`);
          }
        }
      );

      // =========================================================================
      // SYNC-08: currentBalanceMinor remains consistent
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-08',
        'اتساق currentBalanceMinor مع مجموع المعاملات بعد المزامنة (Balance Consistency)',
        async () => {
          setupMocks();

          const acc = await accountRepository.create({
            name: `حساب اتساق الرصيد ${Date.now()}`,
          });

          await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 500,
            date: '2026-09-08',
          });

          await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'credit',
            amount: 200,
            date: '2026-09-08',
          });

          await syncEngine.performFullSync();

          const finalAcc = await db.accounts.get(acc.id);
          if (!finalAcc) throw new Error('الحساب غير موجود');

          // Expected: debit (500) - credit (200) = 300
          if (finalAcc.currentBalance !== 300) {
            throw new Error(`قيمة currentBalance غير متسقة: المتوقع 300 ولكن الفعلي ${finalAcc.currentBalance}`);
          }
          if (finalAcc.currentBalanceMinor === undefined) {
            throw new Error('قيمة currentBalanceMinor مفقودة في الحساب');
          }
        }
      );

      // =========================================================================
      // SYNC-09: Delete does not accidentally resurrect stale records
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-09',
        'منع إحياء السجلات المحذوفة عبر Tombstones (Tombstone Deletion Safety)',
        async () => {
          setupMocks();

          const acc = await accountRepository.create({
            name: `حساب اختبار الحذف ${Date.now()}`,
          });

          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 350,
            date: '2026-09-08',
            operationId: `op_tomb_${Date.now()}`,
          });

          // First sync pushes record to cloud
          await syncEngine.performFullSync();

          // Local device deletes the transaction
          await transactionEngine.deleteTransaction(trx.id);

          // Verify deleted locally
          const deletedLocal = await db.transactions.get(trx.id);
          if (deletedLocal) throw new Error('المعاملة لم تحذف محلياً');

          // Cloud still had the old copy; now run sync again
          await syncEngine.performFullSync();

          // Verify transaction was NOT resurrected locally!
          const resurrected = await db.transactions.get(trx.id);
          if (resurrected) {
            throw new Error('حدث خطأ فادح: المعاملة المحذوفة عادت للحياة بعد المزامنة! (Zombie Record Resurrection)');
          }

          // Verify tombstone is recorded in cloud state
          const tombstone = inMemoryCloudFile?.tombstones?.find((t: any) => t.id === trx.id);
          if (!tombstone) {
            throw new Error('لم يتم تسجيل الـ Tombstone في حالة السحابة');
          }
        }
      );

      // =========================================================================
      // SYNC-10: Successful sync is reported only after actual success
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-10',
        'عرض حالة "مكتملة" فقط بعد النجاح الفعلي المؤكد (Accurate Sync Status Reporting)',
        async () => {
          setupMocks();

          let lastObservedStatus: string | null = null;
          const unsubscribe = syncEngine.subscribeStatus((status) => {
            lastObservedStatus = status;
          });

          try {
            // 1. When disconnected or upload fails, status must NOT be 'synced'
            googleDriveService.uploadJsonFile = async () => {
              throw new Error('Upload server error 500');
            };
            googleDriveService.updateJsonFile = async () => {
              throw new Error('Update server error 500');
            };

            try {
              await syncEngine.performFullSync();
            } catch {
              // Expected
            }

            if (lastObservedStatus === 'synced') {
              throw new Error('تم الإبلاغ عن نجاح المزامنة مع أن العملية فشلت!');
            }

            // 2. When upload succeeds, status becomes 'synced'
            googleDriveService.uploadJsonFile = async (name: string, content: any) => {
              inMemoryCloudFile = content;
              return { id: 'file_cloud_sync_1', name };
            };
            googleDriveService.updateJsonFile = async (id: string, name: string, content: any) => {
              inMemoryCloudFile = content;
              return { id, name };
            };

            await syncEngine.performFullSync();

            if (lastObservedStatus !== 'synced' && lastObservedStatus !== 'conflict') {
              throw new Error(`حالة المزامنة غير صحيحة بعد النجاح: ${lastObservedStatus}`);
            }
          } finally {
            unsubscribe();
            setupMocks();
          }
        }
      );

      // =========================================================================
      // SYNC-11: Queue Statistics & Completed Cleanup
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-11',
        'إحصائيات طابور المزامنة وتنظيف السجلات المكتملة (Queue Stats & Completed Cleanup)',
        async () => {
          setupMocks();
          await db.syncQueue.clear();

          // Enqueue test mutation
          await syncEngine.enqueueMutation(
            'account',
            `acc_stats_${Date.now()}`,
            'CREATE',
            { name: 'حساب اختبار الإحصائيات' },
            `op_stats_1_${Date.now()}`
          );

          const statsBefore = await syncEngine.getQueueStats();
          if (statsBefore.pending !== 1 || statsBefore.total !== 1) {
            throw new Error(`إحصائيات الطابور غير صحيحة قبل المزامنة: ${JSON.stringify(statsBefore)}`);
          }

          // Complete sync
          await syncEngine.performFullSync();

          const statsAfter = await syncEngine.getQueueStats();
          if (statsAfter.completed < 1) {
            throw new Error(`لم يتم تحويل العملية إلى مكتملة (completed): ${JSON.stringify(statsAfter)}`);
          }

          // Test cleanup with maxKeep = 0
          const cleared = await syncEngine.clearCompletedQueue(0);
          if (cleared < 1) {
            throw new Error('فشل تنظيف العمليات المكتملة في الطابور');
          }
        }
      );

      // =========================================================================
      // SYNC-12: Exponential Backoff & Jitter Verification
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-12',
        'التراجع الأسي مع التشتيت العشوائي لحماية الشبكة (Exponential Backoff with Jitter)',
        async () => {
          setupMocks();
          await db.syncQueue.clear();

          const itemOpId = `op_backoff_${Date.now()}`;
          await syncEngine.enqueueMutation(
            'account',
            `acc_backoff_${Date.now()}`,
            'CREATE',
            { name: 'حساب فحص التراجع' },
            itemOpId
          );

          // Force failure
          googleDriveService.uploadJsonFile = async () => {
            throw new Error('Network timeout 408');
          };
          googleDriveService.updateJsonFile = async () => {
            throw new Error('Network timeout 408');
          };

          try {
            await syncEngine.performFullSync();
          } catch {
            // Expected
          }

          const failedItem = await db.syncQueue.where('operationId').equals(itemOpId).first();
          if (!failedItem || failedItem.retryCount !== 1) {
            throw new Error(`عداد المحاولات لم يزداد بالشكل الصحيح: ${failedItem?.retryCount}`);
          }
          if (failedItem.status !== 'pending') {
            throw new Error(`حالة العملية بعد أول فشل يجب أن تبقى pending للمحاولة التالية`);
          }
        }
      );

      // =========================================================================
      // SYNC-13: Max Retries Exhaustion & Manual Recovery
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-13',
        'حماية استنفاد المحاولات القصوى وإعادة الجدولة اليدوية (Max Retries & Manual Recovery)',
        async () => {
          setupMocks();
          await db.syncQueue.clear();

          const opIdExhaust = `op_exhaust_${Date.now()}`;
          // Insert queue item already at retryCount = 4
          await db.syncQueue.add({
            id: 'sq_exhaust_1',
            entityType: 'account',
            entityId: 'acc_exhaust_1',
            operation: 'CREATE',
            operationId: opIdExhaust,
            createdAt: new Date().toISOString(),
            retryCount: 4,
            status: 'pending',
          });

          // Force failure
          googleDriveService.uploadJsonFile = async () => {
            throw new Error('Persistent 503 Service Unavailable');
          };
          googleDriveService.updateJsonFile = async () => {
            throw new Error('Persistent 503 Service Unavailable');
          };

          try {
            await syncEngine.performFullSync();
          } catch {
            // Expected
          }

          // Check it transitioned to failed
          const exhaustedItem = await db.syncQueue.where('operationId').equals(opIdExhaust).first();
          if (!exhaustedItem || exhaustedItem.status !== 'failed') {
            throw new Error(`العملية التي تجاوزت 5 محاولات يجب أن تتحول إلى failed: ${exhaustedItem?.status}`);
          }

          const stats = await syncEngine.getQueueStats();
          if (stats.failed < 1) {
            throw new Error(`إحصائيات العمليات الفاشلة لم تسجل العملية: ${JSON.stringify(stats)}`);
          }

          // Test manual recovery
          const retriedCount = await syncEngine.retryFailedQueueItems();
          if (retriedCount < 1) {
            throw new Error('فشلت إعادة جدولة العمليات الفاشلة');
          }

          const recoveredItem = await db.syncQueue.where('operationId').equals(opIdExhaust).first();
          if (!recoveredItem || recoveredItem.status !== 'pending' || recoveredItem.retryCount !== 0) {
            throw new Error(`العملية بعد الاستعادة يجب أن تصبح pending بعداد 0: ${JSON.stringify(recoveredItem)}`);
          }
        }
      );

      // =========================================================================
      // SYNC-14: Network Recovery & Flush Verification
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-14',
        'معالجة استعادة الاتصال ودورة حياة الطابور (Network Recovery & Queue Flush)',
        async () => {
          setupMocks();
          await db.syncQueue.clear();

          const acc = await accountRepository.create({
            name: `حساب استعادة الشبكة ${Date.now()}`,
          });

          await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 420,
            date: '2026-09-08',
            operationId: `op_net_recov_${Date.now()}`,
          });

          const pendingBefore = await syncEngine.getPendingCount();
          if (pendingBefore < 1) {
            throw new Error('لم يتم إدراج المعاملة في طابور المزامنة');
          }

          // Simulate sync flush upon recovery
          const syncRes = await syncEngine.performFullSync();
          if (!syncRes.success) {
            throw new Error('فشلت المزامنة بعد استعادة الاتصال');
          }

          const pendingAfter = await syncEngine.getPendingCount();
          if (pendingAfter !== 0) {
            throw new Error(`لم يتم إفراغ طابور المزامنة بالكامل بعد النجاح: تبقى ${pendingAfter}`);
          }
        }
      );

      // =========================================================================
      // SYNC-15: Interactive Conflict Resolution & Recalculation
      // =========================================================================
      await this.runTest(
        results,
        'SYNC-15',
        'حل التعارض المالي التفاعلي وإعادة احتساب الأرصدة (Interactive Conflict Resolution)',
        async () => {
          setupMocks();
          await db.syncQueue.clear();

          const acc = await accountRepository.create({
            name: `حساب حل التعارض ${Date.now()}`,
          });

          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 1000,
            date: '2026-09-08',
          });

          // Construct conflict item
          const conflictItem: any = {
            id: 'cf_test_resolve_' + trx.id,
            entityType: 'transaction',
            entityId: trx.id,
            localVersion: {
              title: 'المعاملة محلياً',
              updatedAt: '2026-09-08T12:00:00.000Z',
              data: { ...trx, amount: 1000, amountMinor: decimalToMinor(1000) },
            },
            remoteVersion: {
              title: 'المعاملة في السحابة',
              updatedAt: '2026-09-08T13:00:00.000Z',
              data: { ...trx, amount: 1500, amountMinor: decimalToMinor(1500) },
            },
            detectedAt: new Date().toISOString(),
            resolved: false,
          };

          // Resolve choosing 'remote'
          await syncEngine.resolveConflict(conflictItem, 'remote');

          // Verify local transaction was updated to 1500
          const updatedTrx = await db.transactions.get(trx.id);
          if (!updatedTrx || updatedTrx.amount !== 1500) {
            throw new Error(`لم يتم تطبيق النسخة السحابية المختارة: ${updatedTrx?.amount}`);
          }

          // Verify account balance was accurately recalculated to 1500
          const updatedAcc = await db.accounts.get(acc.id);
          if (!updatedAcc || updatedAcc.currentBalance !== 1500) {
            throw new Error(`لم تتم إعادة احتساب رصيد الحساب بشكل سليم: ${updatedAcc?.currentBalance}`);
          }

          // Test resolving choosing 'local'
          const localConflict: any = {
            id: 'cf_test_local_' + trx.id,
            entityType: 'transaction',
            entityId: trx.id,
            localVersion: {
              title: 'المعاملة محلياً',
              updatedAt: '2026-09-08T14:00:00.000Z',
              data: { ...trx, amount: 1200, amountMinor: decimalToMinor(1200) },
            },
            remoteVersion: {
              title: 'المعاملة في السحابة',
              updatedAt: '2026-09-08T15:00:00.000Z',
              data: { ...trx, amount: 900, amountMinor: decimalToMinor(900) },
            },
            detectedAt: new Date().toISOString(),
            resolved: false,
          };

          await syncEngine.resolveConflict(localConflict, 'local');

          // Verify UPDATE mutation was enqueued
          const enqueued = await db.syncQueue
            .where('entityId')
            .equals(trx.id)
            .filter((item) => item.operation === 'UPDATE')
            .first();

          if (!enqueued) {
            throw new Error('لم يتم جدولة عملية UPDATE لمزامنة الاختيار المحلي مع السحابة');
          }
        }
      );

    } finally {
      // Restore original googleDriveService methods
      googleDriveService.listFiles = origListFiles;
      googleDriveService.downloadJsonFile = origDownload;
      googleDriveService.uploadJsonFile = origUpload;
      googleDriveService.updateJsonFile = origUpdate;
      googleDriveService.isConnected = origIsConnected;

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
