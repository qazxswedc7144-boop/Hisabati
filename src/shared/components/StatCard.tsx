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
      cardBg: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/80 dark:border-emerald-800/40',
      iconBg: 'bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400',
      textColor: 'text-emerald-700 dark:text-emerald-300',
      amountColor: 'text-emerald-800 dark:text-emerald-200',
    },
    rose: {
      cardBg: 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/40',
      iconBg: 'bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400',
      textColor: 'text-rose-700 dark:text-rose-300',
      amountColor: 'text-rose-800 dark:text-rose-200',
    },
    teal: {
      cardBg: 'bg-teal-50/70 dark:bg-teal-950/30 border-teal-200/80 dark:border-teal-800/40',
      iconBg: 'bg-teal-100 dark:bg-teal-900/60 text-teal-600 dark:text-teal-400',
      textColor: 'text-teal-700 dark:text-teal-300',
      amountColor: 'text-teal-800 dark:text-teal-200',
    },
    slate: {
      cardBg: 'bg-white dark:bg-slate-900/70 border-slate-200 dark:border-slate-800',
      iconBg: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
      textColor: 'text-slate-600 dark:text-slate-400',
      amountColor: 'text-slate-900 dark:text-slate-100',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      id={id}
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl border p-4 sm:p-5 transition-all shadow-sm ${style.cardBg} ${
        onClick ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`p-2.5 rounded-xl shrink-0 ${style.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="truncate">
            <h4 className={`text-xs sm:text-sm font-bold truncate ${style.textColor}`}>
              {title}
            </h4>
            {subtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-1">
        {isCurrency && amount !== undefined ? (
          <div className={`text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums ${style.amountColor}`}>
            {formatCurrency(amount, currencyCode as CurrencyCode)}
          </div>
        ) : count !== undefined ? (
          <div className={`text-xl sm:text-2xl font-extrabold tracking-tight tabular-nums ${style.amountColor}`}>
            {count}
          </div>
        ) : null}
      </div>
    </div>
  );
};
