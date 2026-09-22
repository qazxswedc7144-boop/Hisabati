import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountService } from '../services/account.service';
import { integrityService, IntegrityReport } from '../services/integrity.service';
import { SyncContextRegistry } from '../services/syncContext';

export interface TestCaseResult {
  id: number;
  title: string;
  passed: boolean;
  expected: string;
  actual: string;
  error?: string;
}

export interface EngineTestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  results: TestCaseResult[];
  integrityReport: IntegrityReport;
  durationMs: number;
}

/**
 * Runs the complete Phase 2 Financial Engine Test Suite
 */
export async function runFinancialEngineTests(): Promise<EngineTestSuiteResult> {
  const startTime = Date.now();
  const results: TestCaseResult[] = [];

  const addResult = (
    id: number,
    title: string,
    passed: boolean,
    expected: string,
    actual: string,
    error?: string
  ) => {
    results.push({ id, title, passed, expected, actual, error });
  };

  try {
    // Isolated Test Account IDs
    const testAcc1Id = 'test_acc_engine_1_' + Date.now();
    const testAcc2Id = 'test_acc_engine_2_' + Date.now();

    // Setup Test Accounts
    await db.accounts.add({
      id: testAcc1Id,
      name: 'حساب اختبار 1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: 0 as 0 | 1,
      currentBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      transactionCount: 0,
    });

    await db.accounts.add({
      id: testAcc2Id,
      name: 'حساب اختبار 2',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: 0 as 0 | 1,
      currentBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      transactionCount: 0,
    });

    // Test 1: Initial Account State
    const acc1 = await db.accounts.get(testAcc1Id);
    addResult(
      1,
      'إنشاء حساب جديد برصيد صفري',
      acc1?.currentBalance === 0 && acc1?.transactionCount === 0,
      'رصيد = 0، عدد العمليات = 0',
      `رصيد = ${acc1?.currentBalance}، عدد العمليات = ${acc1?.transactionCount}`
    );

    // Test 2: Add 10,000 Debit (لي) -> Balance = 10,000
    const trx1 = await transactionEngine.createTransaction({
      accountId: testAcc1Id,
      type: 'debit',
      amount: 10000,
      date: '2026-09-01',
      note: 'دفعة أولى',
      operationId: `test_op_1_${Date.now()}`,
    });
    const acc1AfterTrx1 = await db.accounts.get(testAcc1Id);
    addResult(
      2,
      'تسجيل عملية لي بمبلغ 10,000 (Debit)',
      acc1AfterTrx1?.currentBalance === 10000 && acc1AfterTrx1?.totalDebit === 10000,
      'رصيد = 10000، إجمالي لك = 10000',
      `رصيد = ${acc1AfterTrx1?.currentBalance}، إجمالي لك = ${acc1AfterTrx1?.totalDebit}`
    );

    // Test 3: Add 5,000 Debit -> Balance = 15,000
    const trx2 = await transactionEngine.createTransaction({
      accountId: testAcc1Id,
      type: 'debit',
      amount: 5000,
      date: '2026-09-02',
      note: 'دفعة ثانية',
      operationId: `test_op_2_${Date.now()}`,
    });
    const acc1AfterTrx2 = await db.accounts.get(testAcc1Id);
    addResult(
      3,
      'تسجيل عملية لي أخرى بمبلغ 5,000',
      acc1AfterTrx2?.currentBalance === 15000 && acc1AfterTrx2?.transactionCount === 2,
      'رصيد = 15000، عدد العمليات = 2',
      `رصيد = ${acc1AfterTrx2?.currentBalance}، عدد العمليات = ${acc1AfterTrx2?.transactionCount}`
    );

    // Test 4: Add 3,000 Credit (علي) -> Balance = 12,000
    const trx3 = await transactionEngine.createTransaction({
      accountId: testAcc1Id,
      type: 'credit',
      amount: 3000,
      date: '2026-09-03',
      note: 'سداد من العميل',
      operationId: `test_op_3_${Date.now()}`,
    });
    const acc1AfterTrx3 = await db.accounts.get(testAcc1Id);
    addResult(
      4,
      'تسجيل عملية علي بمبلغ 3,000 (Credit)',
      acc1AfterTrx3?.currentBalance === 12000 && acc1AfterTrx3?.totalCredit === 3000,
      'رصيد = 12000، إجمالي عليك = 3000',
      `رصيد = ${acc1AfterTrx3?.currentBalance}، إجمالي عليك = ${acc1AfterTrx3?.totalCredit}`
    );

    // Test: Unauthorized isRemote throws error outside syncEngine
    let unauthorizedCaught = false;
    try {
      await transactionEngine.updateTransaction(trx2.id, { amount: 8000 }, undefined, { isRemote: true });
    } catch (err: any) {
      if (err.message.includes('isRemote ممنوع خارج محرك المزامنة')) {
        unauthorizedCaught = true;
      }
    }
    addResult(
      4.5,
      'منع استخدام isRemote خارج محرك المزامنة',
      unauthorizedCaught,
      'رمي استثناء عند تمرير isRemote دون beginSyncApply',
      unauthorizedCaught ? 'تم رمي الاستثناء بنجاح' : 'لم يتم رمي الاستثناء'
    );

    // Test 5: رفض تعديل قيد POSTED عبر isRemote
    let rejectionCaught = false;
    transactionEngine.beginSyncApply();
    try {
      await transactionEngine.updateTransaction(trx2.id, {
        amount: 8000,
      }, undefined, { isRemote: true });
    } catch (e: any) {
      rejectionCaught = e.message.includes('لا يمكن تعديل الحقول المالية') ||
                        e.message.includes('POSTED');
    } finally {
      transactionEngine.endSyncApply();
    }
    addResult(
      5,
      'رفض تعديل مبلغ قيد POSTED عبر المزامنة (Immutable Ledger)',
      rejectionCaught,
      'استثناء برفض التعديل',
      rejectionCaught ? 'تم الرفض' : 'تم السماح (خطأ)'
    );

    // Test 5b: التحقق من ثبات الرصيد
    const accStateAfterEdit = await db.accounts.get(testAcc1Id);
    addResult(
      5.5,
      'التحقق من ثبات الرصيد بعد رفض التعديل',
      accStateAfterEdit?.currentBalance === 12000,
      'رصيد = 12000',
      `رصيد = ${accStateAfterEdit?.currentBalance}`
    );

    // Test 6: التحقق من ثبات بيانات الحركة بعد الرفض
    const freshTrx2 = await db.transactions.get(trx2.id);
    addResult(
      6,
      'التحقق من ثبات بيانات الحركة بعد الرفض',
      freshTrx2?.amount === 5000,
      'المبلغ = 5000',
      `المبلغ = ${freshTrx2?.amount}`
    );

    // Test 7: رفض حذف قيد POSTED عبر isRemote
    let deleteRejectionCaught = false;
    transactionEngine.beginSyncApply();
    try {
      await transactionEngine.deleteTransaction(trx1.id, undefined, { isRemote: true });
    } catch (e: any) {
      deleteRejectionCaught = e.message.includes('لا يمكن حذف قيد مرحّل') ||
                              e.message.includes('POSTED');
    } finally {
      transactionEngine.endSyncApply();
    }
    addResult(
      7,
      'رفض حذف قيد POSTED عبر المزامنة (Immutable Ledger)',
      deleteRejectionCaught,
      'استثناء برفض الحذف',
      deleteRejectionCaught ? 'تم الرفض' : 'تم السماح (خطأ)'
    );

    // Test 7b: التحقق من ثبات الرصيد بعد رفض الحذف
    const accStateAfterDeleteAttempt = await db.accounts.get(testAcc1Id);
    addResult(
      7.5,
      'التحقق من ثبات الرصيد بعد رفض الحذف',
      accStateAfterDeleteAttempt?.currentBalance === 12000,
      'رصيد = 12000',
      `رصيد = ${accStateAfterDeleteAttempt?.currentBalance}`
    );

    // Test 8: التحقق من بقاء الحركة في قاعدة البيانات بعد رفض الحذف
    const stillExistsTrx1 = await db.transactions.get(trx1.id);
    addResult(
      8,
      'التحقق من بقاء الحركة في قاعدة البيانات بعد رفض الحذف',
      stillExistsTrx1 !== undefined && stillExistsTrx1?.amount === 10000,
      'trx1 موجود بمبلغ 10000',
      stillExistsTrx1 ? `موجود بمبلغ ${stillExistsTrx1.amount}` : 'محذوف (خطأ)'
    );

    // Test 9: Idempotency Key - duplicate operationId returns existing record
    const uniqueOpId = `op_idempotent_${Date.now()}`;
    const origTrx = await transactionEngine.createTransaction({
      accountId: testAcc2Id,
      type: 'debit',
      amount: 450,
      date: '2026-09-04',
      operationId: uniqueOpId,
    });
    const duplicateTrx = await transactionEngine.createTransaction({
      accountId: testAcc2Id,
      type: 'debit',
      amount: 450,
      date: '2026-09-04',
      operationId: uniqueOpId,
    });
    // إضافة حركة ثانية للحساب 2 لضمان اختبار الرصيد التراكمي
    await transactionEngine.createTransaction({
      accountId: testAcc2Id,
      type: 'credit',
      amount: 150,
      date: '2026-09-05',
      operationId: `op_second_${Date.now()}`,
    });
    addResult(
      9,
      'منع تكرار العملية عند إعادة إرسال نفس المعرف (Idempotency)',
      origTrx.id === duplicateTrx.id,
      `معرف العملية المرتجع متطابق (${origTrx.id})`,
      `المرتجع: ${duplicateTrx.id}`
    );

    // Test 10: Running Balances Statement Calculation
    const statement = await transactionEngine.getAccountStatement(testAcc2Id);
    const hasRunningBalances = statement.transactions.every((t) => typeof t.runningBalance === 'number');
    addResult(
      10,
      'حساب الرصيد التراكمي (Running Balance) في كشف الحساب',
      hasRunningBalances && statement.transactions.length >= 2,
      'كشف الحساب يتضمن الرصيد التراكمي بعد كل حركة',
      `العمليات بالكشف: ${statement.transactions.length}`
    );

    // Test 11: Global Recalculate All Balances
    const recalcResult = await transactionEngine.recalculateAllBalances();
    addResult(
      11,
      'إعادة احتساب شاملة لكافة الأرصدة (recalculateAllBalances)',
      recalcResult.accountsUpdated >= 2,
      'تم تحديث كافة الحسابات بدون أخطاء',
      `عدد الحسابات المحدثة: ${recalcResult.accountsUpdated}`
    );

    // Test 12: Data Integrity Checker Verification
    const integrityReport = await integrityService.verifyFinancialIntegrity();
    addResult(
      12,
      'فحص السلامة المالية الكامل (verifyFinancialIntegrity)',
      integrityReport.valid === true,
      'سلامة البيانات = true وبدون أي تناقضات',
      `النتيجة: valid=${integrityReport.valid}, تناقضات=${integrityReport.inconsistencies.length}`
    );

    // Test 13: isRemote guard rejects remote update without beginSyncApply
    let testAError = false;
    try {
      SyncContextRegistry.endSyncApply();
      await accountService.updateAccount(testAcc1Id, { name: 'تحديث غير مصرح به' }, { isRemote: true });
    } catch (e: any) {
      testAError = true;
    }
    addResult(
      13,
      'حماية isRemote: منع تحديث الحساب كـ isRemote بدون beginSyncApply',
      testAError === true,
      'يرمي استثناء لمنع التجاوز',
      testAError ? 'تم رمي استثناء ومنع التجاوز بنجاح' : 'فشل: تم السماح بالعملية دون تفعيل العلم'
    );

    // Test 14: isRemote guard permits remote update after SyncContextRegistry.beginSyncApply()
    let testBSuccess = false;
    try {
      SyncContextRegistry.beginSyncApply();
      const updated = await accountService.updateAccount(testAcc1Id, { name: 'تحديث بمزامنة معتمدة' }, { isRemote: true });
      testBSuccess = !!updated && updated.name === 'تحديث بمزامنة معتمدة';
    } catch (e: any) {
      testBSuccess = false;
    } finally {
      SyncContextRegistry.endSyncApply();
    }
    addResult(
      14,
      'حماية isRemote: السماح بتحديث الحساب بعد SyncContextRegistry.beginSyncApply()',
      testBSuccess === true,
      'نجاح التحديث عن بعد مع تفعيل العلم الموحد',
      testBSuccess ? 'تم التحديث بنجاح' : 'فشل التحديث'
    );

    // Test 15: SyncContextRegistry handles nested begin/end
    SyncContextRegistry.beginSyncApply();
    SyncContextRegistry.beginSyncApply();
    SyncContextRegistry.endSyncApply();
    const depth1 = SyncContextRegistry.isInsideSyncApply(); // depth = 1 => true
    SyncContextRegistry.endSyncApply();
    const depth0 = SyncContextRegistry.isInsideSyncApply(); // depth = 0 => false
    addResult(
      15,
      'SyncContextRegistry handles nested begin/end',
      depth1 === true && depth0 === false,
      'depth=1 is true, depth=0 is false',
      `depth1=${depth1}, depth0=${depth0}`
    );

    // Cleanup test data
    await db.transactions.where('accountId').anyOf([testAcc1Id, testAcc2Id]).delete();
    await db.accounts.where('id').anyOf([testAcc1Id, testAcc2Id]).delete();

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed: passedCount,
      failed: failedCount,
      results,
      integrityReport,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error('Test Suite Failed:', err);
    addResult(99, 'حدث خطأ استثنائي أثناء الاختبارات', false, 'عدم وجود أخطاء استثنائية', err?.message || 'Error');
    const integrityReport = await integrityService.verifyFinancialIntegrity();
    return {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      results,
      integrityReport,
      durationMs: Date.now() - startTime,
    };
  }
}
