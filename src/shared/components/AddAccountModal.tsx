import React, { useState } from 'react';
import { X, UserCheck, Phone, FileText, Tag, Wallet } from 'lucide-react';
import { useUIStore, useAccountStore, useSettingsStore } from '@/shared/stores';
import { validateAccountForm } from '@/core/utils/validators';

export const AddAccountModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isAddAccountOpen);
  const close = useUIStore((state) => state.closeAddAccount);
  const showToast = useUIStore((state) => state.showToast);
  const addAccount = useAccountStore((state) => state.addAccount);
  const currency = useSettingsStore((state) => state.settings.currency);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<'customer' | 'supplier' | 'personal' | 'other'>('customer');
  const [hasInitialBalance, setHasInitialBalance] = useState(false);
  const [initialBalance, setInitialBalance] = useState('');
  const [initialBalanceType, setInitialBalanceType] = useState<'owed_to_me' | 'owed_by_me'>('owed_to_me');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = validateAccountForm({ name, phone });
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const initBalNum = hasInitialBalance && initialBalance ? parseFloat(initialBalance) : undefined;

      await addAccount({
        name: name.trim(),
        phone: phone.trim() || undefined,
        note: note.trim() || undefined,
        category,
        initialBalance: initBalNum,
        initialBalanceType,
      });

      showToast(`تم إضافة الحساب "${name.trim()}" بنجاح`, 'success');
      // Reset form
      setName('');
      setPhone('');
      setNote('');
      setCategory('customer');
      setHasInitialBalance(false);
      setInitialBalance('');
      close();
    } catch (err) {
      console.error('Failed to create account:', err);
      showToast('تعذر إضافة الحساب، يرجى المحاولة ثانية', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="add-account-modal-overlay"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        id="add-account-modal"
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                إضافة حساب جديد
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                عميل، مورد، أو شخص
              </p>
            </div>
          </div>

          <button
            onClick={close}
            aria-label="إغلاق"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              اسم الحساب / الشخص *
            </label>
            <input
              id="input-account-name"
              type="text"
              required
              placeholder="مثال: محمد أحمد، شركة النور..."
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[44px]"
              autoFocus
            />
            {errors.name && <p className="text-xs text-rose-500 mt-1">{errors.name}</p>}
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              رقم الهاتف (اختياري)
            </label>
            <input
              id="input-account-phone"
              type="tel"
              dir="ltr"
              placeholder="77XXXXXXX"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition text-end"
            />
            {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              التصنيف
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'customer', label: 'عميل' },
                { id: 'supplier', label: 'مورد' },
                { id: 'personal', label: 'شخصي' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id as any)}
                  className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${
                    category === cat.id
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Initial Balance toggle */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasInitialBalance}
                onChange={(e) => setHasInitialBalance(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                تسجيل رصيد افتتاحي سابق
              </span>
            </label>

            {hasInitialBalance && (
              <div className="mt-3 space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 animate-in fade-in duration-150">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    المبلغ الافتتاحي ({currency})
                  </label>
                  <input
                    type="number"
                    step="any"
                    placeholder="0"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setInitialBalanceType('owed_to_me')}
                    className={`py-1.5 px-2 text-xs font-bold rounded-lg border ${
                      initialBalanceType === 'owed_to_me'
                        ? 'border-emerald-500 bg-emerald-100/70 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    لك عنده (مستحق لك)
                  </button>
                  <button
                    type="button"
                    onClick={() => setInitialBalanceType('owed_by_me')}
                    className={`py-1.5 px-2 text-xs font-bold rounded-lg border ${
                      initialBalanceType === 'owed_by_me'
                        ? 'border-rose-500 bg-rose-100/70 dark:bg-rose-900/50 text-rose-800 dark:text-rose-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    له عندك (عليك له)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              ملاحظة عن الحساب (اختياري)
            </label>
            <textarea
              rows={2}
              placeholder="مثال: عنوان السكن أو العمل، طبيعة التعامل..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition resize-none"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              id="btn-submit-account"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm shadow-teal-700/20 active:scale-[0.99] transition-all min-h-[46px]"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ الحساب'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
