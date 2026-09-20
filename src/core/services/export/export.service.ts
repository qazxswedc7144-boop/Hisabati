import * as XLSX from 'xlsx';
import type { Account, CurrencyCode } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';

export interface ExportOptions {
  currency: CurrencyCode;
  filterLabel: string;   // "الكل" | "لك عنده" | ...
  sortLabel: string;     // "الأحدث حركة" | ...
  appName?: string;      // "حساباتي"
}

export interface ExportResult {
  success: boolean;
  filename?: string;
  error?: string;
  method?: 'share' | 'download';
}

const CATEGORY_NAMES: Record<string, string> = {
  customer: 'عميل',
  supplier: 'مورد',
  personal: 'شخصي',
  other: 'أخرى',
};

export class AccountExportService {
  /**
   * Helper to trigger client-side download for a Blob
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
   * Exports accounts list to Excel (.xlsx) file
   */
  public async exportToExcel(accounts: Account[], options: ExportOptions): Promise<ExportResult> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const filename = `قائمة_الحسابات_${today}.xlsx`;

      // Financial totals
      let totalReceivables = 0; // لك عنده
      let totalPayables = 0;    // له عندك
      let totalNet = 0;

      for (const acc of accounts) {
        const bal = acc.currentBalance ?? 0;
        totalNet += bal;
        if (bal > 0) totalReceivables += bal;
        if (bal < 0) totalPayables += Math.abs(bal);
      }

      const wb = XLSX.utils.book_new();

      const data: (string | number)[][] = [
        [`${options.appName || 'حساباتي'} — تقرير قائمة الحسابات المالية`],
        ['تاريخ الاستخراج:', today, '', 'العملة:', options.currency],
        ['حالة التصفية:', options.filterLabel, '', 'ترتيب العرض:', options.sortLabel],
        ['إجمالي عدد الحسابات:', accounts.length],
        [],
        ['الملخص المالي العام للقائمة'],
        ['إجمالي المبالغ المستحقة (لك عنده)', 'إجمالي المبالغ المطلوبة (له عندك)', 'صافي المركز المالي'],
        [totalReceivables, totalPayables, totalNet],
        [],
        [
          'م',
          'اسم الحساب',
          'رقم الهاتف',
          'التصنيف',
          'حالة الرصيد',
          'الرصيد الحالي',
          'إجمالي لك (مدين)',
          'إجمالي عليك (دائن)',
          'عدد العمليات',
          'تاريخ آخر حركة',
          'الملاحظات',
        ],
      ];

      accounts.forEach((acc, idx) => {
        const bal = acc.currentBalance ?? 0;
        const status = bal > 0 ? 'لك عنده' : bal < 0 ? 'له عندك' : 'متعادل';
        const categoryLabel = acc.category ? CATEGORY_NAMES[acc.category] || acc.category : 'عام';
        const lastDate = acc.lastTransactionDate ? formatDate(acc.lastTransactionDate, 'short') : '—';

        data.push([
          idx + 1,
          acc.name,
          acc.phone || '—',
          categoryLabel,
          status,
          bal,
          acc.totalDebit ?? 0,
          acc.totalCredit ?? 0,
          acc.transactionCount ?? 0,
          lastDate,
          acc.note || '',
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(data);

      // Configure RTL and column widths
      (ws as any)['!views'] = [{ rightToLeft: true }];
      ws['!cols'] = [
        { wch: 6 },  // م
        { wch: 26 }, // اسم الحساب
        { wch: 16 }, // رقم الهاتف
        { wch: 12 }, // التصنيف
        { wch: 12 }, // حالة الرصيد
        { wch: 16 }, // الرصيد الحالي
        { wch: 16 }, // إجمالي لك
        { wch: 16 }, // إجمالي عليك
        { wch: 12 }, // عدد العمليات
        { wch: 16 }, // تاريخ آخر حركة
        { wch: 30 }, // ملاحظات
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'قائمة الحسابات');

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      // Attempt Web Share API if supported on mobile
      if (typeof navigator !== 'undefined' && navigator.canShare) {
        try {
          const file = new File([blob], filename, { type: blob.type });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `${options.appName || 'حساباتي'} - قائمة الحسابات`,
            });
            return { success: true, filename, method: 'share' };
          }
        } catch (shareErr: any) {
          if (shareErr?.name === 'AbortError') {
            return { success: true, filename, method: 'share' };
          }
          // fallback to download if share failed or cancelled with error
        }
      }

      this.downloadBlob(blob, filename);
      return { success: true, filename, method: 'download' };
    } catch (err: any) {
      console.error('[AccountExportService] exportToExcel failed:', err);
      return { success: false, error: err?.message || 'فشل تصدير ملف Excel' };
    }
  }

  /**
   * Generates a printable HTML string with A4 styling and Arabic RTL layout
   */
  public generateAccountsHTML(accounts: Account[], options: ExportOptions): string {
    const today = new Date().toISOString().split('T')[0];

    let totalReceivables = 0;
    let totalPayables = 0;
    let totalNet = 0;

    for (const acc of accounts) {
      const bal = acc.currentBalance ?? 0;
      totalNet += bal;
      if (bal > 0) totalReceivables += bal;
      if (bal < 0) totalPayables += Math.abs(bal);
    }

    const rowsHtml = accounts
      .map((acc, idx) => {
        const bal = acc.currentBalance ?? 0;
        const isPositive = bal > 0;
        const isNegative = bal < 0;
        const statusLabel = isPositive ? 'لك عنده' : isNegative ? 'له عندك' : 'متعادل';
        const categoryLabel = acc.category ? CATEGORY_NAMES[acc.category] || acc.category : 'عام';
        const lastDate = acc.lastTransactionDate ? formatDate(acc.lastTransactionDate, 'short') : '—';

        return `
          <tr class="${idx % 2 === 0 ? 'even' : 'odd'}">
            <td class="text-center font-mono">${idx + 1}</td>
            <td class="font-bold text-dark">${this.escapeHTML(acc.name)}</td>
            <td class="text-center font-mono text-muted">${this.escapeHTML(acc.phone || '—')}</td>
            <td class="text-center"><span class="badge badge-category">${this.escapeHTML(categoryLabel)}</span></td>
            <td class="text-center">
              <span class="badge ${isPositive ? 'badge-credit' : isNegative ? 'badge-debit' : 'badge-neutral'}">
                ${statusLabel}
              </span>
            </td>
            <td class="text-start font-mono font-bold ${isPositive ? 'text-emerald' : isNegative ? 'text-rose' : 'text-dark'}">
              ${formatCurrency(Math.abs(bal), options.currency)}
            </td>
            <td class="text-start font-mono text-emerald">${formatCurrency(acc.totalDebit ?? 0, options.currency)}</td>
            <td class="text-start font-mono text-rose">${formatCurrency(acc.totalCredit ?? 0, options.currency)}</td>
            <td class="text-center font-mono text-muted">${acc.transactionCount ?? 0}</td>
            <td class="text-center font-mono text-muted">${lastDate}</td>
          </tr>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>تقرير قائمة الحسابات — ${options.appName || 'حساباتي'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');

    @page {
      size: A4 landscape;
      margin: 12mm 10mm 15mm 10mm;
      @bottom-right {
        content: "${options.appName || 'حساباتي'} | Hisabati";
        font-size: 8pt;
        color: #64748b;
      }
      @bottom-left {
        content: "صفحة " counter(page) " من " counter(pages);
        font-size: 8pt;
        color: #64748b;
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Tajawal', 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif;
      direction: rtl;
      text-align: right;
      background: #ffffff;
      color: #0f172a;
      font-size: 11pt;
      line-height: 1.5;
      padding: 16px;
    }

    .report-container { max-width: 100%; margin: 0 auto; }

    .header-card {
      border: 1.5px solid #0f766e;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 16px;
      background: #f0fdfa;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .brand-title {
      font-size: 18pt;
      font-weight: 900;
      color: #0f766e;
      letter-spacing: -0.5px;
    }

    .report-subtitle {
      font-size: 11pt;
      font-weight: 700;
      color: #334155;
      margin-top: 2px;
    }

    .meta-list {
      display: flex;
      gap: 16px;
      font-size: 9.5pt;
      color: #475569;
    }

    .meta-item strong { color: #0f172a; }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }

    .summary-card {
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      background: #ffffff;
    }

    .summary-label {
      font-size: 8.5pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 13pt;
      font-weight: 800;
      font-family: 'IBM Plex Sans Arabic', monospace;
    }

    .table-container {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 20px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9.5pt;
    }

    thead {
      background: #0f766e;
      color: #ffffff;
    }

    th {
      padding: 9px 8px;
      font-weight: 700;
      text-align: right;
      border-bottom: 1px solid #0d9488;
      font-size: 9pt;
      white-space: nowrap;
    }

    td {
      padding: 8px 8px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    tr.even { background-color: #ffffff; }
    tr.odd { background-color: #f8fafc; }

    .text-center { text-align: center; }
    .text-start { text-align: right; }
    .font-mono { font-family: 'IBM Plex Sans Arabic', monospace; }
    .font-bold { font-weight: 700; }
    .text-emerald { color: #059669; }
    .text-rose { color: #e11d48; }
    .text-dark { color: #0f172a; }
    .text-muted { color: #64748b; }

    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 8pt;
      font-weight: 700;
      white-space: nowrap;
    }

    .badge-category { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
    .badge-credit { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .badge-debit { background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; }
    .badge-neutral { background: #f8fafc; color: #64748b; border: 1px solid #e2e8f0; }

    .footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid #e2e8f0;
      font-size: 8.5pt;
      color: #64748b;
    }

    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
      tr { page-break-inside: avoid; }
      thead { display: table-header-group; }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="header-card">
      <div>
        <h1 class="brand-title">${options.appName || 'حساباتي'}</h1>
        <p class="report-subtitle">تقرير قائمة الحسابات المالية العامة</p>
      </div>
      <div class="meta-list">
        <div class="meta-item">تاريخ الاستخراج: <strong>${today}</strong></div>
        <div class="meta-item">التصفية: <strong>${this.escapeHTML(options.filterLabel)}</strong></div>
        <div class="meta-item">الترتيب: <strong>${this.escapeHTML(options.sortLabel)}</strong></div>
        <div class="meta-item">العملة: <strong>${options.currency}</strong></div>
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-label">إجمالي الحسابات</div>
        <div class="summary-value text-dark">${accounts.length} حساب</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي لك عنده (مستحقات)</div>
        <div class="summary-value text-emerald">${formatCurrency(totalReceivables, options.currency)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">إجمالي له عندك (التزامات)</div>
        <div class="summary-value text-rose">${formatCurrency(totalPayables, options.currency)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">صافي المركز المالي</div>
        <div class="summary-value ${totalNet >= 0 ? 'text-emerald' : 'text-rose'}">
          ${formatCurrency(Math.abs(totalNet), options.currency)}
          <span style="font-size: 9pt; font-weight: 500;">(${totalNet >= 0 ? 'لك' : 'عليك'})</span>
        </div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th class="text-center" style="width: 35px;">م</th>
            <th>اسم الحساب</th>
            <th class="text-center" style="width: 100px;">رقم الهاتف</th>
            <th class="text-center" style="width: 75px;">التصنيف</th>
            <th class="text-center" style="width: 80px;">حالة الرصيد</th>
            <th class="text-start" style="width: 110px;">الرصيد الحالي</th>
            <th class="text-start" style="width: 100px;">إجمالي لك</th>
            <th class="text-start" style="width: 100px;">إجمالي عليك</th>
            <th class="text-center" style="width: 65px;">الحركات</th>
            <th class="text-center" style="width: 90px;">آخر حركة</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>

    <div class="footer-bar">
      <div>تم الاستخراج بواسطة نظام حساباتي لإدارة المعاملات المالية — تطبيق آمن ومحلي Offline-First</div>
      <div>عدد السجلات: ${accounts.length}</div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Triggers the native browser print / save to PDF dialog via hidden iframe
   */
  public async exportToPDF(accounts: Account[], options: ExportOptions): Promise<ExportResult> {
    try {
      const today = new Date().toISOString().split('T')[0];
      const filename = `قائمة_الحسابات_${today}.pdf`;
      const html = this.generateAccountsHTML(accounts, options);

      // Create an invisible iframe for isolated printing
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.visibility = 'hidden';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        throw new Error('تعذر الوصول إلى نافذة الطباعة');
      }

      doc.open();
      doc.write(html);
      doc.close();

      await new Promise<void>((resolve) => {
        iframe.onload = () => resolve();
        // Fallback timeout in case onload event was already triggered
        setTimeout(resolve, 350);
      });

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.error('[AccountExportService] iframe print failed:', e);
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1500);
        }
      }, 250);

      return { success: true, filename, method: 'download' };
    } catch (err: any) {
      console.error('[AccountExportService] exportToPDF failed:', err);
      return { success: false, error: err?.message || 'فشل طباعة / تصدير PDF' };
    }
  }

  private escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const accountExportService = new AccountExportService();
