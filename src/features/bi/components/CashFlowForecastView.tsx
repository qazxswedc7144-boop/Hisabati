import React from 'react';
import {
  Compass,
  AlertCircle,
  TrendingUp,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  Layers,
} from 'lucide-react';
import { CashFlowForecast } from '@/shared/types/bi.types';
import { formatCurrency } from '@/core/utils/formatters';

interface CashFlowForecastViewProps {
  forecast: CashFlowForecast | null;
  currency: string;
}

export const CashFlowForecastView: React.FC<CashFlowForecastViewProps> = ({
  forecast,
  currency,
}) => {
  if (!forecast || forecast.periods.length === 0) {
    return (
      <div
        id="bi-cashflow-forecast-empty"
        className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2"
      >
        <Compass className="w-8 h-8 text-teal-600 mx-auto" />
        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
          توقعات التدفق النقدي الاسترشادية
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          يتطلب التوقع تسجيل حركات مالية ومقبوضات كافية في قاعدة البيانات لحساب المتوسطات الإحصائية لحركة السيولة.
        </p>
      </div>
    );
  }

  const {
    disclaimerAr,
    periods,
    totalProjectedInflow,
    totalProjectedOutflow,
    totalProjectedNet,
    assumptionsAr,
    historicalPeriodsAnalyzed,
  } = forecast;

  return (
    <div
      id="bi-cashflow-forecast-section"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Compass className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span>توقع التدفق النقدي الاسترشادي (Cash Flow Forecast)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            نمذجة إحصائية مبنية حصرياً على المتوسطات التاريخية للحركات المسجلة محلياً
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-bold px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            مبني على آخر {historicalPeriodsAnalyzed} فترات سابقة
          </span>
        </div>
      </div>

      {/* Mandatory Statutory Disclaimer Banner */}
      <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-900/60 flex items-start gap-3 text-xs text-amber-900 dark:text-amber-200">
        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="font-black text-amber-900 dark:text-amber-100">
            تنويه قانوني ومحاسبي إلزامي (Forecast Disclaimer)
          </h5>
          <p className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
            {disclaimerAr}
          </p>
        </div>
      </div>

      {/* 3 Period Forecast Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {periods.map((p) => {
          const isNetPositive = p.projectedNetFlow >= 0;

          return (
            <div
              key={p.periodIndex}
              id={`forecast-card-period-${p.periodIndex}`}
              className="p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-4 flex flex-col justify-between"
            >
              <div>
                {/* Card Title & Confidence Score */}
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/60 dark:border-slate-800">
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {p.periodLabelAr}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-900">
                    ثقة إحصائية {p.confidenceScore}%
                  </span>
                </div>

                {/* Inflow / Outflow Projections */}
                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                      <span>المقبوضات المتوقعة:</span>
                    </span>
                    <strong className="text-emerald-600 dark:text-emerald-400 font-black tabular-nums">
                      +{formatCurrency(p.projectedInflow, currency)}
                    </strong>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                      <span>المسحوبات المتوقعة:</span>
                    </span>
                    <strong className="text-rose-600 dark:text-rose-400 font-black tabular-nums">
                      -{formatCurrency(p.projectedOutflow, currency)}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Bottom: Net flow & Projected Cumulative Balance */}
              <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600 dark:text-slate-400">
                    صافي التدفق المقدر:
                  </span>
                  <span
                    className={`font-black tabular-nums ${
                      isNetPositive
                        ? 'text-teal-700 dark:text-teal-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    {isNetPositive ? '+' : ''}
                    {formatCurrency(p.projectedNetFlow, currency)}
                  </span>
                </div>

                <div className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 text-xs flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    الرصيد التراكمي المقدر:
                  </span>
                  <strong className="text-slate-900 dark:text-slate-100 font-black tabular-nums">
                    {formatCurrency(p.projectedCumulativeBalance, currency)}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Assumptions & Methodology Notes */}
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs space-y-2">
        <h5 className="font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>الفرضيات والمعايير الحسابية المعتمدة في التوقع:</span>
        </h5>
        <ul className="space-y-1 text-slate-600 dark:text-slate-400 list-disc list-inside pe-2">
          {assumptionsAr.map((assumption, idx) => (
            <li key={idx} className="leading-relaxed">
              {assumption}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
