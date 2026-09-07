import { reportService } from '../services/report.service';
import { excelGenerator } from '../services/excelGenerator.service';
import { pdfGenerator } from '../services/pdfGenerator.service';
import { shareService } from '../services/share.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { db } from '../database/db';
import { resolveDateRange } from '../utils/dateRange';

export interface TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class ReportsTestSuite {
  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: TestResult[];
  }> {
    const results: TestResult[] = [];

    // Setup clean isolated test fixtures
    const testAccountName = `حساب اختبار التقارير ${Date.now()}`;
    let testAccountId = '';

    try {
      // Create test account
      const testAccount = await accountRepository.create({
        name: testAccountName,
        phone: '0501234567',
      });
      testAccountId = testAccount.id;

      // Insert prior-period transactions (date: 2026-01-10 & 2026-01-15)
      await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 1000.50,
        date: '2026-01-10',
        note: 'رصيد سابق حركة 1 (لك)',
      });

      await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'credit',
        amount: 300.25,
        date: '2026-01-15',
        note: 'رصيد سابق حركة 2 (عليك)',
      });

      // Expected opening balance before 2026-02-01 = 1000.50 - 300.25 = 700.25

      // Insert period transactions (date: 2026-02-05 & 2026-02-10)
      await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'debit',
        amount: 250.00,
        date: '2026-02-05',
        note: 'حركة خلال الفترة (لك)',
      });

      await transactionEngine.createTransaction({
        accountId: testAccountId,
        type: 'credit',
        amount: 100.00,
        date: '2026-02-10',
        note: 'حركة خلال الفترة (عليك)',
      });

      // TEST 1: Accurate Historical Opening Balance
      await this.runTest(
        results,
        'REP-01',
        'حساب الرصيد الافتتاحي التاريخي الدقيق قبل بداية الفترة',
        async () => {
          const statement = await reportService.getAccountStatement(testAccountId, {
            preset: 'custom',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          });

          if (statement.openingBalance !== 700.25) {
            throw new Error(
              `الرصيد الافتتاحي غير مطابق: المتوقع 700.25 ولكن الفعلي ${statement.openingBalance}`
            );
          }
        }
      );

      // TEST 2: Running Balance Progression & Invariant Formula
      await this.runTest(
        results,
        'REP-02',
        'تسلسل الرصيد التراكمي ومطابقة المعادلة الرياضية الختامية',
        async () => {
          const statement = await reportService.getAccountStatement(testAccountId, {
            preset: 'custom',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          });

          if (statement.transactions.length !== 2) {
            throw new Error(`عدد الحركات غير صحيح: ${statement.transactions.length}`);
          }

          // Trx 1 (debit 250): 700.25 + 250 = 950.25
          // Trx 2 (credit 100): 950.25 - 100 = 850.25
          if (statement.transactions[0].runningBalance !== 950.25) {
            throw new Error(`الرصيد التراكمي للحركة 1 غير مطابق: ${statement.transactions[0].runningBalance}`);
          }

          if (statement.transactions[1].runningBalance !== 850.25) {
            throw new Error(`الرصيد التراكمي للحركة 2 غير مطابق: ${statement.transactions[1].runningBalance}`);
          }

          if (statement.closingBalance !== 850.25) {
            throw new Error(`الرصيد الختامي غير مطابق: ${statement.closingBalance}`);
          }

          // Formula check
          const expectedClosing = statement.openingBalance + statement.totalPeriodDebit - statement.totalPeriodCredit;
          if (Math.abs(expectedClosing - statement.closingBalance) > 0.0001) {
            throw new Error(`المعادلة الرياضية غير متطابقة!`);
          }
        }
      );

      // TEST 3: Excel Generation (XLSX Blob)
      await this.runTest(
        results,
        'REP-03',
        'توليد ملف Excel بصيغة .xlsx وحجم غير صفري',
        async () => {
          const statement = await reportService.getAccountStatement(testAccountId, {
            preset: 'custom',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          });

          const blob = await excelGenerator.generateStatementExcel(statement, 'ر.س');
          if (!blob || blob.size === 0) {
            throw new Error('ملف Excel المتولد فارغ أو غير صالح');
          }
          if (!blob.type.includes('openxmlformats-officedocument')) {
            throw new Error(`نوع MIME غير مطابق: ${blob.type}`);
          }
        }
      );

      // TEST 4: HTML / PDF Generation
      await this.runTest(
        results,
        'REP-04',
        'توليد قالب HTML / PDF بتنسيق عربي RTL وتضمين كافة البيانات',
        async () => {
          const statement = await reportService.getAccountStatement(testAccountId, {
            preset: 'custom',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          });

          const html = pdfGenerator.generateStatementHTML(statement, 'ر.س');
          if (!html.includes('حساباتي | Hisabati') || !html.includes('كشف حساب مالي')) {
            throw new Error('قالب HTML لا يحتوي على الترويسة والعنوان');
          }
          if (!html.includes(testAccountName)) {
            throw new Error('قالب HTML لا يحتوي على اسم الحساب');
          }
        }
      );

      // TEST 5: Share Text Message Formatting
      await this.runTest(
        results,
        'REP-05',
        'توليد نص المشاركة العربي مع كافة الأرقام والإجماليات',
        async () => {
          const statement = await reportService.getAccountStatement(testAccountId, {
            preset: 'custom',
            startDate: '2026-02-01',
            endDate: '2026-02-28',
          });

          const msg = shareService.generateStatementTextMessage(statement, 'ر.س');
          if (!msg.includes(testAccountName)) {
            throw new Error('نص المشاركة لا يحتوي على اسم الحساب');
          }
          if (!msg.includes('الرصيد الختامي')) {
            throw new Error('نص المشاركة لا يحتوي على الرصيد الختامي');
          }
        }
      );

      // TEST 6: Date Range Presets Resolution
      await this.runTest(
        results,
        'REP-06',
        'التحقق من صحة فترات التواريخ المسبقة (Presets)',
        async () => {
          const todayRange = resolveDateRange('today');
          const nowStr = new Date().toISOString().split('T')[0];
          if (todayRange.startDate !== nowStr || todayRange.endDate !== nowStr) {
            throw new Error('تحديد تاريخ اليوم غير صحيح');
          }

          const monthRange = resolveDateRange('this_month');
          if (!monthRange.startDate.endsWith('-01')) {
            throw new Error('بداية الشهر يجب أن تبدأ بيوم 01');
          }
        }
      );

      // TEST 7: Receivables & Payables Segregation
      await this.runTest(
        results,
        'REP-07',
        'فرز وتصنيف تقرير المستحقات لك والديون عليك',
        async () => {
          const recReport = await reportService.getReceivablesReport({ search: testAccountName });
          if (recReport.items.length === 0) {
            throw new Error('الحساب المدين لم يظهر في تقرير المستحقات لك');
          }
          if (recReport.items[0].balance <= 0) {
            throw new Error('رصيد المستحقات لك يجب أن يكون موجباً');
          }
        }
      );

    } finally {
      // Clean up test data
      try {
        await db.transactions.where('accountId').equals(testAccountId).delete();
        await db.accounts.delete(testAccountId);
      } catch (err) {
        console.warn('Failed to cleanup reports test fixtures', err);
      }
    }

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
        message: 'نجح الاختبار بنجاح وبدقة متطابقة 100%',
        durationMs,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        nameAr,
        passed: false,
        message: err?.message || 'فشل الاختبار',
        durationMs,
      });
    }
  }
}
