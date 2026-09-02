import React, { useState } from 'react';
import {
  FileText,
  ScanLine,
  CheckCircle2,
  Clock,
  Trash2,
  Calendar,
  Building2,
  Receipt,
  ArrowRight,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { useOCRStore } from '@/shared/stores/ocrStore';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { StructuredReceiptDraft } from '@/shared/types';

export const OCRDraftsSection: React.FC = () => {
  const { savedDrafts, openScannerModal, deleteDraft } = useOCRStore();
  const [selectedDraft, setSelectedDraft] = useState<StructuredReceiptDraft | null>(null);

  return (
    <div
      id="ocr-drafts-section"
      className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 flex items-center justify-center border border-sky-200/60 dark:border-sky-800/60 shrink-0">
            <ScanLine className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>مسودات الفواتير الممسوحة ذكيًا (OCR Drafts)</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300">
                {savedDrafts.length} مسودة
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مسودات الفواتير المدققة والمحفوظة في انتظار الترحيل المالي في الخطوة التالية
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openScannerModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white text-xs font-bold shadow-sm shadow-sky-600/20 active:scale-[0.98] transition min-h-[42px]"
        >
          <ScanLine className="w-4 h-4" />
          <span>مسح فاتورة جديدة</span>
        </button>
      </div>

      {savedDrafts.length === 0 ? (
        <div className="py-8 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30 p-4">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
            لا توجد مسودات فواتير محفوظة حاليًا
          </p>
          <p className="text-[11px] text-slate-400 mt-1 max-w-sm mx-auto">
            يمكنك مسح أي فاتورة ورقية أو إلكترونية ومراجعة بياناتها واعتمادها كمسودة قبل ترحيلها ماليًا.
          </p>
          <button
            type="button"
            onClick={openScannerModal}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>مسح فاتورة تجريبية الآن</span>
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {savedDrafts.map((draft) => (
            <div
              key={draft.id}
              className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  <Receipt className="w-4 h-4 text-slate-600 dark:text-slate-300" />
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 dark:text-slate-100 truncate">
                      {draft.partyName}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold">
                      {draft.partyType === 'vendor' ? 'مورد' : 'عميل'}
                    </span>
                    {draft.invoiceNumber && (
                      <span className="text-[11px] font-mono text-slate-500">
                        #{draft.invoiceNumber}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      {draft.date}
                    </span>
                    <span>•</span>
                    <span>{draft.lineItems.length} أصناف</span>
                    <span>•</span>
                    <span className="text-teal-600 dark:text-teal-400 font-semibold">
                      معتمدة باليد ({formatDate(draft.confirmedAt)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
                <div className="text-end">
                  <span className="font-mono font-black text-sm text-slate-900 dark:text-slate-100">
                    {formatCurrency(draft.totalAmount, draft.currency)}
                  </span>
                  <p className="text-[10px] text-slate-400">مسودة جاهزة للترحيل</p>
                </div>

                <button
                  type="button"
                  onClick={() => deleteDraft(draft.id)}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  title="حذف المسودة"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
