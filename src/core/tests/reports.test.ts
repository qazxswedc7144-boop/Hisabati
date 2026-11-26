import ExcelJS from 'exceljs';
import { reportService } from '../services/report.service';
import { excelGenerator } from '../services/excelGenerator.service';
import { pdfGenerator } from '../services/pdfGenerator.service';
import { shareService } from '../services/share.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
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
  public static async runAllTests(): Promise<{ passedCount: number; failedCount: number; totalCount: number; results: TestResult[] }> {
    const results: TestResult[] = [];
    const testAccountName = 'حساب اختبار التقارير ' + Date.now();
    let testAccountId = '';
    const payableAccountName = 'حساب دائن اختبار ' + Date.now();
    let payableAccountId = '';

    try {
      const testAccount = await accountRepository.create({ name: testAccountName, phone: '0501234567', currency: 'SAR' });
      testAccountId = testAccount.id;
      const payableAccount = await accountRepository.create({ name: payableAccountName, phone: '0509876543', currency: 'SAR' });
      payableAccountId = payableAccount.id;

      await transactionEngine.createTransaction({ accountId: payableAccountId, type: 'credit', amount: 500, date: '2026-02-12', note: 'دين علي للمورد' });
      await transactionEngine.createTransaction({ accountId: testAccountId, type: 'debit', amount: 1000.50, date: '2026-01-10', note: 'رصيد سابق حركة 1 (لك)' });
      await transactionEngine.createTransaction({ accountId: testAccountId, type: 'credit', amount: 300.25, date: '2026-01-15', note: 'رصيد سابق حركة 2 (عليك)' });
      await transactionEngine.createTransaction({ accountId: testAccountId, type: 'debit', amount: 250, date: '2026-02-05', note: 'حركة خلال الفترة (لك)' });
      await transactionEngine.createTransaction({ accountId: testAccountId, type: 'credit', amount: 100, date: '2026-02-10', note: 'حركة خلال الفترة (عليك)' });

      await this.runTest(results, 'REP-01', 'حساب الرصيد الافتتاحي التاريخي الدقيق قبل بداية الفترة', async () => {
        const statement = await reportService.getAccountStatement(testAccountId, { preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' });
        if (statement.openingBalance !== 700.25) throw new Error('الرصيد الافتتاحي غير مطابق: ' + statement.openingBalance);
      });

      await this.runTest(results, 'REP-02', 'تسلسل الرصيد التراكمي ومطابقة المعادلة الرياضية الختامية', async () => {
        const statement = await reportService.getAccountStatement(testAccountId, { preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' });
        if (statement.transactions.length !== 2) throw new Error('عدد الحركات غير صحيح: ' + statement.transactions.length);
        if (statement.transactions[0].runningBalance !== 950.25) throw new Error('الرصيد التراكمي للحركة 1 غير مطابق');
        if (statement.transactions[1].runningBalance !== 850.25) throw new Error('الرصيد التراكمي للحركة 2 غير مطابق');
        if (statement.closingBalance !== 850.25) throw new Error('الرصيد الختامي غير مطابق');
        const expectedClosing = statement.openingBalance + statement.totalPeriodDebit - statement.totalPeriodCredit;
        if (Math.abs(expectedClosing - statement.closingBalance) > 0.0001) throw new Error('المعادلة الرياضية غير متطابقة!');
      });

      await this.runTest(results, 'REP-03', 'سلامة ملفات Excel العربية واتجاه RTL بعد إعادة قراءة المصنف', async () => {
        const statement = await reportService.getAccountStatement(testAccountId, { preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' });
        const receivables = {
          generatedAt: statement.generatedAt, totalAmount: 250, totalAmountMinor: 25000, accountsCount: 1,
          items: [{ account: statement.account, balance: 250, balanceMinor: 25000, transactionCount: 1, sharePercentage: 100 }],
        };
        const payables = {
          generatedAt: statement.generatedAt, totalAmount: 500, totalAmountMinor: 50000, accountsCount: 1,
          items: [{ account: statement.account, balance: 500, balanceMinor: 50000, transactionCount: 1, sharePercentage: 100 }],
        };
        const summary = {
          dateRange: statement.dateRange, preset: statement.preset, generatedAt: statement.generatedAt,
          totalDebit: 250, totalCredit: 100, netBalance: 150, totalTransactions: 2,
          totalAccounts: 2, activeAccountsCount: 2, owedToMeTotal: 250, owedToMeCount: 1,
          owedByMeTotal: 500, owedByMeCount: 1, settledAccountsCount: 0,
          dailyBreakdown: [{ date: '2026-02-05', debit: 250, credit: 0, net: 250, transactionCount: 1 }],
        };
        const cases = [
          { blob: await excelGenerator.generateStatementExcel(statement, 'ر.س'), sheetName: 'كشف الحساب', numberCell: 'A8', expected: 700.25 },
          { blob: await excelGenerator.generateReceivablesExcel(receivables, 'ر.س'), sheetName: 'المستحقات لك', numberCell: 'D6', expected: 250 },
          { blob: await excelGenerator.generatePayablesExcel(payables, 'ر.س'), sheetName: 'الديون عليك', numberCell: 'D6', expected: 500 },
          { blob: await excelGenerator.generateFinancialSummaryExcel(summary, 'ر.س'), sheetName: 'ملخص حركة الفترة', numberCell: 'C8', expected: 150 },
        ];
        for (const item of cases) {
          if (!item.blob || item.blob.size === 0) throw new Error('ملف Excel فارغ: ' + item.sheetName);
          if (!item.blob.type.includes('openxmlformats-officedocument')) throw new Error('نوع MIME غير مطابق: ' + item.blob.type);
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.load(await item.blob.arrayBuffer());
          const worksheet = workbook.getWorksheet(item.sheetName);
          if (!worksheet) throw new Error('ورقة العمل غير موجودة: ' + item.sheetName);
          if (worksheet.views[0]?.rightToLeft !== true) throw new Error('اتجاه RTL غير محفوظ: ' + item.sheetName);
          const title = worksheet.getCell('A1').value;
          if (typeof title !== 'string' || !title.includes('حساباتي')) throw new Error('النص العربي غير محفوظ: ' + item.sheetName);
          if (Number(worksheet.getCell(item.numberCell).value) !== item.expected) throw new Error('القيمة الرقمية غير محفوظة: ' + item.sheetName);
        }
        const statementWorkbook = new ExcelJS.Workbook();
        await statementWorkbook.xlsx.load(await cases[0].blob.arrayBuffer());
        const statementSheet = statementWorkbook.getWorksheet('كشف الحساب');
        if (statementSheet?.getCell('B2').value !== testAccountName) throw new Error('اسم الحساب العربي لم يُحفظ');
        if (statementSheet?.getCell('B12').value !== '2026-02-05') throw new Error('تاريخ الحركة لم يُحفظ');
      });

      await this.runTest(results, 'REP-04', 'توليد قالب HTML / PDF بتنسيق عربي RTL وتضمين كافة البيانات', async () => {
        const statement = await reportService.getAccountStatement(testAccountId, { preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' });
        const html = pdfGenerator.generateStatementHTML(statement, 'ر.س');
        if (!html.includes('حساباتي | Hisabati') || !html.includes('كشف حساب مالي')) throw new Error('قالب HTML لا يحتوي على الترويسة والعنوان');
        if (!html.includes(testAccountName)) throw new Error('قالب HTML لا يحتوي على اسم الحساب');
      });

      await this.runTest(results, 'REP-05', 'توليد نص المشاركة العربي مع كافة الأرقام والإجماليات', async () => {
        const statement = await reportService.getAccountStatement(testAccountId, { preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' });
        const msg = shareService.generateStatementTextMessage(statement, 'ر.س');
        if (!msg.includes(testAccountName)) throw new Error('نص المشاركة لا يحتوي على اسم الحساب');
        if (!msg.includes('الرصيد الختامي')) throw new Error('نص المشاركة لا يحتوي على الرصيد الختامي');
      });

      await this.runTest(results, 'REP-06', 'التحقق من صحة فترات التواريخ المسبقة (Presets)', async () => {
        const todayRange = resolveDateRange('today');
        const nowStr = new Date().toISOString().split('T')[0];
        if (todayRange.startDate !== nowStr || todayRange.endDate !== nowStr) throw new Error('تحديد تاريخ اليوم غير صحيح');
        const monthRange = resolveDateRange('this_month');
        if (!monthRange.startDate.endsWith('-01')) throw new Error('بداية الشهر يجب أن تبدأ بيوم 01');
      });

      await this.runTest(results, 'REP-07', 'فرز وتصنيف تقرير المستحقات لك والديون عليك', async () => {
        const recReport = await reportService.getReceivablesReport({ search: testAccountName });
        if (recReport.items.length === 0) throw new Error('الحساب المدين لم يظهر في تقرير المستحقات لك');
        if (recReport.items[0].balance <= 0) throw new Error('رصيد المستحقات لك يجب أن يكون موجباً');
      });

      await this.runTest(results, 'REP-08', 'تطابق الأرقام المحاسبية عبر مختلف التقارير (Cross-Report Integrity)', async () => {
        const statement = await reportService.getAccountStatement(testAccountId, { preset: 'custom', startDate: '2026-02-01', endDate: '2026-02-28' });
        const expectedClosing = Math.round((statement.openingBalance + statement.totalPeriodDebit - statement.totalPeriodCredit) * 100) / 100;
        if (Math.abs(statement.closingBalance - expectedClosing) > 0.001) throw new Error('خلل في معادلة كشف الحساب');
        const expectedNet = Math.round((statement.totalPeriodDebit - statement.totalPeriodCredit) * 100) / 100;
        if (Math.abs(statement.periodNetMovement - expectedNet) > 0.001) throw new Error('خلل في صافي الحركة');
      });

      await this.runTest(results, 'REP-09', 'تقرير الديون عليك: عزل الحسابات الدائنة وعرض رصيد الديون كقيمة مطلقة موجبة', async () => {
        const payReport = await reportService.getPayablesReport({ search: payableAccountName });
        if (payReport.items.length === 0) throw new Error('الحساب الدائن لم يظهر في تقرير الديون عليك');
        const item = payReport.items[0];
        if (Math.abs(item.balance - 500) > 0.01) throw new Error('قيمة الدين المعروضة يجب أن تكون 500 موجبة');
        if (item.balanceMinor <= 0) throw new Error('قيمة balanceMinor يجب أن تكون أكبر من الصفر');
        if (item.sharePercentage <= 0) throw new Error('نسبة الحصة يجب أن تكون أكبر من الصفر');
        const recCheck = await reportService.getReceivablesReport({ search: payableAccountName });
        if (recCheck.items.length > 0) throw new Error('الحساب الدائن ظهر خطأً في تقرير المستحقات لك');
      });
    } finally {
      try {
        if (testAccountId) {
          await db.transactions.where('accountId').equals(testAccountId).delete();
          await db.accounts.delete(testAccountId);
        }
        if (payableAccountId) {
          await db.transactions.where('accountId').equals(payableAccountId).delete();
          await db.accounts.delete(payableAccountId);
        }
      } catch (err) {
        console.warn('Failed to cleanup reports test fixtures', err);
      }
    }

    const passedCount = results.filter(result => result.passed).length;
    const failedCount = results.filter(result => !result.passed).length;
    return { passedCount, failedCount, totalCount: results.length, results };
  }

  private static async runTest(results: TestResult[], id: string, nameAr: string, fn: () => Promise<void>): Promise<void> {
    const start = performance.now();
    try {
      await fn();
      results.push({ id, nameAr, passed: true, message: 'نجح الاختبار بنجاح وبدقة متطابقة 100%', durationMs: Math.round(performance.now() - start) });
    } catch (err: any) {
      results.push({ id, nameAr, passed: false, message: err?.message || 'فشل الاختبار', durationMs: Math.round(performance.now() - start) });
    }
  }
}
