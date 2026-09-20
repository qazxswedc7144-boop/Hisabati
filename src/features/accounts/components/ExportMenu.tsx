import React, { useState } from 'react';
import { X, FileSpreadsheet, Printer, Loader2, Info } from 'lucide-react';
import type { Account, CurrencyCode } from '@/shared/types';
import { accountExportService } from '@/core/services/export/export.service';
import { useUIStore } from '@/shared/stores';

interface ExportMenuProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: Account[];
  currency: CurrencyCode;
  filterLabel: string;
  sortLabel: string;
}

export const ExportMenu: React.FC<ExportMenuProps> = ({
  isOpen,
  onClose,
  accounts,
  currency,
  filterLabel,
  sortLabel,
}) => {
  const [loadingType, setLoadingType] = useState<'excel' | 'pdf' | null>(null);
  const showToast = useUIStore((state) => state.showToast);

  if (!isOpen) return null;

  const handleExportExcel = async () => {
    if (loadingType) return;
    setLoadingType('excel');
    try {
      const res = await accountExportService.exportToExcel(accounts, {
        currency,
        filterLabel,
        sortLabel,
        appName: 'حساباتي',
      });

      if (res.success) {
        showToast(
          res.method === 'share' ? 'تمت مشاركة ملف Excel بنجاح' : 'تم تحميل ملف Excel بنجاح',
          'success'
        );
        onClose();
      } else {
        showToast(res.error || 'تعذر تصدير ملف Excel', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'حدث خطأ أثناء تصدير Excel', 'error');
    } finally {
      setLoadingType(null);
    }
  };

  const handleExportPDF = async () => {
    if (loadingType) return;
    setLoadingType('pdf');
    try {
      const res = await accountExportService.exportToPDF(accounts, {
        currency,
        filterLabel,
        sortLabel,
        appName: 'حساباتي',
      });

      if (res.success) {
        showToast('تم تجهيز كشف الحسابات للطباعة والحفظ كـ PDF', 'success');
        onClose();
      } else {
        showToast(res.error || 'تعذر تجهيز ملف PDF', 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'حدث خطأ أثناء إعداد مستند PDF', 'error');
    } finally {
      setLoadingType(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-menu-title"
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col transition-all duration-200 animate-in slide-in-from-bottom sm:zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400 flex items-center justify-center font-bold">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 id="export-menu-title" className="text-base font-bold text-slate-900 dark:text-slate-100">
                تصدير قائمة الحسابات
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                اختر الصيغة المناسبة لتصدير وحفظ البيانات
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق النافذة"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content & Metadata */}
        <div className="p-4 space-y-3">
          {/* Metadata pill */}
          <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60 text-xs text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
            <div className="flex-1 flex flex-wrap gap-x-3 gap-y-1">
              <span>السجلات: <strong>{accounts.length} حساب</strong></span>
              <span>التصفية: <strong>{filterLabel}</strong></span>
              <span>الترتيب: <strong>{sortLabel}</strong></span>
            </div>
          </div>

          {/* Option 1: Excel */}
          <button
            type="button"
            id="btn-export-excel-action"
            onClick={handleExportExcel}
            disabled={loadingType !== null}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition min-h-[52px] text-start group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                {loadingType === 'excel' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <FileSpreadsheet className="w-5 h-5" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                  تصدير ملف Excel (.xlsx)
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  جدول بيانات تفصيلي مع الإجماليات والأرصدة
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              XLSX
            </span>
          </button>

          {/* Option 2: PDF */}
          <button
            type="button"
            id="btn-export-pdf-action"
            onClick={handleExportPDF}
            disabled={loadingType !== null}
            className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition min-h-[52px] text-start group disabled:opacity-50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                {loadingType === 'pdf' ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Printer className="w-5 h-5" />
                )}
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                  طباعة / تصدير مستند PDF
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  تنسيق أفقي رسمي عالي الجودة جاهز للطباعة والحفظ
                </p>
              </div>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              PDF
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition min-h-[44px]"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
};
