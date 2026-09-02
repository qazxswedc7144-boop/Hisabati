import React, { useState, useRef } from 'react';
import {
  Camera,
  Upload,
  ScanLine,
  X,
  AlertCircle,
  FileText,
  Sparkles,
  RefreshCw,
  Eye,
  Zap,
} from 'lucide-react';
import { useOCRStore } from '@/shared/stores/ocrStore';
import { ocrService } from '@/core/services/ocr';
import { useUIStore } from '@/shared/stores/uiStore';

export const OCRReceiptScannerModal: React.FC = () => {
  const {
    isScannerModalOpen,
    closeScannerModal,
    openReviewModal,
    isScanning,
    setScanning,
    scanError,
    setScanError,
  } = useOCRStore();
  const { showToast } = useUIStore();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [rawTextInput, setRawTextInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'camera' | 'text'>('camera');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isScannerModalOpen) return null;

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setScanError('يرجى اختيار ملف صورة صالح (JPEG, PNG, WebP)');
      return;
    }

    setSelectedFileName(file.name);
    setScanError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setPreviewImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleProcessScan = async () => {
    if (activeTab === 'camera' && !previewImage) {
      setScanError('يرجى اختيار صورة الفاتورة أو التقاطها أولاً');
      return;
    }
    if (activeTab === 'text' && !rawTextInput.trim()) {
      setScanError('يرجى كتابة أو لصق نص الفاتورة للمسح المالي');
      return;
    }

    setScanning(true, 15);
    setScanError(null);

    try {
      let result;
      if (activeTab === 'camera' && previewImage) {
        setScanning(true, 45);
        result = await ocrService.processImage(previewImage, {
          maxWidth: 1600,
          quality: 0.85,
          grayscale: false,
        });
        // Store image preview inside result
        result.imageUrl = previewImage;
      } else {
        setScanning(true, 50);
        result = await ocrService.processText(rawTextInput);
      }

      setScanning(true, 100);
      showToast('تم استخراج بيانات الفاتورة بنجاح. يرجى مراجعة الحقول واعتمادها.', 'success');
      
      // Close scanner and transition seamlessly to Review Modal
      openReviewModal(result);
    } catch (err: any) {
      console.error('OCR Processing failed:', err);
      setScanError(err.message || 'تعذر معالجة الفاتورة. يرجى المحاولة مرة أخرى أو مراجعة الاتصال.');
    } finally {
      setScanning(false, 0);
    }
  };

  const handleReset = () => {
    setPreviewImage(null);
    setSelectedFileName(null);
    setRawTextInput('');
    setScanError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUseDemoReceipt = (demoIndex: number) => {
    const samples = [
      `مؤسسة الأمل للتجارة العامة
فاتورة ضريبية رقم: INV-2026-904
التاريخ: 2026-05-14
العميل: مؤسسة الريان الدولية
العملة: YER
سكر أبيض 10كجم    2    4000    8000
أرز بسمتي 5كجم    3    3000    9000
زيت طبخ 4لتر     1    5000    5000
المجموع الجزئي: 22000
الضريبة: 0
الإجمالي: 22000 ريال يمني`,

      `سند قبض نقدية
سند رقم: RCT-8831
التاريخ: 14/05/2026
وصلنا من السيد: شركة الأفق للتوريدات
مبلغ وقدره: 150000 ريال يمني
وذلك عن: سداد دفعة من الحساب الآجل
المستلم: الصندوق الرئيسي
المجموع: 150000 YER`,

      `Al-Madina Hypermarket
Tax Invoice
Inv No: 40992
Date: 2026/04/10
Customer: أحمد ناصر
Items:
Fresh Milk 1L    4    250    1000
Coffee Beans     1    1200   1200
Subtotal: 2200 SAR
VAT 15%: 330 SAR
Total Amount: 2530 SAR`,
    ];

    setRawTextInput(samples[demoIndex] || samples[0]);
    setActiveTab('text');
    setScanError(null);
  };

  return (
    <div
      id="ocr-scanner-modal-backdrop"
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in"
    >
      <div
        id="ocr-scanner-modal-container"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-200/60 dark:border-sky-800/60 shrink-0">
              <ScanLine className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                مسح الفواتير والإيصالات الذكي (OCR)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                قراءة تلقائية للبيانات مع ضمان عدم الترحيل المالي إلا بعد المراجعة
              </p>
            </div>
          </div>
          <button
            onClick={closeScannerModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 dark:border-slate-800 px-5 pt-3 gap-3">
          <button
            type="button"
            onClick={() => setActiveTab('camera')}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'camera'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <span>تصوير / رفع صورة الفاتورة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`pb-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'text'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>نص الفاتورة / نموذج تجريبي</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {scanError && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200 flex items-start gap-2.5 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <span>{scanError}</span>
            </div>
          )}

          {activeTab === 'camera' ? (
            <div className="space-y-3">
              {previewImage ? (
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 aspect-4/3 flex items-center justify-center group">
                  <img
                    src={previewImage}
                    alt="صورة الفاتورة"
                    className="max-h-full max-w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleReset}
                    className="absolute top-2 end-2 p-2 rounded-xl bg-black/60 text-white hover:bg-black/80 transition"
                    title="إزالة الصورة"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-2 start-2 bg-black/70 text-white text-[11px] px-2.5 py-1 rounded-lg">
                    {selectedFileName || 'فاتورة محددة'}
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-sky-500 dark:hover:border-sky-500 rounded-2xl p-6 sm:p-8 text-center cursor-pointer bg-slate-50/50 dark:bg-slate-900/40 transition hover:bg-sky-50/30 dark:hover:bg-sky-950/20 flex flex-col items-center justify-center gap-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center shadow-xs">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      اضغط لالتقاط صورة بكاميرا الهاتف أو اختيار ملف
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      يدعم صور الفواتير الورقية والإلكترونية (JPG, PNG, WebP)
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-2xs">
                    <Upload className="w-3.5 h-3.5" />
                    تصفح الملفات
                  </span>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  نص الفاتورة (أو انسخ بيانات من رسالة/واتساب)
                </label>
                <textarea
                  value={rawTextInput}
                  onChange={(e) => setRawTextInput(e.target.value)}
                  placeholder="مثال: فاتورة ضريبية رقم 102 - مؤسسة النور - التاريخ 2026-05-10 - الإجمالي 45000 ريال..."
                  rows={6}
                  className="w-full text-xs font-mono p-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-sky-500/30"
                />
              </div>

              {/* Sample Receipts Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  نماذج فواتير تجريبية سريعة:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleUseDemoReceipt(0)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    فاتورة مشتريات يمنية (مؤسسة الأمل)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseDemoReceipt(1)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    سند قبض نقدية (شركة الأفق)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUseDemoReceipt(2)}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
                  >
                    فاتورة ثنائية اللغة (Hypermarket)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Safe Accounting Banner */}
          <div className="p-3 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/40 text-[11px] text-amber-900 dark:text-amber-200 flex items-center gap-2">
            <Zap className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>مبدأ الأمان المالي:</strong> المسح الضوئي لا ينشئ أي قيد مالي أو حركة في الأرصدة تلقائيًا. ستظهر شاشة مراجعة لتدقيق كل حقل وتأكيده يدويًا.
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleReset}
            className="px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
          >
            إعادة تعيين
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeScannerModal}
              className="px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition min-h-[42px]"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleProcessScan}
              disabled={isScanning || (activeTab === 'camera' && !previewImage) || (activeTab === 'text' && !rawTextInput.trim())}
              className="px-5 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold shadow-md shadow-sky-600/20 disabled:opacity-50 flex items-center gap-2 transition min-h-[42px]"
            >
              {isScanning ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>جارٍ التحليل واستخراج البيانات...</span>
                </>
              ) : (
                <>
                  <ScanLine className="w-4 h-4" />
                  <span>بدء المسح والاستخراج</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
