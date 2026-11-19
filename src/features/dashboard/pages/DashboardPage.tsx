import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  Users,
  UserPlus,
  Clock,
  ChevronLeft,
  ScanLine,
  PlusCircle,
  Plus,
  Wallet,
} from 'lucide-react';
import { useAccountStore } from '@/shared/stores/accountStore';
import { useTransactionStore } from '@/shared/stores/transactionStore';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useUIStore } from '@/shared/stores/uiStore';
import { useOCRStore } from '@/shared/stores/ocrStore';
import { StatCard } from '@/shared/components/StatCard';
import { BalanceBadge } from '@/shared/components/BalanceBadge';
import { EmptyState } from '@/shared/components/EmptyState';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { useI18n } from '@/shared/hooks/useI18n';

const FinancialHealthCard = React.lazy(() => import('../components/FinancialHealthCard').then(m => ({ default: m.FinancialHealthCard })));
const DueDebtsAlertCard = React.lazy(() => import('../components/DueDebtsAlertCard').then(m => ({ default: m.DueDebtsAlertCard })));

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  const accounts = useAccountStore((state) => state.accounts);
  const recentTransactions = useTransactionStore((state) => state.recentTransactions);
  const currency = useSettingsStore((state) => state.settings.currency);

  // Keep the existing balance calculation unchanged; only derive a clean view list.
  const summary = useMemo(() => {
    let totalFor = 0, totalAgainst = 0;
    for (const acc of accounts) {
      if (acc.archived === 1 || (acc as any).deletedAt) continue;
      const b = acc.currentBalance ?? 0;
      if (b > 0) totalFor += b; else if (b < 0) totalAgainst += b;
    }
    return { totalFor, totalAgainst, netBalance: totalFor + totalAgainst };
  }, [accounts]);

  const activeAccounts = useMemo(
    () => accounts.filter((account) => account.archived !== 1 && !(account as any).deletedAt),
    [accounts]
  );

  const topAccounts = useMemo(
    () => [...activeAccounts]
      .sort((a, b) => Math.abs(b.currentBalance ?? 0) - Math.abs(a.currentBalance ?? 0))
      .slice(0, 4),
    [activeAccounts]
  );

  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);
  const openScannerModal = useOCRStore((state) => state.openScannerModal);

  return (
    <div id="dashboard-page" className="app-page-stack animate-in fade-in duration-200">
      {/* Welcome */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {t('dashboard.welcome')} 👋
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t('dashboard.quickSummary')}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <span>{activeAccounts.length} حساب نشط</span>
        </div>
      </section>

      {/* Primary actions: transaction first, then account and receipt scan */}
      <section aria-label="الإجراءات السريعة" className="grid grid-cols-3 gap-2 sm:gap-3">
        <button
          id="btn-dash-add-transaction"
          type="button"
          onClick={() => openQuickAdd()}
          className="min-w-0 min-h-[52px] sm:min-h-[60px] inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl bg-teal-600 hover:bg-teal-700 text-white px-2.5 sm:px-4 py-2.5 text-[11px] sm:text-sm font-extrabold shadow-sm hover:shadow-md active:scale-[0.98] transition"
        >
          <Plus className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          <span className="truncate">إضافة عملية</span>
        </button>
        <button
          id="btn-dash-add-acc"
          type="button"
          onClick={() => openAddAccount()}
          className="min-w-0 min-h-[52px] sm:min-h-[60px] inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 px-2.5 sm:px-4 py-2.5 text-[11px] sm:text-sm font-bold transition"
        >
          <UserPlus className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-teal-600 dark:text-teal-400 shrink-0" />
          <span className="truncate">إضافة حساب</span>
        </button>
        <button
          id="btn-dash-scan-ocr"
          type="button"
          onClick={() => openScannerModal()}
          className="min-w-0 min-h-[52px] sm:min-h-[60px] inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl border border-sky-200 dark:border-sky-800/80 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-700 dark:text-sky-300 px-2.5 sm:px-4 py-2.5 text-[11px] sm:text-sm font-bold transition"
        >
          <ScanLine className="w-4 h-4 sm:w-[18px] sm:h-[18px] shrink-0" />
          <span className="truncate">مسح فاتورة</span>
        </button>
      </section>

      {/* Financial overview: consistent 2x2 mobile grid, four balanced cards on desktop */}
      <section aria-label="ملخص الأرصدة" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-slate-800 dark:text-slate-200">ملخص الأرصدة</h3>
          <button
            type="button"
            onClick={() => navigate('/accounts')}
            className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px] inline-flex items-center gap-1"
          >
            <span>كل الحسابات</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <StatCard
            id="stat-owed-to-me"
            title={t('dashboard.owedToMe')}
            subtitle={t('dashboard.owedToMeSubtitle')}
            amount={summary.totalFor}
            currencyCode={currency}
            variant="emerald"
            icon={ArrowUpRight}
            onClick={() => navigate('/accounts?filter=owed_to_me')}
          />
          <StatCard
            id="stat-owed-by-me"
            title={t('dashboard.owedByMe')}
            subtitle={t('dashboard.owedByMeSubtitle')}
            amount={Math.abs(summary.totalAgainst)}
            currencyCode={currency}
            variant="rose"
            icon={ArrowDownLeft}
            onClick={() => navigate('/accounts?filter=owed_by_me')}
          />
          <StatCard
            id="stat-net-balance"
            title={t('dashboard.netBalance')}
            subtitle={summary.netBalance >= 0 ? 'صافي مستحق لك' : 'صافي مستحق عليك'}
            amount={summary.netBalance}
            currencyCode={currency}
            variant={summary.netBalance >= 0 ? 'teal' : 'rose'}
            icon={Scale}
          />
          <StatCard
            id="stat-total-accounts"
            title={t('dashboard.totalAccounts')}
            subtitle="الأشخاص والجهات"
            count={activeAccounts.length}
            isCurrency={false}
            variant="slate"
            icon={Users}
            onClick={() => navigate('/accounts')}
          />
        </div>
      </section>

      <React.Suspense fallback={<div className="h-48 w-full bg-slate-50 dark:bg-slate-900 rounded-2xl animate-pulse" />}>
        <FinancialHealthCard />
      </React.Suspense>

      <React.Suspense fallback={<div className="h-32 w-full bg-slate-50 dark:bg-slate-900 rounded-2xl animate-pulse" />}>
        <DueDebtsAlertCard />
      </React.Suspense>

      {/* Recent activity and leading accounts */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
        <section className="lg:col-span-3 min-w-0 space-y-3">
          <div className="app-section-heading">
            <h3 className="app-section-title">
              <Clock className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>آخر العمليات</span>
            </h3>
            <button
              type="button"
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
            <div className="app-panel overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {recentTransactions.map((trx) => (
                <button
                  key={trx.id}
                  id={`trx-row-${trx.id}`}
                  type="button"
                  onClick={() => navigate(`/accounts/${trx.accountId}`)}
                  className="w-full text-start p-3 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition"
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      trx.type === 'debit'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60'
                    }`}>
                      {trx.type === 'debit' ? <ArrowUpRight className="w-4 h-4 sm:w-5 sm:h-5" /> : <ArrowDownLeft className="w-4 h-4 sm:w-5 sm:h-5" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {trx.accountName || 'حساب'}
                      </span>
                      <span className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 min-w-0">
                        <span className="shrink-0">{formatDate(trx.date, 'relative')}</span>
                        {trx.note && (
                          <>
                            <span>•</span>
                            <span className="truncate">{trx.note}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="text-end shrink-0 ps-2">
                    <span className={`block text-xs sm:text-base font-extrabold tabular-nums ${
                      trx.type === 'debit' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                    }`}>
                      {trx.type === 'debit' ? '+' : '-'} {formatCurrency(trx.amount, currency)}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-block mt-0.5 ${
                      trx.type === 'debit'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
                    }`}>
                      {trx.type === 'debit' ? 'لك عنده' : 'له عندك'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="lg:col-span-2 min-w-0 space-y-3">
          <div className="app-section-heading">
            <h3 className="app-section-title">
              <Users className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>أبرز الحسابات</span>
            </h3>
            <button
              type="button"
              onClick={() => navigate('/accounts')}
              className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline min-h-[36px] inline-flex items-center gap-1"
            >
              <span>{t('dashboard.viewAll')}</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>

          <div className="app-panel p-2.5 sm:p-3">
            {topAccounts.length === 0 ? (
              <div className="py-8 text-center">
                <Users className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                <p className="text-xs text-slate-500 dark:text-slate-400">لا توجد حسابات مسجلة بعد</p>
                <button
                  type="button"
                  onClick={() => openAddAccount()}
                  className="mt-3 text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline"
                >
                  إضافة أول حساب
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {topAccounts.map((account, index) => (
                  <div key={account.id} className="py-3 first:pt-1 last:pb-1 flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-extrabold flex items-center justify-center shrink-0">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(`/accounts/${account.id}`)}
                      className="min-w-0 flex-1 text-start"
                    >
                      <span className="block text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 truncate hover:text-teal-600 dark:hover:text-teal-400">
                        {account.name}
                      </span>
                      <span className="block text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {account.phone || account.note || 'لا توجد ملاحظات'}
                      </span>
                    </button>
                    <div className="text-end shrink-0">
                      <span className={`block text-xs sm:text-sm font-black tabular-nums ${
                        account.currentBalance > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : account.currentBalance < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-600 dark:text-slate-300'
                      }`}>
                        {formatCurrency(Math.abs(account.currentBalance ?? 0), currency)}
                      </span>
                      <BalanceBadge balance={account.currentBalance ?? 0} size="sm" />
                    </div>
                    <button
                      type="button"
                      onClick={() => openQuickAdd(account.id)}
                      title="تسجيل عملية لهذا الحساب"
                      aria-label={`إضافة عملية إلى ${account.name}`}
                      className="w-9 h-9 sm:w-10 sm:h-10 inline-flex items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 transition shrink-0"
                    >
                      <PlusCircle className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
