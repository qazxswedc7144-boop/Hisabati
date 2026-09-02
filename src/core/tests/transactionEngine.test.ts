import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountService } from '../services/account.service';
import { integrityService, IntegrityReport } from '../services/integrity.service';

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
      archived: false,
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
      archived: false,
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

    // Test 5: Edit Transaction 2 (5,000 -> 8,000) -> Balance = 15,000
    await transactionEngine.updateTransaction(trx2.id, {
      amount: 8000,
    });
    const acc1AfterEdit = await db.accounts.get(testAcc1Id);
    addResult(
      5,
      'تعديل قيمة عملية من 5,000 إلى 8,000',
      acc1AfterEdit?.currentBalance === 15000 && acc1AfterEdit?.totalDebit === 18000,
      'رصيد = 15000، إجمالي لك = 18000',
      `رصيد = ${acc1AfterEdit?.currentBalance}، إجمالي لك = ${acc1AfterEdit?.totalDebit}`
    );

    // Test 6: Delete Transaction (8,000) -> Balance = 7,000
    await transactionEngine.deleteTransaction(trx2.id);
    const acc1AfterDelete = await db.accounts.get(testAcc1Id);
    addResult(
      6,
      'حذف عملية بمبلغ 8,000 والتحقق من تحديث الرصيد',
      acc1AfterDelete?.currentBalance === 7000 && acc1AfterDelete?.transactionCount === 2,
      'رصيد = 7000، عدد العمليات = 2',
      `رصيد = ${acc1AfterDelete?.currentBalance}، عدد العمليات = ${acc1AfterDelete?.transactionCount}`
    );

    // Test 7: Move Transaction 1 (10,000) to Account 2 -> Recalculates both
    await transactionEngine.updateTransaction(trx1.id, {
      accountId: testAcc2Id,
    });
    const acc1AfterMove = await db.accounts.get(testAcc1Id);
    const acc2AfterMove = await db.accounts.get(testAcc2Id);
    addResult(
      7,
      'نقل عملية إلى حساب آخر وتحديث رصيد الحسابين بدقة',
      acc1AfterMove?.currentBalance === -3000 && acc2AfterMove?.currentBalance === 10000,
      'رصيد الحساب الأول = -3000، رصيد الحساب الثاني = 10000',
      `رصيد الأول = ${acc1AfterMove?.currentBalance}، رصيد الثاني = ${acc2AfterMove?.currentBalance}`
    );

    // Test 8: Change Transaction 3 type from Credit to Debit
    await transactionEngine.updateTransaction(trx3.id, {
      type: 'debit',
    });
    const acc1AfterTypeChange = await db.accounts.get(testAcc1Id);
    addResult(
      8,
      'تغيير نوع العملية من دائن إلى مدين وتحديث الرصيد',
      acc1AfterTypeChange?.currentBalance === 3000 && acc1AfterTypeChange?.totalCredit === 0,
      'رصيد = 3000، إجمالي عليك = 0',
      `رصيد = ${acc1AfterTypeChange?.currentBalance}، إجمالي عليك = ${acc1AfterTypeChange?.totalCredit}`
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
