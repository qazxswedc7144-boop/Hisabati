import React from 'react';
import { Clock, AlertTriangle, ShieldCheck, HelpCircle } from 'lucide-react';
import { FinancialHealthSummary, AgingBucketKey } from '@/shared/types/bi.types';
import { formatCurrency } from '@/core/utils/formatters';

interface DebtAgingChartProps {
  summary: FinancialHealthSummary;
  currency: string;
}

export const DebtAgingChart: React.FC<DebtAgingChartProps> = ({ summary, currency }) => {
  const { agingBreakdown, totalReceivables } = summary;

  const bucketsOrder: AgingBucketKey[] = ['0_30', '31_60', '61_90', '90_PLUS'];

  const bucketMetadata: Record<
    AgingBucketKey,
    {
      title: string;
      desc: string;
      barColor: string;
      badgeColor: string;
      textColor: string;
    }
  > = {
    '0_30': {
      title: '0 - 30 يوماً',
      desc: 'ديون جارية ضمن فترة السماح المعتادة',
      barColor: 'bg-emerald-500',
      badgeColor: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300',
      textColor: 'text-emerald-600 dark:text-emerald-400',
    },
    '31_60': {
      title: '31 - 60 يوماً',
      desc: 'متأخرات معتدلة تتطلب إرسال تذكير سداد',
      barColor: 'bg-sky-500',
      badgeColor: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300',
      textColor: 'text-sky-600 dark:text-sky-400',
    },
    '61_90': {
      title: '61 - 90 يوماً',
      desc: 'متأخرات متقدمة تتطلب متابعة تحصيل حثيثة',
      barColor: 'bg-amber-500',
      badgeColor: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300',
      textColor: 'text-amber-600 dark:text-amber-400',
    },
    '90_PLUS': {
      title: '+90 يوماً',
      desc: 'ديون حرجة وشديدة التعثر مهددة بالتوقف',
      barColor: 'bg-rose-500',
      badgeColor: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300',
      textColor: 'text-rose-600 dark:text-rose-400',
    },
  };

  const hasReceivables = totalReceivables > 0;

  return (
    <div
      id="bi-debt-aging-chart"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span>جدول أعمار الديون (Debt Aging Breakdown)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            توزيع المستحقات المالية بحسب فترة التأخر عن السداد باستخدام معيار FIFO الدقيق
          </p>
        </div>

        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg self-start sm:self-auto">
          إجمالي المستحقات: <strong className="text-slate-900 dark:text-slate-100 tabular-nums">{formatCurrency(totalReceivables, currency)}</strong>
        </div>
      </div>

      {/* Composite Stacked Horizontal Bar */}
      {hasReceivables ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
            <span>التوزيع النسبي للمستحقات</span>
            <span>100%</span>
          </div>

          <div className="w-full h-4 rounded-xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            {bucketsOrder.map((key) => {
              const b = agingBreakdown[key];
              if (!b || b.percentage <= 0) return null;
              const meta = bucketMetadata[key];

              return (
                <div
                  key={key}
                  className={`${meta.barColor} h-full transition-all duration-300 relative group`}
                  style={{ width: `${b.percentage}%` }}
                  title={`${meta.title}: ${b.percentage}% (${formatCurrency(b.amount, currency)})`}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500">
          لا توجد مستحقات قائمة على العملاء حالياً.
        </div>
      )}

      {/* Grid of 4 Bucket Detail Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {bucketsOrder.map((key) => {
          const b = agingBreakdown[key];
          const meta = bucketMetadata[key];
          const amount = b?.amount ?? 0;
          const percentage = b?.percentage ?? 0;
          const count = b?.accountCount ?? 0;

          return (
            <div
              key={key}
              id={`aging-bucket-${key}`}
              className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className={`px-2 py-0.5 rounded-md text-xs font-extrabold ${meta.badgeColor}`}>
                    {meta.title}
                  </span>
                  <span className="text-xs font-black text-slate-900 dark:text-slate-100 tabular-nums">
                    {percentage}%
                  </span>
                </div>

                <div className="mt-2.5">
                  <p className="text-lg font-black text-slate-900 dark:text-slate-100 tabular-nums">
                    {formatCurrency(amount, currency)}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {meta.desc}
                  </p>
                </div>
              </div>

              {/* Bucket specific progress and account count */}
              <div className="pt-2 border-t border-slate-200/50 dark:border-slate-800/80 space-y-1.5">
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${meta.barColor}`}
                    style={{ width: `${Math.min(100, percentage)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                  <span>عدد الحسابات المتأثرة:</span>
                  <strong className="text-slate-800 dark:text-slate-200 font-bold tabular-nums">
                    {count}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
