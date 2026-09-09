import React, { useState, useEffect, useRef } from 'react';
import {
  Store,
  Building2,
  User,
  Phone,
  MapPin,
  Upload,
  Trash2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';

export const BusinessProfileSection: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  // Local form state
  const [businessName, setBusinessName] = useState(settings.businessName || '');
  const [ownerName, setOwnerName] = useState(settings.ownerName || '');
  const [phone, setPhone] = useState(settings.phone || '');
  const [businessAddress, setBusinessAddress] = useState(settings.businessAddress || '');
  const [businessLogo, setBusinessLogo] = useState(settings.businessLogo || '');
  const [isSaving, setIsSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize when store loads or changes externally
  useEffect(() => {
    setBusinessName(settings.businessName || '');
    setOwnerName(settings.ownerName || '');
    setPhone(settings.phone || '');
    setBusinessAddress(settings.businessAddress || '');
    setBusinessLogo(settings.businessLogo || '');
  }, [
    settings.businessName,
    settings.ownerName,
    settings.phone,
    settings.businessAddress,
    settings.businessLogo,
  ]);

  // Handle Logo Upload with 100KB guard
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WebP)', 'error');
      return;
    }

    // Limit to 100KB to keep IndexedDB and backup files lean and fast
    const MAX_BYTES = 100 * 1024;
    if (file.size > MAX_BYTES) {
      showToast(
        `حجم الصورة (${Math.round(file.size / 1024)}KB) يتجاوز الحد الأقصى المسموح به (100KB)`,
        'error'
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setBusinessLogo(result);
        showToast('تم تحميل شعار المنشأة بنجاح. اضغط حفظ لتأكيد التغييرات.', 'info');
      }
    };
    reader.onerror = () => {
      showToast('حدث خطأ أثناء قراءة ملف الصورة', 'error');
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveLogo = () => {
    setBusinessLogo('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('تمت إزالة الشعار. اضغط حفظ لتأكيد التغييرات.', 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    const trimmedName = businessName.trim();
    if (!trimmedName || trimmedName.length < 2) {
      setValidationError('اسم المنشأة مطلوب ويجب ألا يقل عن حرفين');
      return;
    }

    setIsSaving(true);
    try {
      await updateSettings({
        businessName: trimmedName,
        ownerName: ownerName.trim(),
        phone: phone.trim(),
        businessAddress: businessAddress.trim(),
        businessLogo: businessLogo.trim(),
      });
      showToast('تم حفظ بيانات المنشأة بنجاح', 'success');
    } catch {
      showToast('فشل حفظ بيانات المنشأة. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section
      id="business-profile-section"
      className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Store className="w-4 h-4 text-teal-600 shrink-0" />
            <span>بيانات المنشأة والنشاط التجاري</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            تظهر هذه البيانات في ترويسة التقارير، كشوفات الحساب، ومطبوعات الـ PDF ومشاركات WhatsApp
          </p>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Logo Upload & Preview Card */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative w-18 h-18 sm:w-20 sm:h-20 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
            {businessLogo ? (
              <img
                src={businessLogo}
                alt="شعار المنشأة"
                className="w-full h-full object-contain p-1.5"
              />
            ) : (
              <Building2 className="w-8 h-8 text-slate-400 dark:text-slate-500" />
            )}
          </div>

          <div className="flex-1 space-y-2 text-center sm:text-start">
            <div>
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                شعار المنشأة / المحل
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                صورة مربعة واضحة (الحد الأقصى 100 كيلوبايت - PNG أو JPG)
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoUpload}
                className="hidden"
                id="business-logo-input"
              />
              <label
                htmlFor="business-logo-input"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer min-h-[40px]"
              >
                <Upload className="w-3.5 h-3.5 text-teal-600" />
                <span>{businessLogo ? 'تغيير الشعار' : 'تحميل الشعار'}</span>
              </label>

              {businessLogo && (
                <button
                  type="button"
                  onClick={handleRemoveLogo}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/50 transition min-h-[40px]"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف الشعار</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center gap-2 text-xs font-bold text-rose-700 dark:text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Fields Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Business Name */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-teal-600" />
              <span>اسم المنشأة / المحل *</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => {
                setBusinessName(e.target.value);
                if (validationError) setValidationError(null);
              }}
              placeholder="مثال: مؤسسة الأمل للتجارة"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 min-h-[44px]"
              required
            />
          </div>

          {/* Owner / Manager Name */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-teal-600" />
              <span>اسم المالك / المدير</span>
            </label>
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="مثال: أحمد محمد القاسمي"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 min-h-[44px]"
            />
          </div>

          {/* Phone Number */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-teal-600" />
              <span>رقم الهاتف / للتواصل</span>
            </label>
            <input
              type="text"
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+967 770 000 000"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 min-h-[44px] text-end font-mono"
            />
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-teal-600" />
              <span>العنوان / المدينة</span>
            </label>
            <input
              type="text"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
              placeholder="مثال: صنعاء - شارع الزبيري"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-teal-500 min-h-[44px]"
            />
          </div>
        </div>

        {/* Submit Actions */}
        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            * الحقول الموسومة بنجمة إلزامية للتقارير
          </span>

          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs sm:text-sm transition shadow-xs min-h-[44px] disabled:opacity-50"
          >
            {isSaving ? (
              <span>جارٍ الحفظ...</span>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>حفظ بيانات المنشأة</span>
              </>
            )}
          </button>
        </div>
      </form>
    </section>
  );
};
