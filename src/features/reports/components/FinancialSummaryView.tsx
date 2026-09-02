import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Layers,
  Users,
  Activity,
  CalendarDays,
} from 'lucide-react';
import { useSettingsStore } from '@/shared/stores';
import { reportService } from '@/core/services';
import { FinancialSummaryReport, DatePreset, DateRange } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { DateRangePicker } from './DateRangePicker';
import { formatISODate } from '@/core/utils/dateRange';

export const FinancialSummaryView: React.FC = () => {
  const currency = useSettingsStore((state) => state.settings.currency);

  const [preset, setPreset] = useState<DatePreset>('this_month');
  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: formatISODate(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    endDate: formatISODate(new Date()),
  });
  const [report, setReport] = useState<FinancialSummaryReport | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    reportService
      .getFinancialSummary({
        preset,
        startDate: preset === 'custom' ? customRange.startDate : undefined,
        endDate: preset === 'custom' ? customRange.endDate : undefined,
      })
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load financial summary:', err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [preset, customRange]);

  return (
    <div className="space-y-5">
      {/* Date Filter Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-teal-600" />
          تحديد فترة النشاط والتقرير المالي
        </label>
        <DateRangePicker
          preset={preset}
          customRange={customRange}
          onPresetChange={setPreset}
          onCustomRangeChange={setCustomRange}
        />
      </div>

      {loading ? (
        <div className="p-12 text-center text-xs font-bold text-slate-400">جاري إعداد الملخص المالي...</div>
      ) : !report ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-3xl">
          لا توجد بيانات متاحة
        </div>
      ) : (
        <div className="space-y-5">
          {/* Period Financial KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Total Period Debit */}
            <div className="p-4 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  إجمالي حركات لك (مدين +)
                </span>
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums">
                +{formatCurrency(report.totalDebit, currency)}
              </div>
              <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-1 block">
                أموال قمت بإقراضها أو إعطائها خلال الفترة
              </span>
            </div>

            {/* Total Period Credit */}
            <div className="p-4 rounded-3xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/50 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
                  إجمالي حركات عليك (دائن -)
                </span>
                <TrendingDown className="w-5 h-5 text-rose-600" />
              </div>
              <div className="text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums">
                -{formatCurrency(report.totalCredit, currency)}
              </div>
              <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-1 block">
                أموال قمت باقتراضها أو استلامها خلال الفترة
              </span>
            </div>

            {/* Net Movement */}
            <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  صافي السيولة وحركة الفترة
                </span>
                <Scale className="w-5 h-5 text-teal-600" />
              </div>
              <div
                className={`text-xl sm:text-2xl font-black tabular-nums ${
                  report.netBalance >= 0
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {formatCurrency(report.netBalance, currency)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {report.netBalance >= 0 ? 'صافي تدفق إيجابي لصالحك' : 'صافي التزام خلال الفترة'}
              </span>
            </div>
          </div>

          {/* Activity Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">حركات الفترة</span>
              <div className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums">
                {report.totalTransactions}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">الحسابات النشطة</span>
              <div className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums">
                {report.activeAccountsCount} من {report.totalAccounts}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">حسابات لك عندهم</span>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                {report.owedToMeCount}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">حسابات عليك لهم</span>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums">
                {report.owedByMeCount}
              </div>
            </div>
          </div>

          {/* Daily Breakdown Timeline Table */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-teal-600" />
                الحركة اليومية المفصلة خلال الفترة
              </h4>
              <span className="text-[11px] text-slate-400">
                {report.dailyBreakdown.length} أيام نشطة
              </span>
            </div>

            {report.dailyBreakdown.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                لا توجد حركات مسجلة في التواريخ المحددة
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-right">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                      <th className="py-3 px-3">التاريخ</th>
                      <th className="py-3 px-3 text-center">عدد العمليات</th>
                      <th className="py-3 px-3 text-emerald-600">لك (+)</th>
                      <th className="py-3 px-3 text-rose-600">عليك (-)</th>
                      <th className="py-3 px-3">صافي اليوم</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                    {report.dailyBreakdown.map((day) => (
                      <tr key={day.date} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {formatDate(day.date, 'short')}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500 font-mono font-bold">
                          {day.transactionCount}
                        </td>
                        <td className="py-2.5 px-3 font-bold font-mono text-emerald-600 tabular-nums">
                          {day.debit > 0 ? `+${formatCurrency(day.debit, currency)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3 font-bold font-mono text-rose-600 tabular-nums">
                          {day.credit > 0 ? `-${formatCurrency(day.credit, currency)}` : '—'}
                        </td>
                        <td
                          className={`py-2.5 px-3 font-extrabold font-mono tabular-nums ${
                            day.net > 0
                              ? 'text-emerald-600'
                              : day.net < 0
                              ? 'text-rose-600'
                              : 'text-slate-500'
                          }`}
                        >
                          {formatCurrency(day.net, currency)}
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
