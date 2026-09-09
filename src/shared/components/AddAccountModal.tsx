import React, { useState, useMemo } from 'react';
import { X, UserPlus, Phone, FileText, Tag, UserCheck, ChevronDown } from 'lucide-react';
import { useUIStore, useAccountStore, useSettingsStore } from '@/shared/stores';
import { validateAccountForm } from '@/core/utils/validators';

const POPULAR_COUNTRY_CODES = [
  { code: '+967', label: '+967 (اليمن)' },
  { code: '+966', label: '+966 (السعودية)' },
  { code: '+20', label: '+20 (مصر)' },
  { code: '+971', label: '+971 (الإمارات)' },
  { code: '+965', label: '+965 (الكويت)' },
  { code: '+968', label: '+968 (عُمان)' },
  { code: '+962', label: '+962 (الأردن)' },
];

export const AddAccountModal: React.FC = () => {
  const isOpen = useUIStore((state) => state.isAddAccountOpen);
  const close = useUIStore((state) => state.closeAddAccount);
  const showToast = useUIStore((state) => state.showToast);
  const addAccount = useAccountStore((state) => state.addAccount);
  const accounts = useAccountStore((state) => state.accounts);
  const currency = useSettingsStore((state) => state.settings.currency);

  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+967');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<'personal' | 'supplier' | 'customer'>('customer');
  const [hasInitialBalance, setHasInitialBalance] = useState(false);
  const [initialBalance, setInitialBalance] = useState('');
  const [initialBalanceType, setInitialBalanceType] = useState<'owed_by_me' | 'owed_to_me'>('owed_to_me');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Autocomplete suggestions from existing accounts
  const nameSuggestions = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.name) set.add(a.name.trim());
    });
    return Array.from(set).slice(0, 15);
  }, [accounts]);

  const phoneSuggestions = useMemo(() => {
    const set = new Set<string>();
    accounts.forEach((a) => {
      if (a.phone) set.add(a.phone.trim());
    });
    return Array.from(set).slice(0, 15);
  }, [accounts]);

  if (!isOpen) return null;

  // Phone number auto-formatter: formats digits cleanly (e.g., 770 123 456)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const digitsOnly = raw.replace(/[^\d]/g, '');
    let formatted = digitsOnly;
    if (digitsOnly.length > 3 && digitsOnly.length <= 6) {
      formatted = `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3)}`;
    } else if (digitsOnly.length > 6) {
      formatted = `${digitsOnly.slice(0, 3)} ${digitsOnly.slice(3, 6)} ${digitsOnly.slice(6, 10)}`;
    }
    setPhone(formatted);
    if (errors.phone) setErrors((prev) => ({ ...prev, phone: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prepare full phone number with country code if provided
    const cleanNumber = phone.replace(/\s+/g, '').trim();
    const fullPhone = cleanNumber ? `${countryCode} ${cleanNumber}` : undefined;

    const validation = validateAccountForm({ name, phone: fullPhone });
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const initBalNum = hasInitialBalance && initialBalance ? parseFloat(initialBalance) : undefined;

      await addAccount({
        name: name.trim(),
        phone: fullPhone,
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
      setInitialBalanceType('owed_to_me');
      setErrors({});
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      {/* 1. النافذة الرئيسية مستقرة وثابتة في المنتصف مع أقصى ارتفاع وتمرير داخلي لمنع الاهتزاز */}
      <div
        id="add-account-modal"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150 my-auto"
      >
        {/* Header: رأس النافذة */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                إضافة حساب جديد
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                عميل، مورد، أو شخصي
              </p>
            </div>
          </div>

          <button
            onClick={close}
            aria-label="إغلاق"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[36px] min-h-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form: المحتوى المدمج في شبكة محكمة تقلل الطول الرأسي */}
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-5 space-y-3 sm:space-y-3.5 overflow-y-auto flex-1 overscroll-contain"
        >
          {/* Autocomplete Datalists */}
          <datalist id="account-name-autocomplete-list">
            {nameSuggestions.map((sug) => (
              <option key={sug} value={sug} />
            ))}
          </datalist>

          <datalist id="account-phone-autocomplete-list">
            {phoneSuggestions.map((sug) => (
              <option key={sug} value={sug} />
            ))}
          </datalist>

          {/* 1. حقل اسم الحساب / الشخص (4 أعمدة للعنوان و 8 أعمدة للحقل) */}
          <div className="grid grid-cols-12 gap-2 sm:gap-3 items-center">
            <label
              htmlFor="input-account-name"
              className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"
            >
              <span className="truncate">اسم الحساب</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="col-span-8">
              <input
                id="input-account-name"
                name="accountName"
                type="text"
                required
                autoComplete="name"
                list="account-name-autocomplete-list"
                placeholder="مثال: محمد أحمد، شركة النور..."
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[40px] sm:min-h-[42px]"
                autoFocus
              />
              {errors.name && (
                <p className="text-xs text-rose-500 mt-1">{errors.name}</p>
              )}
            </div>
          </div>

          {/* 2. حقل رقم الهاتف: الجهة اليمنى للعنوان (4 أعمدة) واليسرى لحقل الرقم والبادئة LTR (8 أعمدة) */}
          <div className="grid grid-cols-12 gap-2 sm:gap-3 items-center">
            <label
              htmlFor="input-account-phone"
              className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">رقم الهاتف</span>
            </label>

            <div className="col-span-8">
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition overflow-hidden min-h-[40px] sm:min-h-[42px]">
                {/* حقل إدخال رقم الهاتف في الجهة اليمنى */}
                <input
                  id="input-account-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  list="account-phone-autocomplete-list"
                  dir="ltr"
                  placeholder="77XXXXXXX"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="flex-1 px-3 py-2 bg-transparent text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:outline-hidden text-right font-medium placeholder:text-slate-400 min-w-0"
                />

                {/* فاصل بصري وقائمة مفتاح الدولة في الجهة اليسرى مع سهم منسدل واضح */}
                <div className="relative flex items-center shrink-0 border-s border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-750 transition h-full self-stretch">
                  <select
                    id="select-account-country-code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    dir="ltr"
                    aria-label="مفتاح الدولة"
                    className="appearance-none ps-2.5 pe-6 py-2 bg-transparent text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer h-full"
                  >
                    {POPULAR_COUNTRY_CODES.map((item) => (
                      <option
                        key={item.code}
                        value={item.code}
                        className="text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900"
                      >
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 pointer-events-none absolute end-1.5 shrink-0" />
                </div>
              </div>
              {errors.phone && (
                <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>
              )}
            </div>
          </div>

          {/* 3. حقل التصنيف: 4 أعمدة للعنوان والأيقونة و 8 أعمدة لأزرار التصنيف الأفقية الثلاثة (عميل، مورد، شخصي) */}
          <div className="grid grid-cols-12 gap-2 sm:gap-3 items-center">
            <label className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">التصنيف</span>
            </label>

            <div className="col-span-8 grid grid-cols-3 gap-1.5 sm:gap-2">
              {[
                { id: 'customer', label: 'عميل' },
                { id: 'supplier', label: 'مورد' },
                { id: 'personal', label: 'شخصي' },
              ].map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id as any)}
                    className={`py-1.5 px-1 sm:px-2 text-xs font-bold rounded-xl border transition-all min-h-[38px] sm:min-h-[40px] flex items-center justify-center text-center ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. حقل ملاحظة عن الحساب */}
          <div className="grid grid-cols-12 gap-2 sm:gap-3 items-start">
            <label
              htmlFor="textarea-account-note"
              className="col-span-4 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 pt-2"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">ملاحظة</span>
            </label>
            <div className="col-span-8">
              <textarea
                id="textarea-account-note"
                rows={2}
                placeholder="مثال: عنوان السكن أو العمل، طبيعة التعامل..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition resize-none min-h-[42px]"
              />
            </div>
          </div>

          {/* 5. خانة اختيار تسجيل رصيد افتتاحي سابق */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                id="checkbox-has-initial-balance"
                type="checkbox"
                checked={hasInitialBalance}
                onChange={(e) => setHasInitialBalance(e.target.checked)}
                className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700"
              />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                تسجيل رصيد افتتاحي سابق
              </span>
            </label>

            {hasInitialBalance && (
              <div className="mt-2.5 space-y-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 animate-in fade-in duration-150">
                {/* المبلغ */}
                <div className="grid grid-cols-12 gap-2 sm:gap-3 items-center">
                  <label
                    htmlFor="input-initial-balance-amount"
                    className="col-span-4 text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    المبلغ ({currency})
                  </label>
                  <div className="col-span-8">
                    <input
                      id="input-initial-balance-amount"
                      type="number"
                      step="any"
                      min="0"
                      placeholder="0.00"
                      value={initialBalance}
                      onChange={(e) => setInitialBalance(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-bold min-h-[38px] sm:min-h-[40px] focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>
                </div>

                {/* طبيعة الرصيد */}
                <div className="grid grid-cols-12 gap-2 sm:gap-3 items-center">
                  <span className="col-span-4 text-xs font-medium text-slate-600 dark:text-slate-400">
                    طبيعة الرصيد
                  </span>
                  <div className="col-span-8 grid grid-cols-2 gap-2">
                    {/* لك عنده (مستحق لك) - أخضر */}
                    <button
                      type="button"
                      id="btn-balance-owed-to-me"
                      onClick={() => setInitialBalanceType('owed_to_me')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-xl border transition-all min-h-[38px] flex items-center justify-center text-center ${
                        initialBalanceType === 'owed_to_me'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      لك عنده (مستحق لك)
                    </button>

                    {/* له عليك (عليك له) - وردي */}
                    <button
                      type="button"
                      id="btn-balance-owed-by-me"
                      onClick={() => setInitialBalanceType('owed_by_me')}
                      className={`py-1.5 px-2 text-xs font-bold rounded-xl border transition-all min-h-[38px] flex items-center justify-center text-center ${
                        initialBalanceType === 'owed_by_me'
                          ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 shadow-xs ring-1 ring-rose-500'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      له عليك (عليك له)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 6. زر الحفظ الرئيسي في الأسفل */}
          <div className="pt-2">
            <button
              id="btn-submit-account"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 sm:py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs shadow-teal-700/20 active:scale-[0.99] transition-all min-h-[44px]"
            >
              <UserCheck className="w-4 h-4 shrink-0" />
              <span>{isSubmitting ? 'جاري الحفظ...' : 'حفظ الحساب'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
