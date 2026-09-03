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
} from 'lucide-react';
import { useAccountStore, useTransactionStore, useSettingsStore, useUIStore } from '@/shared/stores';
import { BalanceBadge, EmptyState, EditTransactionModal } from '@/shared/components';
import { AccountStatementModal } from '@/features/reports/components';
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
  const fetchAccountTransactions = useTransactionStore((state) => state.fetchAccountTransactions);
  const deleteTransaction = useTransactionStore((state) => state.deleteTransaction);

  const currency = useSettingsStore((state) => state.settings.currency);
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const showToast = useUIStore((state) => state.showToast);

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
      if (account.archived) {
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

  const handleDeleteTrx = async (trxId: string) => {
    await deleteTransaction(trxId, account.id);
    await fetchAccountById(account.id);
    showToast('تم حذف العملية وتحديث الرصيد بنجاح', 'success');
    setTrxToDelete(null);
  };

  return (
    <div id="account-details-page" className="space-y-6 animate-in fade-in duration-200">
      {/* Top Breadcrumb & Action Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          id="btn-back-to-accounts"
          onClick={() => navigate('/accounts')}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 transition"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للحسابات</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Statement Button */}
          <button
            id="btn-open-account-statement"
            onClick={() => setShowStatementModal(true)}
            className="px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/50 transition min-h-[40px] flex items-center justify-center text-xs font-bold gap-1.5"
            title="كشف الحساب المالي"
          >
            <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>كشف الحساب</span>
          </button>

          {/* Archive / Unarchive Button */}
          <button
            onClick={handleToggleArchive}
            className={`p-2 rounded-xl border transition min-w-[40px] min-h-[40px] flex items-center justify-center text-xs font-bold gap-1.5 ${
              account.archived
                ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 text-amber-700 dark:text-amber-400'
                : 'border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
            title={account.archived ? 'استعادة من الأرشيف' : 'أرشفة الحساب'}
          >
            {account.archived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            <span className="hidden sm:inline">{account.archived ? 'استعادة' : 'أرشفة'}</span>
          </button>

          {/* Edit Account */}
          <button
            onClick={() => setIsEditing(true)}
            className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-slate-200/80 dark:border-slate-800"
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
            className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-rose-200/80 dark:border-rose-900/40"
            title="حذف الحساب"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Account Hero Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
                {account.name}
              </h2>
              <BalanceBadge balance={account.currentBalance} size="lg" />
              {account.archived && (
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  مؤرشف
                </span>
              )}
            </div>

            {account.phone && (
              <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-1" dir="ltr">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{account.phone}</span>
              </p>
            )}

            {account.note && (
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-2 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-xl inline-block max-w-md">
                {account.note}
              </p>
            )}
          </div>

          <button
            id="btn-add-trx-for-account"
            onClick={() => openQuickAdd(account.id)}
            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm shadow-md shadow-teal-700/20 active:scale-[0.98] transition min-h-[46px]"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
            <span>تسجيل عملية لهذا الحساب</span>
          </button>
        </div>

        {/* 3 Metric Balance Highlights (Calculated from transactions) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5">
          {/* Current Net Balance */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
              الرصيد المتبقي
            </span>
            <div
              className={`text-xl sm:text-2xl font-black tabular-nums ${
                account.currentBalance > 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : account.currentBalance < 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-700 dark:text-slate-300'
              }`}
            >
              {formatCurrency(Math.abs(account.currentBalance), currency)}
            </div>
            <span className="text-[11px] font-semibold text-slate-400 mt-0.5 block">
              {account.currentBalance > 0 ? 'لك عنده (مستحق)' : account.currentBalance < 0 ? 'له عندك (مطلوب)' : 'الحساب مصفر'}
            </span>
          </div>

          {/* Total Debit (لك) */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40">
            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 block mb-1">
              إجمالي لك (أعطيته)
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-800 dark:text-emerald-300 tabular-nums">
              {formatCurrency(account.totalDebit, currency)}
            </div>
            <span className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 mt-0.5 block">
              مجموع المبالغ المقيدة له
            </span>
          </div>

          {/* Total Credit (عليك) */}
          <div className="p-4 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 dark:border-rose-800/40">
            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 block mb-1">
              إجمالي عليك (استلمت منه)
            </span>
            <div className="text-xl sm:text-2xl font-black text-rose-800 dark:text-rose-300 tabular-nums">
              {formatCurrency(account.totalCredit, currency)}
            </div>
            <span className="text-[11px] text-rose-600/80 dark:text-rose-400/80 mt-0.5 block">
              مجموع التسديدات والواردات
            </span>
          </div>
        </div>
      </div>

      {/* Transaction Statement Table / List */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span>كشف الحساب والعمليات ({transactions.length})</span>
          </h3>
          <span className="text-xs text-slate-400">مرتبة تنازلياً مع الرصيد بعد كل حركة</span>
        </div>

        {transactions.length === 0 ? (
          <EmptyState
            title="لا توجد عمليات مسجلة لهذا الحساب"
            description="اضغط على زر الإضافة لتسجيل أول حركة مالية لهذا الحساب."
            actionLabel="+ تسجيل عملية الآن"
            onAction={() => openQuickAdd(account.id)}
          />
        ) : (
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 shadow-xs">
            {transactions.map((trx) => (
              <div
                key={trx.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
              >
                {/* Left/Start side: Icon + Type badge + Details */}
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
                      trx.type === 'debit'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {trx.type === 'debit' ? (
                      <ArrowUpRight className="w-5 h-5" />
                    ) : (
                      <ArrowDownLeft className="w-5 h-5" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-md ${
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

                    <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                      <Calendar className="w-3 h-3" />
                      <span>{formatDate(trx.date, 'full')}</span>
                    </p>
                  </div>
                </div>

                {/* Right/End side: Amount + Running Balance + Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-3.5 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800/60">
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

                    {/* Progressive Running Balance after this transaction */}
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

                  {/* Actions: Edit & Delete & Document */}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in zoom-in-95 duration-150">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
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
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={() => {
                      handleToggleArchive();
                      setShowDeleteConfirm(false);
                    }}
                    className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs"
                  >
                    أرشفة الحساب بدلاً من الحذف
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
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
