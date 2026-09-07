import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ChevronLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { FinancialHealthSummary, FinancialInsight } from '@/shared/types/bi.types';
import { CurrencyCode } from '@/shared/types';
import { formatCurrency } from '@/core/utils/formatters';

interface FinancialHealthCardProps {
  healthSummary: FinancialHealthSummary | null;
  proactiveInsight?: FinancialInsight | null;
  currency: CurrencyCode;
}

export const FinancialHealthCard: React.FC<FinancialHealthCardProps> = ({
  healthSummary,
  proactiveInsight,
  currency,
}) => {
  const navigate = useNavigate();

  const score = healthSummary?.healthScore ?? 85;
  const grade = healthSummary?.healthGrade ?? 'A';
  const statusText = healthSummary?.healthStatusAr || 'ممتاز — سيولة قوية وتحكم منتظم';

  const trendLabel =
    healthSummary?.cashFlowTrend === 'upward'
      ? 'صاعد'
      : healthSummary?.cashFlowTrend === 'downward'
      ? 'هابط'
      : 'مستقر';

  const TrendIcon =
    healthSummary?.cashFlowTrend === 'upward'
      ? TrendingUp
      : healthSummary?.cashFlowTrend === 'downward'
      ? TrendingDown
      : Minus;

  return (
    <div
      id="dashboard-financial-health-card"
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4 transition-all"
    >
      {/* Top Title & Link */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60 shrink-0">
            <Activity className="w-4 h-4" />
          </div>
          <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
            مؤشر الصحة المالية
          </h3>
        </div>

        <button
          onClick={() => navigate('/bi')}
          className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition"
        >
          <span>لوحة ذكاء الأعمال (BI)</span>
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Layout: Vertical on Mobile, Horizontal on Desktop */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
        {/* Score & Progress Visualization (Mobile full width, Desktop 5 cols) */}
        <div className="md:col-span-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                {score}
              </span>
              <span className="text-sm font-bold text-slate-400 dark:text-slate-500">
                / 100
              </span>
            </div>

            <span className="px-3 py-1 rounded-xl text-xs font-extrabold bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/70 dark:border-teal-800/70">
              الفئة {grade}
            </span>
          </div>

          {/* Progress Visualization Bar */}
          <div className="space-y-1.5">
            <div className="w-full h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-teal-600 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
              />
            </div>
            <p className="text-xs font-bold text-teal-700 dark:text-teal-400">
              {statusText}
            </p>
          </div>
        </div>

        {/* Vertical Divider for Desktop */}
        <div className="hidden md:block md:col-span-1 h-full min-h-[90px] w-px bg-slate-200/80 dark:bg-slate-800 mx-auto" />

        {/* Business Analysis Section (Mobile full width, Desktop 6 cols) */}
        <div className="md:col-span-6 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            تحليل الأعمال
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {/* الديون (لك) */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                الديون المستحقة
              </span>
              <span className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums truncate block">
                {formatCurrency(healthSummary?.totalReceivables ?? 0, currency)}
              </span>
            </div>

            {/* الالتزامات (عليك) */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                الالتزامات للغير
              </span>
              <span className="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums truncate block">
                {formatCurrency(healthSummary?.totalPayables ?? 0, currency)}
              </span>
            </div>

            {/* التدفقات النقدية */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                التدفقات النقدية
              </span>
              <span className="text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100 tabular-nums truncate block">
                {(healthSummary?.netPosition ?? 0) >= 0 ? '+' : ''}
                {formatCurrency(healthSummary?.netPosition ?? 0, currency)}
              </span>
            </div>

            {/* النمو والتحصيل */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                نسبة التحصيل
              </span>
              <span className="text-xs sm:text-sm font-black text-teal-600 dark:text-teal-400 tabular-nums block">
                {healthSummary?.collectionRate ?? 88}%
              </span>
            </div>

            {/* اتجاه السيولة */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 col-span-2 sm:col-span-1 flex flex-col justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-medium">
                اتجاه السيولة
              </span>
              <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <TrendIcon className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                <span>{trendLabel}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Proactive Intelligence Alert Banner if any */}
      {proactiveInsight && (
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                proactiveInsight.impact === 'CRITICAL'
                  ? 'bg-rose-500 animate-pulse'
                  : proactiveInsight.impact === 'WARNING'
                  ? 'bg-amber-500'
                  : 'bg-teal-500'
              }`}
            />
            <span className="font-bold text-slate-800 dark:text-slate-200 shrink-0">
              تنبيه استباقي:
            </span>
            <span className="text-slate-600 dark:text-slate-400 truncate">
              {proactiveInsight.titleAr}
            </span>
          </div>
          <div className="text-[11px] text-teal-700 dark:text-teal-400 font-bold self-start sm:self-auto shrink-0">
            {proactiveInsight.recommendationAr}
          </div>
        </div>
      )}
    </div>
  );
};
