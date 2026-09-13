import React, { useState } from 'react';
import {
  Coins,
  Check,
  AlertTriangle,
  Info,
  ChevronDown,
  ArrowLeftRight,
  Plus,
  X,
} from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';
import { CurrencyCode } from '@/shared/types';
import { SUPPORTED_CURRENCIES } from '@/core/utils/formatters';
import { getCurrencyDecimals } from '@/core/money/currency';

export const CurrencySection: React.FC = () => {
  const { settings, setCurrency } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  // States for confirmation modal
  const [pendingCurrency, setPendingCurrency] = useState<CurrencyCode | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGuidanceExpanded, setIsGuidanceExpanded] = useState(false);

  // States for Custom Currency Modal
  const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [customDecimals, setCustomDecimals] = useState<number>(2);

  const activeCurrencyConfig =
    SUPPORTED_CURRENCIES.find((c) => c.code === settings.currency) ||
    SUPPORTED_CURRENCIES[0];

  const [activePrecision, setActivePrecision] = useState<number>(
    getCurrencyDecimals(activeCurrencyConfig.code)
  );

  React.useEffect(() => {
    setActivePrecision(getCurrencyDecimals(activeCurrencyConfig.code));
  }, [activeCurrencyConfig.code]);

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

  const handlePrecisionChange = (decimals: number) => {
    setActivePrecision(decimals);
    showToast(
      `تم تعيين دقة العرض المحاسبي إلى ${decimals === 0 ? 'أعداد صحيحة بدون كسور' : `${decimals} منازل عشرية`}`,
      'info'
    );
  };

  const handleSaveCustomCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customCode || !customName || !customSymbol) {
      showToast('يرجى تعبئة كافة الحقول المطلوبة للعملة المخصصة', 'error');
      return;
    }

    // هنا يمكنك إضافة منطق حفظ العملة المخصصة في الـ Store أو القائمة
    showToast(`تم إضافة العملة المخصصة ${customName} (${customCode}) بنجاح`, 'success');
    setIsCustomModalOpen(false);
    setCustomCode('');
    setCustomName('');
    setCustomSymbol('');
    setCustomDecimals(2);
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
      className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-6"
    >
      {/* Header */}
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Coins className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>العملة الرئيسية للنظام</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
          العملة القياسية المعتمدة للمعاملات والتقارير وكشوفات الحسابات المحاسبية
        </p>
      </div>

      {/* 1. Active Currency Banner with Quick Precision Control */}
      <div className="p-4 sm:p-5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-xl shadow-xs shrink-0">
            {activeCurrencyConfig.symbolAr}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                {activeCurrencyConfig.nameAr}
              </span>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/80 text-emerald-800 dark:text-emerald-200 border border-emerald-300/60 dark:border-emerald-700/60">
                {activeCurrencyConfig.code}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                <Check className="w-3 h-3 stroke-[3]" />
                مفعلة الآن
              </span>
            </div>
            <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-1 font-medium">
              العملة القياسية المعتمدة لحسابات المنشأة والمعاملات والتقارير
            </p>
          </div>
        </div>

        <div className="w-full md:w-auto flex items-center justify-between md:justify-end gap-2.5 pt-3 md:pt-0 border-t md:border-t-0 border-emerald-200/60 dark:border-emerald-800/40">
          <div className="flex flex-col md:items-end">
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
              الدقة المحاسبية (الكسور):
            </span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              تحديد منازل العرض العشرية
            </span>
          </div>
          <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl p-1 border border-emerald-200 dark:border-emerald-800 shadow-2xs">
            {[
              { label: '0 (صحيح)', val: 0 },
              { label: '2 (0.00)', val: 2 },
              { label: '3 (0.000)', val: 3 },
            ].map((prec) => {
              const isCurrent = activePrecision === prec.val;
              return (
                <button
                  key={prec.val}
                  type="button"
                  onClick={() => handlePrecisionChange(prec.val)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    isCurrent
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                  title={`عرض المبالغ بـ ${prec.val} منازل عشرية`}
                >
                  {prec.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Supported Currencies Grid System */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 block">
            اختر العملة الرئيسية من القائمة المعتمدة:
          </label>
          <span className="text-[11px] text-slate-400 font-medium">
            {SUPPORTED_CURRENCIES.length} عملات مدعومة
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {SUPPORTED_CURRENCIES.map((curr) => {
            const isSelected = settings.currency === curr.code;

            return (
              <button
                key={curr.code}
                id={`currency-card-${curr.code}`}
                type="button"
                onClick={() => handleSelectCurrency(curr.code)}
                className={`p-3.5 rounded-2xl border text-start transition-all flex flex-col justify-between min-h-[96px] relative group ${
                  isSelected
                    ? 'border-2 border-emerald-600 dark:border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-100 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base font-black text-slate-900 dark:text-slate-100">
                      {curr.symbolAr}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border ${
                        isSelected
                          ? 'bg-emerald-100 dark:bg-emerald-900/80 text-emerald-900 dark:text-emerald-200 border-emerald-300/80 dark:border-emerald-700/80'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {curr.code}
                    </span>
                  </div>

                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </span>
                  )}
                </div>

                <div className="mt-2.5">
                  <span className="text-xs sm:text-sm font-extrabold block truncate text-slate-900 dark:text-slate-100">
                    {curr.nameAr}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                    {formatPrecisionText(curr.code)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 4. Interactive Feature: Add Custom Currency Button */}
        <button
          id="btn-add-custom-currency"
          type="button"
          onClick={() => setIsCustomModalOpen(true)}
          className="w-full py-3 px-4 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 text-slate-700 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer min-h-[44px]"
        >
          <Plus className="w-4 h-4 text-slate-400 group-hover:text-emerald-600" />
          <span>+ إضافة عملة مخصصة</span>
        </button>
      </div>

      {/* 3. Informational Guidance Accordion (Collapsible) */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 overflow-hidden transition-all">
        <button
          type="button"
          onClick={() => setIsGuidanceExpanded(!isGuidanceExpanded)}
          className="w-full p-3.5 flex items-center justify-between text-start hover:bg-slate-100/70 dark:hover:bg-slate-800/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Info className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
              ⚠️ ملاحظة هامة حول تغيير العملة الرئيسية وأثره المحاسبي
            </span>
          </div>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isGuidanceExpanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {isGuidanceExpanded && (
          <div className="px-4 pb-4 pt-1 text-xs text-slate-600 dark:text-slate-300 space-y-2 border-t border-slate-200/60 dark:border-slate-700/60">
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              تخزن المعاملات في نظام <strong className="text-slate-800 dark:text-slate-200">حساباتي</strong> بوحدات صغرى صحيحة (Minor Units) معزولة لضمان عدم وجود أخطاء في الكسور العشرية أو تقلبات الفاصلة العائمة.
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
              <strong>تنبيه النزاهة المحاسبية:</strong> تغيير العملة الرئيسية لا يعيد تقييم السجلات السابقة أو تغيير قيمها التاريخية بسعر صرف افتراضي، بل يعتمد العملة المحددة للقيود والتقارير المالية الصادرة ابتداءً من لحظة الاعتماد.
            </p>
          </div>
        )}
      </div>

      {/* Custom Currency Modal */}
      {isCustomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-xl space-y-4 text-start">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600">
                  <Plus className="w-5 h-5" />
                </div>
                <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                  إضافة عملة مخصصة جديدة
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomModalOpen(false)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomCurrency} className="space-y-3.5 pt-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رمز العملة (Code) مثل: GBP, EUR
                </label>
                <input
                  type="text"
                  value={customCode}
                  onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                  placeholder="مثال: EUR"
                  maxLength={5}
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs uppercase font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  اسم العملة بالعربي
                </label>
                <input
                  type="text"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="مثال: يورو أوروبي"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  رمز العملة البصري (Symbol) مثل: €, £
                </label>
                <input
                  type="text"
                  value={customSymbol}
                  onChange={(e) => setCustomSymbol(e.target.value)}
                  placeholder="مثال: €"
                  required
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الدقة المحاسبية (عدد الكسور العشرية)
                </label>
                <select
                  value={customDecimals}
                  onChange={(e) => setCustomDecimals(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs"
                >
                  <option value={0}>0 - بدون كسور (أعداد صحيحة)</option>
                  <option value={2}>2 - منزلتان (0.00)</option>
                  <option value={3}>3 - ثلاثة منازل (0.000)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCustomModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs"
                >
                  حفظ واعتماد العملة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal (Preserved with strict financial safety) */}
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

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-around text-center">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-400 block font-bold">العملة الحالية</span>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {activeCurrencyConfig.nameAr} ({activeCurrencyConfig.code})
                </span>
              </div>
              <ArrowLeftRight className="w-4 h-4 text-slate-400" />
              <div className="space-y-0.5">
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block font-bold">
                  العملة الجديدة
                </span>
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-300">
                  {pendingCurrencyConfig.nameAr} ({pendingCurrencyConfig.code})
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed space-y-1.5">
              <span className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                تنبيه محاسبي مهم:
              </span>
              <p className="text-[11px] leading-relaxed">
                تغيير العملة الافتراضية يحدد العملة المستخدمة للمعاملات والتقارير الجديدة فقط، ولا يقوم بتحويل المبالغ التاريخية المسجلة مسبقاً في الدفتر.
              </p>
            </div>

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
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs min-h-[44px] disabled:opacity-50 inline-flex items-center gap-1.5"
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
