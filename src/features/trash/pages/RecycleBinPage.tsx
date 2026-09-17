import React, { useEffect, useState } from 'react';
import { Trash2, RotateCcw, AlertTriangle, Calendar, Clock, Trash } from 'lucide-react';
import { useAccountStore, useUIStore, useSettingsStore } from '@/shared/stores';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { EmptyState } from '@/shared/components';
import { TrashItem } from '@/shared/types';

export const RecycleBinPage: React.FC = () => {
  const trashItems = useAccountStore((state) => state.trashItems);
  const fetchTrashItems = useAccountStore((state) => state.fetchTrashItems);
  const restoreFromTrash = useAccountStore((state) => state.restoreFromTrash);
  const deletePermanentlyFromTrash = useAccountStore((state) => state.deletePermanentlyFromTrash);
  const currency = useSettingsStore((state) => state.settings.currency);
  const showToast = useUIStore((state) => state.showToast);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  useEffect(() => {
    fetchTrashItems();
  }, [fetchTrashItems]);

  const handleRestore = async (id: string, name: string) => {
    try {
      await restoreFromTrash(id);
      showToast(`تم استعادة الحساب "${name}" بكافة عملياته بنجاح`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشل استعادة الحساب', 'error');
    }
  };

  const handleDeletePermanently = async () => {
    if (!itemToDelete) return;
    try {
      await deletePermanentlyFromTrash(itemToDelete);
      showToast('تم حذف البيانات نهائياً من سلة المهملات', 'success');
      setItemToDelete(null);
    } catch (err: any) {
      showToast(err?.message || 'فشل الحذف النهائي', 'error');
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTrashItems();
    setIsRefreshing(false);
  };

  return (
    <div id="recycle-bin-page" className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Trash2 className="w-6 h-6 text-rose-600" />
            <span>سلة المهملات</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            إدارة الحسابات والعمليات المحذوفة مؤقتاً (تبقى لمدة 30-60 يوم)
          </p>
        </div>

        <button
          onClick={handleRefresh}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          title="تحديث القائمة"
        >
          <RotateCcw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {trashItems.length === 0 ? (
        <div className="py-12">
          <EmptyState
            title="سلة المهملات فارغة"
            description="لا توجد حسابات أو عمليات محذوفة حالياً. عند حذف حساب بشكل نهائي سيظهر هنا."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {trashItems.map((item: TrashItem) => (
            <div
              key={item.id}
              className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center shrink-0">
                  <Trash2 className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {item.snapshot.account?.name || 'حساب غير معروف'}
                  </h3>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-[11px] font-semibold text-slate-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      حُذف في: {formatDate(item.deletedAt, 'full')}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      ينتهي في: {formatDate(item.expiresAt, 'full')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {item.entityType === 'account' ? 'سيتم استعادة الحساب ومعلوماته الأساسية.' : 'استعادة هذا البند.'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:self-center">
                <button
                  onClick={() => handleRestore(item.id, item.snapshot.account?.name || 'البند')}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-300 hover:bg-teal-100 dark:hover:bg-teal-900/60 transition text-xs font-bold min-h-[44px]"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>استعادة</span>
                </button>

                <button
                  onClick={() => setItemToDelete(item.id)}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 transition text-xs font-bold min-h-[44px]"
                >
                  <Trash className="w-4 h-4" />
                  <span>حذف نهائي</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Permanent Delete Confirmation Dialog */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center my-auto">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              تأكيد الحذف النهائي
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              هل أنت متأكد من رغبتك في حذف هذا الحساب وكافة عملياته نهائياً؟
              <br />
              <span className="font-bold text-rose-600 block mt-1">هذا الإجراء لا يمكن التراجع عنه.</span>
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setItemToDelete(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeletePermanently}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                حذف للأبد
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
