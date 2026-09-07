import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Scale,
  Calendar,
  Users,
  CalendarDays,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
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

  // Account distribution percentages calculated deterministically without floating-point accumulation
  const totalAccountsCount = report && report.totalAccounts > 0 ? report.totalAccounts : 1;
  const owedToMePercent = report ? Math.round((report.owedToMeCount / totalAccountsCount) * 100) : 0;
  const owedByMePercent = report ? Math.round((report.owedByMeCount / totalAccountsCount) * 100) : 0;
  const settledPercent = report ? Math.max(0, 100 - owedToMePercent - owedByMePercent) : 0;

  return (
    <div className="space-y-5">
      {/* Date Filter Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-teal-600" />
            تحديد فترة النشاط والتقرير المالي
          </label>
          {report && (
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-full self-start sm:self-auto tabular-nums font-mono">
              الفترة: {formatDate(report.dateRange.startDate, 'short')} إلى {formatDate(report.dateRange.endDate, 'short')}
            </span>
          )}
        </div>
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
              <div className="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums font-mono">
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
              <div className="text-xl sm:text-2xl font-black text-rose-700 dark:text-rose-300 tabular-nums font-mono">
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
                className={`text-xl sm:text-2xl font-black tabular-nums font-mono ${
                  (report.netMinor !== undefined ? report.netMinor >= 0 : report.netBalance >= 0)
                    ? 'text-teal-600 dark:text-teal-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {formatCurrency(report.netBalance, currency)}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                {(report.netMinor !== undefined ? report.netMinor >= 0 : report.netBalance >= 0)
                  ? 'صافي تدفق إيجابي لصالحك'
                  : 'صافي التزام خلال الفترة'}
              </span>
            </div>
          </div>

          {/* Activity Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">حركات الفترة</span>
              <div className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums font-mono">
                {report.totalTransactions}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">الحسابات النشطة</span>
              <div className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums font-mono">
                {report.activeAccountsCount} من {report.totalAccounts}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">حسابات لك عندهم</span>
              <div className="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums font-mono">
                {report.owedToMeCount}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <span className="text-[11px] font-bold text-slate-500 block mb-1">حسابات عليك لهم</span>
              <div className="text-lg font-black text-rose-600 dark:text-rose-400 tabular-nums font-mono">
                {report.owedByMeCount}
              </div>
            </div>
          </div>

          {/* Account Distribution Section */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                توزيع أرصدة الحسابات الإجمالية القائمة
              </h4>
              <span className="text-[11px] text-slate-400 font-bold">
                إجمالي {report.totalAccounts} حساب
              </span>
            </div>

            {/* Distribution Visual Progress Bar (Solid Colors, RTL) */}
            {report.totalAccounts > 0 && (
              <div className="space-y-1.5">
                <div className="h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex flex-row-reverse">
                  <div
                    style={{ width: `${owedToMePercent}%` }}
                    className="h-full bg-emerald-500 transition-all duration-300"
                    title={`مستحقات لك: ${owedToMePercent}%`}
                  />
                  <div
                    style={{ width: `${owedByMePercent}%` }}
                    className="h-full bg-rose-500 transition-all duration-300"
                    title={`ديون عليك: ${owedByMePercent}%`}
                  />
                  <div
                    style={{ width: `${settledPercent}%` }}
                    className="h-full bg-slate-400 dark:bg-slate-600 transition-all duration-300"
                    title={`متكافئة: ${settledPercent}%`}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium px-0.5">
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    لك ({owedToMePercent}%)
                  </span>
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                    عليك ({owedByMePercent}%)
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                    متكافئة ({settledPercent}%)
                  </span>
                </div>
              </div>
            )}

            {/* Distribution 3-Card Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Owed To Me Total */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-600" />
                    مستحقات لك (المدينون)
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/50 px-2 py-0.5 rounded-full font-mono">
                    {report.owedToMeCount} حساب
                  </span>
                </div>
                <div className="text-lg font-black text-emerald-700 dark:text-emerald-300 tabular-nums font-mono mt-2">
                  +{formatCurrency(report.owedToMeTotal, currency)}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                  يشكلون {owedToMePercent}% من إجمالي الحسابات
                </span>
              </div>

              {/* Owed By Me Total */}
              <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-rose-800 dark:text-rose-300 flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-rose-600" />
                    التزامات عليك (الدائنون)
                  </span>
                  <span className="text-[11px] font-bold text-rose-600 bg-rose-100 dark:bg-rose-900/50 px-2 py-0.5 rounded-full font-mono">
                    {report.owedByMeCount} حساب
                  </span>
                </div>
                <div className="text-lg font-black text-rose-700 dark:text-rose-300 tabular-nums font-mono mt-2">
                  -{formatCurrency(report.owedByMeTotal, currency)}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                  يشكلون {owedByMePercent}% من إجمالي الحسابات
                </span>
              </div>

              {/* Settled Accounts */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                    حسابات متكافئة (صفرية)
                  </span>
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700 px-2 py-0.5 rounded-full font-mono">
                    {report.settledAccountsCount} حساب
                  </span>
                </div>
                <div className="text-lg font-black text-slate-700 dark:text-slate-300 tabular-nums font-mono mt-2">
                  {formatCurrency(0, currency)}
                </div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
                  حسابات رصيدها الحالي صفر ومتوازنة
                </span>
              </div>
            </div>
          </div>

          {/* Daily Breakdown Timeline */}
          <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-teal-600" />
                الحركة اليومية المفصلة خلال الفترة
              </h4>
              <span className="text-[11px] text-slate-400 font-bold">
                {report.dailyBreakdown.length} أيام نشطة
              </span>
            </div>

            {report.dailyBreakdown.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                لا توجد حركات مسجلة في التواريخ المحددة
              </div>
            ) : (
              <div>
                {/* Mobile View: Compact Timeline Cards (Zero Horizontal Overflow) */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800 sm:hidden">
                  {report.dailyBreakdown.map((day) => {
                    const isPositive = day.netMinor !== undefined ? day.netMinor > 0 : day.net > 0;
                    const isNegative = day.netMinor !== undefined ? day.netMinor < 0 : day.net < 0;
                    const hasDebit = day.debitMinor !== undefined ? day.debitMinor > 0 : day.debit > 0;
                    const hasCredit = day.creditMinor !== undefined ? day.creditMinor > 0 : day.credit > 0;

                    return (
                      <div key={day.date} className="p-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold font-mono text-slate-900 dark:text-slate-100">
                            {formatDate(day.date, 'short')}
                          </span>
                          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md font-mono">
                            {day.transactionCount} حركة
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                            <span className="text-[10px] text-slate-500 block mb-0.5">لك (+)</span>
                            <span className="font-mono font-bold text-emerald-600 tabular-nums">
                              {hasDebit ? `+${formatCurrency(day.debit, currency)}` : '—'}
                            </span>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl">
                            <span className="text-[10px] text-slate-500 block mb-0.5">عليك (-)</span>
                            <span className="font-mono font-bold text-rose-600 tabular-nums">
                              {hasCredit ? `-${formatCurrency(day.credit, currency)}` : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-1 border-t border-slate-50 dark:border-slate-800/60">
                          <span className="text-[11px] text-slate-500 font-medium">صافي اليوم:</span>
                          <span
                            className={`font-mono font-black tabular-nums text-xs ${
                              isPositive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : isNegative
                                ? 'text-rose-600 dark:text-rose-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {formatCurrency(day.net, currency)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop & Tablet View: Structured Financial Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                        <th className="py-3 px-4">التاريخ</th>
                        <th className="py-3 px-4 text-center">عدد العمليات</th>
                        <th className="py-3 px-4 text-emerald-600">لك (+)</th>
                        <th className="py-3 px-4 text-rose-600">عليك (-)</th>
                        <th className="py-3 px-4">صافي اليوم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {report.dailyBreakdown.map((day) => {
                        const isPositive = day.netMinor !== undefined ? day.netMinor > 0 : day.net > 0;
                        const isNegative = day.netMinor !== undefined ? day.netMinor < 0 : day.net < 0;
                        const hasDebit = day.debitMinor !== undefined ? day.debitMinor > 0 : day.debit > 0;
                        const hasCredit = day.creditMinor !== undefined ? day.creditMinor > 0 : day.credit > 0;

                        return (
                          <tr key={day.date} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                              {formatDate(day.date, 'short')}
                            </td>
                            <td className="py-2.5 px-4 text-center text-slate-500 font-mono font-bold">
                              {day.transactionCount}
                            </td>
                            <td className="py-2.5 px-4 font-bold font-mono text-emerald-600 tabular-nums">
                              {hasDebit ? `+${formatCurrency(day.debit, currency)}` : '—'}
                            </td>
                            <td className="py-2.5 px-4 font-bold font-mono text-rose-600 tabular-nums">
                              {hasCredit ? `-${formatCurrency(day.credit, currency)}` : '—'}
                            </td>
                            <td
                              className={`py-2.5 px-4 font-extrabold font-mono tabular-nums ${
                                isPositive
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : isNegative
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-500'
                              }`}
                            >
                              {formatCurrency(day.net, currency)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
