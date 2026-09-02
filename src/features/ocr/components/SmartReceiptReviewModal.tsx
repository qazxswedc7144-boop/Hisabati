import React, { useState } from 'react';
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  X,
  Building2,
  User,
  Calendar,
  DollarSign,
  Hash,
  Plus,
  Trash2,
  Sparkles,
  HelpCircle,
  Eye,
  Info,
  ShieldCheck,
  Receipt,
  FileSpreadsheet,
} from 'lucide-react';
import { useOCRStore } from '@/shared/stores/ocrStore';
import { useAccountStore } from '@/shared/stores/accountStore';
import { useUIStore } from '@/shared/stores/uiStore';
import { ReceiptReviewService, ReceiptReviewValidationResult } from '@/core/services/ocr/ReceiptReviewService';
import { CurrencyCode, OCRDocumentType } from '@/shared/types';
import { formatCurrency } from '@/core/utils/formatters';

export const SmartReceiptReviewModal: React.FC = () => {
  const {
    isReviewModalOpen,
    closeReviewModal,
    currentOCRResult,
    editableState,
    updateEditableField,
    updateLineItem,
    addLineItem,
    removeLineItem,
    confirmReview,
    resetReview,
  } = useOCRStore();

  const accounts = useAccountStore((state) => state.accounts);
  const { showToast } = useUIStore();

  const [validationResult, setValidationResult] = useState<ReceiptReviewValidationResult | null>(null);
  const [activeImageView, setActiveImageView] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);

  if (!isReviewModalOpen || !editableState) return null;

  const confidenceStatus = currentOCRResult
    ? ReceiptReviewService.getFieldConfidenceStatus(currentOCRResult)
    : {};

  // Live validation on state
  const liveValidation = ReceiptReviewService.validate(editableState);

  const handleSaveAndConfirm = () => {
    const check = ReceiptReviewService.validate(editableState);
    setValidationResult(check);

    if (!check.isValid) {
      showToast('يرجى تصحيح الأخطاء الموضحة قبل حفظ المسودة', 'error');
      return;
    }

    try {
      const draft = confirmReview();
      showToast(`تم اعتماد مسودة الفاتورة بنجاح (#${draft.invoiceNumber || 'بدون رقم'}). لم يتم ترحيل أي قيد مالي بعد.`, 'success');
    } catch (e: any) {
      showToast(e.message || 'فشل حفظ المسودة', 'error');
    }
  };

  const getConfidenceBadge = (fieldName: string) => {
    const status = confidenceStatus[fieldName];
    if (!status) return null;

    if (status.isMissing) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 text-[10px] font-bold border border-amber-200/60 dark:border-amber-800/60">
          <AlertTriangle className="w-2.5 h-2.5" />
          حقل مفقود
        </span>
      );
    }

    if (status.isLow) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-[10px] font-bold border border-rose-200/60 dark:border-rose-800/60">
          <AlertTriangle className="w-2.5 h-2.5" />
          ثقة منخفضة ({Math.round(status.confidence * 100)}%)
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold border border-emerald-200/60 dark:border-emerald-800/60">
        <CheckCircle2 className="w-2.5 h-2.5" />
        ثقة {Math.round(status.confidence * 100)}%
      </span>
    );
  };

  // Match existing account if partyName closely matches
  const suggestedAccount = accounts.find((a) =>
    a.name.toLowerCase().includes(editableState.partyName.trim().toLowerCase()) ||
    editableState.partyName.trim().toLowerCase().includes(a.name.toLowerCase())
  );

  return (
    <div
      id="smart-receipt-review-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in"
    >
      <div
        id="smart-receipt-review-container"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] my-auto"
      >
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60 shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                مراجعة وتدقيق الفاتورة الذكية (Phase 7-B)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                دقّق القيم المستخرجة، عدّل أي حقل، ثم اعتمد المسودة للحفظ المؤقت
              </p>
            </div>
          </div>
          <button
            onClick={closeReviewModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global OCR Confidence & Status Banner */}
        <div className="px-5 py-2.5 bg-sky-50 dark:bg-sky-950/40 border-b border-sky-100 dark:border-sky-900/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span className="font-bold text-sky-900 dark:text-sky-200">
              نسبة الثقة العامة للاستخراج:{' '}
              {currentOCRResult ? Math.round(currentOCRResult.overallConfidence * 100) : 100}%
            </span>
            <span className="text-sky-700/70 dark:text-sky-400/70 text-[11px]">
              ({currentOCRResult?.provider || 'local_heuristic'})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {currentOCRResult?.imageUrl && (
              <button
                type="button"
                onClick={() => setActiveImageView(!activeImageView)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 font-bold hover:bg-sky-50 transition"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{activeImageView ? 'إخفاء الصورة' : 'معاينة الصورة الأصلية'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={resetReview}
              className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline"
            >
              إعادة تعيين للقيم المستخرجة
            </button>
          </div>
        </div>

        {/* Original Image Accordion View (if toggled) */}
        {activeImageView && currentOCRResult?.imageUrl && (
          <div className="p-4 bg-slate-100 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 max-h-48 overflow-hidden flex items-center justify-center">
            <img
              src={currentOCRResult.imageUrl}
              alt="صورة الفاتورة الأصلية"
              className="max-h-44 object-contain rounded-xl shadow-xs"
            />
          </div>
        )}

        {/* Scrollable Form Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 flex-1">
          {/* Warnings & Incomplete Input Banner */}
          {currentOCRResult && currentOCRResult.warnings.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>تنبيهات استخراج الذكاء الاصطناعي (تحتاج تدقيق المستخدم):</span>
              </div>
              <ul className="list-disc list-inside ps-2 space-y-0.5 text-[11px]">
                {currentOCRResult.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Validation Warnings (e.g. Items sum doesn't match total) */}
          {liveValidation.warnings.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900/50 text-sky-900 dark:text-sky-200 text-xs space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-sky-600 shrink-0" />
                <span>ملاحظات التدقيق الحسابي:</span>
              </div>
              <ul className="list-disc list-inside ps-2 space-y-0.5 text-[11px]">
                {liveValidation.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 1. Document & Party Section */}
          <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-teal-600" />
                <span>جهة الفاتورة ونوع الطرف</span>
              </span>

              {/* Party Type Switch */}
              <div className="inline-flex rounded-xl p-0.5 bg-slate-200 dark:bg-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => updateEditableField('partyType', 'vendor')}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    editableState.partyType === 'vendor'
                      ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  مورد / متجر (عليّ)
                </button>
                <button
                  type="button"
                  onClick={() => updateEditableField('partyType', 'customer')}
                  className={`px-3 py-1 rounded-lg font-bold transition ${
                    editableState.partyType === 'customer'
                      ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  عميل / مستلم (لي)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Party Name Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {editableState.partyType === 'vendor' ? 'اسم المورد / المتجر' : 'اسم العميل'}
                  </label>
                  {getConfidenceBadge(editableState.partyType === 'vendor' ? 'vendorName' : 'customerName')}
                </div>
                <input
                  type="text"
                  value={editableState.partyName}
                  onChange={(e) => updateEditableField('partyName', e.target.value)}
                  placeholder="مثال: مؤسسة الأمل للتجارة"
                  className={`w-full text-xs font-semibold p-2.5 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                    liveValidation.errors.partyName
                      ? 'border-rose-400 focus:ring-rose-500/20'
                      : 'border-slate-300 dark:border-slate-700 focus:ring-teal-500/20'
                  }`}
                />
                {liveValidation.errors.partyName && (
                  <p className="text-[11px] text-rose-500 mt-1">{liveValidation.errors.partyName}</p>
                )}
              </div>

              {/* Match Existing Account Dropdown */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    ربط بحساب مسجل في النظام (اختياري)
                  </label>
                  {suggestedAccount && (
                    <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold">
                      مطابقة مقترحة: {suggestedAccount.name}
                    </span>
                  )}
                </div>
                <select
                  value={editableState.matchedAccountId || ''}
                  onChange={(e) => updateEditableField('matchedAccountId', e.target.value || undefined)}
                  className="w-full text-xs font-semibold p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                >
                  <option value="">بدون ربط (حفظ كمسودة مستقلة)</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.category === 'customer' ? 'عميل' : acc.category === 'supplier' ? 'مورد' : 'أخرى'})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 2. Metadata: Invoice Number, Date, Currency */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Invoice Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  رقم الفاتورة / السند
                </label>
                {getConfidenceBadge('invoiceNumber')}
              </div>
              <input
                type="text"
                value={editableState.invoiceNumber}
                onChange={(e) => updateEditableField('invoiceNumber', e.target.value)}
                placeholder="مثال: INV-1004"
                className="w-full text-xs font-mono font-semibold p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Date */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-400" />
                  تاريخ الفاتورة
                </label>
                {getConfidenceBadge('date')}
              </div>
              <input
                type="date"
                value={editableState.date}
                onChange={(e) => updateEditableField('date', e.target.value)}
                className={`w-full text-xs font-semibold p-2.5 rounded-xl border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                  liveValidation.errors.date
                    ? 'border-rose-400'
                    : 'border-slate-300 dark:border-slate-700'
                }`}
              />
            </div>

            {/* Currency */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-slate-400" />
                  العملة المالية
                </label>
                {getConfidenceBadge('currency')}
              </div>
              <select
                value={editableState.currency}
                onChange={(e) => updateEditableField('currency', e.target.value as CurrencyCode)}
                className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="YER">ريال يمني (YER)</option>
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="USD">دولار أمريكي (USD)</option>
              </select>
            </div>
          </div>

          {/* 3. Amounts Summary Cards */}
          <div className="p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span>المبالغ المالية الإجمالية</span>
              </span>
              {getConfidenceBadge('totalAmount')}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Total Amount (Primary) */}
              <div>
                <label className="block text-xs font-bold text-teal-900 dark:text-teal-100 mb-1">
                  المبلغ الإجمالي النهائي *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editableState.totalAmount}
                  onChange={(e) => updateEditableField('totalAmount', e.target.value)}
                  placeholder="0.00"
                  className={`w-full text-base font-black p-2.5 rounded-xl border bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 ${
                    liveValidation.errors.totalAmount
                      ? 'border-rose-400'
                      : 'border-teal-300 dark:border-teal-700'
                  }`}
                />
                {liveValidation.errors.totalAmount && (
                  <p className="text-[11px] text-rose-600 mt-1">{liveValidation.errors.totalAmount}</p>
                )}
              </div>

              {/* Subtotal */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  المجموع الجزئي (قبل الضريبة)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editableState.subtotal}
                  onChange={(e) => updateEditableField('subtotal', e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                />
              </div>

              {/* Tax */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  مبلغ الضريبة / الرسوم
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editableState.tax}
                  onChange={(e) => updateEditableField('tax', e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          </div>

          {/* 4. Tabular Line Items Section */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-sky-600" />
                <span>أصناف ومحتويات الفاتورة ({editableState.lineItems.length})</span>
              </span>
              <button
                type="button"
                onClick={addLineItem}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-bold hover:bg-sky-100 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف</span>
              </button>
            </div>

            {editableState.lineItems.length === 0 ? (
              <div className="p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400">
                لم يتم استخراج أصناف مفردة، سيتم اعتماد المبلغ الإجمالي كبند واحد للفاتورة.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pe-1">
                {editableState.lineItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs"
                  >
                    <div className="flex-1">
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateLineItem(idx, 'name', e.target.value)}
                        placeholder="اسم الصنف"
                        className="w-full p-1.5 px-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-semibold"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={item.quantity}
                          onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                          placeholder="الكمية"
                          title="الكمية"
                          className="w-full p-1.5 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-bold"
                        />
                      </div>

                      <div className="w-24">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={(e) => updateLineItem(idx, 'unitPrice', e.target.value)}
                          placeholder="السعر"
                          title="سعر الوحدة"
                          className="w-full p-1.5 px-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-center font-mono font-semibold"
                        />
                      </div>

                      <div className="w-24 text-end font-mono font-bold text-slate-700 dark:text-slate-300 px-1">
                        {formatCurrency(ReceiptReviewService.parseNumericInput(item.totalPrice), editableState.currency)}
                      </div>

                      <button
                        type="button"
                        onClick={() => removeLineItem(idx)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 5. Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
              ملاحظات الفاتورة أو شروط الدفع
            </label>
            <input
              type="text"
              value={editableState.notes}
              onChange={(e) => updateEditableField('notes', e.target.value)}
              placeholder="مثال: دفعة تحت الحساب، استحقاق بعد 30 يوم..."
              className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            />
          </div>

          {/* Safety Notice Card */}
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="font-bold">ضمان الأمان المالي والرقابة المحاسبية:</p>
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                بالضغط على &quot;اعتماد مسودة الفاتورة&quot;، سيتم إنشاء <strong>Structured Receipt Draft</strong> محفوظ بشكل آمن. لن يتم خصم أو إضافة أي قيد في حساباتك المالية حتى تقرر ترحيله يدويًا في الخطوة القادمة.
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={closeReviewModal}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[42px]"
          >
            إلغاء وتجاهل
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSaveAndConfirm}
              disabled={!liveValidation.isValid}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold shadow-md shadow-teal-700/20 disabled:opacity-50 flex items-center gap-2 transition min-h-[42px]"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>اعتماد مسودة الفاتورة (حفظ المسودة)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
