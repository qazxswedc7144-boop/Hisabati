import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, UserPlus, Phone, FileText, Tag, UserCheck, ChevronDown, Contact, Search, Check, ExternalLink } from 'lucide-react';
import { useUIStore, useAccountStore, useSettingsStore } from '@/shared/stores';
import { validateAccountForm } from '@/core/utils/validators';
import { useLockBody } from '@/shared/hooks';

const normalizeSearchText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();

export const AddAccountModal: React.FC = () => {
  const navigate = useNavigate();
  const isOpen = useUIStore((state) => state.isAddAccountOpen);
  const close = useUIStore((state) => state.closeAddAccount);
  const showToast = useUIStore((state) => state.showToast);
  const addAccount = useAccountStore((state) => state.addAccount);
  const accounts = useAccountStore((state) => state.accounts);
  const currency = useSettingsStore((state) => state.settings.currency);

  useLockBody(isOpen);

  const [name, setName] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [category, setCategory] = useState<'personal' | 'supplier' | 'customer'>('customer');
  const [hasInitialBalance, setHasInitialBalance] = useState(false);
  const [initialBalance, setInitialBalance] = useState('');
  const [initialBalanceType, setInitialBalanceType] = useState<'owed_by_me' | 'owed_to_me'>('owed_to_me');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close search dropdown
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const normalizedQuery = useMemo(() => normalizeSearchText(name), [name]);
  const filteredAccounts = useMemo(() => {
    if (!normalizedQuery) return [];
    return accounts
      .filter((acc) => {
        const accName = normalizeSearchText(acc.name || '');
        const accPhone = normalizeSearchText(acc.phone || '');
        return accName.includes(normalizedQuery) || accPhone.includes(normalizedQuery);
      })
      .slice(0, 5);
  }, [accounts, normalizedQuery]);

  const canPickContacts = typeof navigator !== 'undefined' && 'contacts' in navigator && 'select' in (navigator as any).contacts;

  const handlePickContact = async () => {
    try {
      const isIframe = typeof window !== 'undefined' && window.self !== window.top;
      if (isIframe) {
        showToast('لمزيد من الأمان، يرجى فتح التطبيق في علامة تبويب جديدة لاستخدام ميزة اختيار جهات الاتصال', 'info');
        return;
      }

      if (canPickContacts) {
        const props = ['name', 'tel'];
        const opts = { multiple: false };
        const pickedContacts = await (navigator as any).contacts.select(props, opts);
        
        if (pickedContacts.length > 0) {
          const contact = pickedContacts[0];
          if (contact.name && contact.name.length > 0 && !name) {
            setName(contact.name[0]);
          }
          if (contact.tel && contact.tel.length > 0) {
            const pickedNum = contact.tel[0];
            const digitsOnly = pickedNum.replace(/[^\d]/g, '');
            let finalNum = digitsOnly;
            if (digitsOnly.startsWith('967')) {
              finalNum = digitsOnly.slice(3);
            } else if (digitsOnly.startsWith('00967')) {
              finalNum = digitsOnly.slice(5);
            } else if (digitsOnly.startsWith('0')) {
              finalNum = digitsOnly.slice(1);
            }
            
            let formatted = finalNum;
            if (finalNum.length > 3 && finalNum.length <= 6) {
              formatted = `${finalNum.slice(0, 3)} ${finalNum.slice(3)}`;
            } else if (finalNum.length > 6) {
              formatted = `${finalNum.slice(0, 3)} ${finalNum.slice(3, 6)} ${finalNum.slice(6, 10)}`;
            }
            setPhone(formatted);
          }
        }
      } else {
        showToast('ميزة اختيار جهات الاتصال غير مدعومة في هذا المتصفح أو الجهاز حالياً', 'info');
      }
    } catch (err: any) {
      console.error('Contact picker error:', err);
      if (err?.message?.includes('top frame')) {
        showToast('يرجى فتح التطبيق في علامة تبويب جديدة لاستخدام ميزة جهات الاتصال', 'info');
      }
    }
  };

  if (!isOpen) return null;

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
    const cleanNumber = phone.replace(/\s+/g, '').trim();
    // Defaulting to +967 for now as per previous logic but without the selector UI
    const fullPhone = cleanNumber ? `+967 ${cleanNumber}` : undefined;

    const validation = validateAccountForm({ name, phone: fullPhone });
    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }

    // Smart Duplicate Validation (Total Match Check)
    const normalizedNewName = normalizeSearchText(name);
    const existingMatch = accounts.find((acc) => {
      const nameMatch = normalizeSearchText(acc.name) === normalizedNewName;
      const phoneMatch = (acc.phone || '').trim() === (fullPhone || '').trim();
      return nameMatch && phoneMatch;
    });

    if (existingMatch) {
      setErrors({ name: 'هذا الحساب موجود بالفعل بنفس الاسم ورقم الهاتف' });
      showToast('تنبيه: لا يمكن إنشاء حساب مطابِق تماماً لحساب موجود', 'error');
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
      <div
        id="add-account-modal"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85dvh] animate-in fade-in zoom-in-95 duration-150 my-auto"
      >
        {/* Header */}
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

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1 overscroll-contain"
        >
          {/* 1. حقل اسم الحساب التنبؤي */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-account-name"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"
            >
              <span>اسم الحساب</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="relative" ref={containerRef}>
              <div className="relative">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  id="input-account-name"
                  name="accountName"
                  type="text"
                  required
                  placeholder="مثال: محمد أحمد، شركة النور..."
                  autoComplete="off"
                  value={name}
                  onFocus={() => {
                    if (name.trim().length > 0) setIsSearchOpen(true);
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    setIsSearchOpen(val.trim().length > 0);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: '' }));
                  }}
                  className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm font-bold focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition min-h-[44px]"
                  autoFocus
                />
              </div>

              {/* Search Results Dropdown (Clickable Predictive Search) */}
              {isSearchOpen && filteredAccounts.length > 0 && (
                <div className="absolute inset-x-0 top-full mt-1 z-50 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-900 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-2.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 mb-1">
                    حسابات موجودة بالفعل
                  </div>
                  {filteredAccounts.map((acc) => (
                    <button
                      key={acc.id}
                      type="button"
                      onClick={() => {
                        setIsSearchOpen(false);
                        close();
                        navigate(`/accounts/${acc.id}`);
                        showToast(`تم التوجيه إلى حساب "${acc.name}" موجود مسبقاً`, 'info');
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-right hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-transparent hover:border-teal-100/50 transition-all mb-1 last:mb-0 group"
                    >
                      <div className="min-w-0 text-right">
                        <div className="truncate text-xs font-black text-slate-700 dark:text-slate-200 group-hover:text-teal-700 dark:group-hover:text-teal-300">
                          {acc.name}
                        </div>
                        {acc.phone && (
                          <div className="text-[10px] text-slate-500">{acc.phone}</div>
                        )}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-teal-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  ))}
                  <div className="p-2 text-[10px] text-slate-500 text-center border-t border-slate-100 dark:border-slate-800 mt-1">
                    اختيار حساب موجود سيقوم بنقلك إليه مباشرة
                  </div>
                </div>
              )}

              {errors.name && (
                <p className="text-xs text-rose-500 mt-1">{errors.name}</p>
              )}
            </div>
          </div>

          {/* 2. حقل رقم الهاتف النظيف - كامل العرض */}
          <div className="space-y-1.5">
            <label
              htmlFor="input-account-phone"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
            >
              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>رقم الهاتف</span>
            </label>

            <div className="relative group">
              <div className="flex items-center rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-teal-500 transition overflow-hidden min-h-[44px]">
                <input
                  id="input-account-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  dir="ltr"
                  placeholder="77XXXXXXX"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="flex-1 px-4 py-2.5 bg-transparent text-slate-900 dark:text-slate-100 text-sm focus:outline-none text-right font-bold placeholder:text-slate-400 min-w-0"
                />

                <button
                  type="button"
                  onClick={handlePickContact}
                  title="اختيار من جهات الاتصال"
                  className="p-2.5 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-teal-50 dark:hover:bg-teal-900/30 text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 transition-colors border-s border-slate-200 dark:border-slate-700 h-full self-stretch flex items-center justify-center min-w-[48px]"
                >
                  <Contact className="w-5 h-5" />
                </button>
              </div>
              {errors.phone && (
                <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>
              )}
            </div>
          </div>

          {/* 3. حقل التصنيف */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>التصنيف</span>
            </label>

            <div className="grid grid-cols-3 gap-2">
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
                    className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all min-h-[40px] flex items-center justify-center text-center ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 shadow-xs ring-1 ring-teal-500'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. حقل ملاحظة */}
          <div className="space-y-1.5">
            <label
              htmlFor="textarea-account-note"
              className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>ملاحظة</span>
            </label>
            <textarea
              id="textarea-account-note"
              rows={2}
              placeholder="مثال: عنوان السكن أو العمل، طبيعة التعامل..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs sm:text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition resize-none min-h-[60px]"
            />
          </div>

          {/* 5. الرصيد الافتتاحي */}
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
                <div className="grid grid-cols-1 gap-2.5 items-center">
                  <label
                    htmlFor="input-initial-balance-amount"
                    className="text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    المبلغ ({currency})
                  </label>
                  <input
                    id="input-initial-balance-amount"
                    type="number"
                    step="any"
                    min="0"
                    placeholder="0.00"
                    value={initialBalance}
                    onChange={(e) => setInitialBalance(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-bold min-h-[44px] focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 items-center">
                  <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    طبيعة الرصيد
                  </span>
                  <div className="grid grid-cols-2 gap-2">
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

          {/* 6. زر الحفظ */}
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
