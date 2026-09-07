import React from 'react';
import { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/core/utils/formatters';
import { CurrencyCode } from '@/shared/types';

interface StatCardProps {
  id: string;
  title: string;
  subtitle?: string;
  amount?: number;
  count?: number;
  isCurrency?: boolean;
  currencyCode?: CurrencyCode;
  variant: 'emerald' | 'rose' | 'teal' | 'slate';
  icon: LucideIcon;
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  subtitle,
  amount,
  count,
  isCurrency = true,
  currencyCode = 'YER',
  variant,
  icon: Icon,
  onClick,
}) => {
  const variantStyles = {
    emerald: {
      cardBg: 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-emerald-500/40',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60',
      labelColor: 'text-slate-600 dark:text-slate-400',
      amountColor: 'text-emerald-600 dark:text-emerald-400',
    },
    rose: {
      cardBg: 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-rose-500/40',
      iconBg: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60',
      labelColor: 'text-slate-600 dark:text-slate-400',
      amountColor: 'text-rose-600 dark:text-rose-400',
    },
    teal: {
      cardBg: 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-teal-500/40',
      iconBg: 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 border border-teal-200/60 dark:border-teal-800/60',
      labelColor: 'text-slate-600 dark:text-slate-400',
      amountColor: 'text-teal-600 dark:text-teal-400',
    },
    slate: {
      cardBg: 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800 hover:border-slate-400/40',
      iconBg: 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700/60',
      labelColor: 'text-slate-600 dark:text-slate-400',
      amountColor: 'text-slate-900 dark:text-slate-100',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      id={id}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-3.5 sm:p-4 transition-all shadow-xs flex flex-col justify-between ${style.cardBg} ${
        onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-1.5 mb-2">
        <span className={`text-xs font-bold truncate ${style.labelColor}`}>
          {title}
        </span>
        <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${style.iconBg}`}>
          <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </div>
      </div>

      <div className="space-y-0.5 min-w-0">
        <div className={`text-base xs:text-lg sm:text-xl md:text-2xl font-black tracking-tight tabular-nums truncate leading-tight ${style.amountColor}`}>
          {isCurrency && amount !== undefined
            ? formatCurrency(amount, currencyCode as CurrencyCode)
            : count !== undefined
            ? count
            : 0}
        </div>
        {subtitle && (
          <p className="text-[10px] sm:text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
