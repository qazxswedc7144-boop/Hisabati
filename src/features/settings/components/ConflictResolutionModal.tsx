import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  ArrowRightLeft,
  Smartphone,
  Cloud,
  Clock,
  Coins,
  FileText,
  Calendar,
  ShieldAlert,
} from 'lucide-react';
import { useSyncStore, useUIStore } from '@/shared/stores';
import { SyncConflictItem } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';

interface ConflictResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { conflicts, resolveConflict } = useSyncStore();
  const { showToast } = useUIStore();

  const [activeConflict, setActiveConflict] = useState<SyncConflictItem | null>(null);
  const [pendingChoice, setPendingChoice] = useState<'local' | 'remote' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentConflict = activeConflict || (conflicts.length > 0 ? conflicts[0] : null);

  const handleInitiateResolution = (conflict: SyncConflictItem, choice: 'local' | 'remote') => {
    setActiveConflict(conflict);
    setPendingChoice(choice);
  };

  const handleConfirmResolution = async () => {
    if (!currentConflict || !pendingChoice) return;
    setIsSubmitting(true);
    try {
      await resolveConflict(currentConflict, pendingChoice);
      showToast(
        pendingChoice === 'local'
          ? 'تم اعتماد النسخة المحلية وتحديث حالة السحابة'
          : 'تم اعتماد نسخة السحابة وإعادة احتساب الأرصدة بنجاح',
        'success'
      );
      setPendingChoice(null);
      setActiveConflict(null);
      if (conflicts.length <= 1) {
        onClose();
      }
    } catch (err: any) {
      showToast(err?.message || 'فشلت معالجة التعارض', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="conflict-resolution-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in"
      onClick={onClose}
    >
      <div
        id="conflict-resolution-modal"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>حل تعارض المزامنة</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono">
                  {conflicts.length} سجلات معلقة
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                مقارنة دقيقة بين التعديل المحلي على جهازك وتعديل السحابة لاختيار النسخة المعتمدة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Empty State when no conflicts */}
        {conflicts.length === 0 ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              لا توجد أي تعارضات حالياً
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              جميع السجلات المحاسبية متطابقة بين الأجهزة وقاعدة البيانات السحابية.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-teal-600 text-white text-xs font-bold"
            >
              إغلاق النافذة
            </button>
          </div>
        ) : (
          <>
            {/* Conflict Selector Tabs (if multiple) */}
            {conflicts.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                {conflicts.map((c, idx) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setActiveConflict(c);
                      setPendingChoice(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 min-h-[36px] ${
                      currentConflict?.id === c.id
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    تعارض #{idx + 1}: {c.localVersion.title || c.entityType}
                  </button>
                ))}
              </div>
            )}

            {currentConflict && (
              <div className="space-y-4">
                {/* Conflict Entity Meta Info */}
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded-lg bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-bold">
                      {currentConflict.entityType === 'transaction'
                        ? 'معاملة مالية'
                        : currentConflict.entityType === 'account'
                        ? 'حساب مالي'
                        : 'إعداد'}
                    </span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {currentConflict.localVersion.title}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>تاريخ الاكتشاف: {formatDate(currentConflict.detectedAt, 'full')}</span>
                  </div>
                </div>

                {/* Side-by-Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* LOCAL VERSION CARD */}
                  <div className="p-4 rounded-2xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-3 relative">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                          النسخة المحلية (جهازك)
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {currentConflict.localVersion.updatedAt
                          ? formatDate(currentConflict.localVersion.updatedAt)
                          : 'غير محدد'}
                      </span>
                    </div>

                    {/* Data Details */}
                    <div className="space-y-2 text-xs">
                      {currentConflict.entityType === 'transaction' && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                            <span className="text-slate-500">المبلغ:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                              {formatCurrency(
                                currentConflict.localVersion.data?.amountMinor !== undefined
                                  ? currentConflict.localVersion.data.amountMinor / 100
                                  : currentConflict.localVersion.data?.amount || 0
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                            <span className="text-slate-500">النوع:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {currentConflict.localVersion.data?.type === 'income'
                                ? 'له (قبض)'
                                : 'عليه (صرف)'}
                            </span>
                          </div>

                          {currentConflict.localVersion.data?.notes && (
                            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 text-[11px]">
                              <span className="text-slate-500 block mb-0.5">البيان / الملاحظات:</span>
                              <p className="text-slate-800 dark:text-slate-200">
                                {currentConflict.localVersion.data.notes}
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {currentConflict.entityType === 'account' && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                            <span className="text-slate-500">اسم الحساب:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {currentConflict.localVersion.data?.name || currentConflict.localVersion.title}
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/80">
                            <span className="text-slate-500">الرصيد:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 font-mono text-sm">
                              {formatCurrency(
                                currentConflict.localVersion.data?.currentBalanceMinor !== undefined
                                  ? currentConflict.localVersion.data.currentBalanceMinor / 100
                                  : currentConflict.localVersion.data?.currentBalance || 0
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleInitiateResolution(currentConflict, 'local')}
                      className="w-full py-2.5 px-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      <span>الاحتفاظ بالنسخة المحلية</span>
                    </button>
                  </div>

                  {/* REMOTE VERSION CARD */}
                  <div className="p-4 rounded-2xl border-2 border-teal-400 dark:border-teal-700 bg-teal-50/30 dark:bg-teal-950/20 space-y-3 relative">
                    <div className="flex items-center justify-between pb-2 border-b border-teal-100 dark:border-teal-900/60">
                      <div className="flex items-center gap-2">
                        <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                        <span className="font-bold text-xs text-teal-900 dark:text-teal-200">
                          نسخة السحابة (Google Drive)
                        </span>
                      </div>
                      <span className="text-[10px] text-teal-600/80 dark:text-teal-400 font-mono">
                        {currentConflict.remoteVersion.updatedAt
                          ? formatDate(currentConflict.remoteVersion.updatedAt)
                          : 'غير محدد'}
                      </span>
                    </div>

                    {/* Data Details */}
                    <div className="space-y-2 text-xs">
                      {currentConflict.entityType === 'transaction' && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-slate-500">المبلغ:</span>
                            <span className="font-bold text-teal-700 dark:text-teal-300 font-mono text-sm">
                              {formatCurrency(
                                currentConflict.remoteVersion.data?.amountMinor !== undefined
                                  ? currentConflict.remoteVersion.data.amountMinor / 100
                                  : currentConflict.remoteVersion.data?.amount || 0
                              )}
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-slate-500">النوع:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-200">
                              {currentConflict.remoteVersion.data?.type === 'income'
                                ? 'له (قبض)'
                                : 'عليه (صرف)'}
                            </span>
                          </div>

                          {currentConflict.remoteVersion.data?.notes && (
                            <div className="p-2 rounded-xl bg-white dark:bg-slate-800 text-[11px]">
                              <span className="text-slate-500 block mb-0.5">البيان / الملاحظات:</span>
                              <p className="text-slate-800 dark:text-slate-200">
                                {currentConflict.remoteVersion.data.notes}
                              </p>
                            </div>
                          )}
                        </>
                      )}

                      {currentConflict.entityType === 'account' && (
                        <>
                          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-slate-500">اسم الحساب:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">
                              {currentConflict.remoteVersion.data?.name || currentConflict.remoteVersion.title}
                            </span>
                          </div>

                          <div className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800">
                            <span className="text-slate-500">الرصيد:</span>
                            <span className="font-bold text-teal-700 dark:text-teal-300 font-mono text-sm">
                              {formatCurrency(
                                currentConflict.remoteVersion.data?.currentBalanceMinor !== undefined
                                  ? currentConflict.remoteVersion.data.currentBalanceMinor / 100
                                  : currentConflict.remoteVersion.data?.currentBalance || 0
                              )}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleInitiateResolution(currentConflict, 'remote')}
                      className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 min-h-[44px]"
                    >
                      <span>اعتماد نسخة السحابة</span>
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    <strong>ضمان النزاهة المالية:</strong> كل خيار يتم توثيقه في سجل التدقيق المحاسبي ولا يؤدي لحذف غير قابل للتتبع أو تراكم غير متوازن للأرصدة.
                  </p>
                </div>
              </div>
            )}
          </>
        )}

        {/* Confirmation Modal Before Applying Resolution */}
        {pendingChoice && currentConflict && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div>
                <h4 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                  تأكيد اعتماد النسخة
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  أنت على وشك اعتماد{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {pendingChoice === 'local' ? 'النسخة المحلية' : 'نسخة السحابة'}
                  </strong>{' '}
                  لـ ({currentConflict.localVersion.title}). سيتم تحديث قاعدة البيانات وإعادة احتساب الأرصدة تلقائياً.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPendingChoice(null)}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleConfirmResolution}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[44px] disabled:opacity-50"
                >
                  {isSubmitting ? 'جارٍ التطبيق...' : 'تأكيد وحفظ'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
