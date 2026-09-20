/**
 * Phase P1.3 Unit Tests - Mobile UX, WhatsApp Integration & Biometrics Security Hardening
 */
import { reminderService } from '../services/messaging/reminder.service';
import { securityService } from '../services/security.service';
import { db } from '../database/db';

export async function runPhaseP13Tests() {
  const results: { id: string; name: string; passed: boolean; error?: string }[] = [];

  const runTest = async (id: string, name: string, fn: () => Promise<void>) => {
    try {
      await fn();
      results.push({ id, name, passed: true });
    } catch (e: any) {
      results.push({ id, name, passed: false, error: e.message || String(e) });
    }
  };

  // Test 1: WhatsApp Reminder Text Generation with Minor Units
  await runTest('P1.3-01', 'WhatsApp reminder professional text and amount precision', async () => {
    const testAccountId = 'acc_wa_test_' + Date.now();
    await db.accounts.put({
      id: testAccountId,
      name: 'شركة التجارة الحديثة',
      category: 'customer',
      currency: 'YER',
      currentBalance: 150000,
      currentBalanceMinor: 15000000, // 150,000.00 YER minor units
      totalDebit: 150000,
      totalDebitMinor: 15000000,
      totalCredit: 0,
      totalCreditMinor: 0,
      transactionCount: 1,
      archived: false,
      phone: '+967771234567',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const payload = await reminderService.generateDebtReminderPayload(testAccountId, {
      channel: 'whatsapp',
      dueDate: '2026-10-01',
      customNote: 'سداد الدفعة الأولى',
    });

    if (!payload.body.includes('150,000') && !payload.body.includes('150000')) {
      throw new Error(`لم يتضمن نص رسالة الواتساب المبلغ بدقة: ${payload.body}`);
    }
    if (!payload.body.includes('2026-10-01')) {
      throw new Error('لم يتضمن نص رسالة الواتساب تاريخ الاستحقاق');
    }
  });

  // Test 2: Biometric & PIN Security PBKDF2 Hash Verification
  await runTest('P1.3-02', 'Security service PBKDF2 hash & verification test', async () => {
    const testPin = '8822';
    const hashed = await securityService.setPin(testPin);
    
    if (!hashed || !hashed.includes(':')) {
      throw new Error('فشل إنشاء هاش رمز المرور بشكل آمن عبر PBKDF2 مع الـ salt');
    }

    const isValid = await securityService.verifyPin(testPin, hashed);
    if (!isValid) {
      throw new Error('فشل التحقق من صحة رمز المرور الصحيح');
    }

    const isInvalid = await securityService.verifyPin('0000', hashed);
    if (isInvalid) {
      throw new Error('فشل أمني خطير: تم قبول رمز مرور خاطئ!');
    }
  });

  // Test 3: Horizontal Scroll / Mobile UX Debt Overview Filtering
  await runTest('P1.3-03', 'Due debt overview filtering and categorization', async () => {
    const overview = await reminderService.getDueDebtAlerts(14);
    if (typeof overview.totalDueTodayCount !== 'number' || typeof overview.totalReceivableMinor !== 'number') {
      throw new Error('فشل استرجاع ملخص الديون المستحقة للأجهزة المحمولة');
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
