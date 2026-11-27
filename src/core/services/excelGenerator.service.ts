import ExcelJS from 'exceljs';
import { AccountStatementReport, ReceivablesReport, PayablesReport, FinancialSummaryReport } from '@/shared/types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export class ExcelGeneratorService {
  private async createWorkbookBlob(sheetName: string, rows: unknown[][], columnWidths: number[]): Promise<Blob> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName, { views: [{ rightToLeft: true }] });
    worksheet.addRows(rows);
    columnWidths.forEach((width, index) => { worksheet.getColumn(index + 1).width = width; });
    const buffer = await workbook.xlsx.writeBuffer();
    const bytes = new Uint8Array(buffer);
    return new Blob([bytes.buffer as ArrayBuffer], { type: XLSX_MIME });
  }

  public downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public async generateStatementExcel(statement: AccountStatementReport, currency: string = 'ر.س'): Promise<Blob> {
    const data: unknown[][] = [
      ['حساباتي | Hisabati — كشف حساب مالي رسمي'],
      ['اسم الحساب:', statement.account.name, '', 'رقم الهاتف:', statement.account.phone || '—'],
      ['الفترة الزمنية:', statement.dateRange.startDate + ' إلى ' + statement.dateRange.endDate, '', 'تاريخ الاستخراج:', new Date().toISOString().split('T')[0]],
      ['العملة:', currency, '', 'حالة الحساب:', statement.account.archived ? 'مؤرشف' : 'نشط'],
      [],
      ['الملخص المالي للفترة'],
      ['الرصيد الافتتاحي', 'إجمالي لك (مدين +)', 'إجمالي عليك (دائن -)', 'صافي حركة الفترة', 'الرصيد الختامي'],
      [statement.openingBalance, statement.totalPeriodDebit, statement.totalPeriodCredit, statement.periodNetMovement, statement.closingBalance],
      [],
      ['تفاصيل المعاملات المالية خلال الفترة'],
      ['م', 'التاريخ', 'البيان والتفاصيل', 'رقم السند', 'لك (مدين +)', 'عليك (دائن -)', 'الرصيد بعدها'],
    ];
    statement.transactions.forEach((transaction, index) => {
      data.push([
        index + 1, transaction.date, transaction.note || 'عملية مالية', transaction.receiptNumber || '—',
        transaction.debitAmount > 0 ? transaction.debitAmount : '',
        transaction.creditAmount > 0 ? transaction.creditAmount : '',
        transaction.runningBalance,
      ]);
    });
    return this.createWorkbookBlob('كشف الحساب', data, [6, 14, 32, 14, 16, 16, 18]);
  }

  public async generateReceivablesExcel(report: ReceivablesReport, currency: string = 'ر.س'): Promise<Blob> {
    const data: unknown[][] = [
      ['حساباتي | Hisabati — تقرير المبالغ المستحقة لك (المدينون)'],
      ['إجمالي المستحقات لك:', report.totalAmount, 'العملة:', currency],
      ['عدد الحسابات المدنية:', report.accountsCount, 'تاريخ التقرير:', new Date().toISOString().split('T')[0]],
      [],
      ['م', 'اسم الحساب', 'رقم الهاتف', 'المبلغ المستحق لك', 'نسبة الحصة %', 'عدد العمليات'],
    ];
    report.items.forEach((item, index) => data.push([
      index + 1, item.account.name, item.account.phone || '—', item.balance,
      item.sharePercentage + '%', item.transactionCount,
    ]));
    return this.createWorkbookBlob('المستحقات لك', data, [6, 28, 16, 18, 14, 14]);
  }

  public async generatePayablesExcel(report: PayablesReport, currency: string = 'ر.س'): Promise<Blob> {
    const data: unknown[][] = [
      ['حساباتي | Hisabati — تقرير المبالغ المستحقة عليك (الدائنون)'],
      ['إجمالي الديون والالتزامات عليك:', report.totalAmount, 'العملة:', currency],
      ['عدد الحسابات الدائنة:', report.accountsCount, 'تاريخ التقرير:', new Date().toISOString().split('T')[0]],
      [],
      ['م', 'اسم الحساب', 'رقم الهاتف', 'المبلغ المستحق عليك', 'نسبة الحصة %', 'عدد العمليات'],
    ];
    report.items.forEach((item, index) => data.push([
      index + 1, item.account.name, item.account.phone || '—', item.balance,
      item.sharePercentage + '%', item.transactionCount,
    ]));
    return this.createWorkbookBlob('الديون عليك', data, [6, 28, 16, 18, 14, 14]);
  }

  public async generateFinancialSummaryExcel(report: FinancialSummaryReport, currency: string = 'ر.س'): Promise<Blob> {
    const data: unknown[][] = [
      ['حساباتي | Hisabati — تقرير ملخص حركة الفترة المالي'],
      ['الفترة الزمنية:', report.dateRange.startDate + ' إلى ' + report.dateRange.endDate],
      ['تاريخ الاستخراج:', new Date().toISOString().split('T')[0]],
      ['العملة:', currency],
      [],
      ['ملخص الحركة المالية القائمة'],
      ['إجمالي لك (مدين +)', 'إجمالي عليك (دائن -)', 'صافي الحركة'],
      [report.totalDebit, report.totalCredit, report.netBalance],
      [],
      ['إحصائيات الحسابات'],
      ['إجمالي الحسابات', 'حسابات لك عندهم', 'حسابات عليك لهم', 'حسابات متكافئة'],
      [report.totalAccounts, report.owedToMeCount, report.owedByMeCount, report.settledAccountsCount],
      [],
      ['الحركة اليومية المفصلة خلال الفترة'],
      ['التاريخ', 'عدد العمليات', 'لك (+)', 'عليك (-)', 'صافي اليوم'],
    ];
    report.dailyBreakdown.forEach(day => data.push([day.date, day.transactionCount, day.debit, day.credit, day.net]));
    return this.createWorkbookBlob('ملخص حركة الفترة', data, [14, 14, 18, 18, 18]);
  }

  public exportStatementCSV(statement: AccountStatementReport, filename: string): void {
    const rows: string[] = ['م,التاريخ,البيان,رقم السند,لك (مدين),عليك (دائن),الرصيد'];
    statement.transactions.forEach((transaction, index) => {
      const cleanNote = '"' + (transaction.note || '').replace(/"/g, '""') + '"';
      rows.push(
        (index + 1) + ',' + transaction.date + ',' + cleanNote + ',' + (transaction.receiptNumber || '') + ',' +
        (transaction.debitAmount || 0) + ',' + (transaction.creditAmount || 0) + ',' + transaction.runningBalance
      );
    });
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, filename);
  }
}

export const excelGenerator = new ExcelGeneratorService();
