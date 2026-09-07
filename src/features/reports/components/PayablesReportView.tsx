import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FileSpreadsheet,
  ArrowUpRight,
  Phone,
  CheckCircle2,
  X,
  RotateCcw,
  AlertCircle,
  FileText,
  Filter,
} from 'lucide-react';
import { useSettingsStore } from '@/shared/stores';
import { reportService, excelGenerator } from '@/core/services';
import { PayablesReport } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';

export const PayablesReportView: React.FC = () => {
  const navigate = useNavigate();
  const currency = useSettingsStore((state) => state.settings.currency);

  const [search, setSearch] = useState('');
  const [minBalance, setMinBalance] = useState<number>(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [report, setReport] = useState<PayablesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const loadReport = useCallback(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    reportService
      .getPayablesReport({
        search,
        minBalance,
        includeArchived,
      })
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load payables report:', err);
        if (isMounted) {
          setError('تعذر تحميل تقرير الالتزامات والديون. يرجى إعادة المحاولة.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [search, minBalance, includeArchived]);

  useEffect(() => {
    const cleanup = loadReport();
    return cleanup;
  }, [loadReport]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleResetFilters = () => {
    setSearch('');
    setMinBalance(0);
    setIncludeArchived(false);
  };

  const hasActiveFilters = Boolean(search.trim() || minBalance > 0 || includeArchived);

  const handleExportExcel = async () => {
    if (!report || exporting) return;
    try {
      setExporting(true);
      const blob = await excelGenerator.generatePayablesExcel(report, currency);
      const filename = `تقرير_الديون_عليك_${new Date().toISOString().split('T')[0]}.xlsx`;
      excelGenerator.downloadBlob(blob, filename);
      showToast('تم تصدير تقرير الديون والالتزامات بصيغة Excel');
    } catch (err) {
      console.error('Export failed:', err);
      showToast('حدث خطأ أثناء تصدير الملف');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 sm:p-5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Search */}
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="w-full text-xs font-semibold ps-9 pe-8 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="مسح البحث"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Min Balance */}
          <div className="sm:col-span-4">
            <input
              type="number"
              value={minBalance === 0 ? '' : minBalance}
              onChange={(e) => setMinBalance(Math.max(0, Number(e.target.value) || 0))}
              placeholder="الحد الأدنى لمبلغ الدين..."
              className="w-full text-xs font-semibold px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>

          {/* Include Archived toggle & Clear */}
          <div className="sm:col-span-3 flex items-center justify-between sm:justify-end gap-3">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300 select-none py-1">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700"
              />
              <span>تضمين المؤرشف</span>
            </label>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] font-bold text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 transition py-1 px-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                title="إعادة ضبط الفلاتر"
              >
                <RotateCcw className="w-3 h-3" />
                <span>إعادة ضبط</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="py-16 text-center text-xs font-bold text-slate-400 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800">
          جاري إعداد وتحليل تقرير الالتزامات...
        </div>
      ) : error ? (
        /* Error State */
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-rose-200 dark:border-rose-900/50 space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{error}</p>
          <button
            type="button"
            onClick={loadReport}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition hover:opacity-90 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      ) : !report ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800">
          لا توجد بيانات متاحة
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Banner & Excel Export */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                  إجمالي الديون والالتزامات عليك للآخرين ({report.accountsCount} حساب)
                </span>
                {hasActiveFilters && report.overallAccountsCount !== undefined && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300">
                    من أصل {report.overallAccountsCount} حساب
                  </span>
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-700 dark:text-rose-300 tabular-nums font-mono">
                -{formatCurrency(report.totalAmount, currency)}
              </div>
              {hasActiveFilters && report.overallTotalAmount !== undefined && report.overallTotalAmount !== report.totalAmount && (
                <div className="text-[11px] font-semibold text-rose-600/90 dark:text-rose-400/90 mt-1">
                  إجمالي كل الالتزامات: -{formatCurrency(report.overallTotalAmount, currency)}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || report.items.length === 0}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-xs font-bold transition flex items-center justify-center gap-2 self-stretch sm:self-auto shadow-xs select-none"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{exporting ? 'جاري التصدير...' : 'تصدير التقرير (Excel .xlsx)'}</span>
            </button>
          </div>

          {/* Empty State when items array is empty */}
          {report.items.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                {hasActiveFilters ? <Filter className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {hasActiveFilters
                    ? 'لم يتم العثور على حسابات دائنة مطابقة للمعايير'
                    : 'لا توجد ديون أو التزامات مالية عليك حالياً'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {hasActiveFilters
                    ? 'جرّب تعديل عبارة البحث أو تقليل الحد الأدنى للرصيد.'
                    : 'جميع الحسابات متوازنة أو ليس عليك أي ديون مسجلة في النظام.'}
                </p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition"
                >
                  مسح الفلاتر
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card List (sm:hidden) */}
              <div className="sm:hidden space-y-2.5">
                {report.items.map((item, idx) => (
                  <div
                    key={item.account.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5"
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {item.account.name}
                        </span>
                        {item.account.archived && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded shrink-0">
                            مؤرشف
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/reports?tab=statement&accountId=${item.account.id}`)}
                        className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-teal-600 transition shrink-0"
                        title="عرض كشف الحساب"
                        aria-label={`عرض كشف حساب ${item.account.name}`}
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Financial Magnitude & Share */}
                    <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-base font-black font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                        -{formatCurrency(item.balance, currency)}
                      </div>
                      <span className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-full">
                        الحصة: {item.sharePercentage}%
                      </span>
                    </div>

                    {/* Share Mini Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(2, item.sharePercentage))}%` }}
                      />
                    </div>

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                      <span className="font-medium">
                        {item.transactionCount} حركة مسجلة
                      </span>
                      {item.account.phone ? (
                        <span className="font-mono flex items-center gap-1 text-slate-600 dark:text-slate-400" dir="ltr">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {item.account.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400">بدون هاتف</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (hidden sm:block) */}
              <div className="hidden sm:block rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                        <th className="py-3.5 px-3 text-center w-12">#</th>
                        <th className="py-3.5 px-4">اسم الحساب</th>
                        <th className="py-3.5 px-4">رقم الهاتف</th>
                        <th className="py-3.5 px-4 text-rose-600 dark:text-rose-400">المبلغ المطلوب منك</th>
                        <th className="py-3.5 px-4 text-center">نسبة الحصة %</th>
                        <th className="py-3.5 px-4 text-center">العمليات</th>
                        <th className="py-3.5 px-4 text-center">كشف الحساب</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {report.items.map((item, idx) => (
                        <tr key={item.account.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => navigate(`/accounts/${item.account.id}`)}
                              className="font-bold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 transition text-right"
                            >
                              {item.account.name}
                            </button>
                            {item.account.archived && (
                              <span className="ms-2 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                مؤرشف
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500" dir="ltr">
                            {item.account.phone || '—'}
                          </td>
                          <td className="py-3 px-4 font-extrabold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                            -{formatCurrency(item.balance, currency)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex flex-col items-center gap-1 w-20">
                              <span className="font-bold font-mono text-slate-700 dark:text-slate-300">
                                {item.sharePercentage}%
                              </span>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-rose-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(2, item.sharePercentage))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold font-mono text-slate-500">
                            {item.transactionCount}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => navigate(`/reports?tab=statement&accountId=${item.account.id}`)}
                              className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="عرض كشف الحساب"
                              aria-label={`كشف حساب ${item.account.name}`}
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
