import React, { useState } from 'react';
import {
  Coins,
  Check,
  AlertTriangle,
  Info,
  ChevronDown,
  ArrowLeftRight,
} from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';
import { CurrencyCode } from '@/shared/types';
import { SUPPORTED_CURRENCIES } from '@/core/utils/formatters';
import { getCurrencyDecimals } from '@/core/money/currency';

export const CurrencySection: React.FC = () => {
  const { settings, setCurrency } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  // Selected currency awaiting confirmation modal
  const [pendingCurrency, setPendingCurrency] = useState<CurrencyCode | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const activeCurrencyConfig =
    SUPPORTED_CURRENCIES.find((c) => c.code === settings.currency) ||
    SUPPORTED_CURRENCIES[0];

  const handleSelectCurrency = (newCurrency: CurrencyCode) => {
    if (newCurrency === settings.currency) return;
    setPendingCurrency(newCurrency);
    setIsConfirmModalOpen(true);
  };

  const handleConfirmCurrencyChange = async () => {
    if (!pendingCurrency) return;
    setIsUpdating(true);
    try {
      await setCurrency(pendingCurrency);
      const conf = SUPPORTED_CURRENCIES.find((c) => c.code === pendingCurrency);
      showToast(
        `تم اعتماد ${conf?.nameAr || pendingCurrency} كالعملة الرئيسية للنظام`,
        'success'
      );
    } catch {
      showToast('فشل تحديث العملة الرئيسية', 'error');
    } finally {
      setIsUpdating(false);
      setIsConfirmModalOpen(false);
      setPendingCurrency(null);
    }
  };

  const handleCancel = () => {
    setIsConfirmModalOpen(false);
    setPendingCurrency(null);
  };

  const formatPrecisionText = (code: CurrencyCode) => {
    const decimals = getCurrencyDecimals(code);
    if (decimals === 0) return 'بدون كسور (أعداد صحيحة)';
    if (decimals === 2) return 'منزلتان عشريتان (0.00)';
    if (decimals === 3) return '3 منازل عشرية (0.000)';
    return `${decimals} منازل عشرية`;
  };

  const pendingCurrencyConfig = pendingCurrency
    ? SUPPORTED_CURRENCIES.find((c) => c.code === pendingCurrency)
    : null;

  return (
    <section
      id="currency-section"
      className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5"
    >
      {/* Header */}
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Coins className="w-4 h-4 text-teal-600 shrink-0" />
          <span>العملة الرئيسية للنظام</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          العملة القياسية المعتمدة للمعاملات والتقارير وكشوفات الحسابات المحاسبية
        </p>
      </div>

      {/* Active Currency Spotlight Card */}
      <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/40 border border-teal-200/80 dark:border-teal-900/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-black text-lg shadow-xs shrink-0">
            {activeCurrencyConfig.symbolAr}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100">
                {activeCurrencyConfig.nameAr}
              </span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-teal-200/60 dark:bg-teal-900 text-teal-900 dark:text-teal-200 font-bold">
                {activeCurrencyConfig.code}
              </span>
            </div>
            <p className="text-xs text-teal-800 dark:text-teal-300 mt-0.5">
              الدقة المحاسبية: {formatPrecisionText(activeCurrencyConfig.code)}
            </p>
          </div>
        </div>

        <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-teal-100 dark:bg-teal-900/80 text-teal-800 dark:text-teal-200 self-end sm:self-center">
          العملة النشطة حالياً
        </span>
      </div>

      {/* Supported Currencies Grid */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
          اختر العملة الرئيسية من القائمة المعتمدة:
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SUPPORTED_CURRENCIES.map((curr) => {
            const isSelected = settings.currency === curr.code;

            return (
              <button
                key={curr.code}
                type="button"
                onClick={() => handleSelectCurrency(curr.code)}
                className={`p-3.5 rounded-2xl border text-start transition flex flex-col justify-between min-h-[72px] ${
                  isSelected
                    ? 'border-teal-500 bg-teal-50/80 dark:bg-teal-950/50 text-teal-900 dark:text-teal-100 shadow-xs ring-1 ring-teal-500/40'
                    : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-black text-slate-900 dark:text-slate-100">
                    {curr.symbolAr}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-mono text-slate-400 font-bold">
                      {curr.code}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-teal-600" />}
                  </div>
                </div>

                <div className="mt-1.5">
                  <span className="text-xs font-bold block truncate">{curr.nameAr}</span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {getCurrencyDecimals(curr.code) === 0
                      ? '0 كسور'
                      : `${getCurrencyDecimals(curr.code)} كسور`}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Informational Guidance Note */}
      <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-bold text-slate-800 dark:text-slate-200 block">
            إرشادات النزاهة المحاسبية لتعدد العملات:
          </span>
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            تخزن المعاملات في حساباتي بوحدات صحيحة (Minor Units) معزولة لضمان عدم وجود أخطاء في الكسور العشرية. تغيير العملة الرئيسية لا يعيد تقييم السجلات السابقة بسعر صرف وهمي.
          </p>
        </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmModalOpen && pendingCurrencyConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4 text-start">
            <div className="flex items-center gap-3 text-amber-600 dark:text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  تأكيد تغيير العملة الرئيسية
                </h4>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  إجراء محاسبي تنظيمي
                </span>
              </div>
            </div>

            {/* Currency Transition Visual */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-around text-center">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 block font-bold">العملة الحالية</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {activeCurrencyConfig.nameAr} ({activeCurrencyConfig.code})
                </span>
              </div>
              <ArrowLeftRight className="w-4 h-4 text-slate-400" />
              <div className="space-y-0.5">
                <span className="text-[10px] text-teal-600 dark:text-teal-400 block font-bold">
                  العملة الجديدة
                </span>
                <span className="text-xs font-black text-teal-700 dark:text-teal-300">
                  {pendingCurrencyConfig.nameAr} ({pendingCurrencyConfig.code})
                </span>
              </div>
            </div>

            {/* Invariant Warning Note */}
            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed space-y-1.5">
              <span className="font-bold block flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                تنبيه محاسبي مهم:
              </span>
              <p className="text-[11px] leading-relaxed">
                تغيير العملة الافتراضية يحدد العملة المستخدمة للمعاملات والتقارير الجديدة فقط، ولا يقوم بتحويل المبالغ التاريخية المسجلة مسبقاً في الدفتر.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isUpdating}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmCurrencyChange}
                disabled={isUpdating}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition shadow-xs min-h-[44px] disabled:opacity-50 inline-flex items-center gap-1.5"
              >
                {isUpdating ? (
                  <span>جارٍ التحديث...</span>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>تأكيد اعتماد العملة</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
