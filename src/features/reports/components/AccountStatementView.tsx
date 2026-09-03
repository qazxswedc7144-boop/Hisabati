import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Printer,
  FileSpreadsheet,
  Share2,
  MessageCircle,
  Search,
  User,
  Calendar,
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  CheckCircle2,
  Copy,
  Download,
  Receipt,
} from 'lucide-react';
import { useAccountStore, useSettingsStore } from '@/shared/stores';
import { reportService, excelGenerator, pdfGenerator, shareService } from '@/core/services';
import { Account, AccountStatementReport, DatePreset, DateRange } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { DateRangePicker } from './DateRangePicker';
import { formatISODate } from '@/core/utils/dateRange';
import { ReceiptDocumentModal } from '@/features/ocr';

interface AccountStatementViewProps {
  initialAccountId?: string;
}

export const AccountStatementView: React.FC<AccountStatementViewProps> = ({ initialAccountId }) => {
  const accounts = useAccountStore((state) => state.accounts);
  const currency = useSettingsStore((state) => state.settings.currency);

  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    initialAccountId || accounts[0]?.id || ''
  );
  const [accountSearch, setAccountSearch] = useState('');
  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: formatISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    endDate: formatISODate(new Date()),
  });
  const [transactionSearch, setTransactionSearch] = useState('');
  const [statement, setStatement] = useState<AccountStatementReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [selectedDocTrx, setSelectedDocTrx] = useState<any | null>(null);

  // Sync if initialAccountId changes or accounts load
  useEffect(() => {
    if (initialAccountId) {
      setSelectedAccountId(initialAccountId);
    } else if (!selectedAccountId && accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [initialAccountId, accounts]);

  // Load statement whenever account, preset, customRange or search changes
  useEffect(() => {
    if (!selectedAccountId) {
      setStatement(null);
      return;
    }

    let isMounted = true;
    setLoading(true);

    reportService
      .getAccountStatement(selectedAccountId, {
        preset,
        startDate: preset === 'custom' ? customRange.startDate : undefined,
        endDate: preset === 'custom' ? customRange.endDate : undefined,
        search: transactionSearch,
      })
      .then((data) => {
        if (isMounted) {
          setStatement(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load statement:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAccountId, preset, customRange, transactionSearch]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Filtered accounts for dropdown selection
  const filteredAccounts = useMemo(() => {
    if (!accountSearch.trim()) return accounts;
    const q = accountSearch.trim().toLowerCase();
    return accounts.filter((a) => a.name.toLowerCase().includes(q) || a.phone?.includes(q));
  }, [accounts, accountSearch]);

  // Actions
  const handlePrint = () => {
    if (!statement) return;
    pdfGenerator.printStatement(statement, currency);
  };

  const handleExportExcel = async () => {
    if (!statement) return;
    const blob = await excelGenerator.generateStatementExcel(statement, currency);
    const filename = `كشف_حساب_${statement.account.name.replace(/\s+/g, '_')}_${statement.dateRange.startDate}_${statement.dateRange.endDate}.xlsx`;
    excelGenerator.downloadBlob(blob, filename);
    showToast('تم تصدير ملف Excel بنجاح');
  };

  const handleExportCSV = () => {
    if (!statement) return;
    const filename = `كشف_حساب_${statement.account.name.replace(/\s+/g, '_')}.csv`;
    excelGenerator.exportStatementCSV(statement, filename);
    showToast('تم تصدير ملف CSV بنجاح');
  };

  const handleShareText = async () => {
    if (!statement) return;
    const msg = shareService.generateStatementTextMessage(statement, currency);
    const result = await shareService.shareText(`كشف حساب ${statement.account.name}`, msg);
    if (result.method === 'clipboard') {
      showToast('تم نسخ كشف الحساب إلى الحافظة بنجاح');
    }
  };

  const handleShareWhatsApp = () => {
    if (!statement) return;
    const msg = shareService.generateStatementTextMessage(statement, currency);
    shareService.shareToWhatsApp(msg, statement.account.phone);
  };

  return (
    <div className="space-y-5">
      {/* Toast message */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-3">
          <CheckCircle2 className="w-4 h-4 text-teal-400 dark:text-teal-600" />
          {toastMessage}
        </div>
      )}

      {/* Control Panel: Account & Date Range Selection */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Account Selector */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <User className="w-4 h-4 text-teal-600" />
            اختر الحساب لاستخراج الكشف
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full text-xs sm:text-sm font-bold px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {accounts.length === 0 && <option value="">لا توجد حسابات مسجلة</option>}
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.currentBalance > 0 ? `لك: ${formatCurrency(acc.currentBalance, currency)}` : acc.currentBalance < 0 ? `عليك: ${formatCurrency(Math.abs(acc.currentBalance), currency)}` : 'خالص'})
                </option>
              ))}
            </select>

            {/* In-Statement Search */}
            <div className="relative">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={transactionSearch}
                onChange={(e) => setTransactionSearch(e.target.value)}
                placeholder="بحث في الملاحظات أو السندات..."
                className="w-full text-xs font-semibold ps-9 pe-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Date Range Picker */}
        <div>
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-teal-600" />
            فترة الكشف
          </label>
          <DateRangePicker
            preset={preset}
            customRange={customRange}
            onPresetChange={setPreset}
            onCustomRangeChange={setCustomRange}
          />
        </div>
      </div>

      {/* Statement Preview Content */}
      {loading ? (
        <div className="p-12 text-center text-xs font-bold text-slate-400">جاري استخراج وتحضير كشف الحساب...</div>
      ) : !statement ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800">
          الرجاء اختيار حساب لعرض الكشف
        </div>
      ) : (
        <div className="space-y-4">
          {/* Action Buttons Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                الفترة: <strong className="text-slate-900 dark:text-slate-100">{statement.dateRange.startDate}</strong> إلى <strong className="text-slate-900 dark:text-slate-100">{statement.dateRange.endDate}</strong>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrint}
                className="px-3 py-1.5 rounded-xl bg-teal-600 text-white hover:bg-teal-700 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <Printer className="w-3.5 h-3.5" />
                طباعة / PDF
              </button>

              <button
                type="button"
                onClick={handleExportExcel}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Excel (.xlsx)
              </button>

              <button
                type="button"
                onClick={handleExportCSV}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition flex items-center gap-1"
                title="تصدير CSV"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>

              <button
                type="button"
                onClick={handleShareWhatsApp}
                className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white hover:bg-emerald-600 text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                واتساب
              </button>

              <button
                type="button"
                onClick={handleShareText}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold transition flex items-center gap-1"
                title="مشاركة / نسخ النص"
              >
                <Share2 className="w-3.5 h-3.5" />
                مشاركة
              </button>
            </div>
          </div>

          {/* Financial Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {/* Opening Balance */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">الرصيد الافتتاحي</span>
              <div
                className={`text-sm sm:text-base font-extrabold tabular-nums ${
                  statement.openingBalance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : statement.openingBalance < 0
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-700 dark:text-slate-300'
                }`}
              >
                {formatCurrency(Math.abs(statement.openingBalance), currency)}
                <span className="text-[10px] font-normal ms-1 text-slate-400">
                  {statement.openingBalance > 0 ? '(لك)' : statement.openingBalance < 0 ? '(عليك)' : ''}
                </span>
              </div>
            </div>

            {/* Period Debit (لك) */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
                إجمالي لك خلال الفترة (+)
              </span>
              <div className="text-sm sm:text-base font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums">
                +{formatCurrency(statement.totalPeriodDebit, currency)}
              </div>
            </div>

            {/* Period Credit (عليك) */}
            <div className="p-3.5 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/50">
              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block mb-1">
                إجمالي عليك خلال الفترة (-)
              </span>
              <div className="text-sm sm:text-base font-extrabold text-rose-700 dark:text-rose-300 tabular-nums">
                -{formatCurrency(statement.totalPeriodCredit, currency)}
              </div>
            </div>

            {/* Period Net Movement */}
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">صافي حركة الفترة</span>
              <div
                className={`text-sm sm:text-base font-extrabold tabular-nums ${
                  statement.periodNetMovement >= 0
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {formatCurrency(Math.abs(statement.periodNetMovement), currency)}
                <span className="text-[10px] font-normal ms-1 text-slate-400">
                  {statement.periodNetMovement >= 0 ? '(زيادة لك)' : '(نقصان)'}
                </span>
              </div>
            </div>

            {/* Closing Balance */}
            <div
              className={`col-span-2 lg:col-span-1 p-3.5 rounded-2xl border ${
                statement.closingBalance > 0
                  ? 'bg-emerald-100/50 dark:bg-emerald-950/50 border-emerald-300 dark:border-emerald-700'
                  : statement.closingBalance < 0
                  ? 'bg-rose-100/50 dark:bg-rose-950/50 border-rose-300 dark:border-rose-700'
                  : 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            >
              <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 block mb-1">
                الرصيد الختامي ({statement.closingBalance > 0 ? 'لك' : statement.closingBalance < 0 ? 'عليك' : 'متعادل'})
              </span>
              <div
                className={`text-base sm:text-lg font-black tabular-nums ${
                  statement.closingBalance > 0
                    ? 'text-emerald-800 dark:text-emerald-200'
                    : statement.closingBalance < 0
                    ? 'text-rose-800 dark:text-rose-200'
                    : 'text-slate-800 dark:text-slate-200'
                }`}
              >
                {formatCurrency(Math.abs(statement.closingBalance), currency)}
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-teal-600" />
                حركات الفترة ({statement.transactions.length} عملية)
              </h4>
              <span className="text-[11px] text-slate-400 font-semibold">مرتبة زمنياً</span>
            </div>

            {statement.transactions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                لا توجد معاملات مالية مسجلة خلال الفترة المحددة
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                      <th className="py-3 px-3 text-center w-10">#</th>
                      <th className="py-3 px-3">التاريخ</th>
                      <th className="py-3 px-3">البيان والتفاصيل</th>
                      <th className="py-3 px-3 text-emerald-600 dark:text-emerald-400">لك (مدين +)</th>
                      <th className="py-3 px-3 text-rose-600 dark:text-rose-400">عليك (دائن -)</th>
                      <th className="py-3 px-3">الرصيد بعدها</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {statement.transactions.map((t, idx) => {
                      const isDebit = t.debitAmount > 0;
                      return (
                        <tr
                          key={t.id}
                          className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                        >
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 font-mono whitespace-nowrap text-[11px]">
                            {formatDate(t.date, 'short')}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900 dark:text-slate-100">{t.note || 'عملية مالية'}</div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              {t.receiptNumber && (
                                <span className="inline-block text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">
                                  سند: {t.receiptNumber}
                                </span>
                              )}
                              {Boolean(t.receiptId || t.documentRef || t.documentMetadata) && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedDocTrx({
                                    ...t,
                                    accountId: statement.account.id,
                                    accountName: statement.account.name,
                                  })}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200/80 dark:border-teal-800 px-1.5 py-0.5 rounded transition"
                                  title="عرض المستند الأصلي والفاتورة"
                                >
                                  <Receipt className="w-3 h-3 text-teal-600" />
                                  <span>المستند</span>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {isDebit ? `+${formatCurrency(t.debitAmount, '')}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                            {!isDebit ? `-${formatCurrency(t.creditAmount, '')}` : '—'}
                          </td>
                          <td className="py-2.5 px-3 font-extrabold font-mono tabular-nums whitespace-nowrap">
                            <span
                              className={
                                t.runningBalance > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : t.runningBalance < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }
                            >
                              {formatCurrency(Math.abs(t.runningBalance), currency)}
                            </span>
                            <span className="text-[10px] ms-1 text-slate-400 font-normal">
                              {t.runningBalance > 0 ? 'لك' : t.runningBalance < 0 ? 'عليك' : ''}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Attached Receipt / Document Modal */}
      <ReceiptDocumentModal
        isOpen={!!selectedDocTrx}
        onClose={() => setSelectedDocTrx(null)}
        transaction={selectedDocTrx}
      />
    </div>
  );
};
