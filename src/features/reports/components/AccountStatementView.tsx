import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  MessageCircle,
  MoreVertical,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Share2,
  User,
  X,
} from 'lucide-react';

import { useAccountStore, useSettingsStore } from '@/shared/stores';
import {
  reportService,
  excelGenerator,
  pdfGenerator,
  shareService,
} from '@/core/services';

import {
  Account,
  AccountStatementItem,
  AccountStatementReport,
  DatePreset,
  DateRange,
  Transaction,
} from '@/shared/types';

import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { formatISODate } from '@/core/utils/dateRange';
import { ReceiptDocumentModal } from '@/features/ocr';

interface AccountStatementViewProps {
  initialAccountId?: string;
  onAccountChange?: (accountId: string | null) => void;
}

type AccountSearchable = Account & {
  phone?: string;
};

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();

const getTodayISO = () => formatISODate(new Date());

const getMonthStartISO = () =>
  formatISODate(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  );

const isPositive = (value: number) => value > 0;
const isNegative = (value: number) => value < 0;

const balanceLabel = (value: number) =>
  isPositive(value) ? 'لك' : isNegative(value) ? 'عليك' : 'متعادل';

const balanceTone = (value: number) =>
  isPositive(value)
    ? 'text-emerald-700 dark:text-emerald-300'
    : isNegative(value)
      ? 'text-rose-700 dark:text-rose-300'
      : 'text-slate-700 dark:text-slate-300';

export const AccountStatementView: React.FC<AccountStatementViewProps> = ({
  initialAccountId,
  onAccountChange,
}) => {
  const accounts = useAccountStore((state) => state.accounts) || [];
  const currency =
    useSettingsStore((state) => state.settings?.currency) || 'YER';

  /*
   * No account is selected automatically by default.
   * initialAccountId is only set if supplied by another module (e.g. AccountStatementModal or query params).
   */
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(
    initialAccountId || null
  );

  const [accountSearch, setAccountSearch] = useState('');
  const [isAccountSearchOpen, setIsAccountSearchOpen] = useState(false);

  const [preset, setPreset] = useState<DatePreset>('this_month');

  const [customRange, setCustomRange] = useState<DateRange>({
    startDate: getMonthStartISO(),
    endDate: getTodayISO(),
  });

  const [transactionSearch, setTransactionSearch] = useState('');
  const [debouncedTransactionSearch, setDebouncedTransactionSearch] = useState('');
  const [statement, setStatement] =
    useState<AccountStatementReport | null>(null);

  const [loading, setLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const [selectedDocTrx, setSelectedDocTrx] = useState<Transaction | null>(null);

  const accountSearchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const bottomActionsRef = useRef<HTMLDivElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);
  const lastInitialAccountIdRef = useRef<string | undefined>(initialAccountId);

  // Debounce transaction search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTransactionSearch(transactionSearch);
    }, 250);
    return () => clearTimeout(timer);
  }, [transactionSearch]);

  const selectedAccount = useMemo<AccountSearchable | null>(() => {
    if (!selectedAccountId) return null;

    return (
      (accounts.find(
        (account) => account.id === selectedAccountId
      ) as AccountSearchable | undefined) || null
    );
  }, [accounts, selectedAccountId]);

  const normalizedAccountSearch = normalizeSearchText(accountSearch);
  const hasAccountSearch = normalizedAccountSearch.length > 0;

  const filteredAccounts = useMemo(() => {
    if (!hasAccountSearch) return [];

    return accounts
      .filter((account) => {
        const searchableAccount = account as AccountSearchable;
        const name = normalizeSearchText(searchableAccount.name || '');
        const phone = normalizeSearchText(searchableAccount.phone || '');

        return (
          name.includes(normalizedAccountSearch) ||
          phone.includes(normalizedAccountSearch)
        );
      })
      .slice(0, 20);
  }, [accounts, hasAccountSearch, normalizedAccountSearch]);

  useEffect(() => {
    if (!initialAccountId) {
      lastInitialAccountIdRef.current = undefined;
      return;
    }

    if (lastInitialAccountIdRef.current !== initialAccountId) {
      const exists = accounts.some((account) => account.id === initialAccountId);
      if (exists) {
        setSelectedAccountId(initialAccountId);
        lastInitialAccountIdRef.current = initialAccountId;
      }
    }
  }, [initialAccountId, accounts]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;

      if (
        accountSearchRef.current &&
        !accountSearchRef.current.contains(target)
      ) {
        setIsAccountSearchOpen(false);
      }

      if (
        actionsRef.current &&
        !actionsRef.current.contains(target) &&
        bottomActionsRef.current &&
        !bottomActionsRef.current.contains(target)
      ) {
        setIsActionsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsAccountSearchOpen(false);
        setIsActionsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);

    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleSelectAccount = (account: AccountSearchable) => {
    setSelectedAccountId(account.id);
    lastInitialAccountIdRef.current = account.id;
    setAccountSearch('');
    setIsAccountSearchOpen(false);
    onAccountChange?.(account.id);
  };

  const handleClearAccount = () => {
    setSelectedAccountId(null);
    lastInitialAccountIdRef.current = undefined;
    setAccountSearch('');
    setIsAccountSearchOpen(false);
    setStatement(null);
    onAccountChange?.(null);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  useEffect(() => {
    if (!selectedAccountId) {
      setStatement(null);
      setLoading(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    let cancelled = false;

    setLoading(true);

    reportService
      .getAccountStatement(selectedAccountId, {
        preset,
        startDate:
          preset === ('custom' as DatePreset)
            ? customRange.startDate
            : undefined,
        endDate:
          preset === ('custom' as DatePreset)
            ? customRange.endDate
            : undefined,
        search: debouncedTransactionSearch,
      })
      .then((data) => {
        if (cancelled || requestId !== requestIdRef.current) return;
        setStatement(data);
      })
      .catch((error) => {
        if (cancelled || requestId !== requestIdRef.current) return;

        console.error('Failed to load account statement:', error);
        setStatement(null);
        showToast('تعذر استخراج كشف الحساب');
      })
      .finally(() => {
        if (!cancelled && requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedAccountId,
    preset,
    customRange.startDate,
    customRange.endDate,
    debouncedTransactionSearch,
    showToast,
  ]);

  const datePresets: Array<{ value: DatePreset; label: string }> = [
    { value: 'today' as DatePreset, label: 'اليوم' },
    { value: 'yesterday' as DatePreset, label: 'أمس' },
    { value: 'this_week' as DatePreset, label: 'هذا الأسبوع' },
    { value: 'this_month' as DatePreset, label: 'هذا الشهر' },
    { value: 'last_month' as DatePreset, label: 'الشهر الماضي' },
    { value: 'all' as DatePreset, label: 'الكل' },
  ];

  const handlePrint = useCallback(() => {
    if (!statement) return;
    setIsActionsOpen(false);
    pdfGenerator.printStatement(statement, currency);
  }, [statement, currency]);

  const handleExportExcel = useCallback(async () => {
    if (!statement) return;
    setIsActionsOpen(false);

    try {
      const blob = await excelGenerator.generateStatementExcel(
        statement,
        currency
      );

      const filename =
        `كشف_حساب_${statement.account.name.replace(/\s+/g, '_')}` +
        `_${statement.dateRange.startDate}_${statement.dateRange.endDate}.xlsx`;

      excelGenerator.downloadBlob(blob, filename);
      showToast('تم تصدير ملف Excel بنجاح');
    } catch (error) {
      console.error('Excel export failed:', error);
      showToast('فشل تصدير ملف Excel');
    }
  }, [statement, currency, showToast]);

  const handleExportCSV = useCallback(() => {
    if (!statement) return;
    setIsActionsOpen(false);

    const filename =
      `كشف_حساب_${statement.account.name.replace(/\s+/g, '_')}.csv`;

    excelGenerator.exportStatementCSV(statement, filename);
    showToast('تم تصدير CSV بنجاح');
  }, [statement, showToast]);

  const handleShareText = useCallback(async () => {
    if (!statement) return;
    setIsActionsOpen(false);

    try {
      const message = shareService.generateStatementTextMessage(
        statement,
        currency
      );

      const result = await shareService.shareText(
        `كشف حساب ${statement.account.name}`,
        message
      );

      if (result.method === 'clipboard') {
        showToast('تم نسخ كشف الحساب إلى الحافظة');
      }
    } catch (error) {
      console.error('Share failed:', error);
      showToast('تعذر مشاركة كشف الحساب');
    }
  }, [statement, currency, showToast]);

  const handleShareWhatsApp = useCallback(() => {
    if (!statement) return;
    setIsActionsOpen(false);

    const message = shareService.generateStatementTextMessage(
      statement,
      currency
    );

    shareService.shareToWhatsApp(message, statement.account.phone);
  }, [statement, currency]);

  const openDocument = useCallback(
    (item: AccountStatementItem) => {
      if (!statement) return;

      const trx: Transaction = {
        id: item.id,
        accountId: statement.account.id,
        accountName: statement.account.name,
        type: item.type,
        amount: item.amount,
        date: item.date,
        note: item.note,
        receiptNumber: item.receiptNumber,
        runningBalance: item.runningBalance,
        receiptId: item.receiptId,
        documentRef: item.documentRef,
        documentMetadata: item.documentMetadata,
        createdAt: item.date,
        updatedAt: item.date,
      };

      setSelectedDocTrx(trx);
    },
    [statement]
  );

  // Common action menu options
  const actionMenuItems = (
    <div className="py-1">
      <ReportAction
        icon={<Printer className="h-4 w-4" />}
        label="طباعة / تصدير PDF"
        onClick={handlePrint}
      />
      <ReportAction
        icon={<FileSpreadsheet className="h-4 w-4" />}
        label="تصدير Excel (.xlsx)"
        onClick={handleExportExcel}
      />
      <ReportAction
        icon={<Download className="h-4 w-4" />}
        label="تصدير ملف CSV"
        onClick={handleExportCSV}
      />
      <ReportAction
        icon={<MessageCircle className="h-4 w-4" />}
        label="مشاركة عبر واتساب"
        onClick={handleShareWhatsApp}
      />
      <ReportAction
        icon={<Share2 className="h-4 w-4" />}
        label="مشاركة / نسخ النص"
        onClick={handleShareText}
      />
    </div>
  );

  if (!selectedAccountId) {
    return (
      <div className="relative min-h-[60dvh] pb-28">
        {toastMessage && <Toast message={toastMessage} />}

        <div className="rounded-3xl border border-slate-200/80 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <AccountSearch
            accountSearch={accountSearch}
            setAccountSearch={setAccountSearch}
            isOpen={isAccountSearchOpen}
            setIsOpen={setIsAccountSearchOpen}
            filteredAccounts={filteredAccounts}
            onSelect={handleSelectAccount}
            containerRef={accountSearchRef}
            inputRef={searchInputRef}
            currency={currency}
          />
        </div>

        <div className="mt-5 rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-center dark:border-slate-700 dark:bg-slate-900/70 sm:p-12">
          <div className="mx-auto mb-3.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 dark:bg-teal-950/50">
            <FileText className="h-7 w-7 text-teal-600 dark:text-teal-400" />
          </div>

          <h3 className="text-sm sm:text-base font-black text-slate-800 dark:text-slate-100">
            كشف الحساب المالي
          </h3>

          <p className="mx-auto mt-1.5 max-w-sm text-xs leading-6 text-slate-500 dark:text-slate-400">
            ابحث باسم الحساب أو رقم الهاتف في الحقل أعلاه لعرض الحركات المالية والرصيد الافتتاحي والختامي.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative space-y-3 pb-44 sm:pb-40">
      {toastMessage && <Toast message={toastMessage} />}

      {/* Top Filter and Search Control */}
      <section className="rounded-3xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-4">
        <div className="space-y-3">
          {/* Selected Account Banner with Switch Action */}
          {selectedAccount ? (
            <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/50 p-2.5 dark:border-teal-900/50 dark:bg-teal-950/20 sm:p-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white shadow-xs">
                  <User className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                    {selectedAccount.name}
                  </div>
                  {selectedAccount.phone && (
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {selectedAccount.phone}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleClearAccount}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 shadow-xs transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 active:scale-95"
                  aria-label="تغيير الحساب"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                  <span>تغيير الحساب</span>
                </button>
              </div>
            </div>
          ) : (
            <AccountSearch
              accountSearch={accountSearch}
              setAccountSearch={setAccountSearch}
              isOpen={isAccountSearchOpen}
              setIsOpen={setIsAccountSearchOpen}
              filteredAccounts={filteredAccounts}
              onSelect={handleSelectAccount}
              containerRef={accountSearchRef}
              inputRef={searchInputRef}
              currency={currency}
            />
          )}

          {/* Internal Transaction Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="search"
              value={transactionSearch}
              onChange={(event) => setTransactionSearch(event.target.value)}
              placeholder="بحث داخل تفاصيل الحركات أو رقم السند..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-10 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100"
            />

            {transactionSearch && (
              <button
                type="button"
                onClick={() => setTransactionSearch('')}
                className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                aria-label="مسح البحث"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Date Range & Presets */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
                <Calendar className="h-3.5 w-3.5 text-teal-600" />
                فترة الكشف
              </span>

              <button
                type="button"
                onClick={() => setPreset('custom' as DatePreset)}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition ${
                  preset === ('custom' as DatePreset)
                    ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300'
                    : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                مخصص
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 sm:grid-cols-6">
              {datePresets.map((item) => (
                <button
                  key={String(item.value)}
                  type="button"
                  onClick={() => setPreset(item.value)}
                  className={`min-w-0 rounded-lg px-1.5 py-2 text-[10px] font-black transition ${
                    preset === item.value
                      ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-700 dark:text-teal-300'
                      : 'text-slate-600 hover:bg-white/70 dark:text-slate-300 dark:hover:bg-slate-700/70'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {preset === ('custom' as DatePreset) && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <DateInput
                  label="من تاريخ"
                  value={customRange.startDate}
                  onChange={(value) =>
                    setCustomRange((current) => ({
                      ...current,
                      startDate: value,
                    }))
                  }
                />
                <DateInput
                  label="إلى تاريخ"
                  value={customRange.endDate}
                  onChange={(value) =>
                    setCustomRange((current) => ({
                      ...current,
                      endDate: value,
                    }))
                  }
                />
              </div>
            )}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-teal-600" />
          <p className="mt-3 text-xs font-bold text-slate-500 dark:text-slate-400">
            جاري استخراج وتحضير كشف الحساب...
          </p>
        </div>
      ) : !statement ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          تعذر تحميل كشف الحساب لهذا المعرف.
        </div>
      ) : (
        <>
          {/* Statement Header and Action Dropdown */}
          <section className="rounded-3xl border border-slate-200/80 bg-white p-3 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold text-slate-400">
                  كشف حساب معتمد
                </p>
                <h2 className="truncate text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                  {statement.account.name}
                </h2>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  من {statement.dateRange.startDate} إلى {statement.dateRange.endDate}
                </p>
              </div>

              <div ref={actionsRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setIsActionsOpen((value) => !value)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  aria-label="خيارات كشف الحساب"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>

                {isActionsOpen && (
                  <div className="absolute end-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
                    {actionMenuItems}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Financial Summary Cards */}
          <SummaryCards statement={statement} currency={currency} />

          {/* Transactions List: Mobile Cards + Desktop Table */}
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-3.5 dark:border-slate-800 sm:p-4">
              <h4 className="flex items-center gap-2 text-xs sm:text-sm font-black text-slate-900 dark:text-slate-100">
                <FileText className="h-4 w-4 text-teal-600" />
                حركات الفترة
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {statement.transactions.length}
                </span>
              </h4>

              <span className="text-[10px] font-semibold text-slate-400">
                مرتبة زمنياً
              </span>
            </div>

            {statement.transactions.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400">
                لا توجد معاملات مالية مسجلة خلال الفترة المحددة
              </div>
            ) : (
              <>
                {/* Mobile View: High-density, accessible Cards */}
                <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
                  {statement.transactions.map((transaction, index) => (
                    <TransactionCard
                      key={transaction.id}
                      transaction={transaction}
                      index={index}
                      currency={currency}
                      onOpenDocument={openDocument}
                    />
                  ))}
                </div>

                {/* Desktop View: Full Financial Table */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-right text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                        <th className="w-10 px-3.5 py-3 text-center">#</th>
                        <th className="px-3.5 py-3">التاريخ</th>
                        <th className="px-3.5 py-3">البيان والتفاصيل</th>
                        <th className="px-3.5 py-3 text-emerald-600 dark:text-emerald-400">
                          لك (مدين +)
                        </th>
                        <th className="px-3.5 py-3 text-rose-600 dark:text-rose-400">
                          عليك (دائن -)
                        </th>
                        <th className="px-3.5 py-3">الرصيد بعدها</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100 font-medium dark:divide-slate-800">
                      {statement.transactions.map((transaction, index) => (
                        <TransactionTableRow
                          key={transaction.id}
                          transaction={transaction}
                          index={index}
                          currency={currency}
                          onOpenDocument={openDocument}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}

      {/* Sticky Bottom Summary Bar */}
      {statement && (
        <div
          ref={bottomActionsRef}
          className="fixed inset-x-2 bottom-2 z-40 sm:inset-x-4 sm:bottom-4"
        >
          <div className="relative mx-auto flex max-w-5xl items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95">
            {/* Pop-up menu anchored to the bottom sticky bar */}
            {isActionsOpen && (
              <div className="absolute bottom-16 end-0 z-50 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in slide-in-from-bottom-2 duration-150">
                {actionMenuItems}
              </div>
            )}

            <div className="min-w-0">
              <p className="text-[10px] font-bold text-slate-400">
                الرصيد الختامي بعد حركات الفترة
              </p>
              <div
                className={`truncate text-sm sm:text-base font-black tabular-nums ${balanceTone(
                  statement.closingBalance
                )}`}
              >
                {formatCurrency(Math.abs(statement.closingBalance), currency)}
                <span className="ms-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">
                  {balanceLabel(statement.closingBalance)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsActionsOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2.5 text-xs font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
            >
              <MoreVertical className="h-4 w-4" />
              <span>خيارات التقرير</span>
            </button>
          </div>
        </div>
      )}

      {/* OCR / Document Viewer Modal */}
      <ReceiptDocumentModal
        isOpen={!!selectedDocTrx}
        onClose={() => setSelectedDocTrx(null)}
        transaction={selectedDocTrx}
      />
    </div>
  );
};

interface AccountSearchProps {
  accountSearch: string;
  setAccountSearch: (value: string) => void;
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  filteredAccounts: AccountSearchable[];
  onSelect: (account: AccountSearchable) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  currency: string;
}

const AccountSearch: React.FC<AccountSearchProps> = ({
  accountSearch,
  setAccountSearch,
  isOpen,
  setIsOpen,
  filteredAccounts,
  onSelect,
  containerRef,
  inputRef,
  currency,
}) => {
  const hasText = accountSearch.trim().length > 0;

  return (
    <div ref={containerRef} className="relative">
      <label className="mb-1.5 flex items-center gap-1.5 text-[10px] font-black text-slate-500 dark:text-slate-400">
        <User className="h-3.5 w-3.5 text-teal-600" />
        ابحث عن الحساب
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

        <input
          ref={inputRef}
          type="text"
          value={accountSearch}
          onFocus={() => {
            // Dropdown only appears if user has typed characters
            if (accountSearch.trim().length > 0) {
              setIsOpen(true);
            }
          }}
          onChange={(event) => {
            const query = event.target.value;
            setAccountSearch(query);
            setIsOpen(query.trim().length > 0);
          }}
          placeholder="ابحث باسم الحساب أو رقم الهاتف..."
          className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 ps-9 pe-10 text-xs font-bold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/15 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-100"
        />

        {hasText && (
          <button
            type="button"
            onClick={() => {
              setAccountSearch('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute end-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            aria-label="مسح البحث"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown appears ONLY when hasText and isOpen */}
      {isOpen && hasText && (
        <div className="absolute inset-x-0 top-[4.25rem] z-50 max-h-72 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
          {filteredAccounts.length === 0 ? (
            <div className="p-5 text-center text-xs font-semibold text-slate-400">
              لا توجد حسابات مطابقة للبحث
            </div>
          ) : (
            filteredAccounts.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => onSelect(account)}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-right transition hover:bg-teal-50 dark:hover:bg-teal-950/40 active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
                    {account.name}
                  </div>
                  {account.phone && (
                    <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                      {account.phone}
                    </div>
                  )}
                </div>

                <div className="shrink-0 text-left">
                  <div
                    className={`text-[11px] font-black tabular-nums ${balanceTone(
                      account.currentBalance
                    )}`}
                  >
                    {formatCurrency(
                      Math.abs(account.currentBalance),
                      currency
                    )}
                  </div>
                  <div className="text-[9px] font-semibold text-slate-400">
                    {balanceLabel(account.currentBalance)}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const DateInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = ({ label, value, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-[9px] font-black text-slate-500 dark:text-slate-400">
      {label}
    </span>
    <input
      type="date"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 text-[10px] font-bold text-slate-800 outline-none focus:border-teal-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
    />
  </label>
);

const SummaryCards: React.FC<{
  statement: AccountStatementReport;
  currency: string;
}> = ({ statement, currency }) => (
  <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
    <SummaryCard
      title="الرصيد الافتتاحي"
      value={formatCurrency(Math.abs(statement.openingBalance), currency)}
      suffix={balanceLabel(statement.openingBalance)}
      tone={balanceTone(statement.openingBalance)}
    />

    <SummaryCard
      title="إجمالي لك (+)"
      value={`+${formatCurrency(statement.totalPeriodDebit, currency)}`}
      tone="text-emerald-700 dark:text-emerald-300"
      className="bg-emerald-50/70 dark:bg-emerald-950/30"
    />

    <SummaryCard
      title="إجمالي عليك (-)"
      value={`-${formatCurrency(statement.totalPeriodCredit, currency)}`}
      tone="text-rose-700 dark:text-rose-300"
      className="bg-rose-50/70 dark:bg-rose-950/30"
    />

    <SummaryCard
      title="الرصيد الختامي"
      value={formatCurrency(Math.abs(statement.closingBalance), currency)}
      suffix={balanceLabel(statement.closingBalance)}
      tone={balanceTone(statement.closingBalance)}
      className={
        statement.closingBalance > 0
          ? 'border-emerald-200 bg-emerald-100/50 dark:border-emerald-800 dark:bg-emerald-950/50'
          : statement.closingBalance < 0
            ? 'border-rose-200 bg-rose-100/50 dark:border-rose-800 dark:bg-rose-950/50'
            : ''
      }
    />
  </section>
);

const SummaryCard: React.FC<{
  title: string;
  value: string;
  suffix?: string;
  tone: string;
  className?: string;
}> = ({ title, value, suffix, tone, className = '' }) => (
  <div
    className={`rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 ${className}`}
  >
    <span className="block min-h-7 text-[9px] font-black leading-4 text-slate-500 dark:text-slate-400">
      {title}
    </span>
    <div className={`text-sm font-black tabular-nums ${tone}`}>
      {value}
    </div>
    {suffix && (
      <span className="text-[9px] font-bold text-slate-400">{suffix}</span>
    )}
  </div>
);

const TransactionCard: React.FC<{
  transaction: AccountStatementItem;
  index: number;
  currency: string;
  onOpenDocument: (transaction: AccountStatementItem) => void;
}> = ({ transaction, index, currency, onOpenDocument }) => {
  const isDebit = transaction.debitAmount > 0;
  const hasDocument = Boolean(
    transaction.receiptId ||
      transaction.documentRef ||
      transaction.documentMetadata
  );

  return (
    <article className="p-3 transition hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[9px] font-black text-slate-400">
              #{index + 1}
            </span>
            <span className="font-mono text-[10px] font-bold text-slate-500 dark:text-slate-400">
              {formatDate(transaction.date, 'short')}
            </span>
          </div>

          <div className="text-xs font-black text-slate-900 dark:text-slate-100">
            {transaction.note || 'عملية مالية'}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {transaction.receiptNumber && (
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                سند: {transaction.receiptNumber}
              </span>
            )}

            {hasDocument && (
              <button
                type="button"
                onClick={() => onOpenDocument(transaction)}
                className="inline-flex items-center gap-1 rounded-md border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[9px] font-black text-teal-700 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/60"
              >
                <Receipt className="h-3 w-3" />
                المستند
              </button>
            )}
          </div>
        </div>

        <div className="shrink-0 text-left">
          <div
            className={`text-sm font-black tabular-nums ${
              isDebit
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {isDebit
              ? `+${formatCurrency(transaction.debitAmount, currency)}`
              : `-${formatCurrency(transaction.creditAmount, currency)}`}
          </div>

          <div className="mt-1 text-[10px] font-bold text-slate-400">
            رصيد: {formatCurrency(Math.abs(transaction.runningBalance), currency)}
            <span className="ms-1">{balanceLabel(transaction.runningBalance)}</span>
          </div>
        </div>
      </div>
    </article>
  );
};

const TransactionTableRow: React.FC<{
  transaction: AccountStatementItem;
  index: number;
  currency: string;
  onOpenDocument: (transaction: AccountStatementItem) => void;
}> = ({ transaction, index, currency, onOpenDocument }) => {
  const isDebit = transaction.debitAmount > 0;
  const hasDocument = Boolean(
    transaction.receiptId ||
      transaction.documentRef ||
      transaction.documentMetadata
  );

  return (
    <tr className="transition hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
      <td className="px-3.5 py-2.5 text-center font-mono text-[11px] text-slate-400">
        {index + 1}
      </td>

      <td className="whitespace-nowrap px-3.5 py-2.5 font-mono text-[11px] text-slate-700 dark:text-slate-300">
        {formatDate(transaction.date, 'short')}
      </td>

      <td className="px-3.5 py-2.5">
        <div className="font-black text-slate-900 dark:text-slate-100">
          {transaction.note || 'عملية مالية'}
        </div>

        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          {transaction.receiptNumber && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              سند: {transaction.receiptNumber}
            </span>
          )}

          {hasDocument && (
            <button
              type="button"
              onClick={() => onOpenDocument(transaction)}
              className="inline-flex items-center gap-1 rounded border border-teal-200 bg-teal-50 px-1.5 py-0.5 text-[10px] font-black text-teal-700 transition hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-900/60"
            >
              <Receipt className="h-3 w-3" />
              المستند
            </button>
          )}
        </div>
      </td>

      <td className="px-3.5 py-2.5 font-mono font-black tabular-nums text-emerald-600 dark:text-emerald-400">
        {isDebit
          ? `+${formatCurrency(transaction.debitAmount, currency)}`
          : '—'}
      </td>

      <td className="px-3.5 py-2.5 font-mono font-black tabular-nums text-rose-600 dark:text-rose-400">
        {!isDebit
          ? `-${formatCurrency(transaction.creditAmount, currency)}`
          : '—'}
      </td>

      <td className="whitespace-nowrap px-3.5 py-2.5 font-mono font-black tabular-nums">
        <span className={balanceTone(transaction.runningBalance)}>
          {formatCurrency(Math.abs(transaction.runningBalance), currency)}
        </span>
        <span className="ms-1 text-[10px] font-normal text-slate-400">
          {balanceLabel(transaction.runningBalance)}
        </span>
      </td>
    </tr>
  );
};

const ReportAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-right text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 active:bg-slate-200"
  >
    <span className="text-teal-600 dark:text-teal-400">{icon}</span>
    <span>{label}</span>
    <ChevronDown className="ms-auto h-3.5 w-3.5 rotate-90 text-slate-300" />
  </button>
);

const Toast: React.FC<{ message: string }> = ({ message }) => (
  <div className="fixed left-1/2 top-4 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-bold text-white shadow-xl dark:bg-white dark:text-slate-900 animate-in fade-in slide-in-from-top-2 duration-150">
    <CheckCircle2 className="h-4 w-4 text-teal-400 dark:text-teal-600" />
    {message}
  </div>
);

