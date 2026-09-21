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
      
      const testAccountId = 'acc_ledger_test_' + Date.now();
      // Setup
      await db.accounts.add({
        id: testAccountId,
        name: 'حساب اختبار Ledger',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: 0,
        currentBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        transactionCount: 0,
      });

      // 1. DRAFT can be edited
      const trx1 = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 1000,
        date: '2026-01-01',
        status: 'draft',
        operationId: 'op_ledger_1_' + Date.now()
      });
      
      await transactionEngine.updateTransaction(trx1.id, { amount: 1500 });
      const updatedTrx1 = await db.transactions.get(trx1.id);
      addResult(1, 'يمكن تعديل المسودة (DRAFT)', updatedTrx1?.amount === 1500);

      // 2. DRAFT can be deleted
      await transactionEngine.deleteTransaction(trx1.id);
      const deletedTrx1 = await db.transactions.get(trx1.id);
      addResult(2, 'يمكن حذف المسودة (DRAFT)', !deletedTrx1);

      // 3. POSTED cannot be edited
      const trx2 = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 2000,
        date: '2026-01-01',
        status: 'posted',
        operationId: 'op_ledger_2_' + Date.now()
      });

      let editError = '';
      try {
        await transactionEngine.updateTransaction(trx2.id, { amount: 2500 });
      } catch (e: any) {
        editError = e.message;
      }
      addResult(3, 'يمنع تعديل العملية المرحلة (POSTED)', editError.includes('لا يمكن تعديل'));

      // 4. POSTED cannot be deleted
      let deleteError = '';
      try {
        await transactionEngine.deleteTransaction(trx2.id);
      } catch (e: any) {
        deleteError = e.message;
      }
      addResult(4, 'يمنع حذف العملية المرحلة (POSTED)', deleteError.includes('لا يمكن حذف'));

      // 5. DRAFT -> POSTED transition
      const trx3 = await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 3000,
        date: '2026-01-01',
        status: 'draft',
        operationId: 'op_ledger_3_' + Date.now()
      });
      
      await transactionEngine.postTransaction(trx3.id);
      const postedTrx3 = await db.transactions.get(trx3.id);
      addResult(5, 'يمكن ترحيل المسودة (DRAFT -> POSTED)', 
        postedTrx3?.status === 'posted' && !!postedTrx3?.postedAt && !!postedTrx3?.postedBy
      );

      // 6. POSTED -> DRAFT transition rejected
      let transitionError = '';
      try {
        await transactionEngine.postTransaction(trx3.id); // Idempotent check
        await transactionEngine.updateTransaction(trx3.id, { status: 'draft' } as any);
      } catch (e: any) {
        transitionError = e.message;
      }
      addResult(6, 'يمنع تحويل المرحلة إلى مسودة (POSTED -> DRAFT)', transitionError.includes('لا يمكن'));

      // 7. Legacy records (no status) treated as POSTED
      const legacyId = 'legacy_trx_' + Date.now();
      // @ts-ignore - simulating legacy write without status
      await db.transactions.add({
        id: legacyId,
        accountId: testAccountId,
        type: 'debit',
        amount: 500,
        amountMinor: 500, // YER has 0 decimals, so minor units = major units
        date: '2023-01-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        operationId: 'op_legacy_' + Date.now()
      });

      // Update account balance manually to reflect legacy insertion for integrity
      await transactionEngine.recalculateAllBalances();

      const legacyTrx = await db.transactions.get(legacyId);
      let legacyEditError = '';
      try {
        await transactionEngine.updateTransaction(legacyId, { amount: 600 });
      } catch (e: any) {
        legacyEditError = e.message;
      }
      addResult(7, 'العمليات القديمة (Legacy) تُعامل كمرحلة (POSTED)', legacyEditError.includes('لا يمكن تعديل'));

      // 8. Atomic Posting Audit Log
      const auditLogs = await db.financialAuditLogs
        .where('targetId')
        .equals(trx3.id)
        .and(log => log.eventType === 'TRANSACTION_POST')
        .toArray();
      addResult(8, 'تسجيل حدث الترحيل في سجل التدقيق المالي', auditLogs.length > 0);

      // 9. Balance recalculation on Post (Implicitly tested by transactionEngine logic)
      const acc = await db.accounts.get(testAccountId);
      const allTrxs = await db.transactions.where('accountId').equals(testAccountId).toArray();
      const sum = allTrxs.reduce((s, t) => s + (t.type === 'debit' ? t.amount : -t.amount), 0);
      
      // Balance should include trx2 (2000), trx3 (3000), and legacy (500) = 5500
      addResult(9, `تحديث رصيد الحساب (الرصيد: ${acc?.currentBalance}, العمليات: ${allTrxs.length}, مجموع: ${sum})`, acc?.currentBalance === 5500);

      // 10. Integrity Verification
      const integrity = await integrityService.verifyFinancialIntegrity();
      addResult(10, 'سلامة البيانات المالية بعد الترحيل', integrity.valid);

      // Cleanup
      await db.transactions.where('accountId').equals(testAccountId).delete();
      await db.accounts.delete(testAccountId);

    } catch (err: any) {
      console.error('Immutable Ledger Test Failed:', err);
      addResult(99, 'خطأ استثنائي في الاختبارات', false, err.message);
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
