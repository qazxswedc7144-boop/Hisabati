// CHANGELOG (visual-only, scope-narrow):
// - [1] due badge now handles negative balances
// - [2] chevron separation improved

import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Plus, ArrowUpDown, Filter, ChevronDown, Check, Phone, Clock, ChevronLeft, PlusCircle, Calendar, Coins, SortAsc, AlertCircle } from 'lucide-react';
import { useAccountStore, useSettingsStore, useUIStore } from '@/shared/stores';
import { BalanceBadge, EmptyState } from '@/shared/components';
import { formatCurrency } from '@/core/utils/formatters';
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

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);

  const filteredAccounts = getFilteredAccounts();

  // [3] Helper for due date badge
  const getDueBadge = (dueDate?: string, balance?: number) => {
    const absBal = Math.abs(balance ?? 0);
    if (!dueDate || absBal === 0) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) return null;
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/50 text-xs font-bold shrink-0">
          <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
          <span>متأخر</span>
        </span>
      );
    }
    if (diffDays === 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/50 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900/50 text-xs font-bold shrink-0">
          <span>مستحق اليوم</span>
        </span>
      );
    }
    if (diffDays > 0 && diffDays <= 7) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 text-xs font-bold shrink-0">
          <span>خلال 7 أيام</span>
        </span>
      );
    }
    return null;
  };

  // Sync URL search params with store filter
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam && ['all', 'owed_to_me', 'owed_by_me', 'settled', 'archived'].includes(filterParam)) {
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
    { id: 'owed_to_me', label: 'لك عنده' },
    { id: 'owed_by_me', label: 'له عندك' },
    { id: 'settled', label: 'متعادل' },
    { id: 'archived', label: 'المؤرشفة' },
  ];

  const activeFilterLabel = filterTabs.find(tab => tab.id === filterType)?.label || 'الكل';

  const sortOptions: { id: AccountSortField; label: string; icon: any }[] = [
    { id: 'recent', label: 'الأحدث حركة', icon: Clock },
    { id: 'balance', label: 'الأعلى رصيداً', icon: Coins },
    { id: 'name', label: 'أبجدياً', icon: SortAsc },
    { id: 'createdAt', label: 'تاريخ الإنشاء', icon: Calendar },
  ];

  const activeSortLabel = sortOptions.find(opt => opt.id === sortField)?.label || 'الأحدث حركة';

  return (
    <div id="accounts-page" className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          {/* [1] Header title kept intact */}
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            {t('accounts.title')}
          </h2>
          {/* [2] Account count directly under title with 12px small gray text */}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {filteredAccounts.length} حساب
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

      {/* Search, Filter & Sort Controls */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
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

        {/* Filter & Sort Controls Row */}
        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {/* Filter Dropdown Button */}
          <div className="relative">
            <button
              id="btn-filter-dropdown"
              onClick={() => setIsFilterOpen(!isFilterOpen)}
              className="px-3.5 py-2 rounded-xl border border-slate-300/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500 transition min-h-[44px] flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Filter className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>التصنيف: {activeFilterLabel}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isFilterOpen ? 'rotate-180' : ''}`} />
            </button>

            {isFilterOpen && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsFilterOpen(false)} 
                />
                {/* Popover Menu */}
                <div className="absolute start-0 sm:end-0 sm:start-auto mt-1.5 w-52 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-40 py-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    فلترة حسب التصنيف
                  </div>
                  {filterTabs.map((tab) => {
                    const isActive = filterType === tab.id;
                    return (
                      <button
                        key={tab.id}
                        id={`filter-option-${tab.id}`}
                        onClick={() => {
                          handleFilterChange(tab.id);
                          setIsFilterOpen(false);
                        }}
                        className={`w-full text-start px-3.5 py-2.5 text-xs font-medium flex items-center justify-between transition-colors ${
                          isActive 
                            ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold' 
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <span>{tab.label}</span>
                        {isActive && <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <button
              id="btn-sort-dropdown"
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="px-3.5 py-2 rounded-xl border border-slate-300/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-semibold focus:ring-2 focus:ring-teal-500 transition min-h-[44px] flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
              <span>{activeSortLabel}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSortOpen && (
              <>
                {/* Backdrop */}
                <div 
                  className="fixed inset-0 z-30" 
                  onClick={() => setIsSortOpen(false)} 
                />
                {/* Popover Menu */}
                <div className="absolute end-0 mt-1.5 w-52 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-40 py-1.5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    خيارات الترتيب
                  </div>
                  {sortOptions.map((opt) => {
                    const isActive = sortField === opt.id;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.id}
                        id={`sort-option-${opt.id}`}
                        onClick={() => {
                          setSortField(opt.id);
                          setIsSortOpen(false);
                        }}
                        className={`w-full text-start px-3.5 py-2.5 text-xs font-medium flex items-center justify-between transition-colors ${
                          isActive 
                            ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-bold' 
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-teal-600' : 'text-slate-400'}`} />
                          <span>{opt.label}</span>
                        </div>
                        {isActive && <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-3.5">
          {filteredAccounts.map((account) => (
            <div
              key={account.id}
              id={`account-card-${account.id}`}
              /* [5] Reduced padding by 20-25% (p-3 sm:p-3.5) and target height ~120px */
              className="group relative rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-3.5 shadow-xs hover:shadow-md hover:border-teal-500/40 transition-all flex flex-col justify-between"
            >
              <div>
                {/* [5] Top Row: Name + Phone on one line, with Due Date Badge and BalanceBadge */}
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    className="min-w-0 cursor-pointer flex-1"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition truncate max-w-[150px] sm:max-w-[180px]">
                        {account.name}
                      </h3>

                      {/* [3] Due Date Badge */}
                      {getDueBadge(account.dueDate, account.currentBalance)}

                      {/* [5] Phone on the same line */}
                      {account.phone && (
                        <span className="text-xs text-slate-400 flex items-center gap-1 font-mono shrink-0" dir="ltr">
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{account.phone}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <BalanceBadge balance={account.currentBalance} size="sm" />
                </div>

                {/* Note preview if any (kept intact) */}
                {account.note && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 mt-1 italic">
                    {account.note}
                  </p>
                )}
              </div>

              {/* [5] Financial Summary & Action Row (single line, touch targets >= 44px) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 mt-2 flex items-center justify-between gap-2">
                <div onClick={() => navigate(`/accounts/${account.id}`)} className="cursor-pointer">
                  <span className="text-xs text-slate-400 block leading-tight">الرصيد:</span>
                  <span
                    className={`text-sm sm:text-base font-extrabold tabular-nums ${
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

                {/* [4] Chevron on the far left edge of the card, visually separated from quick add button */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => openQuickAdd(account.id)}
                    title="تسجيل عملية لهذا الحساب"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 text-teal-700 dark:text-teal-300 text-xs font-bold transition min-h-[44px] active:scale-[0.98]"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>+ إضافة عملية</span>
                  </button>

                  <button
                    onClick={() => navigate(`/accounts/${account.id}`)}
                    aria-label="كشف الحساب"
                    className="p-2.5 ps-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[44px] min-h-[44px] flex items-center justify-center border-s border-s-slate-300/80 dark:border-slate-700/80 ms-3"
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
