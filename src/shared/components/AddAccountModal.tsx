import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, UserPlus, Phone, FileText, Tag, UserCheck } from 'lucide-react';
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
  
  // Mobile keyboard slide-up / scroll adjustment state
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Monitor visualViewport for mobile virtual keyboard changes
  useEffect(() => {
    if (!isOpen) return;

    const handleResize = () => {
      if (window.visualViewport) {
        const isKeyboard = window.visualViewport.height < window.innerHeight * 0.82;
        setIsKeyboardOpen(isKeyboard);
      }
    };

    window.visualViewport?.addEventListener('resize', handleResize);
    return () => {
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [isOpen]);

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
    // Allow digits, spaces, and hyphens
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

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setIsInputFocused(true);
    // Smoothly scroll the focused element into view
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  const handleInputBlur = () => {
    setIsInputFocused(false);
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
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-0 sm:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        id="add-account-modal"
        className={`w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] transition-all duration-300 ease-out animate-in slide-in-from-bottom ${
          isInputFocused || isKeyboardOpen
            ? 'translate-y-[-10px] sm:translate-y-0'
            : 'translate-y-0'
        }`}
      >
        {/* 1. Header: عنوان النافذة والأيقونة في الأعلى مع زر إغلاق (X) */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                إضافة حساب جديد
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                شخصي، مورد، أو عميل
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

        {/* 2. Body Form */}
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain"
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

          {/* حقل اسم الحساب / الشخص مع نص توضيحي وخاصية التنبؤ */}
          <div>
            <label
              htmlFor="input-account-name"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1"
            >
              اسم الحساب / الشخص <span className="text-rose-500">*</span>
            </label>
            <input
              id="input-account-name"
              name="accountName"
              type="text"
              required
              autoComplete="name"
              list="account-name-autocomplete-list"
              placeholder="مثال: محمد أحمد، شركة النور..."
              value={name}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[44px]"
              autoFocus
            />
            {errors.name && (
              <p className="text-xs text-rose-500 mt-1">{errors.name}</p>
            )}
          </div>

          {/* حقل رقم الهاتف (اختياري) متبوعاً بمفتاح الدولة وتنسيق الرقم مع خاصية التنبؤ */}
          <div>
            <label
              htmlFor="input-account-phone"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"
            >
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              <span>رقم الهاتف (اختياري)</span>
            </label>

            <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition overflow-hidden min-h-[44px]">
              {/* مفتاح الدولة */}
              <select
                id="select-account-country-code"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                dir="ltr"
                aria-label="مفتاح الدولة"
                className="px-2.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-e border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-hidden cursor-pointer shrink-0"
              >
                {POPULAR_COUNTRY_CODES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.label}
                  </option>
                ))}
              </select>

              {/* رقم الهاتف المنسق مع الاقتراحات */}
              <input
                id="input-account-phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                list="account-phone-autocomplete-list"
                dir="ltr"
                placeholder="770 000 000"
                value={phone}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                onChange={handlePhoneChange}
                className="w-full px-3.5 py-2 bg-transparent text-slate-900 dark:text-slate-100 text-sm focus:outline-hidden text-start font-medium"
              />
            </div>
            {errors.phone && (
              <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>
            )}
          </div>

          {/* أزرار تصنيف أفقية متجاورة (شخصي | مورد | عميل) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1">
              <Tag className="w-3.5 h-3.5 text-slate-400" />
              <span>التصنيف</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'personal', label: 'شخصي' },
                { id: 'supplier', label: 'مورد' },
                { id: 'customer', label: 'عميل' },
              ].map((cat) => {
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id as any)}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all min-h-[40px] flex items-center justify-center ${
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

          {/* خانة اختيار تسجيل رصيد افتتاحي سابق مع خيارات طبيعة الرصيد */}
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
              <div className="mt-3 space-y-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 animate-in fade-in duration-150">
                <div>
                  <label
                    htmlFor="input-initial-balance-amount"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    المبلغ الافتتاحي ({currency})
                  </label>
                  <input
                    id="input-initial-balance-amount"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={initialBalance}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold min-h-[42px] focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                {/* زرا اختيار طبيعة الرصيد ("له عليك (عليك له)" بالوردي و "لك عنده (مستحق لك)" بالأخضر) */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {/* له عليك (عليك له) - وردي */}
                  <button
                    type="button"
                    id="btn-balance-owed-by-me"
                    onClick={() => setInitialBalanceType('owed_by_me')}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all min-h-[40px] flex items-center justify-center text-center ${
                      initialBalanceType === 'owed_by_me'
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 shadow-xs ring-1 ring-rose-500'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    له عليك (عليك له)
                  </button>

                  {/* لك عنده (مستحق لك) - أخضر */}
                  <button
                    type="button"
                    id="btn-balance-owed-to-me"
                    onClick={() => setInitialBalanceType('owed_to_me')}
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all min-h-[40px] flex items-center justify-center text-center ${
                      initialBalanceType === 'owed_to_me'
                        ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 shadow-xs ring-1 ring-emerald-500'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    لك عنده (مستحق لك)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* حقل نصي لاختيار "ملاحظة عن الحساب (اختياري)" */}
          <div>
            <label
              htmlFor="textarea-account-note"
              className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>ملاحظة عن الحساب (اختياري)</span>
            </label>
            <textarea
              id="textarea-account-note"
              rows={2}
              placeholder="مثال: عنوان السكن أو العمل، طبيعة التعامل..."
              value={note}
              onFocus={handleInputFocus}
              onBlur={handleInputBlur}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition resize-none"
            />
          </div>

          {/* زر عريض رئيسي في الأسفل مكتوب عليه "حفظ الحساب" مع أيقونة */}
          <div className="pt-2 pb-1">
            <button
              id="btn-submit-account"
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs shadow-teal-700/20 active:scale-[0.99] transition-all min-h-[46px]"
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
