import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Layers,
} from 'lucide-react';
import { CashFlowAnalysis, CashFlowInterval } from '@/shared/types/bi.types';
import { formatCurrency } from '@/core/utils/formatters';

interface CashFlowTrendViewProps {
  cashFlow: CashFlowAnalysis | null;
  currency: string;
  onIntervalChange: (interval: CashFlowInterval) => void;
  isLoading?: boolean;
}

export const CashFlowTrendView: React.FC<CashFlowTrendViewProps> = ({
  cashFlow,
  currency,
  onIntervalChange,
  isLoading = false,
}) => {
  if (!cashFlow) {
    return null;
  }

  const {
    interval,
    dataPoints,
    totalInflow,
    totalOutflow,
    netCashFlow,
    trend,
  } = cashFlow;

  const intervals: { id: CashFlowInterval; label: string }[] = [
    { id: 'daily', label: 'يومي' },
    { id: 'weekly', label: 'أسبوعي' },
    { id: 'monthly', label: 'شهري' },
  ];

  // Maximum values for proportional visual bar calculations
  const maxFlow = Math.max(
    ...dataPoints.map((p) => Math.max(p.inflow, p.outflow)),
    1
  );

  return (
    <div
      id="bi-cash-flow-trend-view"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors"
    >
      {/* Header and Interval Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>تحليل اتجاه التدفقات المالية (Cash Flow Velocity)</span>
            </h3>

            {/* Trend status pill */}
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                trend === 'upward'
                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  : trend === 'downward'
                  ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              {trend === 'upward' && <TrendingUp className="w-3.5 h-3.5" />}
              {trend === 'downward' && <TrendingDown className="w-3.5 h-3.5" />}
              {trend === 'stable' && <Minus className="w-3.5 h-3.5" />}
              <span>
                {trend === 'upward'
                  ? 'اتجاه صاعد'
                  : trend === 'downward'
                  ? 'اتجاه هابط'
                  : 'تدفق متوازن'}
              </span>
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تتبع حركة المقبوضات والمدفوعات وصافي التدفق النقدي والرصيد التراكمي عبر الفترات
          </p>
        </div>

        {/* Interval Selector Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 self-start sm:self-auto">
          {intervals.map((item) => (
            <button
              key={item.id}
              onClick={() => onIntervalChange(item.id)}
              disabled={isLoading}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition min-h-[36px] ${
                interval === item.id
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPI 3-column banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Inflow */}
        <div className="p-3.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
              إجمالي المقبوضات (Inflow)
            </span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-base sm:text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
            +{formatCurrency(totalInflow, currency)}
          </p>
          <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 block mt-0.5">
            تحصيلات ومقبوضات نقدية مسددة
          </span>
        </div>

        {/* Outflow */}
        <div className="p-3.5 rounded-xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-900/40">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-800 dark:text-rose-300">
              إجمالي المسحوبات (Outflow)
            </span>
            <ArrowUpRight className="w-4 h-4 text-rose-600" />
          </div>
          <p className="text-base sm:text-lg font-black text-rose-700 dark:text-rose-400 tabular-nums mt-1">
            -{formatCurrency(totalOutflow, currency)}
          </p>
          <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 block mt-0.5">
            ديون ومسحوبات جديدة مسجلة
          </span>
        </div>

        {/* Net Flow */}
        <div
          className={`p-3.5 rounded-xl border ${
            netCashFlow >= 0
              ? 'bg-teal-50/60 dark:bg-teal-950/30 border-teal-200/60 dark:border-teal-900/40'
              : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-900/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-bold ${
                netCashFlow >= 0
                  ? 'text-teal-800 dark:text-teal-300'
                  : 'text-amber-800 dark:text-amber-300'
              }`}
            >
              صافي التدفق (Net Flow)
            </span>
            <Calendar
              className={`w-4 h-4 ${
                netCashFlow >= 0 ? 'text-teal-600' : 'text-amber-600'
              }`}
            />
          </div>
          <p
            className={`text-base sm:text-lg font-black tabular-nums mt-1 ${
              netCashFlow >= 0
                ? 'text-teal-700 dark:text-teal-400'
                : 'text-amber-700 dark:text-amber-400'
            }`}
          >
            {netCashFlow >= 0 ? '+' : '-'}
            {formatCurrency(Math.abs(netCashFlow), currency)}
          </p>
          <span
            className={`text-[10px] block mt-0.5 ${
              netCashFlow >= 0
                ? 'text-teal-600/80 dark:text-teal-400/80'
                : 'text-amber-600/80 dark:text-amber-400/80'
            }`}
          >
            {netCashFlow >= 0 ? 'فائض نقد إيجابي للفترة' : 'عجز تدفق نقدي للفترة'}
          </span>
        </div>
      </div>

      {/* Periodic Flow Breakdown Table / Cards */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400">
          تطور التدفق والرصيد التراكمي حسب الفترات:
        </h4>

        {dataPoints.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500">
            لا توجد حركات مسجلة للفترة المحددة.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200/80 dark:border-slate-800">
                <tr>
                  <th className="p-3 text-start">الفترة</th>
                  <th className="p-3 text-start">المقبوضات (+)</th>
                  <th className="p-3 text-start">المسحوبات (-)</th>
                  <th className="p-3 text-start">صافي الفترة</th>
                  <th className="p-3 text-start">الرصيد التراكمي</th>
                  <th className="p-3 text-start">الحركات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {dataPoints.map((point) => (
                  <tr
                    key={point.period}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="p-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {point.periodLabelAr}
                    </td>

                    {/* Inflow */}
                    <td className="p-3 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                      +{formatCurrency(point.inflow, currency)}
                    </td>

                    {/* Outflow */}
                    <td className="p-3 font-semibold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                      -{formatCurrency(point.outflow, currency)}
                    </td>

                    {/* Net Flow */}
                    <td className="p-3 tabular-nums font-bold whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded ${
                          point.netFlow >= 0
                            ? 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-rose-100/70 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                        }`}
                      >
                        {point.netFlow >= 0 ? '+' : ''}
                        {formatCurrency(point.netFlow, currency)}
                      </span>
                    </td>

                    {/* Cumulative Balance */}
                    <td className="p-3 font-extrabold text-slate-800 dark:text-slate-200 tabular-nums whitespace-nowrap">
                      {formatCurrency(point.cumulativeBalance, currency)}
                    </td>

                    {/* Transaction Count */}
                    <td className="p-3 text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {point.transactionCount} عملية
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
