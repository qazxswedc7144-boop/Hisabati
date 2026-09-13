import React from 'react';
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

  const handleAccountChange = (accountId: string | null) => {
    const params = new URLSearchParams(searchParams);
    if (accountId) {
      params.set('accountId', accountId);
    } else {
      params.delete('accountId');
    }
    setSearchParams(params, { replace: true });
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

      {/* Tabs Navigation - Grid 2x2 for Mobile, Flex for Desktop */}
      <div className="grid grid-cols-2 md:flex items-center gap-2 md:gap-1 border-b border-slate-100 dark:border-slate-800 pb-4 md:pb-0">
        <button
          id="btn-report-tab-statement"
          type="button"
          onClick={() => handleTabChange('statement')}
          className={`flex items-center justify-center md:justify-start gap-2 px-3.5 py-3 md:py-2 md:rounded-t-xl md:rounded-b-none rounded-xl text-[11px] sm:text-sm font-bold transition border md:border-b-2 md:border-t-0 md:border-x-0 -mb-px min-h-[48px] md:min-h-0 ${
            currentTab === 'statement'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/25 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="truncate">كشف الحساب</span>
        </button>

        <button
          id="btn-report-tab-summary"
          type="button"
          onClick={() => handleTabChange('summary')}
          className={`flex items-center justify-center md:justify-start gap-2 px-3.5 py-3 md:py-2 md:rounded-t-xl md:rounded-b-none rounded-xl text-[11px] sm:text-sm font-bold transition border md:border-b-2 md:border-t-0 md:border-x-0 -mb-px min-h-[48px] md:min-h-0 ${
            currentTab === 'summary'
              ? 'border-teal-600 text-teal-700 dark:text-teal-400 bg-teal-50/50 dark:bg-teal-950/25 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <Activity className="w-4 h-4 shrink-0" />
          <span className="truncate">الملخص وحركة الفترة</span>
        </button>

        <button
          id="btn-report-tab-receivables"
          type="button"
          onClick={() => handleTabChange('receivables')}
          className={`flex items-center justify-center md:justify-start gap-2 px-3.5 py-3 md:py-2 md:rounded-t-xl md:rounded-b-none rounded-xl text-[11px] sm:text-sm font-bold transition border md:border-b-2 md:border-t-0 md:border-x-0 -mb-px min-h-[48px] md:min-h-0 ${
            currentTab === 'receivables'
              ? 'border-emerald-600 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/25 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="truncate">المستحقات لك (المدينون)</span>
        </button>

        <button
          id="btn-report-tab-payables"
          type="button"
          onClick={() => handleTabChange('payables')}
          className={`flex items-center justify-center md:justify-start gap-2 px-3.5 py-3 md:py-2 md:rounded-t-xl md:rounded-b-none rounded-xl text-[11px] sm:text-sm font-bold transition border md:border-b-2 md:border-t-0 md:border-x-0 -mb-px min-h-[48px] md:min-h-0 ${
            currentTab === 'payables'
              ? 'border-rose-600 text-rose-700 dark:text-rose-400 bg-rose-50/50 dark:bg-rose-950/25 shadow-xs'
              : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
          }`}
        >
          <TrendingDown className="w-4 h-4 text-rose-600 shrink-0" />
          <span className="truncate">الديون عليك (الدائنون)</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div className="pt-1">
        {currentTab === 'statement' && (
          <AccountStatementView
            initialAccountId={targetAccountId}
            onAccountChange={handleAccountChange}
          />
        )}
        {currentTab === 'summary' && <FinancialSummaryView />}
        {currentTab === 'receivables' && <ReceivablesReportView />}
        {currentTab === 'payables' && <PayablesReportView />}
      </div>
    </div>
  );
};
