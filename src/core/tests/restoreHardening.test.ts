import { db } from '../database/db';
import { backupService } from '../services/backup.service';
import {
  calculateBackupPayloadHash,
  calculateLegacyBackupPayloadHash,
  calculateSHA256,
  verifyCurrentBackupHash,
  verifyLegacyBackupHash,
  verifyBackupIntegrityHash,
} from '../utils/crypto';
import {
  getBackupSchemaVersion,
  migrateBackupPayload,
} from '../services/backup/backup-migrator';
import {
  BACKUP_SCHEMA_VERSION,
  DATABASE_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../database/schemaVersion';
import { integrityService } from '../services/integrity.service';
import { transactionEngine } from '../services/transactionEngine.service';

export interface TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class RestoreHardeningTestSuite {
  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: TestResult[];
  }> {
    const results: TestResult[] = [];

    // Helper to generate a clean base payload
    const createPayload = (
      schemaVersion: number,
      accounts: any[] = [
        {
          id: 'acc_sec_1',
          name: 'عميل أمان 1',
          phone: '0500000001',
          currentBalance: 1200,
          totalDebit: 1500,
          totalCredit: 300,
          transactionCount: 2,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc_sec_2',
          name: 'مورد أمان 2',
          phone: '0500000002',
          currentBalance: -700,
          totalDebit: 300,
          totalCredit: 1000,
          transactionCount: 2,
          archived: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      transactions: any[] = [
        {
          id: 'trx_sec_1',
          accountId: 'acc_sec_1',
          amount: 1500,
          type: 'debit',
          date: '2026-01-01T00:00:00.000Z',
          operationId: 'op_sec_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'trx_sec_2',
          accountId: 'acc_sec_1',
          amount: 300,
          type: 'credit',
          date: '2026-01-02T00:00:00.000Z',
          operationId: 'op_sec_2',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        {
          id: 'trx_sec_3',
          accountId: 'acc_sec_2',
          amount: 1000,
          type: 'credit',
          date: '2026-01-01T00:00:00.000Z',
          operationId: 'op_sec_3',
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'trx_sec_4',
          accountId: 'acc_sec_2',
          amount: 300,
          type: 'debit',
          date: '2026-01-02T00:00:00.000Z',
          operationId: 'op_sec_4',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ]
    ) => {
      const rawMeta: any = {
        appVersion: '2.0.0',
        backupId: `bck_sec_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        deviceId: 'dev_security_test',
        deviceName: 'Security Test Agent',
        createdAt: '2026-01-01T00:00:00.000Z',
        accountCount: accounts.length,
        transactionCount: transactions.length,
        totalDebitSum: 1800,
        totalCreditSum: 1300,
      };

      if (schemaVersion === 1) {
        rawMeta.schemaVersion = 1;
      } else if (schemaVersion === 2) {
        rawMeta.backupSchemaVersion = 2;
        rawMeta.schemaVersion = 2;
      } else {
        rawMeta.backupSchemaVersion = schemaVersion;
        rawMeta.schemaVersion = schemaVersion;
        rawMeta.databaseSchemaVersion = DATABASE_SCHEMA_VERSION;
        rawMeta.financialFormatVersion = FINANCIAL_FORMAT_VERSION;
      }

      return {
        metadata: rawMeta,
        accounts,
        transactions,
        settings: [{ id: 's1', key: 'currency', value: 'SAR', updatedAt: '2026-01-01' }],
      };
    };

    // Ensure database has some baseline content before tests
    const seedInitialDb = async () => {
      await db.transaction('rw', [db.accounts, db.transactions, db.settings], async () => {
        await db.accounts.clear();
        await db.transactions.clear();
        await db.accounts.put({
          id: 'baseline_acc',
          name: 'حساب أصلي مبدئي',
          currentBalance: 500,
          totalDebit: 500,
          totalCredit: 0,
          transactionCount: 1,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await db.transactions.put({
          id: 'baseline_trx',
          accountId: 'baseline_acc',
          amount: 500,
          type: 'debit',
          date: '2026-01-01',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    };

    await seedInitialDb();

    // ----------------------------------------------------
    // TEST 1: Version Gate - V4 Future Version Rejected
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-01',
      'بوابة الإصدارات: رفض النسخة V4 فورياً وحماية البيانات دون أي تعديل في DB',
      async () => {
        const preAccountsCount = await db.accounts.count();
        const payloadV4 = createPayload(4);

        let rejected = false;
        try {
          await backupService.restoreFromPayload(payloadV4);
        } catch (err: any) {
          if (err.message.includes('newer than the supported version')) {
            rejected = true;
          }
        }

        if (!rejected) {
          throw new Error('فشلت بوابة الإصدارات في حظر النسخة المستقبلية V4');
        }

        // Verify DB was completely untouched
        const postAccountsCount = await db.accounts.count();
        if (preAccountsCount !== postAccountsCount) {
          throw new Error('تم تعديل قاعدة البيانات على الرغم من رفض الإصدار V4!');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 2: Version Gate - V99 Future Version Rejected
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-02',
      'بوابة الإصدارات: رفض النسخة V99 فورياً وحماية البيانات الحالية',
      async () => {
        const preCount = await db.accounts.count();
        const payloadV99 = createPayload(99);

        let rejected = false;
        try {
          await backupService.restoreFromPayload(payloadV99);
        } catch (err: any) {
          if (err.message.includes('newer than the supported version')) {
            rejected = true;
          }
        }

        if (!rejected) {
          throw new Error('فشلت بوابة الإصدارات في حظر النسخة V99');
        }

        const postCount = await db.accounts.count();
        if (preCount !== postCount) {
          throw new Error('تم تغيير قاعدة البيانات عند محاولة استعادة V99!');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 3: Legacy V1 Restore Compatibility with Integrity Hash
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-03',
      'توافق النسخ القديمة: استعادة كاملة وآمنة لنسخة V1 مع التحقق من Legacy Hash',
      async () => {
        const payloadV1 = createPayload(1);
        // Compute genuine legacy hash
        payloadV1.metadata.integrityHash = await calculateLegacyBackupPayloadHash(payloadV1, 1);

        const restoreRes = await backupService.restoreFromPayload(payloadV1, 'replace');
        if (!restoreRes.success) {
          throw new Error('فشلت استعادة نسخة V1 الصالحة');
        }

        // Verify accounts and transactions restored
        const acc1 = await db.accounts.get('acc_sec_1');
        const acc2 = await db.accounts.get('acc_sec_2');
        if (!acc1 || !acc2) {
          throw new Error('لم يتم استرجاع حسابات النسخة V1 بنجاح');
        }
        if (acc1.currentBalance !== 1200 || acc2.currentBalance !== -700) {
          throw new Error('أرصدة الحسابات المسترجعة من V1 غير صحيحة');
        }

        // Verify audit passes
        const audit = await integrityService.verifyFinancialIntegrity();
        if (!audit.valid) {
          throw new Error('فشل تدقيق النزاهة المالية بعد استعادة V1');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 4: Legacy V2 Restore Compatibility with Integrity Hash
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-04',
      'توافق النسخ القديمة: استعادة كاملة وآمنة لنسخة V2 مع التحقق من التجزئة',
      async () => {
        const payloadV2 = createPayload(2);
        payloadV2.metadata.integrityHash = await calculateLegacyBackupPayloadHash(payloadV2, 2);

        const restoreRes = await backupService.restoreFromPayload(payloadV2, 'replace');
        if (!restoreRes.success) {
          throw new Error('فشلت استعادة نسخة V2');
        }

        const trxs = await db.transactions.toArray();
        if (trxs.length !== 4) {
          throw new Error(`العدد المتوقع للمعاملات 4، تم استرجاع ${trxs.length}`);
        }
      }
    );

    // ----------------------------------------------------
    // TEST 5: Current V3 Backup Generation & Restore
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-05',
      'النسخة الحالية V3: توليد نسخة احتياطية واستعادتها بنجاح مع مطابقة الـ Hash',
      async () => {
        const snapshot = await backupService.generateBackupPayload();
        if (!snapshot.metadata.integrityHash) {
          throw new Error('النسخة المولدة لا تحتوي على تجزئة أمان');
        }

        const isHashValid = await verifyCurrentBackupHash(snapshot);
        if (!isHashValid) {
          throw new Error('فشل التحقق الذاتي من تجزئة النسخة الحالية V3');
        }

        const restoreRes = await backupService.restoreFromPayload(snapshot, 'replace');
        if (!restoreRes.success) {
          throw new Error('فشلت استعادة النسخة الحالية V3');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 6: Rejection of Corrupted Integrity Hash
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-06',
      'حماية التجزئة: رفض النسخة المعدلة أو التالفة التي لا تتطابق مع Integrity Hash',
      async () => {
        const payload = createPayload(3);
        payload.metadata.integrityHash = await calculateBackupPayloadHash(payload);

        // Tamper with one transaction amount
        payload.transactions[0].amount = 999999;

        let rejected = false;
        try {
          await backupService.restoreFromPayload(payload);
        } catch (err: any) {
          if (err.message.includes('Integrity Hash Mismatch') || err.message.includes('فشل التحقق من صحة التشفير')) {
            rejected = true;
          }
        }

        if (!rejected) {
          throw new Error('لم يرفض النظام النسخة ذات التجزئة المتعارضة!');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 7: Exhaustive Migrated Payload Validation (Orphan Trx, Corrupted IDs)
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-07',
      'التحقق الشامل بعد الترحيل: كشف المعاملات المعلقة (Orphans) ومعرفات الحسابات المفقودة',
      async () => {
        const orphanPayload = createPayload(3);
        // Point transaction to an unknown account ID
        orphanPayload.transactions[0].accountId = 'non_existent_acc_999';
        // Compute hash for this corrupted structure to test validation layer
        orphanPayload.metadata.integrityHash = await calculateBackupPayloadHash(orphanPayload);

        let rejected = false;
        try {
          await backupService.restoreFromPayload(orphanPayload);
        } catch (err: any) {
          if (err.message.includes('تشير إلى حساب غير موجود') || err.message.includes('غير موجود بالنسخة')) {
            rejected = true;
          }
        }

        if (!rejected) {
          throw new Error('فشل التحقق في اكتشاف المعاملة المعلقة (Orphan Transaction)');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 8: Safety Backup Failure Prevents DB Mutation
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-08',
      'حماية لقطة الأمان: فشل لقطة الأمان يمنع تماماً بدء Restore ومسح قاعدة البيانات',
      async () => {
        await seedInitialDb();
        const initialAccounts = await db.accounts.toArray();

        // Simulate safety backup failure
        backupService._simulateSafetyBackupFailure = true;

        const validPayload = createPayload(3);
        validPayload.metadata.integrityHash = await calculateBackupPayloadHash(validPayload);

        let rejected = false;
        try {
          await backupService.restoreFromPayload(validPayload);
        } catch (err: any) {
          if (err.message.includes('Safety Backup Failed') || err.message.includes('نسخة الأمان')) {
            rejected = true;
          }
        } finally {
          backupService._simulateSafetyBackupFailure = false;
        }

        if (!rejected) {
          throw new Error('استمرت عملية الاستعادة على الرغم من فشل نسخة الأمان!');
        }

        // Verify initial DB was NOT cleared or overwritten
        const currentAccounts = await db.accounts.toArray();
        if (currentAccounts.length !== initialAccounts.length) {
          throw new Error('تم مسح قاعدة البيانات على الرغم من فشل نسخة الأمان!');
        }
        if (currentAccounts[0].id !== initialAccounts[0].id) {
          throw new Error('بيانات الحسابات تغيرت بعد فشل لقطة الأمان!');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 9: Immutability of Raw Payload
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-09',
      'ثبات البيانات الأصلية (Immutability): عدم المساس بكائن النسخة الخام وتطابق Deep Equality',
      async () => {
        const rawPayload = createPayload(1);
        const originalString = JSON.stringify(rawPayload);

        await migrateBackupPayload(rawPayload);

        if (JSON.stringify(rawPayload) !== originalString) {
          throw new Error('تم تعديل كائن الـ rawPayload أثناء migrateBackupPayload!');
        }

        // Verify legacy field schemaVersion remained
        if (rawPayload.metadata.schemaVersion !== 1) {
          throw new Error('تم حذف أو تعديل schemaVersion القديم من الكائن الأصلي');
        }
      }
    );

    // ----------------------------------------------------
    // TEST 10: Post-Restore Financial Invariants & Invariant Recalculation
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-10',
      'تدقيق النزاهة البعدي: التأكد من تطابق الأرصدة مع مجموع المعاملات وعدم وجود فروقات حسابية',
      async () => {
        const payload = createPayload(3);
        payload.metadata.integrityHash = await calculateBackupPayloadHash(payload);

        await backupService.restoreFromPayload(payload, 'replace');

        const audit = await integrityService.verifyFinancialIntegrity();
        if (!audit.valid) {
          throw new Error(`تدقيق النزاهة البعدي وجد ${audit.inconsistencies.length} تعارضات!`);
        }

        const accounts = await db.accounts.toArray();
        for (const acc of accounts) {
          const accTrxs = await db.transactions.where('accountId').equals(acc.id).toArray();
          let debitSum = 0;
          let creditSum = 0;
          for (const t of accTrxs) {
            if (t.type === 'debit') debitSum += t.amount;
            else if (t.type === 'credit') creditSum += t.amount;
          }
          const expectedBalance = debitSum - creditSum;
          if (Math.abs(acc.currentBalance - expectedBalance) > 0.001) {
            throw new Error(`عدم تطابق الرصيد المحاسبي للحساب ${acc.name}: متوقع ${expectedBalance}, فعلي ${acc.currentBalance}`);
          }
        }
      }
    );

    // ----------------------------------------------------
    // TEST 11: Dexie Versions & Financial Constants Invariance
    // ----------------------------------------------------
    await this.runTest(
      results,
      'RST-11',
      'عزل قاعدة البيانات: ثبات إصدارات Dexie 1-6 وعدم إنشاء Version 7 وثبات FINANCIAL_FORMAT_VERSION=1',
      async () => {
        if (DATABASE_SCHEMA_VERSION !== 6) {
          throw new Error(`DATABASE_SCHEMA_VERSION must remain 6, got ${DATABASE_SCHEMA_VERSION}`);
        }
        if (BACKUP_SCHEMA_VERSION !== 3) {
          throw new Error(`BACKUP_SCHEMA_VERSION must remain 3, got ${BACKUP_SCHEMA_VERSION}`);
        }
        if (FINANCIAL_FORMAT_VERSION !== 1) {
          throw new Error(`FINANCIAL_FORMAT_VERSION must remain 1, got ${FINANCIAL_FORMAT_VERSION}`);
        }

        // Check db versions max
        const versions = (db as any).verno;
        if (versions && versions > 6) {
          throw new Error(`Dexie version is ${versions}, which exceeds maximum version 6! Version 7 must NOT be created.`);
        }
      }
    );

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
        message: 'ناجح',
        durationMs,
      });
      console.log(`  ✓ ${id}: ${nameAr} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        nameAr,
        passed: false,
        message: err?.message || String(err),
        durationMs,
      });
      console.error(`  ❌ ${id}: ${nameAr} - ${err?.message || String(err)}`);
    }
  }
}
