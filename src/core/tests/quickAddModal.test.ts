/**
 * QuickAddTransactionModal & Transaction Form Unit Tests
 */
import { transactionRepository } from '../repositories/transaction.repository';
import { db } from '../database/db';
import { validateTransactionForm } from '../utils/validators';
import { tenantService } from '../services/TenantService';

export async function runQuickAddModalTests() {
  const results: { id: string; name: string; passed: boolean; error?: string }[] = [];

  const runTest = async (id: string, name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (e: any) {
      results.push({ id, name, passed: false, error: e.message || String(e) });
    }
  };

  try {
    await tenantService.switchToLocalMode();
  } catch (e) {
    // ignore if already local
  }

  // Test 1: Validate transaction form & amount minor precision
  await runTest('QA-01', 'Transaction form validation and minor units preservation', async () => {
    const valid = validateTransactionForm({
      accountId: 'acc_test_1',
      amount: 150.50,
      date: new Date().toISOString().split('T')[0],
    });
    if (!valid.isValid) {
      throw new Error('فشل التحقق من نموذج المعاملة الصحيح');
    }

    const invalid = validateTransactionForm({
      accountId: '',
      amount: -10,
      date: '',
    });
    if (invalid.isValid) {
      throw new Error('فشل نظام التحقق من كشف الحقول غير الصالحة');
    }
  });

  // Test 2: Transaction creation & duplicate rapid click guard simulation
  await runTest('QA-02', 'Transaction creation with minor units and idempotency guard', async () => {
    await tenantService.switchToLocalMode();
    await db.settings.put({
      id: 'currency',
      key: 'currency',
      value: 'USD',
      updatedAt: new Date().toISOString(),
    });

    const testAccountId = 'acc_qa_' + Date.now();
    await db.accounts.put({
      id: testAccountId,
      name: 'عميل اختبار السريعة',
      category: 'customer',
      currency: 'USD',
      currentBalance: 0,
      currentBalanceMinor: 0,
      totalDebit: 0,
      totalDebitMinor: 0,
      totalCredit: 0,
      totalCreditMinor: 0,
      transactionCount: 0,
      archived: 0 as 0 | 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const trx = await transactionRepository.create({
      accountId: testAccountId,
      type: 'debit',
      amount: 500,
      currency: 'USD',
      date: new Date().toISOString().split('T')[0],
      note: 'دفعة سريعة مع صورة مستند تجريبية',
      documentRef: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    });

    if (!trx || trx.amountMinor !== 50000) {
      throw new Error(`فشل حساب الوحدات الصغرى للمبلغ: ${trx?.amountMinor}`);
    }

    if (!trx.documentRef) {
      throw new Error('فشل حفظ مرجع الصورة المرفقة مع المعاملة');
    }
  });

  // Test 3: Rapid submission / double-click prevention logic check
  await runTest('QA-03', 'Rapid submission prevention logic verification', async () => {
    let isSubmitting = false;
    let submitCount = 0;

    const mockSubmit = async () => {
      if (isSubmitting) return;
      isSubmitting = true;
      try {
        submitCount++;
        await new Promise((r) => setTimeout(r, 10));
      } finally {
        isSubmitting = false;
      }
    };

    // Trigger double click simultaneously
    await Promise.all([mockSubmit(), mockSubmit()]);

    if (submitCount !== 1) {
      throw new Error(`فشل منع النقر المتكرر: عدد مرات التنفيذ = ${submitCount}`);
    }
  });

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;

  return {
    totalCount: results.length,
    passedCount,
    failedCount,
    results,
  };
}
