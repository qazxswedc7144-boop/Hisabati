import React, { useState, useEffect } from 'react';
import { X, Check, ArrowUpRight, ArrowDownLeft, Calendar, FileText, UserPlus, Hash } from 'lucide-react';
import { useUIStore, useAccountStore, useTransactionStore, useSettingsStore } from '@/shared/stores';
import { TransactionType } from '@/shared/types';
import { formatCurrency } from '@/core/utils/formatters';
import { validateTransactionForm } from '@/core/utils/validators';

export const QuickAddTransactionModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isQuickAddTransactionOpen);
  const preselectedAccountId = useUIStore((state) => state.preselectedAccountId);
  const close = useUIStore((state) => state.closeQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);
  const showToast = useUIStore((state) => state.showToast);

  const accounts = useAccountStore((state) => state.accounts);
  const currency = useSettingsStore((state) => state.settings.currency);
  const addTransaction = useTransactionStore((state) => state.addTransaction);

  const [accountId, setAccountId] = useState<string>('');
  const [type, setType] = useState<TransactionType>('debit'); // 'debit' = لي | 'credit' = علي
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [showMoreFields, setShowMoreFields] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setAccountId(preselectedAccountId || (accounts.length > 0 ? accounts[0].id : ''));
      setType('debit');
      setAmount('');
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setReceiptNumber('');
      setShowMoreFields(false);
      setErrors({});
    }
  }, [isOpen, preselectedAccountId, accounts]);

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

      const selectedAcc = accounts.find((a) => a.id === accountId);
      const typeLabel = type === 'debit' ? 'لك' : 'عليك';
      showToast(`تم تسجيل العملية بنجاح (${typeLabel}: ${formatCurrency(numAmount, currency)})`, 'success');
      close();
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
        className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200"
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
          {/* 1. Account Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
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

            {accounts.length === 0 ? (
              <div className="p-3 text-center bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800/40 text-amber-800 dark:text-amber-300 text-xs">
                لا يوجد أي حسابات مسجلة بعد.
                <button
                  type="button"
                  onClick={() => {
                    close();
                    openAddAccount();
                  }}
                  className="mx-1 font-bold underline text-amber-900 dark:text-amber-200"
                >
                  أضف أول حساب الآن
                </button>
              </div>
            ) : (
              <select
                id="select-transaction-account"
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  if (errors.accountId) setErrors((prev) => ({ ...prev, accountId: '' }));
                }}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-medium focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[46px]"
              >
                <option value="" disabled>
                  -- اختر الشخص أو الحساب --
                </option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} {acc.phone ? `(${acc.phone})` : ''}
                  </option>
                ))}
              </select>
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
                <ArrowUpRight className={`w-5 h-5 ${type === 'debit' ? 'text-emerald-600' : ''}`} />
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
                <ArrowDownLeft className={`w-5 h-5 ${type === 'credit' ? 'text-rose-600' : ''}`} />
                <span>علي (أخذت منه / مستحق له)</span>
              </button>
            </div>
          </div>

          {/* 3. Amount Field & Fast Shortcuts */}
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
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: '' }));
                }}
                className="w-full px-4 py-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-2xl font-extrabold text-start focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition tracking-wide tabular-nums min-h-[52px]"
                autoFocus
              />
            </div>
            {errors.amount && (
              <p className="text-xs text-rose-500 mt-1">{errors.amount}</p>
            )}

            {/* Quick Amount Pills */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] text-slate-400 ms-1">إضافة سريعة:</span>
              {[1000, 5000, 10000, 50000].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleAmountShortcut(val)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition active:scale-95"
                >
                  +{val.toLocaleString('ar-YE')}
                </button>
              ))}
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
              {showMoreFields ? 'إخفاء الحقول الإضافية' : '+ إضافة ملاحظة أو رقم سند (اختياري)'}
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  رقم الإيصال / السند
                </label>
                <input
                  type="text"
                  value={receiptNumber}
                  placeholder="مثال: REC-1002"
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
