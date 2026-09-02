import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, ArrowDownLeft, Scale, Users, Plus, UserPlus, Clock, ChevronLeft, ArrowRight, ScanLine } from 'lucide-react';
import { useAccountStore, useTransactionStore, useSettingsStore, useUIStore, useOCRStore } from '@/shared/stores';
import { StatCard, BalanceBadge, EmptyState } from '@/shared/components';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { useI18n } from '@/shared/hooks/useI18n';
import { OCRDraftsSection } from '@/features/ocr';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const accounts = useAccountStore((state) => state.accounts);
  const recentTransactions = useTransactionStore((state) => state.recentTransactions);
  const summary = useTransactionStore((state) => state.summary);
  const currency = useSettingsStore((state) => state.settings.currency);
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);
  const openScannerModal = useOCRStore((state) => state.openScannerModal);

  return (
    <div id="dashboard-page" className="space-y-6 animate-in fade-in duration-200">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {t('dashboard.welcome')} 👋
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('dashboard.quickSummary')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-dash-scan-ocr"
            onClick={() => openScannerModal()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-sky-300 dark:border-sky-800 bg-sky-50 dark:bg-sky-950/50 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs sm:text-sm font-bold shadow-xs active:scale-[0.98] transition min-h-[44px]"
          >
            <ScanLine className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>مسح فاتورة (OCR)</span>
          </button>

          <button
            id="btn-dash-add-trx"
            onClick={() => openQuickAdd()}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-sm shadow-teal-700/20 active:scale-[0.98] transition min-h-[44px]"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل عملية</span>
          </button>

          <button
            id="btn-dash-add-acc"
            onClick={() => openAddAccount()}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-bold shadow-xs active:scale-[0.98] transition min-h-[44px]"
          >
            <UserPlus className="w-4 h-4 text-teal-600" />
            <span className="hidden xs:inline">حساب جديد</span>
          </button>
        </div>
      </div>

      {/* 4 Financial Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total Owed to Me (لك) */}
        <StatCard
          id="stat-owed-to-me"
          title={t('dashboard.owedToMe')}
          subtitle={t('dashboard.owedToMeSubtitle')}
          amount={summary.totalDebit}
          currencyCode={currency}
          variant="emerald"
          icon={ArrowUpRight}
          onClick={() => navigate('/accounts?filter=owed_to_me')}
        />

        {/* Total Owed by Me (عليك) */}
        <StatCard
          id="stat-owed-by-me"
          title={t('dashboard.owedByMe')}
          subtitle={t('dashboard.owedByMeSubtitle')}
          amount={summary.totalCredit}
          currencyCode={currency}
          variant="rose"
          icon={ArrowDownLeft}
          onClick={() => navigate('/accounts?filter=owed_by_me')}
        />

        {/* Net Balance (صافي الرصيد) */}
        <StatCard
          id="stat-net-balance"
          title={t('dashboard.netBalance')}
          subtitle={summary.netBalance >= 0 ? 'صافي مستحق لك' : 'صافي مستحق عليك'}
          amount={summary.netBalance}
          currencyCode={currency}
          variant={summary.netBalance >= 0 ? 'teal' : 'rose'}
          icon={Scale}
        />

        {/* Number of Accounts */}
        <StatCard
          id="stat-total-accounts"
          title={t('dashboard.totalAccounts')}
          subtitle="الأشخاص والجهات المسجلة"
          count={accounts.length}
          isCurrency={false}
          variant="slate"
          icon={Users}
          onClick={() => navigate('/accounts')}
        />
      </div>

      {/* Recent Transactions & Quick Accounts Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2">
        {/* Recent Transactions List (2 Cols on lg) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              {t('dashboard.recentTransactions')}
            </h3>

            <button
              onClick={() => navigate('/accounts')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
            >
              <span>{t('dashboard.viewAll')}</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          {recentTransactions.length === 0 ? (
            <EmptyState
              id="empty-recent-transactions"
              title={t('dashboard.emptyRecent')}
              description={t('dashboard.emptyRecentHint')}
              actionLabel="تسجيل أول عملية الآن"
              onAction={() => openQuickAdd()}
            />
          ) : (
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
              {recentTransactions.map((trx) => (
                <div
                  key={trx.id}
                  id={`trx-row-${trx.id}`}
                  onClick={() => navigate(`/accounts/${trx.accountId}`)}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        trx.type === 'debit'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {trx.type === 'debit' ? (
                        <ArrowUpRight className="w-5 h-5" />
                      ) : (
                        <ArrowDownLeft className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {trx.accountName || 'حساب'}
                      </h4>
                      <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        <span>{formatDate(trx.date, 'relative')}</span>
                        {trx.note && (
                          <>
                            <span>•</span>
                            <span className="truncate">{trx.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-end shrink-0">
                    <div
                      className={`text-sm sm:text-base font-extrabold tabular-nums ${
                        trx.type === 'debit'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {trx.type === 'debit' ? '+' : '-'} {formatCurrency(trx.amount, currency)}
                    </div>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-md inline-block mt-0.5 ${
                        trx.type === 'debit'
                          ? 'bg-emerald-100/70 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-rose-100/70 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      {trx.type === 'debit' ? 'لك (أعطيته)' : 'عليك (أخذت منه)'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Active Accounts Quick View */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              أبرز الحسابات
            </h3>
            <button
              onClick={() => navigate('/accounts')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline"
            >
              {t('dashboard.viewAll')}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shadow-xs">
            {accounts.slice(0, 4).map((account) => (
              <div
                key={account.id}
                onClick={() => navigate(`/accounts/${account.id}`)}
                className="p-2.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer transition flex items-center justify-between gap-3 border border-transparent hover:border-slate-200/60 dark:hover:border-slate-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                    {account.name}
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                    {account.phone || account.note || 'لا توجد ملاحظات'}
                  </p>
                </div>

                <div className="text-end shrink-0">
                  <BalanceBadge balance={account.currentBalance} size="sm" />
                  <p className="text-xs font-bold tabular-nums text-slate-700 dark:text-slate-300 mt-1">
                    {formatCurrency(Math.abs(account.currentBalance), currency)}
                  </p>
                </div>
              </div>
            ))}

            <button
              onClick={() => openAddAccount()}
              className="w-full py-2 text-center text-xs font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 rounded-xl transition"
            >
              + إضافة حساب جديد
            </button>
          </div>
        </div>
      </div>

      {/* OCR Smart Drafts Section (Phase 7-B) */}
      <OCRDraftsSection />
    </div>
  );
};
