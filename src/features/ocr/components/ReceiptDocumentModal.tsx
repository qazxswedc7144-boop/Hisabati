import React from 'react';
import {
  X,
  Receipt,
  Calendar,
  DollarSign,
  User,
  FileText,
  ShieldCheck,
  CheckCircle2,
  Printer,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
} from 'lucide-react';
import { Transaction } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { useSettingsStore } from '@/shared/stores';

interface ReceiptDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction | null;
}

export const ReceiptDocumentModal: React.FC<ReceiptDocumentModalProps> = ({
  isOpen,
  onClose,
  transaction,
}) => {
  const currency = useSettingsStore((state) => state.settings.currency);

  if (!isOpen || !transaction) return null;

  const metadata = transaction.documentMetadata;
  const lineItems = metadata?.lineItems || [];
  const imageUrl = transaction.documentRef?.startsWith('data:') || transaction.documentRef?.startsWith('http')
    ? transaction.documentRef
    : metadata?.imageUrl;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      id="modal-receipt-document-viewer"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>المستند المالي الأصلي</span>
                {transaction.receiptNumber && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-teal-100/80 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                    #{transaction.receiptNumber}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                مستند القيد المحاسبي الموثق عبر الفحص الضوئي والمحرك المالي
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-xs font-bold flex items-center gap-1.5"
              title="طباعة المستند"
            >
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">طباعة</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Top Transaction Banner */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold text-slate-400 block">الحساب والبيان</span>
              <h4 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 mt-0.5">
                {transaction.accountName || metadata?.vendorName || metadata?.customerName || 'حساب مالي'}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" />
                <span>{formatDate(transaction.date, 'full')}</span>
              </p>
            </div>

            <div className="text-start sm:text-end border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[11px] font-bold text-slate-400 block">المبلغ المقيد</span>
              <div
                className={`text-xl font-black font-mono tabular-nums ${
                  transaction.type === 'debit'
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {transaction.type === 'debit' ? '+' : '-'}
                {formatCurrency(transaction.amount, currency)}
              </div>
              <span
                className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1 ${
                  transaction.type === 'debit'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                }`}
              >
                {transaction.type === 'debit' ? 'مدين (مستحق لي)' : 'دائن (مستحق عليك)'}
              </span>
            </div>
          </div>

          {/* Original Document Photo / Image if available */}
          {imageUrl && (
            <div className="space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-teal-600" />
                <span>صورة الفاتورة الأصلية الملتقطة</span>
              </span>
              <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950/5 flex items-center justify-center p-2 max-h-72">
                <img
                  src={imageUrl}
                  alt="Original Invoice"
                  className="max-h-68 w-auto object-contain rounded-xl shadow-xs"
                />
              </div>
            </div>
          )}

          {/* Invoice Line Items (الأصناف والبنود) */}
          {lineItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-teal-600" />
                  <span>تفاصيل أصناف وبنود الفاتورة ({lineItems.length})</span>
                </h4>
              </div>

              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                        <th className="py-2.5 px-3">الصنف / البيان</th>
                        <th className="py-2.5 px-3 text-center">الكمية</th>
                        <th className="py-2.5 px-3 text-center">سعر الوحدة</th>
                        <th className="py-2.5 px-3 text-left">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {lineItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            {item.name}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {item.quantity}
                          </td>
                          <td className="py-2 px-3 text-center font-mono text-slate-600 dark:text-slate-400">
                            {formatCurrency(item.unitPrice, currency)}
                          </td>
                          <td className="py-2 px-3 text-left font-bold font-mono text-slate-900 dark:text-slate-100">
                            {formatCurrency(item.totalPrice, currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Audit Trail & Document Identifiers */}
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 text-xs space-y-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-teal-600" />
              <span>بيانات التتبع والتوثيق المالي (Audit Trail)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-slate-500 dark:text-slate-400 pt-1">
              <div>
                <span className="text-slate-400">معرف المعاملة: </span>
                <span className="text-slate-700 dark:text-slate-300">{transaction.id}</span>
              </div>
              {transaction.operationId && (
                <div>
                  <span className="text-slate-400">مفتاح عدم التكرار (OpID): </span>
                  <span className="text-slate-700 dark:text-slate-300 truncate inline-block max-w-[180px] align-bottom">
                    {transaction.operationId}
                  </span>
                </div>
              )}
              {transaction.receiptId && (
                <div>
                  <span className="text-slate-400">معرف الفاتورة الأصلية: </span>
                  <span className="text-slate-700 dark:text-slate-300">{transaction.receiptId}</span>
                </div>
              )}
              {metadata?.ocrConfidence !== undefined && (
                <div>
                  <span className="text-slate-400">دقة القراءة الآلية (OCR): </span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {Math.round(metadata.ocrConfidence * 100)}%
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/30">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs sm:text-sm font-bold transition min-h-[44px]"
          >
            إغلاق المستند
          </button>
        </div>
      </div>
    </div>
  );
};
