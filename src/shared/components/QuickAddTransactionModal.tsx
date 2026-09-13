import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  FileText,
  UserPlus,
  Hash,
  Search,
  User,
} from 'lucide-react';
import {
  useUIStore,
  useAccountStore,
  useTransactionStore,
  useSettingsStore,
} from '@/shared/stores';
import { TransactionType, Account } from '@/shared/types';
import { formatCurrency } from '@/core/utils/formatters';
import { validateTransactionForm } from '@/core/utils/validators';

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();

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

type AccountSearchable = Account & {
  phone?: string;
};

export const QuickAddTransactionModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isQuickAddTransactionOpen);
  const preselectedAccountId = useUIStore((state) => state.preselectedAccountId);
  const close = useUIStore((state) => state.closeQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);
  const showToast = useUIStore((state) => state.showToast);

  const accounts = useAccountStore((state) => state.accounts) as AccountSearchable[];
  const settings = useSettingsStore((state) => state.settings);
  const currency = settings.currency;
  const addTransaction = useTransactionStore((state) => state.addTransaction);

  const [accountId, setAccountId] = useState<string>('');
  const [accountSearch, setAccountSearch] = useState<string>('');
  const [isAccountSearchOpen, setIsAccountSearchOpen] = useState<boolean>(false);

  const [type, setType] = useState<TransactionType>('debit');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [note, setNote] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [showMoreFields, setShowMoreFields] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize form state when modal opens
  useEffect(() => {
    if (isOpen) {
      if (preselectedAccountId) {
        const found = accounts.find((a) => a.id === preselectedAccountId);
        if (found) {
          setAccountId(found.id);
          setAccountSearch(found.name);
        } else {
          setAccountId('');
          setAccountSearch('');
        }
      } else {
        // Requirement 1: Empty by default
        setAccountId('');
        setAccountSearch('');
      }

      setType(settings.defaultTransactionType || 'debit');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setReceiptNumber('');
      setShowMoreFields(false);
      setErrors({});
      setIsAccountSearchOpen(false);
    }
  }, [isOpen, preselectedAccountId, accounts, settings.defaultTransactionType]);

  // Click outside to close account search dropdown
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsAccountSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const normalizedQuery = normalizeSearchText(accountSearch);
  const hasSearchText = normalizedQuery.length > 0;

  const filteredAccounts = useMemo(() => {
    if (!hasSearchText) return accounts.slice(0, 15);

    return accounts
      .filter((account) => {
        const name = normalizeSearchText(account.name || '');
        const phone = normalizeSearchText(account.phone || '');
        return name.includes(normalizedQuery) || phone.includes(normalizedQuery);
      })
      .slice(0, 20);
  }, [accounts, hasSearchText, normalizedQuery]);

  const selectedAccount = useMemo(() => {
    if (!accountId) return null;
    return accounts.find((a) => a.id === accountId) || null;
  }, [accounts, accountId]);

  if (!isOpen) return null;

  const handleAmountShortcut = (value: number) => {
    const current = parseFloat(amount) || 0;
    setAmount(String(current + value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);

    const validation = validateTransactionForm({
      accountId,
      amount: numAmount,
      date,
    });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await addTransaction({
        accountId,
        type,
        amount: numAmount,
        date,
        note: note.trim() || undefined,
        receiptNumber: receiptNumber.trim() || undefined,
      });

      const typeLabel = type === 'debit' ? 'لك' : 'عليك';
      showToast(
        `تم تسجيل العملية بنجاح (${typeLabel}: ${formatCurrency(
          numAmount,
          currency
        )})`,
        'success'
      );

      // Requirement 4: Persistent Modal - Do NOT close! Reset amount, note, receiptNumber and keep modal open
      setAmount('');
      setNote('');
      setReceiptNumber('');
      setErrors({});
    } catch (err) {
      console.error('Failed to save transaction:', err);
      showToast('تعذر حفظ العملية، يرجى المحاولة مرة أخرى', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="quick-add-transaction-modal-overlay"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        id="quick-add-transaction-modal"
        className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] sm:my-auto animate-in slide-in-from-bottom duration-200"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold">
              +
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تسجيل عملية سريعة
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                دفتر الحسابات والذمم
              </p>
            </div>
          </div>

          <button
            id="btn-close-quick-add"
            onClick={close}
            aria-label="إغلاق"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* 1. Searchable Autocomplete Account Selector & Live Balance Preview */}
          <div ref={containerRef} className="relative">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-teal-600" />
                الحساب / الشخص
              </label>
              <button
                type="button"
                onClick={() => {
                  close();
                  openAddAccount();
                }}
                className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 font-semibold"
              >
                <UserPlus className="w-3.5 h-3.5" />
                حساب جديد
              </button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                ref={inputRef}
                type="text"
                value={accountSearch}
                onFocus={() => setIsAccountSearchOpen(true)}
                onChange={(e) => {
                  const query = e.target.value;
                  setAccountSearch(query);
                  setIsAccountSearchOpen(true);
                  if (accountId) {
                    setAccountId(''); // Clear selected account if user changes typing
                  }
                  if (errors.accountId) {
                    setErrors((prev) => ({ ...prev, accountId: '' }));
                  }
                }}
                placeholder="ابحث باسم الحساب أو رقم الهاتف..."
                className="w-full h-12 ps-10 pe-10 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
              />

              {accountSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setAccountSearch('');
                    setAccountId('');
                    setIsAccountSearchOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label="مسح البحث"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Dropdown Autocomplete Results */}
            {isAccountSearchOpen && (
              <div className="absolute inset-x-0 top-full mt-1.5 z-50 max-h-60 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
                {filteredAccounts.length === 0 ? (
                  <div className="p-4 text-center text-xs font-semibold text-slate-400">
                    لا توجد حسابات مطابقة للبحث
                  </div>
                ) : (
                  filteredAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setAccountId(acc.id);
                        setAccountSearch(acc.name);
                        setIsAccountSearchOpen(false);
                        if (errors.accountId) {
                          setErrors((prev) => ({ ...prev, accountId: '' }));
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-right transition hover:bg-teal-50 dark:hover:bg-teal-950/40 active:scale-[0.99]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black text-slate-800 dark:text-slate-100">
                          {acc.name}
                        </div>
                        {acc.phone && (
                          <div className="mt-0.5 text-[10px] font-semibold text-slate-400">
                            {acc.phone}
                          </div>
                        )}
                      </div>

                      <div className="shrink-0 text-left">
                        <div
                          className={`text-[11px] font-black tabular-nums ${balanceTone(
                            acc.currentBalance
                          )}`}
                        >
                          {formatCurrency(
                            Math.abs(acc.currentBalance),
                            currency
                          )}
                        </div>
                        <div className="text-[9px] font-semibold text-slate-400">
                          {balanceLabel(acc.currentBalance)}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Requirement 2: Live Balance Preview under selected account */}
            {selectedAccount && (
              <div className="mt-2 flex items-center gap-2 px-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-semibold">
                  الرصيد الحالي:
                </span>
                <span
                  className={`font-black tabular-nums ${balanceTone(
                    selectedAccount.currentBalance
                  )}`}
                >
                  {formatCurrency(
                    Math.abs(selectedAccount.currentBalance),
                    currency
                  )}
                  <span className="ms-1 font-bold">
                    ({balanceLabel(selectedAccount.currentBalance)})
                  </span>
                </span>
              </div>
            )}

            {errors.accountId && (
              <p className="text-xs text-rose-500 mt-1">{errors.accountId}</p>
            )}
          </div>

          {/* 2. Transaction Type (لي / علي) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              نوع المعاملة
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                id="btn-type-debit"
                onClick={() => setType('debit')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all min-h-[48px] ${
                  type === 'debit'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <ArrowUpRight
                  className={`w-5 h-5 ${
                    type === 'debit' ? 'text-emerald-600' : ''
                  }`}
                />
                <span>لي (أعطيته / مطلوب منه)</span>
              </button>

              <button
                type="button"
                id="btn-type-credit"
                onClick={() => setType('credit')}
                className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 font-bold text-sm transition-all min-h-[48px] ${
                  type === 'credit'
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                }`}
              >
                <ArrowDownLeft
                  className={`w-5 h-5 ${
                    type === 'credit' ? 'text-rose-600' : ''
                  }`}
                />
                <span>علي (أخذت منه / مستحق له)</span>
              </button>
            </div>
          </div>

          {/* 3. Amount Field & Additive Quick Chips + Clear C Button */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              المبلغ ({currency})
            </label>
            <div className="relative">
              <input
                id="input-transaction-amount"
                type="number"
                step="any"
                inputMode="decimal"
                value={amount}
                placeholder="0"
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount)
                    setErrors((prev) => ({ ...prev, amount: '' }));
                }}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-2xl font-extrabold text-start focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition tracking-wide tabular-nums min-h-[52px]"
                autoFocus
              />
            </div>
            {errors.amount && (
              <p className="text-xs text-rose-500 mt-1">{errors.amount}</p>
            )}

            {/* Quick Amount Chips (+1000, +5000, +10000, C) */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] text-slate-400 ms-1">إضافة سريعة:</span>
              {[1000, 5000, 10000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAmountShortcut(val)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition active:scale-95"
                >
                  +{val.toLocaleString('ar-YE')}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setAmount('')}
                className="px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-bold transition active:scale-95 ms-auto"
                title="مسح الحقل"
              >
                C (مسح)
              </button>
            </div>
          </div>

          {/* 4. Date Field */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              التاريخ
            </label>
            <div className="relative flex items-center">
              <input
                id="input-transaction-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[44px]"
              />
            </div>
          </div>

          {/* Optional Fields Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setShowMoreFields(!showMoreFields)}
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 font-medium underline flex items-center gap-1"
            >
              {showMoreFields
                ? 'إخفاء الحقول الإضافية'
                : '+ إضافة ملاحظة أو رقم سند (اختياري)'}
            </button>
          </div>

          {/* 5. Additional Note and Receipt Fields */}
          {showMoreFields && (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-150">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  البيان / الملاحظة
                </label>
                <input
                  type="text"
                  value={note}
                  placeholder="مثال: دفعة حساب، شراء بضاعة، سلفة..."
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <Hash className="w-3.5 h-3.5 text-slate-400" />
                    رقم الإيصال / السند
                  </label>
                  {settings.invoiceNumberingFormat !== 'manual' && (
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                      سيتم التوليد تلقائياً إذا ترك فارغاً
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={receiptNumber}
                  placeholder={
                    settings.invoiceNumberingFormat === 'manual'
                      ? 'مثال: REC-1002'
                      : 'اتركه فارغاً للتوليد التلقائي'
                  }
                  onChange={(e) => setReceiptNumber(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition"
                />
              </div>
            </div>
          )}

          {/* Submit Action */}
          <div className="pt-3">
            <button
              id="btn-submit-transaction"
              type="submit"
              disabled={isSubmitting || accounts.length === 0}
              className="w-full py-3.5 px-5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-teal-700/20 active:scale-[0.99] transition-all min-h-[48px]"
            >
              <Check className="w-5 h-5" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ العملية'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
