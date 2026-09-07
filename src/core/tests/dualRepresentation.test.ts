import { db } from '../database/db';
import { FinancialTransactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { validateDualMoneyRepresentation, assertDualMoneyRepresentation } from '../money/validator';
import { decimalToMinor, minorToDecimal } from '../money/converter';
import { getAmountMinor } from '../money/compat';
import { computeAccountMetricsFromTransactions } from '../utils/financial';
import { integrityService } from '../services/integrity.service';
import { FINANCIAL_FORMAT_VERSION, BACKUP_SCHEMA_VERSION } from '../database/schemaVersion';

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
        date: '2026-03-02',
      });

      const updated = await engine.updateTransaction(tx.id, {
        amount: 1500,
        note: 'مبلغ معدل',
      });

      if (!updated) throw new Error('فشل تعديل المعاملة');
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

      const metrics = computeAccountMetricsFromTransactions([legacyTx]);
      if (metrics.currentBalance !== 350.75) throw new Error(`الرصيد المحسوب غير صحيح: ${metrics.currentBalance}`);
      if (metrics.currentBalanceMinor !== 35075) throw new Error(`الرصيد الأصغر غير صحيح: ${metrics.currentBalanceMinor}`);
    });

    // Test 5: Derived account metrics recalculation with zero floating drift
    await run('DUAL-05', 'إعادة احتساب الأرصدة عبر minor units تضمن عدم وجود انحرافات IEEE-754', async () => {
      const acc = await accountRepository.create({
        name: 'حساب اختبار الانحراف العشري',
        phone: '770000003',
        category: 'customer',
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
    await run('DUAL-07', 'حظر تغيير إصدار Dexie (ثابت على 6) وثبات Backup Schema V3 و Format V1', async () => {
      if (db.verno !== 6) {
        throw new Error(`خطأ حرج: تم تعديل إصدار Dexie إلى ${db.verno}. يجب أن يبقى 6 حصراً.`);
      }
      if (BACKUP_SCHEMA_VERSION !== 3) {
        throw new Error(`خطأ حرج: تم تعديل BACKUP_SCHEMA_VERSION إلى ${BACKUP_SCHEMA_VERSION}. يجب أن يبقى 3.`);
      }
      if (FINANCIAL_FORMAT_VERSION !== 1) {
        throw new Error(`خطأ حرج: تم تعديل FINANCIAL_FORMAT_VERSION إلى ${FINANCIAL_FORMAT_VERSION}. يجب أن يبقى 1.`);
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
