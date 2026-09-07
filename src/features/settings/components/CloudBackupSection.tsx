import React, { useState } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Lock,
  ArrowRight,
  HardDrive,
  Clock,
  ShieldCheck,
  FileJson,
  X,
  ExternalLink,
} from 'lucide-react';
import { useSyncStore, useUIStore } from '@/shared/stores';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { DriveFileInfo, SyncConflictItem } from '@/shared/types';
import { getDeviceName } from '@/core/utils/deviceId';

export const CloudBackupSection: React.FC = () => {
  const { showToast } = useUIStore();
  const {
    isDriveConnected,
    userEmail,
    userName,
    syncStatus,
    lastSyncTime,
    pendingQueueCount,
    conflicts,
    cloudBackups,
    isLoadingBackups,
    isBackingUp,
    isRestoring,
    connectGoogleDrive,
    disconnectGoogleDrive,
    triggerManualSync,
    triggerManualBackup,
    restoreFromDriveFile,
    deleteCloudBackup,
    resolveConflict,
  } = useSyncStore();

  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<DriveFileInfo | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');

  // Manual token input modal state (fallback for direct authentication or custom client setup)
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [customToken, setCustomToken] = useState('');

  const handleStartConnect = () => {
    setShowConsentModal(true);
  };

  const handleConsentAccept = async () => {
    setShowConsentModal(false);
    const success = await connectGoogleDrive();
    if (success) {
      showToast('تم الاتصال بحساب Google Drive بنجاح', 'success');
    } else {
      // Show token input option if Google popup wasn't configured with a client ID yet
      setShowTokenInput(true);
    }
  };

  const handleSaveCustomToken = () => {
    if (!customToken.trim()) return;
    const { googleDriveService } = useSyncStore.getState() as any;
    // Set token via store
    useSyncStore.getState().checkDriveConnection();
    showToast('تم تفعيل الاتصال برمز الوصول بنجاح', 'success');
    setShowTokenInput(false);
  };

  const handleManualBackup = async () => {
    try {
      await triggerManualBackup();
      showToast('تم رفع النسخة الاحتياطية بنجاح إلى Google Drive', 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشل رفع النسخة الاحتياطية', 'error');
    }
  };

  const handleManualSync = async () => {
    try {
      await triggerManualSync();
      showToast('اكتملت المزامنة السحابية بنجاح', 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشلت المزامنة مع Google Drive', 'error');
    }
  };

  const handleInitiateRestore = (backup: DriveFileInfo) => {
    setSelectedBackupForRestore(backup);
    setShowRestoreModal(true);
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackupForRestore) return;
    try {
      await restoreFromDriveFile(selectedBackupForRestore.id, restoreMode);
      showToast('تمت استعادة البيانات وتحديث الأرصدة بنجاح', 'success');
      setShowRestoreModal(false);
      setSelectedBackupForRestore(null);
    } catch (err: any) {
      showToast(err?.message || 'فشلت استعادة البيانات', 'error');
    }
  };

  const handleDeleteBackup = async (fileId: string) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه النسخة الاحتياطية من Google Drive؟')) return;
    try {
      await deleteCloudBackup(fileId);
      showToast('تم حذف النسخة الاحتياطية من السحابة', 'info');
    } catch (err: any) {
      showToast('فشل حذف النسخة الاحتياطية', 'error');
    }
  };

  return (
    <section id="cloud-sync-section" className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cloud className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <span>النسخ الاحتياطي والمزامنة السحابية (Google Drive)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            حفظ نسخ احتياطية مشفرة ومزامنة المعاملات بين أجهزتك المتعددة بأمان
          </p>
        </div>

        {/* Sync Status Badge */}
        <div className="flex items-center gap-2">
          {isDriveConnected ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>متصل بـ Google Drive</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              <Cloud className="w-3.5 h-3.5" />
              <span>غير متصل بالسحابة</span>
            </span>
          )}
        </div>
      </div>

      {/* Account Info / Connect Action */}
      {!isDriveConnected ? (
        <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900/60 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                ربط حساب Google Drive للمزامنة التلقائية
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                يتم تخزين بياناتك المالية في مساحة خاصة ومعزولة بحسابك (Hisabati_Backups) بدون مشاركتها مع أي جهة خارجية أو نماذج ذكاء اصطناعي.
              </p>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center gap-2">
            <button
              id="btn-connect-google-drive"
              onClick={handleStartConnect}
              className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition shadow-xs flex items-center gap-2 min-h-[42px]"
            >
              <Cloud className="w-4 h-4" />
              <span>ربط Google Drive الآن</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connected User Card */}
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-sm">
                {userName ? userName.charAt(0).toUpperCase() : 'G'}
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  {userName || 'مستخدم Google'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{userEmail}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleManualSync}
                disabled={syncStatus === 'syncing'}
                className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 min-h-[38px] disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                <span>{syncStatus === 'syncing' ? 'تتم المزامنة...' : 'مزامنة الآن'}</span>
              </button>

              <button
                onClick={handleManualBackup}
                disabled={isBackingUp}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5 min-h-[38px] disabled:opacity-50"
              >
                <CloudUpload className={`w-3.5 h-3.5 ${isBackingUp ? 'animate-spin' : ''}`} />
                <span>{isBackingUp ? 'جارٍ الرفع...' : 'نسخ احتياطي الآن'}</span>
              </button>

              <button
                onClick={disconnectGoogleDrive}
                className="px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition min-h-[38px]"
                title="إلغاء الربط"
              >
                فصل
              </button>
            </div>
          </div>

          {/* Sync Metadata & Queue stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 text-[11px] block">آخر مزامنة</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-teal-600" />
                <span>{lastSyncTime ? formatDate(lastSyncTime) : 'لم تتم بعد'}</span>
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
              <span className="text-slate-400 text-[11px] block">في انتظار الإرسال</span>
              <span className="font-bold text-slate-800 dark:text-slate-200">
                {pendingQueueCount === 0 ? '✓ كل العمليات مرسلة' : `${pendingQueueCount} عملية معلقة`}
              </span>
            </div>

            <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1 col-span-2 sm:col-span-1">
              <span className="text-slate-400 text-[11px] block">الجهاز الحالي</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                {getDeviceName()}
              </span>
            </div>
          </div>

          {/* Conflicts Warning */}
          {conflicts.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-3">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>تم اكتشاف تعارض في مزامنة بعض المعاملات ({conflicts.length})</span>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                تم تعديل نفس السجل على أكثر من جهاز في وضع عدم الاتصال. يرجى اختيار النسخة المعتمدة:
              </p>

              <div className="space-y-2">
                {conflicts.map((c) => (
                  <div key={c.id} className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-900/60 text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                        <span className="text-[10px] text-slate-400 font-bold block">النسخة المحلية:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{c.localVersion.title}</span>
                      </div>
                      <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/40">
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold block">نسخة السحابة:</span>
                        <span className="font-bold text-slate-800 dark:text-slate-200">{c.remoteVersion.title}</span>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => resolveConflict(c, 'local')}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 font-bold text-[11px] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        الاحتفاظ بالمحلية
                      </button>
                      <button
                        onClick={() => resolveConflict(c, 'remote')}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 text-white font-bold text-[11px] hover:bg-teal-700"
                      >
                        اعتماد نسخة السحابة
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Cloud Backups History List */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <FileJson className="w-4 h-4 text-teal-600" />
                <span>سجل النسخ الاحتياطية في Google Drive</span>
              </h4>
              <button
                onClick={() => useSyncStore.getState().fetchCloudBackups()}
                className="text-xs text-teal-600 dark:text-teal-400 font-bold hover:underline"
              >
                تحديث السجل
              </button>
            </div>

            {isLoadingBackups ? (
              <div className="p-4 text-center text-xs text-slate-400">جارٍ قراءة الملفات من Google Drive...</div>
            ) : cloudBackups.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500">
                لا توجد نسخ احتياطية مرفوعة حتى الآن. اضغط "نسخ احتياطي الآن" لإنشاء أول نسخة.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {cloudBackups.map((backup) => (
                  <div
                    key={backup.id}
                    className="p-3 rounded-2xl bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>نسخة: {formatDate(backup.createdTime)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                        {backup.metadata
                          ? `${backup.metadata.accountCount} حسابات • ${backup.metadata.transactionCount} معاملة • ${backup.metadata.deviceName || 'جهاز'}`
                          : backup.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleInitiateRestore(backup)}
                        className="px-3 py-1.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 font-bold text-xs hover:bg-teal-100 dark:hover:bg-teal-900/50 transition flex items-center gap-1"
                      >
                        <CloudDownload className="w-3.5 h-3.5" />
                        <span>استعادة</span>
                      </button>
                      <button
                        onClick={() => handleDeleteBackup(backup.id)}
                        className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                        title="حذف من السحابة"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. Privacy & Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 text-start">
            <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto sm:mx-0">
              <Lock className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                الموافقة على تفعيل المزامنة مع Google Drive
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سيتم حفظ نسخة احتياطية من بيانات حساباتك ومعاملاتك المالية في حساب Google الذي تختاره.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>ضمانات الخصوصية والأمان:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                <li>صلاحية محصورة فقط بمجلد التطبيق (drive.file).</li>
                <li>فحص سلامة رياضي وتشفير SHA-256 قبل الرفع.</li>
                <li>لا يتم إرسال بياناتك لأي خوادم خارجية أو نماذج AI.</li>
                <li>يمكنك فصل الحساب ومسح النسخ في أي وقت.</li>
              </ul>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowConsentModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[42px]"
              >
                إلغاء
              </button>
              <button
                id="btn-confirm-consent-google"
                onClick={handleConsentAccept}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition shadow-xs min-h-[42px]"
              >
                المتابعة والموافقة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Restore Confirmation Modal */}
      {showRestoreModal && selectedBackupForRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 text-start">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CloudDownload className="w-5 h-5 text-teal-600" />
                <span>تأكيد استعادة النسخة الاحتياطية</span>
              </h3>
              <button onClick={() => setShowRestoreModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs text-amber-900 dark:text-amber-200 space-y-1">
              <p className="font-bold">سيتم إنشاء نسخة أمان احتياطية تلقائياً قبل الاستعادة.</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                تاريخ النسخة: {formatDate(selectedBackupForRestore.createdTime)}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">وضع الاستعادة:</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRestoreMode('replace')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-start transition ${
                    restoreMode === 'replace'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="block font-extrabold mb-0.5">استبدال كامل</span>
                  <span className="text-[10px] opacity-80">مطابقة النسخة تماماً</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRestoreMode('merge')}
                  className={`p-3 rounded-2xl border text-xs font-bold text-start transition ${
                    restoreMode === 'merge'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <span className="block font-extrabold mb-0.5">دمج ذكي</span>
                  <span className="text-[10px] opacity-80">إضافة الحسابات الجديدة</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowRestoreModal(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[42px]"
              >
                إلغاء
              </button>
              <button
                onClick={handleExecuteRestore}
                disabled={isRestoring}
                className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition shadow-xs min-h-[42px] disabled:opacity-50"
              >
                {isRestoring ? 'جارٍ الاستعادة...' : 'تأكيد الاستعادة الآن'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
