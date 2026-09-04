import React from 'react';
import { Activity, ShieldCheck, AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { FinancialHealthSummary } from '@/shared/types/bi.types';

interface HealthScoreCardProps {
  summary: FinancialHealthSummary;
}

export const HealthScoreCard: React.FC<HealthScoreCardProps> = ({ summary }) => {
  const { healthScore, healthGrade, healthStatusAr, collectionRate, overdueDebtRatio, cashFlowTrend } = summary;

  // Grade badge color schemes (strictly solid colors, no gradients)
  const gradeConfig = {
    A: {
      bg: 'bg-emerald-600',
      badgeBg: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      border: 'border-emerald-200 dark:border-emerald-800',
      barColor: 'bg-emerald-500',
      label: 'ممتاز',
      description: 'استقرار مالي عالٍ، معدل تحصيل قوي وتدفقات إيجابية مستقرة.',
    },
    B: {
      bg: 'bg-teal-600',
      badgeBg: 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border-teal-300 dark:border-teal-800',
      border: 'border-teal-200 dark:border-teal-800',
      barColor: 'bg-teal-500',
      label: 'جيد جداً',
      description: 'وضع مالي سليم مع حاجة لمتابعة تحصيل الديون ذات الفترات المتوسطة.',
    },
    C: {
      bg: 'bg-amber-600',
      badgeBg: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      border: 'border-amber-200 dark:border-amber-800',
      barColor: 'bg-amber-500',
      label: 'متوسط',
      description: 'مستوى متأخرات ملحوظ أو عجز تدفق نقدي يتطلب خطة تحصيل نشطة.',
    },
    D: {
      bg: 'bg-rose-600',
      badgeBg: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
      border: 'border-rose-200 dark:border-rose-800',
      barColor: 'bg-rose-500',
      label: 'بحاجة لتحسين فوري',
      description: 'ارتفاع حرج في نسبة الديون المتأخرة وضعف السيولة يتطلب تدخلاً عاجلاً.',
    },
  }[healthGrade];

  return (
    <div
      id="bi-health-score-card"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs transition-colors"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Left / Main info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                مؤشر الصحة المالية الشامل (Health Score)
              </span>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>{healthStatusAr}</span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-extrabold border ${gradeConfig.badgeBg}`}
                >
                  الفئة {healthGrade}
                </span>
              </h3>
            </div>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
            {gradeConfig.description}
          </p>
        </div>

        {/* Big Score Visual Badge */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 self-start md:self-auto shrink-0 min-w-[200px] justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
              الدرجة الكلية
            </span>
            <div className="flex items-baseline gap-1 mt-0.5">
              <span className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-slate-100 tabular-nums">
                {healthScore}
              </span>
              <span className="text-xs font-bold text-slate-400">/ 100</span>
            </div>
          </div>

          <div
            className={`w-13 h-13 rounded-2xl ${gradeConfig.bg} text-white flex items-center justify-center font-black text-2xl shadow-sm`}
          >
            {healthGrade}
          </div>
        </div>
      </div>

      {/* Progress Bar (Solid color) */}
      <div className="mt-5 space-y-1.5">
        <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
          <span>مستوى الأمان المالي</span>
          <span className="tabular-nums">{healthScore}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${gradeConfig.barColor}`}
            style={{ width: `${Math.min(100, Math.max(5, healthScore))}%` }}
          />
        </div>
      </div>

      {/* Sub KPI Mini Pills */}
      <div className="grid grid-cols-1 xs:grid-cols-3 gap-2.5 mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
        {/* Collection Rate */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
            نسبة التحصيل
          </span>
          <p className="text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums mt-0.5">
            {collectionRate}%
          </p>
        </div>

        {/* Overdue Debt Ratio */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
            نسبة الديون المتأخرة
          </span>
          <p
            className={`text-sm font-black tabular-nums mt-0.5 ${
              overdueDebtRatio > 35
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {overdueDebtRatio}%
          </p>
        </div>

        {/* Cash Flow Direction */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800">
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">
            اتجاه التدفق النقدي
          </span>
          <div className="flex items-center gap-1.5 mt-0.5">
            {cashFlowTrend === 'upward' && (
              <>
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                  صاعد (إيجابي)
                </span>
              </>
            )}
            {cashFlowTrend === 'downward' && (
              <>
                <TrendingDown className="w-4 h-4 text-rose-600" />
                <span className="text-xs font-bold text-rose-700 dark:text-rose-400">
                  هابط (سلبي)
                </span>
              </>
            )}
            {cashFlowTrend === 'stable' && (
              <>
                <Minus className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  مستقر ومتوازن
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
