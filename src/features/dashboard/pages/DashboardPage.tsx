import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Users,
  Plus,
  UserPlus,
  Clock,
  ChevronLeft,
  ScanLine,
  PlusCircle,
} from 'lucide-react';
import {
  useAccountStore,
  useTransactionStore,
  useSettingsStore,
  useUIStore,
  useOCRStore,
  useBIStore,
} from '@/shared/stores';
import { StatCard, BalanceBadge, EmptyState } from '@/shared/components';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { useI18n } from '@/shared/hooks/useI18n';
import { FinancialHealthCard } from '../components/FinancialHealthCard';

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

  const healthSummary = useBIStore((state) => state.healthSummary);
  const insights = useBIStore((state) => state.insights);
  const loadBIData = useBIStore((state) => state.loadBIData);

  const proactiveInsight =
    insights.find((i) => i.impact === 'CRITICAL' || i.impact === 'WARNING') ||
    insights[0];

  useEffect(() => {
    if (!healthSummary) {
      loadBIData();
    }
  }, [healthSummary, loadBIData]);

  return (
    <div id="dashboard-page" className="space-y-5 sm:space-y-6 animate-in fade-in duration-200">
      {/* Welcome Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {t('dashboard.welcome')} 👋
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t('dashboard.quickSummary')}
          </p>
        </div>

        {/* Quick Actions (Primary: تسجيل عملية, Secondary: مسح, Tertiary: حساب جديد) في سطر أفقي واحد دائم بحجم المحتوى فقط */}
        <div className="flex flex-row items-center gap-1.5 sm:gap-2.5 w-auto flex-nowrap shrink-0">
          <button
            id="btn-dash-add-trx"
            onClick={() => openQuickAdd()}
            className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-xs shadow-teal-700/20 active:scale-[0.98] transition min-h-[40px] sm:min-h-[44px] shrink-0 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5] shrink-0" />
            <span className="whitespace-nowrap">تسجيل عملية</span>
          </button>

          <button
            id="btn-dash-scan-ocr"
            onClick={() => openScannerModal()}
            className="inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl border border-sky-200 dark:border-sky-800/80 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 text-xs sm:text-sm font-bold shadow-xs active:scale-[0.98] transition min-h-[40px] sm:min-h-[44px] shrink-0 whitespace-nowrap"
          >
            <ScanLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="whitespace-nowrap">مسح</span>
          </button>

          {/* 3. زر حساب جديد (أيقونة فقط) */}
          <button
            id="btn-dash-add-acc"
            onClick={() => openAddAccount()}
            title="حساب جديد"
            className="inline-flex items-center justify-center p-2.5 sm:py-2.5 sm:px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-xs active:scale-[0.98] transition min-h-[40px] min-w-[40px] sm:min-h-[44px] sm:min-w-[44px] shrink-0"
          >
            <UserPlus className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          </button>
        </div>
      </div>

      {/* 4 Financial Stat Cards (2x2 Grid on Mobile, 4 Columns on lg) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
          subtitle="الأشخاص والجهات"
          count={accounts.length}
          isCurrency={false}
          variant="slate"
          icon={Users}
          onClick={() => navigate('/accounts')}
        />
      </div>

      {/* Financial Health Card (Responsive: Vertical on Mobile, Horizontal on Desktop) */}
      <FinancialHealthCard
        healthSummary={healthSummary}
        proactiveInsight={proactiveInsight}
        currency={currency}
      />

      {/* Latest Operations & Top Accounts Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 sm:gap-6">
        {/* Latest Operations (2 Cols on lg) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>آخر العمليات</span>
            </h3>

            <button
              onClick={() => navigate('/accounts')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 min-h-[36px]"
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
            <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
              {recentTransactions.map((trx) => (
                <div
                  key={trx.id}
                  id={`trx-row-${trx.id}`}
                  onClick={() => navigate(`/accounts/${trx.accountId}`)}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 cursor-pointer transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        trx.type === 'debit'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
                      }`}
                    >
                      {trx.type === 'debit' ? (
                        <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {trx.accountName || 'حساب'}
                      </h4>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
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

                  <div className="text-end shrink-0 ps-2">
                    <div
                      className={`text-xs sm:text-base font-extrabold tabular-nums ${
                        trx.type === 'debit'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {trx.type === 'debit' ? '+' : '-'} {formatCurrency(trx.amount, currency)}
                    </div>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${
                        trx.type === 'debit'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                      }`}
                    >
                      {trx.type === 'debit' ? 'لك عنده' : 'له عندك'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Accounts Section (1 Col on lg) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>أبرز الحسابات</span>
            </h3>
            <button
              onClick={() => navigate('/accounts')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px] flex items-center gap-1"
            >
              <span>{t('dashboard.viewAll')}</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shadow-xs">
            {accounts.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400">لا توجد حسابات مسجلة بعد</p>
              </div>
            ) : (
              accounts.slice(0, 4).map((account) => (
                <div
                  key={account.id}
                  className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-teal-500/30 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-white dark:hover:bg-slate-800/80 transition flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div
                      onClick={() => navigate(`/accounts/${account.id}`)}
                      className="min-w-0 cursor-pointer flex-1"
                    >
                      <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate hover:text-teal-600 dark:hover:text-teal-400">
                        {account.name}
                      </p>
                      <p className="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {account.phone || account.note || 'لا توجد ملاحظات'}
                      </p>
                    </div>

                    <BalanceBadge balance={account.currentBalance} size="sm" />
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800">
                    <div className="text-start">
                      <span className="text-[10px] text-slate-400 block">الرصيد:</span>
                      <span
                        className={`text-xs sm:text-sm font-black tabular-nums ${
                          account.currentBalance > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : account.currentBalance < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {formatCurrency(Math.abs(account.currentBalance), currency)}
                      </span>
                    </div>

                    <button
                      onClick={() => openQuickAdd(account.id)}
                      title="تسجيل عملية لهذا الحساب"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 text-[11px] font-bold transition min-h-[36px] active:scale-[0.98]"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>+ إضافة عملية</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

