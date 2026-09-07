import React from 'react';
import { ArrowUpRight, ArrowDownLeft, Scale, Percent, AlertCircle, Users } from 'lucide-react';
import { FinancialHealthSummary } from '@/shared/types/bi.types';
import { formatCurrency } from '@/core/utils/formatters';

interface BIKpiGridProps {
  summary: FinancialHealthSummary;
  currency: string;
}

export const BIKpiGrid: React.FC<BIKpiGridProps> = ({ summary, currency }) => {
  const {
    totalReceivables,
    totalPayables,
    netPosition,
    collectionRate,
    overdueDebtRatio,
    debtorCount,
    creditorCount,
    balancedCount,
  } = summary;

  const kpis = [
    {
      id: 'kpi-receivables',
      title: 'إجمالي المستحقات لك',
      amount: formatCurrency(totalReceivables, currency),
      subtitle: `${debtorCount} حسابات مدينة لك`,
      icon: ArrowUpRight,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60',
      borderAccent: 'border-s-4 border-s-emerald-500',
      tag: 'لك في السوق',
      tagColor: 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300',
    },
    {
      id: 'kpi-payables',
      title: 'إجمالي الديون عليك',
      amount: formatCurrency(totalPayables, currency),
      subtitle: `${creditorCount} حسابات دائنة عليك`,
      icon: ArrowDownLeft,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/60',
      borderAccent: 'border-s-4 border-s-rose-500',
      tag: 'عليك للآخرين',
      tagColor: 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300',
    },
    {
      id: 'kpi-net-position',
      title: 'صافي المركز المالي',
      amount: `${netPosition >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(netPosition), currency)}`,
      subtitle: netPosition >= 0 ? 'فائض مستحقات صافٍ' : 'عجز والتزامات تفوق المستحقات',
      icon: Scale,
      iconColor: netPosition >= 0 ? 'text-teal-600 dark:text-teal-400' : 'text-rose-600 dark:text-rose-400',
      iconBg: netPosition >= 0 ? 'bg-teal-50 dark:bg-teal-950/60' : 'bg-rose-50 dark:bg-rose-950/60',
      borderAccent: netPosition >= 0 ? 'border-s-4 border-s-teal-500' : 'border-s-4 border-s-rose-500',
      tag: netPosition >= 0 ? 'مركز إيجابي' : 'تنبيه عجز',
      tagColor: netPosition >= 0 ? 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300' : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300',
    },
    {
      id: 'kpi-collection-rate',
      title: 'نسبة التحصيل',
      amount: `${collectionRate}%`,
      subtitle: 'نسبة المبالغ المسددة من إجمالي القيود',
      icon: Percent,
      iconColor: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-50 dark:bg-sky-950/60',
      borderAccent: 'border-s-4 border-s-sky-500',
      tag: collectionRate >= 70 ? 'تحصيل جيد' : 'تحصيل بطيء',
      tagColor: collectionRate >= 70 ? 'bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300',
    },
    {
      id: 'kpi-overdue-ratio',
      title: 'نسبة الديون المتأخرة',
      amount: `${overdueDebtRatio}%`,
      subtitle: 'ديون تجاوز عمرها 30 يوماً',
      icon: AlertCircle,
      iconColor: overdueDebtRatio > 35 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400',
      iconBg: overdueDebtRatio > 35 ? 'bg-rose-50 dark:bg-rose-950/60' : 'bg-amber-50 dark:bg-amber-950/60',
      borderAccent: overdueDebtRatio > 35 ? 'border-s-4 border-s-rose-500' : 'border-s-4 border-s-amber-500',
      tag: overdueDebtRatio <= 25 ? 'متأخرات منخفضة' : overdueDebtRatio <= 40 ? 'انتباه' : 'حرجة',
      tagColor: overdueDebtRatio <= 25 ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300' : overdueDebtRatio <= 40 ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300' : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300',
    },
  ];

  return (
    <div className="space-y-3">
      {/* 5 KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
        {kpis.map((kpi) => (
          <div
            key={kpi.id}
            id={kpi.id}
            className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between transition-colors min-h-[140px] ${kpi.borderAccent}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block truncate">
                  {kpi.title}
                </span>
                <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 tabular-nums mt-1 truncate">
                  {kpi.amount}
                </p>
              </div>

              <div className={`w-9 h-9 rounded-xl ${kpi.iconBg} ${kpi.iconColor} flex items-center justify-center shrink-0`}>
                <kpi.icon className="w-5 h-5 stroke-[2.2]" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 text-[11px]">
              <span className="text-slate-500 dark:text-slate-400 truncate">
                {kpi.subtitle}
              </span>
              <span className={`px-1.5 py-0.5 rounded font-bold shrink-0 ${kpi.tagColor}`}>
                {kpi.tag}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Account Distribution summary strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="font-bold">توزيع دفتر الحسابات:</span>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>مدينون (لك): <strong className="text-slate-900 dark:text-slate-100">{debtorCount}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            <span>دائنون (عليك): <strong className="text-slate-900 dark:text-slate-100">{creditorCount}</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            <span>حسابات مصفّرة: <strong className="text-slate-900 dark:text-slate-100">{balancedCount}</strong></span>
          </span>
        </div>
      </div>
    </div>
  );
};
