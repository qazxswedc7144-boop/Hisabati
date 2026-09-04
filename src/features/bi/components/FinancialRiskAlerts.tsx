import React from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  Info,
  ShieldCheck,
  CheckCircle2,
  ChevronLeft,
  ArrowRight,
} from 'lucide-react';
import { FinancialRiskAlert, RiskSeverity } from '@/shared/types/bi.types';
import { useNavigate } from 'react-router-dom';

interface FinancialRiskAlertsProps {
  risks: FinancialRiskAlert[];
}

export const FinancialRiskAlerts: React.FC<FinancialRiskAlertsProps> = ({ risks }) => {
  const navigate = useNavigate();

  // Sort risks by severity: CRITICAL > HIGH > MEDIUM > LOW
  const severityRank: Record<RiskSeverity, number> = {
    CRITICAL: 4,
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
  };

  const sortedRisks = [...risks].sort(
    (a, b) => severityRank[b.severity] - severityRank[a.severity]
  );

  const getSeverityStyle = (severity: RiskSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return {
          badge: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800',
          cardBorder: 'border-rose-300 dark:border-rose-800/80',
          barColor: 'bg-rose-500',
          label: 'خطورة حرجة',
          icon: AlertOctagon,
          iconColor: 'text-rose-600 dark:text-rose-400',
          bg: 'bg-rose-50/40 dark:bg-rose-950/20',
        };
      case 'HIGH':
        return {
          badge: 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800',
          cardBorder: 'border-amber-300 dark:border-amber-800/80',
          barColor: 'bg-amber-500',
          label: 'خطورة مرتفعة',
          icon: AlertTriangle,
          iconColor: 'text-amber-600 dark:text-amber-400',
          bg: 'bg-amber-50/40 dark:bg-amber-950/20',
        };
      case 'MEDIUM':
        return {
          badge: 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-800',
          cardBorder: 'border-sky-300 dark:border-sky-800/80',
          barColor: 'bg-sky-500',
          label: 'تنبيه متوسط',
          icon: Info,
          iconColor: 'text-sky-600 dark:text-sky-400',
          bg: 'bg-sky-50/40 dark:bg-sky-950/20',
        };
      case 'LOW':
      default:
        return {
          badge: 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
          cardBorder: 'border-slate-200 dark:border-slate-800',
          barColor: 'bg-slate-400',
          label: 'تنبيه استرشادي',
          icon: Info,
          iconColor: 'text-slate-500',
          bg: 'bg-slate-50/60 dark:bg-slate-800/30',
        };
    }
  };

  return (
    <div
      id="bi-financial-risks-section"
      className="p-5 sm:p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-5 transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            <span>مراقبة المخاطر المالية والشذوذ (Financial Risk Radar)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            كشف آلي لمخاطر تركز الديون، عجز السيولة، والديون الراكدة مع توصيات استباقية
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {sortedRisks.length === 0
              ? 'لا توجد مخاطر'
              : `${sortedRisks.length} تنبيهات مرصودة`}
          </span>
        </div>
      </div>

      {sortedRisks.length === 0 ? (
        <div className="p-6 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-start">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <div>
            <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-200">
              المركز المالي آمن ومستقر
            </h4>
            <p className="text-xs text-emerald-700 dark:text-emerald-300/90 mt-0.5 leading-relaxed">
              لم يتم رصد أي مخاطر حرجة لتركز الديون أو ركود الحسابات أو عجز السيولة. تستمر الحسابات بالتدفق المعتاد.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedRisks.map((risk) => {
            const style = getSeverityStyle(risk.severity);
            const Icon = style.icon;

            return (
              <div
                key={risk.id}
                id={`risk-card-${risk.id}`}
                className={`p-4 rounded-xl border ${style.cardBorder} ${style.bg} transition space-y-3`}
              >
                {/* Header: severity and title */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className={`p-1.5 rounded-lg bg-white dark:bg-slate-900 ${style.iconColor} shrink-0 mt-0.5 shadow-xs`}>
                      <Icon className="w-4 h-4 stroke-[2.5]" />
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-slate-100">
                          {risk.titleAr}
                        </h4>
                        {risk.affectedAccountName && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                            الحساب: {risk.affectedAccountName}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {risk.descriptionAr}
                      </p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-md text-[11px] font-black border shrink-0 ${style.badge}`}>
                    {style.label}
                  </span>
                </div>

                {/* Recommendation box */}
                <div className="p-3 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200/60 dark:border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span className="font-bold">التوصية المقترحة:</span>
                    <span className="text-slate-600 dark:text-slate-400">
                      {risk.recommendationAr}
                    </span>
                  </div>

                  {risk.affectedAccountId && (
                    <button
                      onClick={() => navigate(`/accounts/${risk.affectedAccountId}`)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline shrink-0 self-end sm:self-auto min-h-[36px]"
                    >
                      <span>عرض الحساب</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
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
