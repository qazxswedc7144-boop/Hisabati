import * as XLSX from 'xlsx';
import { AccountStatementReport, ReceivablesReport, PayablesReport, FinancialSummaryReport } from '@/shared/types';
import { formatCurrency } from '../utils/formatters';

export class ExcelGeneratorService {
  /**
   * Helper to trigger client-side file download for a Blob
   */
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

  /**
   * Exports an Account Statement to a formatted .xlsx Excel workbook Blob
   */
  public async generateStatementExcel(
    statement: AccountStatementReport,
    currency: string = 'ر.س'
  ): Promise<Blob> {
    const wb = XLSX.utils.book_new();

    const data: any[][] = [
      ['حساباتي | Hisabati — كشف حساب مالي رسمي'],
      ['اسم الحساب:', statement.account.name, '', 'رقم الهاتف:', statement.account.phone || '—'],
      [
        'الفترة الزمنية:',
        `${statement.dateRange.startDate} إلى ${statement.dateRange.endDate}`,
        '',
        'تاريخ الاستخراج:',
        new Date().toISOString().split('T')[0],
      ],
      ['العملة:', currency, '', 'حالة الحساب:', statement.account.archived ? 'مؤرشف' : 'نشط'],
      [],
      ['الملخص المالي للفترة'],
      [
        'الرصيد الافتتاحي',
        'إجمالي لك (مدين +)',
        'إجمالي عليك (دائن -)',
        'صافي حركة الفترة',
        'الرصيد الختامي',
      ],
      [
        statement.openingBalance,
        statement.totalPeriodDebit,
        statement.totalPeriodCredit,
        statement.periodNetMovement,
        statement.closingBalance,
      ],
      [],
      ['تفاصيل المعاملات المالية خلال الفترة'],
      ['م', 'التاريخ', 'البيان والتفاصيل', 'رقم السند', 'لك (مدين +)', 'عليك (دائن -)', 'الرصيد بعدها'],
    ];

    statement.transactions.forEach((t, idx) => {
      data.push([
        idx + 1,
        t.date,
        t.note || 'عملية مالية',
        t.receiptNumber || '—',
        t.debitAmount > 0 ? t.debitAmount : '',
        t.creditAmount > 0 ? t.creditAmount : '',
        t.runningBalance,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws['!cols'] = [
      { wch: 6 },  // م
      { wch: 14 }, // التاريخ
      { wch: 32 }, // البيان
      { wch: 14 }, // رقم السند
      { wch: 16 }, // لك
      { wch: 16 }, // عليك
      { wch: 18 }, // الرصيد
    ];

    // Right-to-Left sheet view for Arabic Excel
    (ws as any)['!views'] = [{ RTL: true }];

    XLSX.utils.book_append_sheet(wb, ws, 'كشف الحساب');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Generates Receivables Excel (.xlsx)
   */
  public async generateReceivablesExcel(
    report: ReceivablesReport,
    currency: string = 'ر.س'
  ): Promise<Blob> {
    const wb = XLSX.utils.book_new();

    const data: any[][] = [
      ['حساباتي | Hisabati — تقرير المبالغ المستحقة لك (المدينون)'],
      ['إجمالي المستحقات لك:', report.totalAmount, 'العملة:', currency],
      ['عدد الحسابات المدنية:', report.accountsCount, 'تاريخ التقرير:', new Date().toISOString().split('T')[0]],
      [],
      ['م', 'اسم الحساب', 'رقم الهاتف', 'المبلغ المستحق لك', 'نسبة الحصة %', 'عدد العمليات'],
    ];

    report.items.forEach((item, idx) => {
      data.push([
        idx + 1,
        item.account.name,
        item.account.phone || '—',
        item.balance,
        `${item.sharePercentage}%`,
        item.transactionCount,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
    ];
    (ws as any)['!views'] = [{ RTL: true }];

    XLSX.utils.book_append_sheet(wb, ws, 'المستحقات لك');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Generates Payables Excel (.xlsx)
   */
  public async generatePayablesExcel(
    report: PayablesReport,
    currency: string = 'ر.س'
  ): Promise<Blob> {
    const wb = XLSX.utils.book_new();

    const data: any[][] = [
      ['حساباتي | Hisabati — تقرير المبالغ المستحقة عليك (الدائنون)'],
      ['إجمالي الديون والالتزامات عليك:', report.totalAmount, 'العملة:', currency],
      ['عدد الحسابات الدائنة:', report.accountsCount, 'تاريخ التقرير:', new Date().toISOString().split('T')[0]],
      [],
      ['م', 'اسم الحساب', 'رقم الهاتف', 'المبلغ المستحق عليك', 'نسبة الحصة %', 'عدد العمليات'],
    ];

    report.items.forEach((item, idx) => {
      data.push([
        idx + 1,
        item.account.name,
        item.account.phone || '—',
        item.balance,
        `${item.sharePercentage}%`,
        item.transactionCount,
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 16 },
      { wch: 18 },
      { wch: 14 },
      { wch: 14 },
    ];
    (ws as any)['!views'] = [{ RTL: true }];

    XLSX.utils.book_append_sheet(wb, ws, 'الديون عليك');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    return new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  /**
   * Exports raw statement data as CSV with proper UTF-8 BOM encoding for Excel compatibility
   */
  public exportStatementCSV(statement: AccountStatementReport, filename: string): void {
    const rows: string[] = [];
    rows.push('م,التاريخ,البيان,رقم السند,لك (مدين),عليك (دائن),الرصيد');

    statement.transactions.forEach((t, idx) => {
      const cleanNote = `"${(t.note || '').replace(/"/g, '""')}"`;
      rows.push(
        `${idx + 1},${t.date},${cleanNote},${t.receiptNumber || ''},${t.debitAmount || 0},${t.creditAmount || 0},${t.runningBalance}`
      );
    });

    // UTF-8 Byte Order Mark for Excel Arabic support
    const csvContent = '\uFEFF' + rows.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    this.downloadBlob(blob, filename);
  }
}

export const excelGenerator = new ExcelGeneratorService();
