import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { tenantService } from '../services/TenantService';
import { Transaction } from '@/shared/types';

export interface AuditSnapshotP2B13TestResult {
  total: number;
  passed: number;
  failed: number;
  results: { id: number; title: string; passed: boolean; error?: string }[];
}

export const FinancialAuditSnapshotP2B13TestSuite = {
  async runAll(): Promise<AuditSnapshotP2B13TestResult> {
    const results: { id: number; title: string; passed: boolean; error?: string }[] = [];
    const addResult = (id: number, title: string, passed: boolean, error?: string) => {
      results.push({ id, title, passed, error });
    };

    try {
      await tenantService.switchToLocalMode();

      const testAccountId = 'acc_p2b13_test_' + Date.now();
      await db.accounts.add({
        id: testAccountId,
        name: 'حساب اختبار تدقيق P2-B.1.3',
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

      // 1. Create a draft transaction
      const draftTrx = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 2500,
        amountMinor: 2500,
        currency: 'YER',
        status: 'draft',
        note: 'Initial Draft Note',
        date: '2026-10-30',
        operationId: 'op_p2b13_' + Date.now()
      });

      // 2. Update transaction description (note) before posting
      await db.transactions.update(draftTrx.id, { note: 'Updated Pre-Post Note' });

      // 3. Post transaction
      await transactionEngine.postTransaction(draftTrx.id);

      // Verify audit event log
      const auditLogs = await db.financialAuditLogs
        .where('targetId')
        .equals(draftTrx.id)
        .toArray();

      const postLog = auditLogs.find(l => l.eventType === 'TRANSACTION_POST');

      // Test 1: beforeState and afterState correctness
      addResult(
        1,
        'بيانات beforeState مأخوذة من freshTrx ومطابقة لحالة الدفتري',
        postLog !== undefined && postLog.beforeState?.revision === draftTrx.id && postLog.beforeState?.amountMinor === 2500
      );

      // Test 2: afterState matches finalUpdatedTrx
      addResult(
        2,
        'بيانات afterState مطابقة لـ finalUpdatedTrx ومبلغها',
        postLog !== undefined && postLog.afterState?.revision === draftTrx.id && postLog.afterState?.amountMinor === 2500
      );

      // Test 3: operationId, amountMinor, and currency match saved transaction
      const savedTrx = await db.transactions.get(draftTrx.id);
      addResult(
        3,
        'تطابق operationId و amountMinor و currency في سجل التدقيق مع المعاملة المحفوظة',
        postLog !== undefined &&
          postLog.amountMinor === savedTrx?.amountMinor &&
          postLog.currency === savedTrx?.currency &&
          postLog.operationId === savedTrx?.operationId
      );

      // Test 4: Updated note/description before posting is preserved in savedTrx
      addResult(
        4,
        'تحديث وصف المعاملة قبل الترحيل لم يُفقد',
        savedTrx?.note === 'Updated Pre-Post Note'
      );

      // Test 5: Legacy transaction posting adds no delta
      const legacyTrxId = 'trx_legacy_' + Date.now();
      const legacyTrx: Transaction = {
        id: legacyTrxId,
        accountId: testAccountId,
        type: 'debit',
        amount: 1000,
        amountMinor: 1000,
        currency: 'YER',
        date: '2026-10-30',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as any;
      await db.transactions.add(legacyTrx);
      await transactionEngine.recalculateAccountBalance(testAccountId);
      const accBeforeLegacyPost = await db.accounts.get(testAccountId);
      const balanceBefore = accBeforeLegacyPost?.currentBalanceMinor;

      await transactionEngine.postTransaction(legacyTrxId);
      const accAfterLegacyPost = await db.accounts.get(testAccountId);
      const balanceAfter = accAfterLegacyPost?.currentBalanceMinor;

      addResult(
        5,
        'ترحيل Legacy لا يضيف Delta إضافياً',
        balanceBefore === balanceAfter
      );

      // Test 6: Retrying transaction posting adds no secondary financial effect
      const balanceBeforeRetry = accAfterLegacyPost?.currentBalanceMinor;
      await transactionEngine.postTransaction(legacyTrxId); // retry
      const accAfterRetry = await db.accounts.get(testAccountId);
      addResult(
        6,
        'إعادة محاولة ترحيل المعاملة لا تضيف أثراً مالياً ثانياً',
        accAfterRetry?.currentBalanceMinor === balanceBeforeRetry && accAfterRetry?.transactionCount === accAfterLegacyPost?.transactionCount
      );

      // Test 7: No isInconsistent in account record
      const rawAccount = await db.accounts.get(testAccountId) as any;
      addResult(
        7,
        'عدم تخزين isInconsistent في سجل الحساب',
        rawAccount.isInconsistent === undefined
      );

    } catch (e: any) {
      addResult(99, 'استثناء غير متوقع في اختبارات P2-B.1.3', false, e?.message || String(e));
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  },
};
