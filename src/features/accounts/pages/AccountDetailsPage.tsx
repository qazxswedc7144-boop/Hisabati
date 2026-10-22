import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Phone,
  Edit,
  Trash2,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  FileText,
  Calendar,
  AlertTriangle,
  X,
  Archive,
  RotateCcw,
  RefreshCw,
  Clock,
  Layers,
  Receipt,
  Bell,
} from 'lucide-react';
import { useAccountStore, useTransactionStore, useSettingsStore, useUIStore, useMessagingStore } from '@/shared/stores';
import { BalanceBadge, EmptyState, EditTransactionModal } from '@/shared/components';
import { AccountStatementModal } from '@/features/reports/components/AccountStatementModal';
import { PdfXlsExportIcon } from '@/shared/components/icons/PdfXlsExportIcon';
import { ReceiptDocumentModal } from '@/features/ocr';
import { formatCurrency, formatDate } from '@/core/utils/formatters';

import { Transaction } from '@/shared/types';
import { useI18n } from '@/shared/hooks/useI18n';

export const AccountDetailsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useI18n();

  const account = useAccountStore((state) => state.selectedAccount);
  const fetchAccountById = useAccountStore((state) => state.fetchAccountById);
  const updateAccount = useAccountStore((state) => state.updateAccount);
  const archiveAccount = useAccountStore((state) => state.archiveAccount);
  const unarchiveAccount = useAccountStore((state) => state.unarchiveAccount);
  const deleteAccount = useAccountStore((state) => state.deleteAccount);

  const transactions = useTransactionStore((state) => state.accountTransactions);
  const hasMore = useTransactionStore((state) => state.hasMoreAccountTransactions);
  const isLoadingTrx = useTransactionStore((state) => state.isLoading);
  const fetchAccountTransactions = useTransactionStore((state) => state.fetchAccountTransactions);
  const loadMoreTransactions = useTransactionStore((state) => state.loadMoreAccountTransactions);
  const deleteTransaction = useTransactionStore((state) => state.deleteTransaction);

  const currency = useSettingsStore((state) => state.settings.currency);
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const showToast = useUIStore((state) => state.showToast);
  const openScheduleModal = useMessagingStore((state) => state.openScheduleModal);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editNote, setEditNote] = useState('');

  const [editingTrx, setEditingTrx] = useState<Transaction | null>(null);
  const [viewingDocTrx, setViewingDocTrx] = useState<Transaction | null>(null);
  const [showStatementModal, setShowStatementModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [trxToDelete, setTrxToDelete] = useState<string | null>(null);
  const [deleteErrorMessage, setDeleteErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      fetchAccountById(id);
      fetchAccountTransactions(id);
    }
  }, [id, fetchAccountById, fetchAccountTransactions]);

  useEffect(() => {
    if (account) {
      setEditName(account.name);
      setEditPhone(account.phone || '');
      setEditNote(account.note || '');
    }
  }, [account]);

  if (!account) {
    return (
      <div className="py-12">
        <EmptyState
          title="الحساب غير موجود"
          description="قد يكون تم حذف الحساب أو المعرف غير صحيح."
          actionLabel="العودة إلى الحسابات"
          onAction={() => navigate('/accounts')}
        />
      </div>
    );
  }

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;

    try {
      await updateAccount(account.id, {
        name: editName.trim(),
        phone: editPhone.trim() || undefined,
        note: editNote.trim() || undefined,
      });

      setIsEditing(false);
      showToast('تم تحديث بيانات الحساب بنجاح', 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشل تحديث الحساب', 'error');
    }
  };

  const handleToggleArchive = async () => {
    try {
      if (account.archived === 1) {
        await unarchiveAccount(account.id);
        showToast('تم إلغاء أرشفة واستعادة الحساب بنجاح', 'success');
      } else {
        await archiveAccount(account.id);
        showToast('تم أرشفة الحساب بنجاح', 'success');
      }
      fetchAccountById(account.id);
    } catch (err: any) {
      showToast(err?.message || 'فشل تغيير حالة الأرشفة', 'error');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleteErrorMessage(null);
      await deleteAccount(account.id, false);
      showToast('تم حذف الحساب بنجاح', 'success');
      navigate('/accounts');
    } catch (err: any) {
      setDeleteErrorMessage(err?.message || 'لا يمكن حذف الحساب');
    }
  };

  const handleForceDeleteAccount = async () => {
    try {
      await deleteAccount(account.id, true);
      showToast('تم حذف الحساب مع كافة سجلاته المالية نهائياً', 'success');
      navigate('/accounts');
    } catch (err: any) {
      showToast(err?.message || 'فشل الحذف', 'error');
    }
  };

  const handleMoveToTrash = async () => {
    try {
      await deleteAccount(account.id, true, true);
      showToast('تم نقل الحساب وكافة عملياته إلى سلة المهملات', 'success');
      navigate('/accounts');
    } catch (err: any) {
      showToast(err?.message || 'فشل النقل لسلة المهملات', 'error');
    }
  };

  const handleDeleteTrx = async (trxId: string) => {
    await deleteTransaction(trxId, account.id);
    await fetchAccountById(account.id);
    showToast('تم حذف العملية وتحديث الرصيد بنجاح', 'success');
    setTrxToDelete(null);
  };

  return (
    <div id="account-details-page" className="space-y-4 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Action Bar */}
      <div
        className="flex items-center justify-between gap-2 overflow-x-auto scrollbar-none flex-nowrap pb-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        <button
          id="btn-back-to-accounts"
          onClick={() => navigate('/accounts')}
          aria-label="العودة للحسابات"
          className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition shrink-0"
        >
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5 flex-nowrap shrink-0">
          {/* Statement Button */}
          <button
            id="btn-account-statement"
            type="button"
            onClick={() => setShowStatementModal(true)}
            aria-label="كشف الحساب"
            title="كشف الحساب"
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-slate-200/60 dark:border-slate-800 shrink-0"
          >
            <PdfXlsExportIcon className="w-4 h-4" />
          </button>

          {/* Schedule Debt Collection Alert Button */}
          {account.currentBalance > 0 && (
            <button
              id="btn-account-schedule-alert"
              onClick={() => openScheduleModal(account)}
              aria-label="جدولة تنبيه تحصيل دين لهذا الحساب"
              className="px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition min-h-[40px] flex items-center justify-center text-xs font-bold gap-1.5 shrink-0"
              title="جدولة تنبيه تحصيل دين لهذا الحساب"
            >
              <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="hidden sm:inline">جدولة تحصيل</span>
            </button>
          )}

          {/* Archive / Unarchive Button */}
          <button
            onClick={handleToggleArchive}
            aria-label={account.archived === 1 ? 'استعادة من الأرشيف' : 'أرشفة الحساب'}
            className={`px-2.5 py-1.5 rounded-xl border transition min-h-[40px] flex items-center justify-center text-xs font-bold gap-1.5 shrink-0 ${
              account.archived === 1
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-700 dark:text-amber-400'
                : 'border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={account.archived === 1 ? 'استعادة من الأرشيف' : 'أرشفة الحساب'}
          >
            {account.archived === 1 ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            <span className="hidden sm:inline">{account.archived === 1 ? 'استعادة' : 'أرشفة'}</span>
          </button>

          {/* Edit Account */}
          <button
            onClick={() => setIsEditing(true)}
            aria-label="تعديل الحساب"
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-slate-200/80 dark:border-slate-800 shrink-0"
            title="تعديل الحساب"
          >
            <Edit className="w-4 h-4" />
          </button>

          {/* Delete Account */}
          <button
            onClick={() => {
              setDeleteErrorMessage(null);
              setShowDeleteConfirm(true);
            }}
            aria-label="حذف الحساب"
            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-rose-200/80 dark:border-rose-900/40 shrink-0"
            title="حذف الحساب"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Account Hero Card - Compact Reorganized */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-4">
        {/* Top: Name, Status, Phone, Note */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
                {account.name}
              </h2>
              <BalanceBadge balance={account.currentBalance} size="md" />
              {account.archived === 1 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  مؤرشف
                </span>
              )}
            </div>

            {account.phone && (
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5" dir="ltr">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span>{account.phone}</span>
              </p>
            )}

            {account.note && (
              <p className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 rounded-xl inline-block max-w-md">
                {account.note}
              </p>
            )}
          </div>

          {/* Compact Primary Action Button (height 48-52px) */}
          <button
            id="btn-add-trx-for-account"
            onClick={() => openQuickAdd(account.id)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs sm:text-sm shadow-sm shadow-teal-700/20 active:scale-[0.98] transition min-h-[48px] shrink-0"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>تسجيل عملية لهذا الحساب</span>
          </button>
        </div>

        {/* 3 Metric Balance Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Current Net Balance */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block mb-0.5">
              الرصيد المتبقي
            </span>
            <div
              className={`text-lg sm:text-xl font-black tabular-nums ${
                account.currentBalance > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : account.currentBalance < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {formatCurrency(Math.abs(account.currentBalance), currency)}
            </div>
            <span className="text-[10px] font-semibold text-slate-400 mt-0.5 block">
              {account.currentBalance > 0 ? 'لك عنده (مستحق)' : account.currentBalance < 0 ? 'له عندك (مطلوب)' : 'الحساب مصفر'}
            </span>
          </div>

          {/* Total Debit (لك) */}
          <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
            <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block mb-0.5">
              إجمالي لك (أعطيته)
            </span>
            <div className="text-lg sm:text-xl font-black text-emerald-800 dark:text-emerald-300 tabular-nums">
              {formatCurrency(account.totalDebit, currency)}
            </div>
            <span className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 block">
              مجموع المبالغ المقيدة له
            </span>
          </div>

          {/* Total Credit (عليك) */}
          <div className="p-3 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
            <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block mb-0.5">
              إجمالي عليك (استلمت منه)
            </span>
            <div className="text-lg sm:text-xl font-black text-rose-800 dark:text-rose-300 tabular-nums">
              {formatCurrency(account.totalCredit, currency)}
            </div>
            <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5 block">
              مجموع التسديدات والواردات
            </span>
          </div>
        </div>
      </div>

      {/* Transaction Statement Table / List */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>كشف الحساب والعمليات ({transactions.length})</span>
          </h3>
          <span className="text-[11px] text-slate-400">مرتبة تنازلياً مع الرصيد</span>
        </div>

        {transactions.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              لا توجد عمليات مسجلة لهذا الحساب حتى الآن.
            </p>
            <button
              onClick={() => openQuickAdd(account.id)}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm transition min-h-[40px]"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>تسجيل عملية الآن</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
              {transactions.map((trx) => (
                <div
                  key={trx.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                        trx.type === 'debit'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {trx.type === 'debit' ? (
                        <ArrowUpRight className="w-4 h-4" />
                      ) : (
                        <ArrowDownLeft className="w-4 h-4" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                            trx.type === 'debit'
                              ? 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-rose-100/80 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          }`}
                        >
                          {trx.type === 'debit' ? 'لي (أعطيته)' : 'عليك (أخذت منه)'}
                        </span>
                        {trx.receiptNumber && (
                          <span className="text-[11px] text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            سند: {trx.receiptNumber}
                          </span>
                        )}
                      </div>

                      <p className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 mt-1 truncate">
                        {trx.note || 'عملية نقدية'}
                      </p>

                      <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{formatDate(trx.date, 'full')}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800/60">
                    <div className="text-start sm:text-end">
                      <div
                        className={`text-sm sm:text-base font-extrabold tabular-nums ${
                          trx.type === 'debit'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {trx.type === 'debit' ? '+' : '-'} {formatCurrency(trx.amount, currency)}
                      </div>

                      {trx.runningBalance !== undefined && (
                        <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 tabular-nums flex items-center gap-1 sm:justify-end">
                          <Layers className="w-3 h-3 text-slate-400" />
                          <span>
                            الرصيد بعدها:{' '}
                            <span
                              className={
                                trx.runningBalance > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : trx.runningBalance < 0
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : 'text-slate-600 dark:text-slate-400'
                              }
                            >
                              {formatCurrency(Math.abs(trx.runningBalance), currency)}{' '}
                              {trx.runningBalance > 0 ? '(له)' : trx.runningBalance < 0 ? '(عليك)' : ''}
                            </span>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {Boolean(trx.receiptId || trx.documentRef || trx.documentMetadata) && (
                        <button
                          type="button"
                          onClick={() => setViewingDocTrx(trx)}
                          className="p-1.5 rounded-lg text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition min-w-[32px] min-h-[32px] flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60"
                          title="عرض المستند الأصلي والفاتورة"
                        >
                          <Receipt className="w-4 h-4" />
                        </button>
                      )}

                      <button
                        onClick={() => setEditingTrx(trx)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition min-w-[32px] min-h-[32px] flex items-center justify-center"
                        title="تعديل العملية"
                      >
                        <Edit className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => setTrxToDelete(trx.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-w-[32px] min-h-[32px] flex items-center justify-center"
                        title="حذف العملية"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={() => loadMoreTransactions(account.id)}
                  disabled={isLoadingTrx}
                  className="px-5 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoadingTrx ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Clock className="w-3.5 h-3.5" />
                  )}
                  <span>تحميل المزيد من العمليات</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Account Statement Modal */}
      <AccountStatementModal
        isOpen={showStatementModal}
        onClose={() => setShowStatementModal(false)}
        accountId={account.id}
        accountName={account.name}
      />

      {/* Edit Transaction Modal */}
      <EditTransactionModal
        isOpen={!!editingTrx}
        transaction={editingTrx}
        onClose={() => {
          setEditingTrx(null);
          if (id) {
            fetchAccountById(id);
            fetchAccountTransactions(id);
          }
        }}
      />

      {/* Edit Account Modal */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150 my-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                تعديل بيانات الحساب
              </h3>
              <button onClick={() => setIsEditing(false)} className="p-1 text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الاسم
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  الهاتف
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium text-end"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات
                </label>
                <textarea
                  rows={2}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-medium resize-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold"
                >
                  حفظ التعديل
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center my-auto">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              تأكيد حذف الحساب
            </h3>
            
            {deleteErrorMessage ? (
              <div className="my-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 text-xs text-amber-800 dark:text-amber-300 text-start leading-relaxed">
                <p className="font-bold mb-1">تنبيه أمان البيانات:</p>
                <p>{deleteErrorMessage}</p>
                <div className="mt-4 space-y-2">
                  <button
                    onClick={() => {
                      handleToggleArchive();
                      setShowDeleteConfirm(false);
                    }}
                    className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs transition active:scale-[0.98]"
                  >
                    أرشفة الحساب بدلاً من الحذف
                  </button>
                  
                  <button
                    onClick={handleMoveToTrash}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs transition active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>حذف نهائي مع كافة العمليات (سلة المهملات)</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                هل أنت متأكد من رغبتك في حذف الحساب "{account.name}"؟
              </p>
            )}

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteErrorMessage(null);
                }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              
              {!deleteErrorMessage && (
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
                >
                  تأكيد الحذف
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Transaction Confirmation Dialog */}
      {trxToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center my-auto">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              تأكيد حذف العملية
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              هل أنت متأكد من رغبتك في حذف هذه العملية وتحديث رصيد الحساب تلقائياً؟
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setTrxToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={() => handleDeleteTrx(trxToDelete)}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                حذف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Original Receipt Document Modal */}
      <ReceiptDocumentModal
        isOpen={!!viewingDocTrx}
        onClose={() => setViewingDocTrx(null)}
        transaction={viewingDocTrx}
      />
    </div>
  );
};
