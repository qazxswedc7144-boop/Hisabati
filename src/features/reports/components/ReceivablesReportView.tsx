import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Search,
  FileSpreadsheet,
  ArrowUpRight,
  User,
  Phone,
  CheckCircle2,
} from 'lucide-react';
import { useSettingsStore } from '@/shared/stores';
import { reportService, excelGenerator } from '@/core/services';
import { ReceivablesReport } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';

export const ReceivablesReportView: React.FC = () => {
  const navigate = useNavigate();
  const currency = useSettingsStore((state) => state.settings.currency);

  const [search, setSearch] = useState('');
  const [minBalance, setMinBalance] = useState<number>(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [report, setReport] = useState<ReceivablesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    reportService
      .getReceivablesReport({
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
        console.error('Failed to load receivables report:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [search, minBalance, includeArchived]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleExportExcel = async () => {
    if (!report) return;
    const blob = await excelGenerator.generateReceivablesExcel(report, currency);
    const filename = `تقرير_المستحقات_لك_${new Date().toISOString().split('T')[0]}.xlsx`;
    excelGenerator.downloadBlob(blob, filename);
    showToast('تم تصدير تقرير المستحقات بصيغة Excel');
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold shadow-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          {toastMessage}
        </div>
      )}

      {/* Filter Bar */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف..."
              className="w-full text-xs font-semibold ps-9 pe-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Min Balance */}
          <div>
            <input
              type="number"
              value={minBalance === 0 ? '' : minBalance}
              onChange={(e) => setMinBalance(Math.max(0, Number(e.target.value) || 0))}
              placeholder="الحد الأدنى للمبلغ المستحق..."
              className="w-full text-xs font-semibold px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>

          {/* Include Archived toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500"
              />
              تضمين الحسابات المؤرشفة
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs font-bold text-slate-400">جاري إعداد تقرير المستحقات...</div>
      ) : !report ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl">
          لا توجد بيانات
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Banner & Excel Export */}
          <div className="p-4 sm:p-5 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div>
              <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 block mb-1">
                إجمالي الديون المستحقة لك على الآخرين ({report.accountsCount} حساب)
              </span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                +{formatCurrency(report.totalAmount, currency)}
              </div>
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition flex items-center justify-center gap-2 self-start sm:self-auto shadow-xs"
            >
              <FileSpreadsheet className="w-4 h-4" />
              تصدير التقرير (Excel .xlsx)
            </button>
          </div>

          {/* Receivables Table */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            {report.items.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                لا توجد حسابات مدينة مطابقة للمعايير المحددة
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                      <th className="py-3 px-3 text-center w-10">#</th>
                      <th className="py-3 px-3">اسم الحساب</th>
                      <th className="py-3 px-3">رقم الهاتف</th>
                      <th className="py-3 px-3 text-emerald-600">المبلغ المستحق لك</th>
                      <th className="py-3 px-3 text-center">نسبة الحصة %</th>
                      <th className="py-3 px-3 text-center">العمليات</th>
                      <th className="py-3 px-3 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {report.items.map((item, idx) => (
                      <tr key={item.account.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {item.account.name}
                          </span>
                          {item.account.archived && (
                            <span className="ms-2 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                              مؤرشف
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500" dir="ltr">
                          {item.account.phone || '—'}
                        </td>
                        <td className="py-2.5 px-3 font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                          +{formatCurrency(item.balance, currency)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-700 dark:text-slate-300">
                          {item.sharePercentage}%
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-500">
                          {item.transactionCount}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => navigate(`/accounts/${item.account.id}`)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                            title="عرض الحساب"
                          >
                            <ArrowUpRight className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
