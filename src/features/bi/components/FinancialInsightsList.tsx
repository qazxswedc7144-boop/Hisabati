import React from 'react';
import {
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ArrowUpRight,
  ShieldAlert,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FinancialInsight, FinancialInsightImpact } from '@/shared/types/bi.types';

interface FinancialInsightsListProps {
  insights: FinancialInsight[];
}

export const FinancialInsightsList: React.FC<FinancialInsightsListProps> = ({ insights }) => {
  const navigate = useNavigate();

  const getImpactBadge = (impact: FinancialInsightImpact) => {
    switch (impact) {
      case 'POSITIVE':
        return {
          label: 'مؤشر إيجابي',
          badgeClass:
            'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
          borderClass: 'border-emerald-200 dark:border-emerald-900/60',
          icon: CheckCircle2,
          iconColor: 'text-emerald-600 dark:text-emerald-400',
          bgClass: 'bg-emerald-50/30 dark:bg-emerald-950/20',
        };
      case 'CRITICAL':
        return {
          label: 'تنبيه حرج',
          badgeClass:
            'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
          borderClass: 'border-rose-200 dark:border-rose-900/60',
          icon: ShieldAlert,
          iconColor: 'text-rose-600 dark:text-rose-400',
          bgClass: 'bg-rose-50/30 dark:bg-rose-950/20',
        };
      case 'WARNING':
        return {
          label: 'تحذير متابعة',
          badgeClass:
            'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
          borderClass: 'border-amber-200 dark:border-amber-900/60',
          icon: AlertTriangle,
          iconColor: 'text-amber-600 dark:text-amber-400',
          bgClass: 'bg-amber-50/30 dark:bg-amber-950/20',
        };
      case 'NEUTRAL':
      default:
        return {
          label: 'رؤية استرشادية',
          badgeClass:
            'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
          borderClass: 'border-slate-200 dark:border-slate-800',
          icon: Info,
          iconColor: 'text-teal-600 dark:text-teal-400',
          bgClass: 'bg-slate-50/50 dark:bg-slate-800/20',
        };
    }
  };

  return (
    <div
      id="bi-financial-insights-section"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <span>الرؤى المالية الذكية والتوصيات العملية (Financial Insights)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            استنتاجات مبنية على القواعد الحتمية لحساباتك مع إرشادات قابلة للتنفيذ المباشر
          </p>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto text-xs font-bold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg">
          <span>عدد الرؤى المرصودة:</span>
          <strong className="text-slate-900 dark:text-slate-100 tabular-nums">
            {insights.length}
          </strong>
        </div>
      </div>

      {insights.length === 0 ? (
        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-500">
          لا توجد رؤى متاحة حالياً.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insights.map((item) => {
            const meta = getImpactBadge(item.impact);
            const Icon = meta.icon;

            return (
              <div
                key={item.id}
                id={`insight-card-${item.id}`}
                className={`p-4 rounded-xl border ${meta.borderClass} ${meta.bgClass} flex flex-col justify-between space-y-3 transition`}
              >
                <div>
                  {/* Badge & Impact Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={`p-1.5 rounded-lg bg-white dark:bg-slate-900 ${meta.iconColor} shadow-xs shrink-0`}
                      >
                        <Icon className="w-4 h-4 stroke-[2.5]" />
                      </div>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${meta.badgeClass}`}>
                        {meta.label}
                      </span>
                    </div>

                    {item.metricLabelAr && item.metricValueFormatted && (
                      <div className="text-start text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        <span className="text-slate-400 dark:text-slate-500 ms-1">
                          {item.metricLabelAr}:
                        </span>
                        <span className="tabular-nums font-black text-slate-900 dark:text-slate-100">
                          {item.metricValueFormatted}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Title & Description */}
                  <div className="mt-3">
                    <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                      {item.titleAr}
                    </h4>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                      {item.descriptionAr}
                    </p>
                  </div>
                </div>

                {/* Recommendation Box & Action */}
                <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 space-y-2">
                  <div className="text-xs text-slate-700 dark:text-slate-300 flex items-start gap-1.5">
                    <span className="font-extrabold text-teal-700 dark:text-teal-400 shrink-0">
                      التوصية:
                    </span>
                    <span className="leading-relaxed text-slate-600 dark:text-slate-400">
                      {item.recommendationAr}
                    </span>
                  </div>

                  {item.suggestedAction && item.suggestedAction.route && (
                    <button
                      onClick={() => navigate(item.suggestedAction!.route!)}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs transition min-h-[36px] active:scale-[0.99]"
                    >
                      <span>{item.suggestedAction.labelAr}</span>
                      <ChevronLeft className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
