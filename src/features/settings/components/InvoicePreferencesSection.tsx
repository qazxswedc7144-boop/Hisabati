import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Check,
  ShieldAlert,
  Hash,
  Eye,
  AlignLeft,
  Sparkles,
  Save,
  RotateCcw,
  Layers,
} from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';
import { InvoiceNumberingFormat } from '@/shared/types';
import { formatInvoiceNumber } from '@/core/utils/formatters';

export const InvoicePreferencesSection: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  // Local form state
  const [numberingFormat, setNumberingFormat] = useState<InvoiceNumberingFormat>(
    settings.invoiceNumberingFormat || 'sequential'
  );
  const [prefix, setPrefix] = useState<string>(settings.invoicePrefix || 'INV-');
  const [nextNumber, setNextNumber] = useState<number>(settings.nextInvoiceNumber || 1);
  const [showLogo, setShowLogo] = useState<boolean>(settings.showBusinessLogoOnInvoice !== false);
  const [showTaxNumber, setShowTaxNumber] = useState<boolean>(settings.showTaxNumberOnInvoice !== false);
  const [showPhone, setShowPhone] = useState<boolean>(settings.showPhoneOnInvoice !== false);
  const [showAddress, setShowAddress] = useState<boolean>(settings.showAddressOnInvoice !== false);
  const [defaultNotes, setDefaultNotes] = useState<string>(
    settings.defaultInvoiceNotes || 'شكراً لتعاملكم معنا'
  );
  const [isSaving, setIsSaving] = useState(false);

  // Synchronize when external store changes
  useEffect(() => {
    setNumberingFormat(settings.invoiceNumberingFormat || 'sequential');
    setPrefix(settings.invoicePrefix !== undefined ? settings.invoicePrefix : 'INV-');
    setNextNumber(settings.nextInvoiceNumber || 1);
    setShowLogo(settings.showBusinessLogoOnInvoice !== false);
    setShowTaxNumber(settings.showTaxNumberOnInvoice !== false);
    setShowPhone(settings.showPhoneOnInvoice !== false);
    setShowAddress(settings.showAddressOnInvoice !== false);
    setDefaultNotes(settings.defaultInvoiceNotes || 'شكراً لتعاملكم معنا');
  }, [
    settings.invoiceNumberingFormat,
    settings.invoicePrefix,
    settings.nextInvoiceNumber,
    settings.showBusinessLogoOnInvoice,
    settings.showTaxNumberOnInvoice,
    settings.showPhoneOnInvoice,
    settings.showAddressOnInvoice,
    settings.defaultInvoiceNotes,
  ]);

  // Compute live sample invoice number
  const sampleInvoiceNumber = useMemo(() => {
    return formatInvoiceNumber(prefix, nextNumber, numberingFormat);
  }, [prefix, nextNumber, numberingFormat]);

  const handleResetDefaults = () => {
    setNumberingFormat('sequential');
    setPrefix('INV-');
    setNextNumber(1);
    setShowLogo(true);
    setShowTaxNumber(true);
    setShowPhone(true);
    setShowAddress(true);
    setDefaultNotes('شكراً لتعاملكم معنا');
    showToast('تمت استعادة القيم الافتراضية للتفضيلات', 'info');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const sanitizedPrefix = prefix.trim();
      const sanitizedNextNumber = Math.max(1, Math.floor(Number(nextNumber) || 1));
      const sanitizedNotes = defaultNotes.trim();

      await updateSettings({
        invoiceNumberingFormat: numberingFormat,
        invoicePrefix: sanitizedPrefix,
        nextInvoiceNumber: sanitizedNextNumber,
        showBusinessLogoOnInvoice: showLogo,
        showTaxNumberOnInvoice: showTaxNumber,
        showPhoneOnInvoice: showPhone,
        showAddressOnInvoice: showAddress,
        defaultInvoiceNotes: sanitizedNotes,
      });

      showToast('تم حفظ تفضيلات الفواتير والترقيم بنجاح', 'success');
    } catch (err) {
      console.error('Failed to save invoice preferences:', err);
      showToast('تعذر حفظ تفضيلات الفواتير، يرجى المحاولة لاحقاً', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      id="invoice-preferences-section"
      className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600" />
            <span>التفضيلات التشغيلية ونمط الفواتير</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            تخصيص نمط تسلسل أرقام الفواتير والسندات، خيارات الترويسة، والشروط الافتراضية
          </p>
        </div>

        <button
          type="button"
          onClick={handleResetDefaults}
          className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 transition min-h-[36px]"
          title="استعادة القيم الافتراضية"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>استعادة الافتراضي</span>
        </button>
      </div>

      {/* Financial Invariant & Safety Banner */}
      <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
        <div className="text-xs text-amber-900 dark:text-amber-200 space-y-1">
          <p className="font-bold">حماية النزاهة المالية والفواتير التاريخية</p>
          <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
            تؤثر هذه الإعدادات على الفواتير والسندات الجديدة فقط. لا يقوم النظام بتعديل أو إعادة ترقيم
            المعاملات السابقة أو تغيير قيم الوحدات المالية الصغرى (amountMinor / currentBalanceMinor) نهائياً.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-5">
        {/* 1. نمط ترقيم الفواتير */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2 flex items-center gap-1.5">
            <Hash className="w-3.5 h-3.5 text-teal-600" />
            <span>نمط ترقيم الفواتير والسندات</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {[
              {
                id: 'sequential' as InvoiceNumberingFormat,
                title: 'ترقيم تسلسلي قياسي',
                desc: 'تسلسل أرقام تصاعدي (مثال: INV-0001)',
              },
              {
                id: 'yearly_sequential' as InvoiceNumberingFormat,
                title: 'تسلسلي سنوي',
                desc: 'تسلسل مقترن بالسنة الحالية (مثال: INV-2026-0001)',
              },
              {
                id: 'manual' as InvoiceNumberingFormat,
                title: 'إدخال يدوي حر',
                desc: 'كتابة رقم السند/الفاتورة يدوياً عند كل قيد',
              },
            ].map((item) => {
              const isSelected = numberingFormat === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNumberingFormat(item.id)}
                  className={`p-3 rounded-2xl border text-start transition flex flex-col justify-between min-h-[64px] ${
                    isSelected
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">{item.title}</span>
                    {isSelected && <Check className="w-4 h-4 text-teal-600 shrink-0" />}
                  </div>
                  <span className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 leading-tight">
                    {item.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. بادئة الفاتورة والرقم التالي (إذا لم يكن يدوي) */}
        {numberingFormat !== 'manual' && (
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/80 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  بادئة رقم الفاتورة / السند (Prefix)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="INV- أو REC-"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 min-h-[44px] font-mono font-bold text-start"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                  الرقم التالي للفاتورة (Next Sequence)
                </label>
                <input
                  type="number"
                  min="1"
                  dir="ltr"
                  value={nextNumber}
                  onChange={(e) => setNextNumber(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 min-h-[44px] font-mono font-bold text-start"
                />
              </div>
            </div>

            {/* معاينة سريعة لشكل الرقم القادم */}
            <div className="pt-2 flex items-center justify-between border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
              <span className="text-slate-500 dark:text-slate-400">معاينة الرقم القادم:</span>
              <span className="font-mono font-black text-teal-700 dark:text-teal-300 bg-teal-100/60 dark:bg-teal-900/60 px-2.5 py-1 rounded-lg">
                {sampleInvoiceNumber || '—'}
              </span>
            </div>
          </div>
        )}

        {/* 3. خيارات إظهار بيانات الترويسة في الفواتير */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-teal-600" />
            <span>بيانات الترويسة المضمنة في الفاتورة والطباعة</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {[
              {
                id: 'logo',
                checked: showLogo,
                onChange: setShowLogo,
                label: 'شعار المنشأة (Business Logo)',
                desc: 'إظهار الشعار في أعلى مطبوعات الفواتير وكشوفات الحساب',
              },
              {
                id: 'tax',
                checked: showTaxNumber,
                onChange: setShowTaxNumber,
                label: 'الرقم الضريبي / السجل التجاري',
                desc: 'إظهار بيانات القيد الضريبي والتجاري المسجلة',
              },
              {
                id: 'phone',
                checked: showPhone,
                onChange: setShowPhone,
                label: 'رقم هاتف المنشأة',
                desc: 'تضمين رقم التواصل المباشر في رأس المستند',
              },
              {
                id: 'address',
                checked: showAddress,
                onChange: setShowAddress,
                label: 'العنوان الجغرافي',
                desc: 'تضمين عنوان المحل أو المدينة في الترويسة',
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className="flex items-start gap-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition min-h-[48px]"
              >
                <input
                  type="checkbox"
                  checked={opt.checked}
                  onChange={(e) => opt.onChange(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded-sm border-slate-300 text-teal-600 focus:ring-teal-500 shrink-0"
                />
                <div className="text-xs">
                  <span className="font-bold text-slate-800 dark:text-slate-200 block">
                    {opt.label}
                  </span>
                  <span className="text-[10.5px] text-slate-500 dark:text-slate-400 block mt-0.5">
                    {opt.desc}
                  </span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 4. الشروط والملاحظات الافتراضية */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
            <AlignLeft className="w-3.5 h-3.5 text-teal-600" />
            <span>الملاحظات والشروط الافتراضية (تذييل الفاتورة)</span>
          </label>
          <textarea
            rows={2}
            value={defaultNotes}
            onChange={(e) => setDefaultNotes(e.target.value)}
            placeholder="مثال: البضاعة المباعة لا ترد ولا تستبدل بعد 3 أيام / شاكرين ثقتكم"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 leading-relaxed"
          />
          <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-1">
            يتم إدراج هذا النص تلقائياً في أسفل كشوفات الحساب والفواتير المطبوعة.
          </span>
        </div>

        {/* 5. المعاينة المباشرة لشكل الترويسة (Live Mobile-First Preview) */}
        <div className="pt-2">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2">
            معاينة شكل ترويسة الفاتورة
          </label>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-3">
              <div className="space-y-1">
                <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100 block">
                  {settings.businessName || 'اسم المنشأة'}
                </span>
                {showPhone && settings.phone && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block font-mono" dir="ltr">
                    الهاتف: {settings.phone}
                  </span>
                )}
                {showAddress && settings.businessAddress && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
                    العنوان: {settings.businessAddress}
                  </span>
                )}
              </div>

              <div className="text-end space-y-1">
                <span className="inline-block px-2.5 py-1 rounded-md bg-teal-600 text-white font-mono font-bold text-[11px]">
                  {sampleInvoiceNumber ? `#${sampleInvoiceNumber}` : 'فاتورة / سند'}
                </span>
                {showTaxNumber && (
                  <span className="text-[10px] text-slate-400 block">
                    الرقم الضريبي: 300012345600003
                  </span>
                )}
              </div>
            </div>

            <div className="text-center text-[10.5px] text-slate-500 dark:text-slate-400 italic pt-1">
              {defaultNotes || '— بدون ملاحظات تذييل —'}
            </div>
          </div>
        </div>

        {/* 6. الميزات المستقبلية المسجلة (Future Enhancements) */}
        <div className="p-3.5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
            <Sparkles className="w-3.5 h-3.5 text-slate-500" />
            <span>تجهيزات مستقبلية (Future Enhancements)</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            تم تصميم الهيكل المعماري لدعم ميزات المراحل اللاحقة دون تغيير في قاعدة البيانات الحالية:
          </p>
          <ul className="text-[11px] text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside ps-1">
            <li>الربط مع منظومة الفاتورة الضريبية الإلكترونية المعتمدة (ZATCA / المرحلة 10).</li>
            <li>سلاسل الترقيم المستقلة والمتوازية للفروع ونقاط البيع (المرحلة 8-10).</li>
            <li>الختم والتوقيع الرقمي المشفر للـ QR الضريبي (Cryptographic Stamp).</li>
          </ul>
        </div>

        {/* Action Button */}
        <div className="pt-2 flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs transition shadow-xs flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ تفضيلات الفواتير'}</span>
          </button>
        </div>
      </form>
    </section>
  );
};
