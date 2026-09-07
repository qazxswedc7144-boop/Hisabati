import React, { useEffect } from 'react';
import {
  Activity,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  BarChart3,
  Clock,
  Layers,
} from 'lucide-react';
import { useBIStore, useSettingsStore } from '@/shared/stores';
import { HealthScoreCard } from '../components/HealthScoreCard';
import { BIKpiGrid } from '../components/BIKpiGrid';
import { DebtAgingChart } from '../components/DebtAgingChart';
import { CashFlowTrendView } from '../components/CashFlowTrendView';
import { FinancialRiskAlerts } from '../components/FinancialRiskAlerts';
import { FinancialInsightsList } from '../components/FinancialInsightsList';
import { CashFlowForecastView } from '../components/CashFlowForecastView';
import { formatDate } from '@/core/utils/formatters';

export const FinancialHealthDashboardPage: React.FC = () => {
  const {
    healthSummary,
    cashFlow,
    risks,
    insights,
    forecast,
    selectedInterval,
    isLoading,
    lastRefreshedAt,
    error,
    loadBIData,
    setInterval,
    refresh,
  } = useBIStore();

  const currency = useSettingsStore((state) => state.settings.currency);

  useEffect(() => {
    loadBIData();
  }, [loadBIData]);

  return (
    <div
      id="financial-health-bi-page"
      className="space-y-6 animate-in fade-in duration-200 pb-10"
    >
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <Activity className="w-5 h-5" />
            </div>
            <span>لوحة الصحة المالية وذكاء الأعمال (BI)</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            رؤى مالية متقدمة، مؤشر الأمان المالي، تفكيك أعمار الديون، ومراقبة التدفقات النقدية
          </p>
        </div>

        {/* Refresh button & status */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {lastRefreshedAt && (
            <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden md:inline">
              آخر تحديث: {formatDate(lastRefreshedAt, 'relative')}
            </span>
          )}

          <button
            id="btn-refresh-bi-data"
            onClick={() => refresh()}
            disabled={isLoading}
            aria-label="تحديث مؤشرات الصحة المالية"
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-xs active:scale-[0.98] transition min-h-[44px]"
          >
            <RefreshCw
              className={`w-4 h-4 text-teal-600 dark:text-teal-400 ${
                isLoading ? 'animate-spin' : ''
              }`}
            />
            <span>{isLoading ? 'جاري التحليل...' : 'تحديث التحليلات'}</span>
          </button>
        </div>
      </div>

      {/* Error state if any */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-xs text-rose-800 dark:text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Initial Loading Skeleton */}
      {isLoading && !healthSummary && (
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-28 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        </div>
      )}

      {/* Main Content */}
      {healthSummary && (
        <>
          {/* 1. Health Score Card */}
          <HealthScoreCard summary={healthSummary} />

          {/* 2. 5 KPI Cards Grid */}
          <BIKpiGrid summary={healthSummary} currency={currency} />

          {/* 3. Practical Arabic Financial Insights */}
          <FinancialInsightsList insights={insights} />

          {/* 4. Cash Flow Forecast (Statistical historical projection with disclaimer) */}
          <CashFlowForecastView forecast={forecast} currency={currency} />

          {/* 5. Debt Aging Breakdown */}
          <DebtAgingChart summary={healthSummary} currency={currency} />

          {/* 6. Cash Flow Trend Velocity */}
          <CashFlowTrendView
            cashFlow={cashFlow}
            currency={currency}
            onIntervalChange={(inv) => setInterval(inv)}
            isLoading={isLoading}
          />

          {/* 7. Financial Risk Radar */}
          <FinancialRiskAlerts risks={risks} />
        </>
      )}
    </div>
  );
};
