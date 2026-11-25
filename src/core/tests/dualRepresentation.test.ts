import { db } from '../database/db';
import { FinancialTransactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { validateDualMoneyRepresentation, assertDualMoneyRepresentation } from '../money/validator';
import { decimalToMinor, minorToDecimal } from '../money/converter';
import { getAmountMinor } from '../money/compat';
import { computeAccountMetricsFromTransactions } from '../utils/financial';
import { integrityService } from '../services/integrity.service';
import { DATABASE_SCHEMA_VERSION, FINANCIAL_FORMAT_VERSION, BACKUP_SCHEMA_VERSION } from '../database/schemaVersion';

export interface DualRepTestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  error?: string;
}

export class DualRepresentationTestSuite {
  static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: DualRepTestResult[];
  }> {
    // [HARDENING] Strict isolation: clear all financial tables to prevent leakage from previous suites
    await Promise.all([
      db.accounts.clear(),
      db.transactions.clear(),
      db.settings.clear()
    ]);

    // P0 Fix: Re-initialize default system currency after wiping DB for tests
    await db.settings.put({
      id: 'currency',
      key: 'currency',
      value: 'YER',
      updatedAt: new Date().toISOString()
    });

    const results: DualRepTestResult[] = [];
    const engine = new FinancialTransactionEngine();

    const run = async (id: string, nameAr: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ id, nameAr, passed: true });
      } catch (err: any) {
        results.push({ id, nameAr, passed: false, error: err.message || String(err) });
      }
    };

    // Test 1: Canonical write path automatically creates amountMinor
    await run('DUAL-01', 'إنشاء قيد جديد يولد تلقائياً amountMinor المطابق للعملة', async () => {
      const acc = await accountRepository.create({
        name: 'عميل المسار الثنائي 1',
        phone: '770000001',
        category: 'customer',
      });

      const tx = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 2500,
        date: '2026-03-01',
        note: 'معاملة بريال يمني صحيح',
      });

      if (tx.amount !== 2500) throw new Error(`المبلغ العشري غير متطابق: ${tx.amount}`);
      if (tx.amountMinor === undefined) throw new Error('amountMinor غير موجود في القيد الجديد');
      if (tx.amountMinor !== 2500) throw new Error(`amountMinor غير صحيح: المتوقع 2500 والفعلي ${tx.amountMinor}`);

      const fetched = await db.transactions.get(tx.id);
      if (!fetched?.amountMinor) throw new Error('amountMinor لم يتم حفظه في قاعدة البيانات');
    });

    // Test 2: Dual consistency validator rejects float amountMinor and mismatches
    await run('DUAL-02', 'التحقق الصارم من صحة الثنائية ورفض الكسور والتعارضات (FAIL FAST)', async () => {
      // Float amountMinor
      const floatRes = validateDualMoneyRepresentation(100, 100.5, 'SAR');
      if (floatRes.isValid) throw new Error('يجب رفض amountMinor الكسري');

      // Mismatched amount and amountMinor
      const mismatchRes = validateDualMoneyRepresentation(100, 9999, 'SAR');
      if (mismatchRes.isValid) throw new Error('يجب رفض عدم التطابق بين amount و amountMinor');

      // NaN
      const nanRes = validateDualMoneyRepresentation(NaN, 100, 'SAR');
      if (nanRes.isValid) throw new Error('يجب رفض NaN في المبلغ');

      // Infinity
      const infRes = validateDualMoneyRepresentation(100, Infinity, 'SAR');
      if (infRes.isValid) throw new Error('يجب رفض Infinity في amountMinor');

      // assertDualMoneyRepresentation throws immediately
      let threw = false;
      try {
        assertDualMoneyRepresentation(500, 49900, 'SAR');
      } catch {
        threw = true;
      }
      if (!threw) throw new Error('assertDualMoneyRepresentation لم تفشل عند عدم التطابق');
    });

    // Test 3: Updating a transaction updates both amount and amountMinor
    await run('DUAL-03', 'تعديل المعاملة يحدث كلاً من amount و amountMinor بشكل متزامن', async () => {
      const acc = await accountRepository.create({
        name: 'عميل التعديل الثنائي',
        phone: '770000002',
        category: 'customer',
      });

      const tx = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 1000,
        status: 'draft',
        date: '2026-03-02',
      });

      const updated = await engine.updateTransaction(tx.id, {
        amount: 1500,
        note: 'مبلغ معدل',
      });

      if (!updated) throw new Error('فشل تعديل المعاملة');
      
      // Legacy test fix: Transition to POSTED to verify balance update
      await engine.postTransaction(tx.id);
      
      if (updated.amount !== 1500) throw new Error(`المبلغ لم يتحدث: ${updated.amount}`);
      if (updated.amountMinor !== 1500) throw new Error(`amountMinor لم يتحدث: ${updated.amountMinor}`);

      const refreshedAcc = await db.accounts.get(acc.id);
      if (refreshedAcc?.currentBalance !== 1500) throw new Error('رصيد الحساب لم يتحدث بناءً على التعديل');
    });

    // Test 4: Seamless compatibility with legacy records lacking amountMinor
    await run('DUAL-04', 'التوافق التام مع القيود القديمة الخالية من amountMinor دون كسر', async () => {
      const legacyTx = {
        id: 'legacy-tx-99',
        accountId: 'acc-legacy',
        type: 'debit' as const,
        amount: 350.75,
        date: '2026-01-01',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      };

      const resolvedMinor = getAmountMinor(legacyTx, 'SAR');
      if (resolvedMinor !== 35075) throw new Error(`getAmountMinor لم يحسب القيمة بشكل صحيح: ${resolvedMinor}`);

      const metrics = computeAccountMetricsFromTransactions([legacyTx], 'SAR');
      if (metrics.currentBalance !== 350.75) throw new Error(`الرصيد المحسوب غير صحيح: ${metrics.currentBalance}`);
      if (metrics.currentBalanceMinor !== 35075) throw new Error(`الرصيد الأصغر غير صحيح: ${metrics.currentBalanceMinor}`);
    });

    // Test 5: Derived account metrics recalculation with zero floating drift
    await run('DUAL-05', 'إعادة احتساب الأرصدة عبر minor units تضمن عدم وجود انحرافات IEEE-754', async () => {
      const acc = await accountRepository.create({
        name: 'حساب اختبار الانحراف العشري',
        phone: '770000003',
        category: 'customer',
        currency: 'SAR', // Explicitly set currency to SAR to match the test scenario
      });

      // Insert multiple transactions with potential floating point drift (0.1 + 0.2)
      await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 0.1,
        amountMinor: 10, // SAR cents
        date: '2026-03-03',
      });

      await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 0.2,
        amountMinor: 20, // SAR cents
        date: '2026-03-03',
      });

      const updated = await engine.recalculateAccountBalance(acc.id, 'SAR');
      if (!updated) throw new Error('فشل احتساب الرصيد');

      if (updated.totalDebitMinor !== 30) throw new Error(`المتوقع 30 minor units ولكن الفعلي ${updated.totalDebitMinor}`);
      if (updated.totalDebit !== 0.3) throw new Error(`المتوقع 0.3 ولكن الفعلي ${updated.totalDebit}`);
      if (updated.currentBalanceMinor !== 30) throw new Error(`المتوقع 30 ولكن الفعلي ${updated.currentBalanceMinor}`);
    });

    // Test 6: Financial integrity verification checks dual representation
    await run('DUAL-06', 'خدمة النزاهة المالية تدقق تطابق التمثيل الثنائي وتكتشف أي تلاعب', async () => {
      const integrity = await integrityService.verifyFinancialIntegrity();
      if (!integrity.valid) {
        throw new Error(`تدقيق النزاهة اكتشف مشاكل غير متوقعة: ${JSON.stringify(integrity.inconsistencies)}`);
      }
    });

    // Test 7: Schema Version and Constants Immunity
    await run('DUAL-07', 'مطابقة إصدار Dexie v13 مع ثبات Backup Schema V6 و Format V1', async () => {
      if (DATABASE_SCHEMA_VERSION !== 13 || db.verno !== DATABASE_SCHEMA_VERSION) {
        throw new Error(`خطأ حرج: إصدار Dexie (${db.verno}) و DATABASE_SCHEMA_VERSION (${DATABASE_SCHEMA_VERSION}) يجب أن يكونا 13.`);
      }
      if (BACKUP_SCHEMA_VERSION !== 6) {
        throw new Error(`خطأ حرج: تم تعديل BACKUP_SCHEMA_VERSION إلى ${BACKUP_SCHEMA_VERSION}. يجب أن يبقى 6.`);
      }
      if (FINANCIAL_FORMAT_VERSION !== 1) {
        throw new Error(`خطأ حرج: تم تعديل FINANCIAL_FORMAT_VERSION إلى ${FINANCIAL_FORMAT_VERSION}. يجب أن يبقى 1.`);
      }
    });

    // Test 8: Idempotency & Unique OperationId enforcement
    await run('DUAL-08', 'منع التكرار ومعرف العملية الفريد (Idempotency)', async () => {
      const acc = await accountRepository.create({
        name: 'عميل التزامن',
        phone: '779998888',
        category: 'customer',
      });

      const opId = 'op_idempotency_' + Date.now();
      const res1 = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 500,
        operationId: opId,
        date: '2026-03-04',
      });

      const res2 = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 500,
        operationId: opId,
        date: '2026-03-04',
      });

      if (res1.id !== res2.id) {
        throw new Error('الطلبات المتكررة بنفس operationId يجب أن تُرجع نفس المعاملة (Idempotent)');
      }

      const count = await db.transactions.where('operationId').equals(opId).count();
      if (count !== 1) {
        throw new Error(`يجب أن يوجد سجل واحد فقط في قاعدة البيانات، والفعلي: ${count}`);
      }
    });

    // Test 9: Account metrics must never combine unrelated minor-unit currencies.
    await run('DUAL-09', 'رفض جمع أرصدة بعملات مختلفة دون تحويل صرف صريح', async () => {
      const mixedCurrencyTransactions = [
        { id: 'mix-yer', accountId: 'mix', type: 'debit' as const, amount: 100, amountMinor: 100, currency: 'YER' as const, date: '2026-03-05', createdAt: '2026-03-05T00:00:00.000Z', updatedAt: '2026-03-05T00:00:00.000Z' },
        { id: 'mix-usd', accountId: 'mix', type: 'credit' as const, amount: 1, amountMinor: 100, currency: 'USD' as const, date: '2026-03-05', createdAt: '2026-03-05T00:00:01.000Z', updatedAt: '2026-03-05T00:00:01.000Z' },
      ];
      let rejected = false;
      try {
        computeAccountMetricsFromTransactions(mixedCurrencyTransactions as any, 'YER');
      } catch {
        rejected = true;
      }
      if (!rejected) throw new Error('تم جمع وحدات YER وUSD في رصيد واحد');
    });

    // Test 10: Double-entry creation validates accounts and single-currency journal policy.
    await run('DUAL-10', 'رفض القيد المزدوج عند غياب الحساب أو اختلاف عملة الحسابات', async () => {
      const yerAccount = await accountRepository.create({
        name: 'حساب قيد يومية بالريال',
        phone: '770000010',
        category: 'customer',
        currency: 'YER',
      });
      const sarAccount = await accountRepository.create({
        name: 'حساب قيد يومية بالريال السعودي',
        phone: '770000011',
        category: 'supplier',
        currency: 'SAR',
      });

      let missingAccountRejected = false;
      try {
        await engine.createDoubleEntry({
          operationId: 'journal_missing_account_' + Date.now(),
          entries: [
            { accountId: yerAccount.id, type: 'debit', amount: 10 },
            { accountId: 'missing-account-id', type: 'credit', amount: 10 },
          ],
        });
      } catch {
        missingAccountRejected = true;
      }
      if (!missingAccountRejected) throw new Error('تم قبول طرف مرتبط بحساب غير موجود');

      let mixedCurrencyRejected = false;
      try {
        await engine.createDoubleEntry({
          operationId: 'journal_mixed_currency_' + Date.now(),
          entries: [
            { accountId: yerAccount.id, type: 'debit', amount: 10 },
            { accountId: sarAccount.id, type: 'credit', amount: 10 },
          ],
        });
      } catch {
        mixedCurrencyRejected = true;
      }
      if (!mixedCurrencyRejected) throw new Error('تم قبول قيد يومية يجمع عملتين مختلفتين');
    });

    // Test 11: Reusing a journal operationId with changed leg details must fail.
    await run('DUAL-11', 'مطابقة جميع تفاصيل القيد عند إعادة استخدام operationId', async () => {
      const debitAccount = await accountRepository.create({
        name: 'حساب مدين لاختبار المرجع',
        phone: '770000012',
        category: 'customer',
        currency: 'YER',
      });
      const creditAccount = await accountRepository.create({
        name: 'حساب دائن لاختبار المرجع',
        phone: '770000013',
        category: 'supplier',
        currency: 'YER',
      });
      const operationId = 'journal_payload_' + Date.now();
      await engine.createDoubleEntry({
        operationId,
        date: '2026-03-06',
        entries: [
          { accountId: debitAccount.id, type: 'debit', amount: 50, note: 'قيد أصلي' },
          { accountId: creditAccount.id, type: 'credit', amount: 50, note: 'قيد أصلي' },
        ],
      });

      let changedPayloadRejected = false;
      try {
        await engine.createDoubleEntry({
          operationId,
          date: '2026-03-06',
          entries: [
            { accountId: debitAccount.id, type: 'debit', amount: 50, note: 'قيد معدل' },
            { accountId: creditAccount.id, type: 'credit', amount: 50, note: 'قيد معدل' },
          ],
        });
      } catch {
        changedPayloadRejected = true;
      }
      if (!changedPayloadRejected) throw new Error('تم قبول operationId نفسه مع تغيير ملاحظات أطراف القيد');
    });

    // Test 12: Double-entry retry is idempotent, but changed payload is rejected.
    await run('DUAL-12', 'إعادة القيد المزدوج بنفس operationId آمنة وتغييره مرفوض', async () => {
      const debitAccount = await accountRepository.create({
        name: 'حساب مدين لإعادة القيد',
        phone: '770000014',
        category: 'customer',
        currency: 'YER',
      });
      const creditAccount = await accountRepository.create({
        name: 'حساب دائن لإعادة القيد',
        phone: '770000015',
        category: 'supplier',
        currency: 'YER',
      });
      const operationId = 'journal_retry_' + Date.now();
      const payload = {
        operationId,
        date: '2026-03-07',
        entries: [
          { accountId: debitAccount.id, type: 'debit' as const, amount: 25, note: 'إعادة آمنة' },
          { accountId: creditAccount.id, type: 'credit' as const, amount: 25, note: 'إعادة آمنة' },
        ],
      };
      const first = await engine.createDoubleEntry(payload);
      const retry = await engine.createDoubleEntry(payload);
      if (first.length !== 2 || retry.length !== 2 || first.some((entry) => !retry.some((candidate) => candidate.id === entry.id))) {
        throw new Error('إعادة الطلب بنفس operationId لم تُرجع أطراف القيد الأصلية');
      }

      let changedPayloadRejected = false;
      try {
        await engine.createDoubleEntry({
          ...payload,
          entries: [
            { accountId: debitAccount.id, type: 'debit', amount: 26, note: 'إعادة آمنة' },
            { accountId: creditAccount.id, type: 'credit', amount: 26, note: 'إعادة آمنة' },
          ],
        });
      } catch {
        changedPayloadRejected = true;
      }
      if (!changedPayloadRejected) throw new Error('تم قبول مبالغ مختلفة مع operationId نفسه');
    });

    // Test 13: Retries remain idempotent when optional dates were defaulted at creation time.
    await run('DUAL-13', 'إعادة operationId بعد مرور الوقت لا تتأثر بالتاريخ الافتراضي', async () => {
      const account = await accountRepository.create({
        name: 'حساب إعادة المحاولة دون تاريخ',
        phone: '770000016',
        category: 'customer',
        currency: 'YER',
      });
      const operationId = 'single_retry_without_date_' + Date.now();
      const payload = { accountId: account.id, type: 'debit' as const, amount: 15, operationId };
      const first = await engine.createTransaction(payload);
      await db.transactions.update(first.id, { date: '2026-01-01' });
      const retry = await engine.createTransaction(payload);
      if (retry.id !== first.id) throw new Error('رفض إعادة المحاولة لأن تاريخ الإنشاء الافتراضي تغيّر');

      const other = await accountRepository.create({
        name: 'حساب إعادة قيد يومية دون تاريخ',
        phone: '770000017',
        category: 'supplier',
        currency: 'YER',
      });
      const journalOperationId = 'journal_retry_without_date_' + Date.now();
      const journalPayload = {
        operationId: journalOperationId,
        entries: [
          { accountId: account.id, type: 'debit' as const, amount: 5 },
          { accountId: other.id, type: 'credit' as const, amount: 5 },
        ],
      };
      const journalFirst = await engine.createDoubleEntry(journalPayload);
      await db.transactions.where('operationId').equals(journalOperationId).modify({ date: '2026-01-02' });
      const journalRetry = await engine.createDoubleEntry(journalPayload);
      if (journalFirst.length !== journalRetry.length || journalFirst.some((entry) => !journalRetry.some((candidate) => candidate.id === entry.id))) {
        throw new Error('رفض إعادة القيد المزدوج بسبب التاريخ الافتراضي');
      }
    });

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      passedCount,
      failedCount,
      totalCount: results.length,
      results,
    };
  }
}
