import { AccountStatementReport, ReceivablesReport, PayablesReport } from '@/shared/types';
import { formatCurrency, formatDate } from '../utils/formatters';

export class PDFGeneratorService {
  /**
   * Generates a fully styled, self-contained Arabic RTL HTML document ready for printing or saving to PDF.
   */
  public generateStatementHTML(statement: AccountStatementReport, currency: string = 'ر.س'): string {
    const isClosingPositive = statement.closingBalance > 0;
    const isClosingNegative = statement.closingBalance < 0;

    const closingLabel = isClosingPositive
      ? 'لك عنده (مستحق)'
      : isClosingNegative
      ? 'له عندك (مطلوب)'
      : 'الحساب متكافئ (0.00)';

    const rowsHtml = statement.transactions
      .map((t, idx) => {
        const isDebit = t.debitAmount > 0;
        return `
        <tr class="table-row ${idx % 2 === 0 ? 'even' : 'odd'}">
          <td class="col-idx text-center">${idx + 1}</td>
          <td class="col-date text-center font-mono">${formatDate(t.date, 'short')}</td>
          <td class="col-note">
            <div class="note-text">${this.escapeHTML(t.note || 'عملية مالية')}</div>
            ${t.receiptNumber ? `<div class="receipt-tag">سند: ${this.escapeHTML(t.receiptNumber)}</div>` : ''}
          </td>
          <td class="col-debit text-start font-mono ${isDebit ? 'text-emerald font-bold' : 'text-muted'}">
            ${isDebit ? `+${formatCurrency(t.debitAmount, '')}` : '—'}
          </td>
          <td class="col-credit text-start font-mono ${!isDebit ? 'text-rose font-bold' : 'text-muted'}">
            ${!isDebit ? `-${formatCurrency(t.creditAmount, '')}` : '—'}
          </td>
          <td class="col-balance text-start font-mono font-bold ${
            t.runningBalance > 0 ? 'text-emerald' : t.runningBalance < 0 ? 'text-rose' : 'text-dark'
          }">
            ${formatCurrency(Math.abs(t.runningBalance), '')}
            <span class="sub-tag">${t.runningBalance > 0 ? 'لك' : t.runningBalance < 0 ? 'عليك' : ''}</span>
          </td>
        </tr>
      `;
      })
      .join('');

    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>كشف حساب — ${this.escapeHTML(statement.account.name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;600;700&display=swap');

    @page {
      size: A4 portrait;
      margin: 12mm 10mm 15mm 10mm;
      @bottom-right {
        content: "حساباتي | Hisabati";
        font-size: 9pt;
        color: #64748b;
        font-family: 'Tajawal', sans-serif;
      }
      @bottom-left {
        content: "صفحة " counter(page) " من " counter(pages);
        font-size: 9pt;
        color: #64748b;
        font-family: 'Tajawal', sans-serif;
      }
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      font-family: 'Tajawal', 'IBM Plex Sans Arabic', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      text-align: right;
      color: #0f172a;
      background: #ffffff;
      font-size: 10pt;
      line-height: 1.4;
      padding: 10px;
    }

    .report-container {
      width: 100%;
      max-width: 800px;
      margin: 0 auto;
    }

    /* Header styling */
    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 14px;
      border-bottom: 2px solid #0d9488;
      margin-bottom: 14px;
    }

    .brand-title {
      font-size: 18pt;
      font-weight: 900;
      color: #0d9488;
      letter-spacing: -0.5px;
    }

    .brand-subtitle {
      font-size: 9pt;
      color: #64748b;
      margin-top: 2px;
    }

    .doc-badge {
      text-align: left;
    }

    .doc-type {
      display: inline-block;
      background: #0f766e;
      color: #ffffff;
      font-weight: 800;
      font-size: 11pt;
      padding: 4px 12px;
      border-radius: 6px;
    }

    .doc-meta {
      font-size: 8.5pt;
      color: #64748b;
      margin-top: 4px;
    }

    /* Account & Period info grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 14px;
    }

    .info-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 10px 12px;
      background: #f8fafc;
    }

    .info-row {
      display: flex;
      margin-bottom: 4px;
      font-size: 9.5pt;
    }
    .info-row:last-child {
      margin-bottom: 0;
    }

    .info-label {
      font-weight: 700;
      color: #475569;
      width: 90px;
      flex-shrink: 0;
    }

    .info-value {
      font-weight: 600;
      color: #0f172a;
    }

    /* Summary cards */
    .summary-section {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      margin-bottom: 16px;
    }

    .summary-card {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 8px 10px;
      text-align: center;
      background: #ffffff;
    }

    .summary-card.highlight {
      background: #f0fdf4;
      border-color: #86efac;
    }
    .summary-card.highlight-neg {
      background: #fef2f2;
      border-color: #fca5a5;
    }

    .summary-title {
      font-size: 8pt;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 2px;
    }

    .summary-amount {
      font-size: 12pt;
      font-weight: 900;
      color: #0f172a;
    }

    .summary-amount.emerald { color: #059669; }
    .summary-amount.rose { color: #e11d48; }

    /* Statement Table */
    .statement-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
      page-break-inside: auto;
    }

    .statement-table thead {
      display: table-header-group;
    }

    .statement-table tr {
      page-break-inside: avoid;
      page-break-after: auto;
    }

    .statement-table th {
      background: #0f766e;
      color: #ffffff;
      font-weight: 800;
      font-size: 9pt;
      padding: 7px 8px;
      text-align: right;
      border: 1px solid #0f766e;
    }

    .statement-table th.text-center { text-align: center; }

    .statement-table td {
      padding: 6px 8px;
      font-size: 9pt;
      border: 1px solid #e2e8f0;
      vertical-align: middle;
    }

    .table-row.even { background: #f8fafc; }
    .table-row.odd { background: #ffffff; }

    .col-idx { width: 32px; color: #94a3b8; font-size: 8pt; }
    .col-date { width: 75px; color: #334155; }
    .col-note { width: auto; font-weight: 600; color: #1e293b; }
    .col-debit { width: 90px; }
    .col-credit { width: 90px; }
    .col-balance { width: 110px; }

    .note-text { line-height: 1.25; }
    .receipt-tag {
      display: inline-block;
      font-size: 7.5pt;
      background: #e2e8f0;
      color: #475569;
      padding: 1px 4px;
      border-radius: 4px;
      margin-top: 2px;
      font-weight: 600;
    }

    .sub-tag {
      font-size: 7pt;
      color: #64748b;
      font-weight: 600;
      margin-right: 2px;
    }

    .text-center { text-align: center; }
    .text-start { text-align: left; }
    .text-emerald { color: #059669; }
    .text-rose { color: #e11d48; }
    .text-dark { color: #0f172a; }
    .text-muted { color: #94a3b8; }
    .font-bold { font-weight: 700; }
    .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }

    /* Footer & signature section */
    .report-footer {
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 8pt;
      color: #64748b;
      page-break-inside: avoid;
    }

    .signature-boxes {
      display: flex;
      justify-content: space-between;
      margin-top: 25px;
      page-break-inside: avoid;
    }

    .sig-box {
      width: 45%;
      border-top: 1px dashed #94a3b8;
      padding-top: 6px;
      text-align: center;
      font-size: 8.5pt;
      color: #475569;
      font-weight: 700;
    }

    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="report-container">
    <!-- Header -->
    <div class="report-header">
      <div>
        <div class="brand-title">حساباتي | Hisabati</div>
        <div class="brand-subtitle">نظام الإدارة المالية والديون الدقيق</div>
      </div>
      <div class="doc-badge">
        <div class="doc-type">كشف حساب مالي</div>
        <div class="doc-meta">تاريخ التقرير: ${formatDate(new Date().toISOString(), 'full')}</div>
      </div>
    </div>

    <!-- Account and Period Info -->
    <div class="info-grid">
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">اسم الحساب:</span>
          <span class="info-value font-bold">${this.escapeHTML(statement.account.name)}</span>
        </div>
        ${
          statement.account.phone
            ? `<div class="info-row">
          <span class="info-label">رقم الهاتف:</span>
          <span class="info-value font-mono" dir="ltr">${this.escapeHTML(statement.account.phone)}</span>
        </div>`
            : ''
        }
        <div class="info-row">
          <span class="info-label">حالة الحساب:</span>
          <span class="info-value">${statement.account.archived ? 'مؤرشف' : 'نشط'}</span>
        </div>
      </div>

      <div class="info-card">
        <div class="info-row">
          <span class="info-label">فترة التقرير:</span>
          <span class="info-value font-mono">${statement.dateRange.startDate} ← ${statement.dateRange.endDate}</span>
        </div>
        <div class="info-row">
          <span class="info-label">العملة:</span>
          <span class="info-value font-bold">${currency}</span>
        </div>
        <div class="info-row">
          <span class="info-label">عدد الحركات:</span>
          <span class="info-value font-bold font-mono">${statement.transactionCount} عملية</span>
        </div>
      </div>
    </div>

    <!-- Summary Highlights -->
    <div class="summary-section">
      <div class="summary-card">
        <div class="summary-title">الرصيد الافتتاحي (قبل الفترة)</div>
        <div class="summary-amount font-mono ${statement.openingBalance > 0 ? 'emerald' : statement.openingBalance < 0 ? 'rose' : ''}">
          ${formatCurrency(Math.abs(statement.openingBalance), currency)}
          <span class="sub-tag">${statement.openingBalance > 0 ? '(لك)' : statement.openingBalance < 0 ? '(عليك)' : ''}</span>
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-title">إجمالي لك خلال الفترة</div>
        <div class="summary-amount emerald font-mono">
          +${formatCurrency(statement.totalPeriodDebit, currency)}
        </div>
      </div>

      <div class="summary-card">
        <div class="summary-title">إجمالي عليك خلال الفترة</div>
        <div class="summary-amount rose font-mono">
          -${formatCurrency(statement.totalPeriodCredit, currency)}
        </div>
      </div>

      <div class="summary-card ${isClosingPositive ? 'highlight' : isClosingNegative ? 'highlight-neg' : ''}">
        <div class="summary-title">الرصيد الختامي (${closingLabel})</div>
        <div class="summary-amount font-mono ${isClosingPositive ? 'emerald' : isClosingNegative ? 'rose' : ''}">
          ${formatCurrency(Math.abs(statement.closingBalance), currency)}
        </div>
      </div>
    </div>

    <!-- Statement Table -->
    ${
      statement.transactions.length === 0
        ? `<div style="padding: 24px; text-align: center; color: #64748b; border: 1px dashed #cbd5e1; border-radius: 8px; margin-bottom: 16px;">
            لا توجد معاملات مسجلة لهذا الحساب خلال الفترة المحددة
          </div>`
        : `<table class="statement-table">
          <thead>
            <tr>
              <th class="col-idx text-center">#</th>
              <th class="col-date text-center">التاريخ</th>
              <th class="col-note">البيان والتفاصيل</th>
              <th class="col-debit text-start">لك (مدين +)</th>
              <th class="col-credit text-start">عليك (دائن -)</th>
              <th class="col-balance text-start">الرصيد بعدها</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>`
    }

    <!-- Signatures -->
    <div class="signature-boxes">
      <div class="sig-box">توقيع ومصادقة صاحب الحساب</div>
      <div class="sig-box">توقيع المستلم / المحاسب</div>
    </div>

    <!-- Footer -->
    <div class="report-footer">
      <div>تم استخراج هذا الكشف آلياً بواسطة تطبيق <strong>حساباتي | Hisabati</strong></div>
      <div>${new Date().toLocaleTimeString('ar-SA')} — ${formatDate(new Date().toISOString(), 'short')}</div>
    </div>
  </div>
</body>
</html>`;
  }

  /**
   * Prints the generated HTML report directly using a temporary hidden print iframe.
   * This provides 100% fidelity, native AirPrint, and "Save to PDF" support.
   */
  public printStatement(statement: AccountStatementReport, currency: string = 'ر.س'): void {
    const html = this.generateStatementHTML(statement, currency);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) {
      throw new Error('فشل إنشاء إطار الطباعة');
    }

    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          document.body.removeChild(iframe);
        }, 1000);
      }, 300);
    };
  }

  /**
   * Converts HTML string to a downloadable HTML report file
   */
  public downloadStatementHTML(
    statement: AccountStatementReport,
    filename: string,
    currency: string = 'ر.س'
  ): void {
    const html = this.generateStatementHTML(statement, currency);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

export const pdfGenerator = new PDFGeneratorService();
