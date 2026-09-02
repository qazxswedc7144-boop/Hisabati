import React from 'react';
import { getBalanceStatusDetails } from '@/core/utils/formatters';

interface BalanceBadgeProps {
  balance: number;
  showAmount?: boolean;
  size?: 'sm' | 'md' | 'lg';
  id?: string;
}

export const BalanceBadge: React.FC<BalanceBadgeProps> = ({
  balance,
  size = 'md',
  id,
}) => {
  const details = getBalanceStatusDetails(balance);

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs font-semibold rounded-md',
    md: 'px-2.5 py-1 text-xs font-bold rounded-lg',
    lg: 'px-3 py-1.5 text-sm font-bold rounded-xl',
  };

  return (
    <span
      id={id}
      className={`inline-flex items-center gap-1 whitespace-nowrap transition-colors ${details.badgeBg} ${sizeClasses[size]}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${
          details.status === 'owed_to_me'
            ? 'bg-emerald-500'
            : details.status === 'owed_by_me'
            ? 'bg-rose-500'
            : 'bg-slate-400'
        }`}
      />
      {details.label}
    </span>
  );
};
