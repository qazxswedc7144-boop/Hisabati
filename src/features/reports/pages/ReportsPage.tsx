import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  FileText,
  Activity,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import {
  AccountStatementView,
  FinancialSummaryView,
  ReceivablesReportView,
  PayablesReportView,
} from '../components';

type ReportTab = 'statement' | 'summary' | 'receivables' | 'payables';

export const ReportsPage: React.FC = () => {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentTab = (searchParams.get('tab') as ReportTab) || 'statement';
  const targetAccountId = searchParams.get('accountId') || undefined;

  const handleTabChange = (tab: ReportTab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tab);
    if (tab !== 'statement') {
      params.delete('accountId');
    }
    setSearchParams(params);
  };

  return (
    <div id="reports-page" className="space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-teal-600" />
          {t('reports.title')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          كشوفات الحسابات، الملخص المالي لحركة الفترة، وتقارير المستحقات والالتزامات
        </p>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800 no-scrollbar">
        <button
          type="button"
          onClick={() => handleTabChange('statement')}
          className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition border-b-2 -mb-px ${
            currentTab === 'statement'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <FileText className="w-4 h-4" />
          كشف الحساب
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('summary')}
          className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition border-b-2 -mb-px ${
            currentTab === 'summary'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Activity className="w-4 h-4" />
          الملخص وحركة الفترة
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('receivables')}
          className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition border-b-2 -mb-px ${
            currentTab === 'receivables'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          المستحقات لك (المدينون)
        </button>

        <button
          type="button"
          onClick={() => handleTabChange('payables')}
          className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-bold flex items-center gap-2 whitespace-nowrap transition border-b-2 -mb-px ${
            currentTab === 'payables'
              ? 'border-rose-600 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/20'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <TrendingDown className="w-4 h-4 text-rose-600" />
          الديون عليك (الدائنون)
        </button>
      </div>

      {/* Tab Panels */}
      <div className="pt-1">
        {currentTab === 'statement' && <AccountStatementView initialAccountId={targetAccountId} />}
        {currentTab === 'summary' && <FinancialSummaryView />}
        {currentTab === 'receivables' && <ReceivablesReportView />}
        {currentTab === 'payables' && <PayablesReportView />}
      </div>
    </div>
  );
};
