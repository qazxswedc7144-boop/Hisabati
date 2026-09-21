import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { integrityService } from '../services/integrity.service';
import { tenantService } from '../services/TenantService';
import { Transaction, TransactionStatus } from '@/shared/types';

export interface ImmutableLedgerTestResult {
  total: number;
  passed: number;
  failed: number;
  results: { id: number; title: string; passed: boolean; error?: string }[];
}

export const ImmutableLedgerTestSuite = {
  async runAll(): Promise<ImmutableLedgerTestResult> {
    const results: { id: number; title: string; passed: boolean; error?: string }[] = [];
    const addResult = (id: number, title: string, passed: boolean, error?: string) => {
      results.push({ id, title, passed, error });
    };

    try {
      await tenantService.switchToLocalMode();
      
      const testAccountId = 'acc_ledger_full_test_' + Date.now();
      // Setup Account
      await db.accounts.add({
        id: testAccountId,
        name: 'حساب اختبار Ledger الشامل',
        currency: 'YER',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: 0,
        currentBalance: 0,
        currentBalanceMinor: 0,
        totalDebit: 0,
        totalDebitMinor: 0,
        totalCredit: 0,
        totalCreditMinor: 0,
        transactionCount: 0,
      });

      // A. Create DRAFT -> Balance doesn't change
      const trxDraft = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 1000,
        status: 'draft',
        date: '2026-01-01',
        operationId: 'op_draft_bal_' + Date.now()
      });
      const accA = await db.accounts.get(testAccountId);
      addResult(1, 'إنشاء مسودة (DRAFT) لا يؤثر على الرصيد', accA?.currentBalanceMinor === 0);

      // B. Edit DRAFT -> Allowed
      await transactionEngine.updateTransaction(trxDraft.id, { amount: 1500 });
      const updatedDraft = await db.transactions.get(trxDraft.id);
      addResult(2, 'تعديل المسودة (DRAFT) مسموح', updatedDraft?.amount === 1500);

      // C. Delete DRAFT -> Allowed
      const draftToDelete = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 500,
        status: 'draft',
        date: '2026-01-01'
      });
      const deleted = await transactionEngine.deleteTransaction(draftToDelete.id);
      addResult(3, 'حذف المسودة (DRAFT) مسموح', deleted === true);

      // D. DRAFT -> POSTED -> Balance changes once
      const beforePostAcc = await db.accounts.get(testAccountId);
      await transactionEngine.postTransaction(trxDraft.id);
      const afterPostAcc = await db.accounts.get(testAccountId);
      const afterPostTrx = await db.transactions.get(trxDraft.id);
      addResult(4, 'التحويل من مسودة إلى مرحلة (POSTED) يُحدث الرصيد', 
        afterPostAcc?.currentBalanceMinor === 1500 && afterPostTrx?.status === 'posted'
      );

      // E. POSTED -> update -> Rejected
      let editError = '';
      try {
        await transactionEngine.updateTransaction(trxDraft.id, { amount: 2000 });
      } catch (e: any) { editError = e.message; }
      addResult(5, 'يمنع تعديل عملية مرحلة (POSTED)', editError.includes('لا يمكن تعديل'));

      // F. POSTED -> delete -> Rejected
      let deleteError = '';
      try {
        await transactionEngine.deleteTransaction(trxDraft.id);
      } catch (e: any) { deleteError = e.message; }
      addResult(6, 'يمنع حذف عملية مرحلة (POSTED)', deleteError.includes('لا يمكن حذف'));

      // G. POSTED -> DRAFT -> Rejected
      let toDraftError = '';
      try {
        await transactionEngine.updateTransaction(trxDraft.id, { status: 'draft' } as any);
      } catch (e: any) { toDraftError = e.message; }
      addResult(7, 'يمنع تحويل عملية مرحلة إلى مسودة', toDraftError.includes('لا يمكن تحويل') || toDraftError.includes('لا يمكن تعديل'));

      // H. REVERSED -> update -> Rejected
      const trxReversedId = 'trx_rev_' + Date.now();
      await db.transactions.add({
        id: trxReversedId,
        accountId: testAccountId,
        type: 'debit',
        amount: 2000,
        amountMinor: 2000,
        currency: 'YER',
        status: 'reversed',
        date: '2026-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        operationId: 'op_rev_test_' + Date.now()
      });
      let revUpdateError = '';
      try {
        await transactionEngine.updateTransaction(trxReversedId, { amount: 3000 });
      } catch (e: any) { revUpdateError = e.message; }
      addResult(8, 'يمنع تعديل عملية معكوسة (REVERSED)', revUpdateError.includes('لا يمكن تعديل'));

      // I. REVERSED -> delete -> Rejected
      let revDeleteError = '';
      try {
        await transactionEngine.deleteTransaction(trxReversedId);
      } catch (e: any) { revDeleteError = e.message; }
      addResult(9, 'يمنع حذف عملية معكوسة (REVERSED)', revDeleteError.includes('لا يمكن حذف'));

      // J. POSTED -> postTransaction again -> Idempotent
      const balBeforeDoublePost = (await db.accounts.get(testAccountId))?.currentBalanceMinor;
      await transactionEngine.postTransaction(trxDraft.id);
      const balAfterDoublePost = (await db.accounts.get(testAccountId))?.currentBalanceMinor;
      addResult(10, 'إعادة الترحيل (POST) لعملية مرحلة لا يضاعف الرصيد', balBeforeDoublePost === balAfterDoublePost);

      // K. Failure during postTransaction -> Rollback
      const rollbackTrxId = 'trx_rollback_' + Date.now();
      await db.transactions.add({
        id: rollbackTrxId,
        accountId: testAccountId,
        type: 'debit',
        amount: 777,
        amountMinor: 777,
        status: 'draft',
        date: '2026-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        operationId: 'op_rollback_test'
      });
      const balBeforeRollback = (await db.accounts.get(testAccountId))?.currentBalanceMinor || 0;
      
      // We force an error by overriding a method temporarily or passing bad data
      // Actually, transactionEngine.postTransaction uses db.transaction. 
      // Let's manually trigger a transaction that fails.
      try {
        await db.transaction('rw', [db.accounts, db.transactions, db.financialAuditLogs], async () => {
          await transactionEngine.postTransaction(rollbackTrxId);
          throw new Error('FORCED_ROLLBACK');
        });
      } catch (e: any) {
        // Expected
      }
      const balAfterRollback = (await db.accounts.get(testAccountId))?.currentBalanceMinor || 0;
      const trxAfterRollback = await db.transactions.get(rollbackTrxId);
      
      addResult(11, 'الترحيل عملية ذرية (Atomic Rollback)', 
        balBeforeRollback === balAfterRollback && trxAfterRollback?.status === 'draft'
      );

      // L. Legacy transaction without status -> Treated as POSTED
      const legacyId = 'legacy_fix_' + Date.now();
      // @ts-ignore
      await db.transactions.add({
        id: legacyId,
        accountId: testAccountId,
        type: 'debit',
        amount: 400,
        amountMinor: 400,
        date: '2023-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        operationId: 'op_legacy_fix_' + Date.now()
      });
      await transactionEngine.recalculateAccountBalance(testAccountId, 'YER');
      const legacyAcc = await db.accounts.get(testAccountId);
      // Balance was 1500 + 400 = 1900. (Reversed 2000 is ignored, Draft 777 rolled back)
      addResult(12, 'العمليات القديمة تدخل في الرصيد وتُعامل كـ POSTED', legacyAcc?.currentBalanceMinor === 1900);

      // M. Double Entry DRAFT
      const testAcc2 = 'acc_double_draft_' + Date.now();
      const now = new Date().toISOString();
      await db.accounts.add({ 
        id: testAcc2, 
        name: 'Double Draft', 
        currentBalanceMinor: 0,
        currentBalance: 0,
        totalDebit: 0,
        totalDebitMinor: 0,
        totalCredit: 0,
        totalCreditMinor: 0,
        transactionCount: 0,
        archived: 0,
        createdAt: now,
        updatedAt: now
      });
      await transactionEngine.createDoubleEntry({
        status: 'draft',
        entries: [
          { accountId: testAccountId, type: 'credit', amount: 900 },
          { accountId: testAcc2, type: 'debit', amount: 900 }
        ]
      });
      const acc1M = await db.accounts.get(testAccountId);
      const acc2M = await db.accounts.get(testAcc2);
      addResult(13, 'القيد المزدوج المسودة لا يؤثر على الأرصدة', acc1M?.currentBalanceMinor === 1900 && acc2M?.currentBalanceMinor === 0);

      // N. Double Entry POSTED -> Balanced
      await transactionEngine.createDoubleEntry({
        status: 'posted',
        entries: [
          { accountId: testAccountId, type: 'credit', amount: 500 },
          { accountId: testAcc2, type: 'debit', amount: 500 }
        ]
      });
      const acc1N = await db.accounts.get(testAccountId);
      const acc2N = await db.accounts.get(testAcc2);
      // acc1: 1900 - 500 = 1400. acc2: 0 + 500 = 500.
      addResult(14, 'القيد المزدوج المرحل يؤثر على الأرصدة بشكل متوازن', acc1N?.currentBalanceMinor === 1400 && acc2N?.currentBalanceMinor === 500);

      // O. Concurrent Posting
      const concurrentTrx = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 100,
        status: 'draft',
        date: '2026-01-01'
      });
      const p1 = transactionEngine.postTransaction(concurrentTrx.id);
      const p2 = transactionEngine.postTransaction(concurrentTrx.id);
      await Promise.all([p1, p2]);
      const accO = await db.accounts.get(testAccountId);
      // 1400 + 100 = 1500
      addResult(15, 'الترحيل المتزامن لنفس العملية لا يضاعف الرصيد', accO?.currentBalanceMinor === 1500);

      // 11. Balance Source of Truth Verification
      const finalAcc = await db.accounts.get(testAccountId);
      const trxs = await db.transactions.where('accountId').equals(testAccountId).toArray();
      const calculated = trxs.reduce((sum, t) => {
        const status = t.status || 'posted';
        if (status !== 'posted') return sum;
        const amt = t.amountMinor || 0;
        return sum + (t.type === 'debit' ? amt : -amt);
      }, 0);
      addResult(16, 'تطابق الرصيد المخزن مع المعاد حسابه من القيود', finalAcc?.currentBalanceMinor === calculated);

      // Final Check for Multi-currency decimals (YER, SAR, USD, KWD)
      const currencies: { code: string, decimals: number, amount: number, expectedMinor: number }[] = [
        { code: 'YER', decimals: 0, amount: 1000, expectedMinor: 1000 },
        { code: 'SAR', decimals: 2, amount: 10.55, expectedMinor: 1055 },
        { code: 'USD', decimals: 2, amount: 50.75, expectedMinor: 5075 },
        { code: 'KWD', decimals: 3, amount: 1.255, expectedMinor: 1255 }
      ];

      let allCurrenciesValid = true;
      for (const cur of currencies) {
        const curAccId = `acc_${cur.code.toLowerCase()}_${Date.now()}`;
        await db.accounts.add({ 
          id: curAccId, 
          name: `${cur.code} Account`, 
          currency: cur.code as any, 
          currentBalanceMinor: 0,
          currentBalance: 0,
          totalDebit: 0,
          totalDebitMinor: 0,
          totalCredit: 0,
          totalCreditMinor: 0,
          transactionCount: 0,
          archived: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        await transactionEngine.createTransaction({ 
          accountId: curAccId, 
          type: 'debit', 
          amount: cur.amount, 
          status: 'posted',
          date: '2026-01-01'
        });
        const curAcc = await db.accounts.get(curAccId);
        if (curAcc?.currentBalanceMinor !== cur.expectedMinor) {
          allCurrenciesValid = false;
          console.error(`Currency ${cur.code} failed: expected ${cur.expectedMinor}, got ${curAcc?.currentBalanceMinor}`);
        }
        await db.transactions.where('accountId').equals(curAccId).delete();
        await db.accounts.delete(curAccId);
      }
      addResult(17, 'دقة العملات المتعددة (YER, SAR, USD, KWD)', allCurrenciesValid);

      // Integrity Check
      const integrity = await integrityService.verifyFinancialIntegrity();
      if (!integrity.valid) {
        console.error('Integrity Inconsistencies:', integrity.inconsistencies);
      }
      addResult(18, 'سلامة النظام المالي بالكامل (Integrity Service)', integrity.valid);

      // Cleanup
      await Promise.all([
        db.transactions.where('accountId').anyOf([testAccountId, testAcc2]).delete(),
        db.accounts.where('id').anyOf([testAccountId, testAcc2]).delete()
      ]);

    } catch (err: any) {
      console.error('Immutable Ledger Full Test Failed:', err);
      addResult(99, 'خطأ استثنائي: ' + err.message, false);
    }

    const passed = results.filter(r => r.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      results
    };
  }
};
