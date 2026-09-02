import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, ArrowUpDown, Filter, Phone, Clock, ChevronLeft, PlusCircle } from 'lucide-react';
import { useAccountStore, useSettingsStore, useUIStore } from '@/shared/stores';
import { BalanceBadge, EmptyState } from '@/shared/components';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { AccountFilterType, AccountSortField } from '@/shared/types';
import { useI18n } from '@/shared/hooks/useI18n';

export const AccountsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useI18n();

  const searchQuery = useAccountStore((state) => state.searchQuery);
  const filterType = useAccountStore((state) => state.filterType);
  const sortField = useAccountStore((state) => state.sortField);
  const setSearchQuery = useAccountStore((state) => state.setSearchQuery);
  const setFilterType = useAccountStore((state) => state.setFilterType);
  const setSortField = useAccountStore((state) => state.setSortField);
  const getFilteredAccounts = useAccountStore((state) => state.getFilteredAccounts);

  const currency = useSettingsStore((state) => state.settings.currency);
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);

  const filteredAccounts = getFilteredAccounts();

  // Sync URL search params with store filter
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam && ['all', 'owed_to_me', 'owed_by_me', 'settled'].includes(filterParam)) {
      setFilterType(filterParam as AccountFilterType);
    }
  }, [searchParams, setFilterType]);

  const handleFilterChange = (filter: AccountFilterType) => {
    setFilterType(filter);
    if (filter === 'all') {
      searchParams.delete('filter');
    } else {
      searchParams.set('filter', filter);
    }
    setSearchParams(searchParams);
  };

  const filterTabs: { id: AccountFilterType; label: string }[] = [
    { id: 'all', label: 'الكل' },
    { id: 'owed_to_me', label: 'لك عندهم' },
    { id: 'owed_by_me', label: 'عليك لهم' },
    { id: 'settled', label: 'متعادل' },
    { id: 'archived', label: 'المؤرشفة' },
  ];

  return (
    <div id="accounts-page" className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {t('accounts.title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            إدارة حسابات العملاء والموردين ومتابعة الأرصدة
          </p>
        </div>

        <button
          id="btn-add-account-main"
          onClick={() => openAddAccount()}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-sm shadow-teal-700/20 active:scale-[0.98] transition min-h-[44px]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>{t('accounts.addNew')}</span>
        </button>
      </div>

      {/* Search & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="input-search-accounts"
            type="text"
            value={searchQuery}
            placeholder={t('accounts.searchPlaceholder')}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-slate-300/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[44px]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              مسح
            </button>
          )}
        </div>

        {/* Sort Select */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            id="select-sort-accounts"
            value={sortField}
            onChange={(e) => setSortField(e.target.value as AccountSortField)}
            className="px-3 py-2 rounded-xl border border-slate-300/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500 transition min-h-[42px]"
          >
            <option value="recent">الترتيب: الأحدث حركة</option>
            <option value="balance">الترتيب: الأعلى رصيداً</option>
            <option value="name">الترتيب: أبجدياً</option>
            <option value="createdAt">الترتيب: تاريخ الإنشاء</option>
          </select>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {filterTabs.map((tab) => (
          <button
            key={tab.id}
            id={`filter-tab-${tab.id}`}
            onClick={() => handleFilterChange(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all min-h-[38px] ${
              filterType === tab.id
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Accounts List */}
      {filteredAccounts.length === 0 ? (
        searchQuery ? (
          <EmptyState
            id="empty-search-accounts"
            title={t('accounts.emptySearchTitle')}
            description={t('accounts.emptySearchDesc')}
            actionLabel="إلغاء البحث"
            onAction={() => {
              setSearchQuery('');
              handleFilterChange('all');
            }}
          />
        ) : (
          <EmptyState
            id="empty-accounts-list"
            title={t('accounts.emptyTitle')}
            description={t('accounts.emptyDesc')}
            actionLabel="+ إضافة أول حساب"
            onAction={() => openAddAccount()}
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          {filteredAccounts.map((account) => (
            <div
              key={account.id}
              id={`account-card-${account.id}`}
              className="group relative rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs hover:shadow-md hover:border-teal-500/40 transition-all flex flex-col justify-between"
            >
              <div>
                {/* Top Row: Name + Badge */}
                <div className="flex items-start justify-between gap-2.5 mb-2">
                  <div
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    className="min-w-0 cursor-pointer"
                  >
                    <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition truncate">
                      {account.name}
                    </h3>
                    {account.phone && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5" dir="ltr">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{account.phone}</span>
                      </p>
                    )}
                  </div>

                  <BalanceBadge balance={account.currentBalance} size="md" />
                </div>

                {/* Note preview if any */}
                {account.note && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mb-3">
                    {account.note}
                  </p>
                )}
              </div>

              {/* Financial Summary & Action Row */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 mt-2 flex items-center justify-between gap-3">
                <div onClick={() => navigate(`/accounts/${account.id}`)} className="cursor-pointer">
                  <span className="text-[11px] text-slate-400 block">الرصيد الحالي:</span>
                  <span
                    className={`text-base font-extrabold tabular-nums ${
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

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openQuickAdd(account.id)}
                    title="تسجيل عملية لهذا الحساب"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 text-xs font-bold transition min-h-[36px]"
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>عملية</span>
                  </button>

                  <button
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    aria-label="كشف الحساب"
                    className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
