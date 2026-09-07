import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Receipt,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  DollarSign,
  User,
  Layers,
  FileCheck,
  ShieldCheck,
  Image as ImageIcon,
  AlertOctagon,
} from 'lucide-react';
import { useOCRStore, useAccountStore, useTransactionStore, useSettingsStore, useUIStore } from '@/shared/stores';
import { receiptTransactionBridge } from '@/core/services/ocr/ReceiptTransactionBridge.service';
import { invoiceAuditEngine } from '@/core/services/ocr/InvoiceAuditEngine.service';
import { DuplicateInvoiceCheckResult, StructuredReceiptDraft, InvoiceAuditReport } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { InvoiceAuditReportCard } from './InvoiceAuditReportCard';

interface ReceiptToTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  draft: StructuredReceiptDraft | null;
}

export const ReceiptToTransactionModal: React.FC<ReceiptToTransactionModalProps> = ({
  isOpen,
  onClose,
  draft,
}) => {
  const accounts = useAccountStore((state) => state.accounts);
  const fetchAccounts = useAccountStore((state) => state.fetchAccounts);
  const fetchAccountTransactions = useTransactionStore((state) => state.fetchAccountTransactions);
  const markDraftConverted = useOCRStore((state) => state.markDraftConverted);
  const currency = useSettingsStore((state) => state.settings.currency);
  const showToast = useUIStore((state) => state.showToast);

  // Form State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [transactionType, setTransactionType] = useState<'debit' | 'credit'>('debit');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState<string>('');
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [showImagePreview, setShowImagePreview] = useState<boolean>(false);

  // Duplicate Check & Confirmation State
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateInvoiceCheckResult | null>(null);
  const [allowDuplicate, setAllowDuplicate] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Phase 7-D AI Invoice Audit state
  const [auditReport, setAuditReport] = useState<InvoiceAuditReport | null>(null);
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [criticalConfirmed, setCriticalConfirmed] = useState<boolean>(false);

  // Initialize form state when draft changes
  useEffect(() => {
    if (draft && isOpen) {
      // Find matching account by draft's matchedAccountId or partyName
      let initialAccountId = draft.matchedAccountId || '';
      if (!initialAccountId && draft.partyName) {
        const found = accounts.find(
          (a) => a.name.trim().toLowerCase() === draft.partyName.trim().toLowerCase()
        );
        if (found) initialAccountId = found.id;
      }

      setSelectedAccountId(initialAccountId);
      // Smart default type: If customer -> debit (لي / مبيعات), if vendor -> credit (عليك / مشتريات)
      setTransactionType(draft.partyType === 'customer' ? 'debit' : 'credit');
      setAmount(draft.totalAmount);
      setDate(draft.date || new Date().toISOString().split('T')[0]);
      setReceiptNumber(draft.invoiceNumber || '');
      setNote(draft.notes || `فاتورة ${draft.partyName} - سند #${draft.invoiceNumber || ''}`);
      setAllowDuplicate(false);
      setErrorMessage(null);
    }
  }, [draft, isOpen, accounts]);

  // Real-time Duplicate Check
  useEffect(() => {
    let isCancelled = false;

    const runDuplicateCheck = async () => {
      if (!draft || !isOpen) return;

      try {
        const result = await receiptTransactionBridge.checkDuplicateInvoice({
          invoiceNumber: receiptNumber || undefined,
          accountId: selectedAccountId || undefined,
          amount: Number(amount) || 0,
          date: date || undefined,
          receiptId: draft.id,
        });

        if (!isCancelled) {
          if (result.isDuplicate) {
            setDuplicateWarning(result);
          } else {
            setDuplicateWarning(null);
            setAllowDuplicate(false);
          }
        }
      } catch (err) {
        console.error('Error checking duplicate invoice:', err);
      }
    };

    runDuplicateCheck();

    return () => {
      isCancelled = true;
    };
  }, [draft, isOpen, selectedAccountId, amount, date, receiptNumber]);

  // Real-time AI Invoice Audit (Phase 7-D)
  const runAudit = async () => {
    if (!draft || !isOpen) return;

    setIsAuditing(true);
    try {
      const draftToAudit: StructuredReceiptDraft = {
        ...draft,
        totalAmount: Number(amount) || draft.totalAmount,
        invoiceNumber: receiptNumber !== undefined ? receiptNumber : draft.invoiceNumber,
        date: date || draft.date,
      };

      const report = await invoiceAuditEngine.auditInvoiceDraft({
        draft: draftToAudit,
        targetAccountId: selectedAccountId || undefined,
        selectedTransactionType: transactionType,
      });

      setAuditReport(report);
      if (report.overallRisk !== 'CRITICAL') {
        setCriticalConfirmed(false);
      }
    } catch (err) {
      console.error('Audit execution error:', err);
    } finally {
      setIsAuditing(false);
    }
  };

  useEffect(() => {
    if (!draft || !isOpen) return;

    const timer = setTimeout(() => {
      runAudit();
    }, 350);

    return () => clearTimeout(timer);
  }, [draft, isOpen, selectedAccountId, transactionType, amount, date, receiptNumber]);

  if (!isOpen || !draft) return null;

  const activeAccounts = accounts.filter((a) => !a.archived);
  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!selectedAccountId) {
      setErrorMessage('يرجى اختيار الحساب المالي المرتبط بهذه الفاتورة.');
      return;
    }

    if (amount <= 0 || isNaN(amount)) {
      setErrorMessage('مبلغ المعاملة غير صالح. يجب أن يكون أكبر من صفر.');
      return;
    }

    if (duplicateWarning?.isDuplicate && !allowDuplicate) {
      setErrorMessage('توجد فاتورة مكررة. يرجى تأكيد المتابعة بالضغط على خيار السماح بالتكرار.');
      return;
    }

    if (auditReport?.overallRisk === 'CRITICAL' && !criticalConfirmed) {
      setErrorMessage('يرجى تأكيد الإقرار بمراجعة التحذير الحرج للمدقق الذكي قبل ترحيل القيد.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await receiptTransactionBridge.convertDraftToTransaction({
        draft,
        accountId: selectedAccountId,
        type: transactionType,
        overrideAmount: amount,
        overrideDate: date,
        overrideNote: note,
        overrideReceiptNumber: receiptNumber,
        explicitUserConfirmed: true, // User clicked explicit confirmation button
        allowDuplicate: allowDuplicate,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'تعذر ترحيل الفاتورة.');
        setIsSubmitting(false);
        return;
      }

      // Mark draft as converted in local store
      if (result.transactionId && result.operationId) {
        markDraftConverted(draft.id, result.transactionId, result.operationId);
      }

      // Refresh accounts & transactions in store
      await fetchAccounts();
      await fetchAccountTransactions(selectedAccountId);

      showToast('تم ترحيل الفاتورة بنجاح وتسجيل المعاملة في الحساب المالي', 'success');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء ترحيل المعاملة المالية.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="modal-receipt-to-transaction"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                ترحيل الفاتورة إلى معاملة مالية
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                تأكيد واعتماد القيد المحاسبي عبر محرك العمليات وإعادة احتساب الرصيد
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleConvert} className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs sm:text-sm font-semibold flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Duplicate Invoice Warning Alert */}
          {duplicateWarning?.isDuplicate && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 space-y-3 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-black">
                    تحذير: اكتشاف فاتورة مكررة مسجلة مسبقاً
                  </h4>
                  <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">
                    {duplicateWarning.messageAr}
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-amber-700 dark:text-amber-400/90 pt-1 space-y-0.5">
                    {duplicateWarning.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Allow Duplicate Checkbox */}
              <label className="flex items-center gap-2.5 pt-2 border-t border-amber-200/80 dark:border-amber-800/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allowDuplicate}
                  onChange={(e) => setAllowDuplicate(e.target.checked)}
                  className="w-4 h-4 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                />
                <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  أؤكد رغبتي في ترحيل هذه الفاتورة بالرغم من وجود سجلات سابقة مطابقة.
                </span>
              </label>
            </div>
          )}

          {/* Receipt Info Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-teal-600" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  بيانات الفاتورة المستخرجة
                </span>
              </div>

              {draft.imageUrl && (
                <button
                  type="button"
                  onClick={() => setShowImagePreview(!showImagePreview)}
                  className="text-[11px] font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1 bg-teal-50 dark:bg-teal-950/60 px-2.5 py-1 rounded-lg border border-teal-200/60"
                >
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{showImagePreview ? 'إخفاء الصورة' : 'معاينة الأصل'}</span>
                </button>
              )}
            </div>

            {showImagePreview && draft.imageUrl && (
              <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-h-48 bg-black/5 flex items-center justify-center">
                <img
                  src={draft.imageUrl}
                  alt="Original Document"
                  className="w-full h-auto max-h-48 object-contain"
                />
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">المورد / العميل</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate block mt-0.5">
                  {draft.partyName || 'غير محدد'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800">
                <span className="text-[10px] text-slate-400 block font-semibold">رقم الفاتورة</span>
                <span className="font-bold font-mono text-slate-800 dark:text-slate-200 block mt-0.5">
                  {draft.invoiceNumber || '—'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-slate-400 block font-semibold">عدد البنود</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                  {draft.lineItems.length} صنف
                </span>
              </div>
            </div>
          </div>

          {/* 1. Account Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
              الحساب المالي المستهدف <span className="text-rose-500">*</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden min-h-[44px]"
            >
              <option value="">-- اختر الحساب الذي سيتم قيد العملية له --</option>
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.category === 'customer' ? 'عميل' : acc.category === 'supplier' ? 'مورد' : 'أخرى'})
                  {acc.currentBalance !== 0 ? ` [رصيد: ${acc.currentBalance}]` : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400">
              سيتم قيد المبلغ في سجل هذا الحساب وإعادة احتساب رصيده مباشرة.
            </p>
          </div>

          {/* 2. Transaction Type (Debit / Credit) */}
          <div className="space-y-1.5">
            <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
              طبيعة القيد المحاسبي <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Debit (لي / مستحق لي) */}
              <button
                type="button"
                onClick={() => setTransactionType('debit')}
                className={`p-3 rounded-2xl border text-right transition flex items-center gap-3 min-h-[52px] ${
                  transactionType === 'debit'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <ArrowUpRight className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">مستحق لي (مدين / له)</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    أعطيته / فاتورة مبيعات
                  </div>
                </div>
              </button>

              {/* Credit (عليك / مستحق له) */}
              <button
                type="button"
                onClick={() => setTransactionType('credit')}
                className={`p-3 rounded-2xl border text-right transition flex items-center gap-3 min-h-[52px] ${
                  transactionType === 'credit'
                    ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 ring-2 ring-rose-500/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
                  <ArrowDownLeft className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">مستحق عليك (دائن / منه)</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400">
                    أخذت منه / فاتورة مشتريات
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Amount & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Amount */}
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                المبلغ الإجمالي ({currency}) <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount || ''}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 text-sm font-bold font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden min-h-[44px]"
              />
            </div>

            {/* Date */}
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                تاريخ المعاملة <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden min-h-[44px]"
              />
            </div>
          </div>

          {/* 4. Receipt Number & Notes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                رقم السند / الفاتورة
              </label>
              <input
                type="text"
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder="INV-..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden min-h-[44px]"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                ملاحظات / بيان العملية
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="بيان الفاتورة..."
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:outline-hidden min-h-[44px]"
              />
            </div>
          </div>

          {/* Phase 7-D AI Invoice Audit Report Card */}
          <InvoiceAuditReportCard report={auditReport} isLoading={isAuditing} onReaudit={runAudit} />

          {/* Critical Risk Safeguard Checkbox */}
          {auditReport?.overallRisk === 'CRITICAL' && (
            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-900/70 text-rose-900 dark:text-rose-200 space-y-2.5 shadow-xs">
              <div className="flex items-start gap-2.5">
                <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-black">
                    تحذير حرج: تم رصد تناقضات جسيمة في بيانات الفاتورة
                  </h4>
                  <p className="text-xs leading-relaxed text-rose-800 dark:text-rose-300">
                    {auditReport.recommendationAr}
                  </p>
                </div>
              </div>

              <label className="flex items-center gap-2.5 pt-2 border-t border-rose-200 dark:border-rose-900/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={criticalConfirmed}
                  onChange={(e) => setCriticalConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-rose-400 text-rose-600 focus:ring-rose-500"
                />
                <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  أقر بأنني دققت التناقضات الحسابية/التكرار وأرغب في المتابعة وترحيل القيد رغم التحذير الحرج.
                </span>
              </label>
            </div>
          )}

          {/* Integrity & Audit Assurance */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/40 flex items-start gap-2.5 text-xs text-teal-800 dark:text-teal-300">
            <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>أمان مالي كامل:</strong> سيتم الترحيل عبر محرك المعاملات المحاسبي المعتمد مع حفظ مرجع الفاتورة، وتوليد مفتاح عدم تكرار (Idempotency Key)، وفحص سلامة التوازن المالي.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px]"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedAccountId ||
                (duplicateWarning?.isDuplicate && !allowDuplicate) ||
                (auditReport?.overallRisk === 'CRITICAL' && !criticalConfirmed)
              }
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-teal-700/20 active:scale-[0.98] transition disabled:opacity-50 disabled:pointer-events-none min-h-[44px] flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جارٍ الترحيل المالي...' : 'تأكيد الترحيل المالي والاعتماد'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
