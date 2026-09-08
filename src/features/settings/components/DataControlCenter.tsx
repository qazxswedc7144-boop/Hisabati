import React, { useState, useRef } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  HardDrive,
  Clock,
  ShieldCheck,
  FileJson,
  X,
  Download,
  Upload,
  Database,
  FileCheck,
  Activity,
  Coins,
} from 'lucide-react';
import { useSyncStore, useUIStore, useAccountStore, useTransactionStore } from '@/shared/stores';
import { formatNumber, formatDate } from '@/core/utils/formatters';
import { DriveFileInfo } from '@/shared/types';
import { getDeviceName } from '@/core/utils/deviceId';
import { googleDriveService } from '@/core/services/googleDrive.service';
import { backupService } from '@/core/services/backup.service';
import { integrityService, IntegrityReport } from '@/core/services/integrity.service';
import { db } from '@/core/database/db';
import { seedInitialMockData } from '@/shared/data/mockData';
import { ConflictResolutionModal } from './ConflictResolutionModal';

export const DataControlCenter: React.FC = () => {
  const { showToast } = useUIStore();
  const fetchAccounts = useAccountStore((state) => state.fetchAccounts);
  const fetchRecentTransactions = useTransactionStore((state) => state.fetchRecentTransactions);
  const recalculateAll = useAccountStore((state) => state.recalculateAll);

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
    isRestoring: isSyncRestoring,
    connectGoogleDrive,
    disconnectGoogleDrive,
    triggerManualSync,
    triggerManualBackup,
    restoreFromDriveFile,
    deleteCloudBackup,
  } = useSyncStore();

  // Modals & States
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [showDriveRestoreModal, setShowDriveRestoreModal] = useState(false);
  const [selectedBackupForRestore, setSelectedBackupForRestore] = useState<DriveFileInfo | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');

  // Manual token input state (fallback)
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [customToken, setCustomToken] = useState('');

  // Local JSON Backup State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isLocalRestoring, setIsLocalRestoring] = useState(false);
  const [showLocalRestoreModal, setShowLocalRestoreModal] = useState(false);
  const [pendingLocalRestorePayload, setPendingLocalRestorePayload] = useState<any | null>(null);

  // Financial Integrity State
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Database Management State
  const [isResettingData, setIsResettingData] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Handlers for Google Drive & Sync
  const handleStartConnect = () => {
    setShowConsentModal(true);
  };

  const handleConsentAccept = async () => {
    setShowConsentModal(false);
    const success = await connectGoogleDrive();
    if (success) {
      showToast('تم الاتصال بحساب Google Drive بنجاح', 'success');
    } else {
      setShowTokenInput(true);
    }
  };

  const handleSaveCustomToken = () => {
    if (!customToken.trim()) return;
    googleDriveService.setAccessToken(customToken.trim());
    useSyncStore.getState().checkDriveConnection();
    useSyncStore.getState().fetchCloudBackups();
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

  const handleInitiateDriveRestore = (backup: DriveFileInfo) => {
    setSelectedBackupForRestore(backup);
    setShowDriveRestoreModal(true);
  };

  const handleExecuteDriveRestore = async () => {
    if (!selectedBackupForRestore) return;
    try {
      await restoreFromDriveFile(selectedBackupForRestore.id, restoreMode);
      await fetchAccounts();
      await fetchRecentTransactions();
      showToast('تمت استعادة البيانات وتحديث الأرصدة بنجاح', 'success');
      setShowDriveRestoreModal(false);
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

  // Local JSON Backup Handlers
  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const payload = await backupService.generateBackupPayload();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `hisabati_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('تم تصدير نسخة احتياطية محلية مشفرة (JSON V3) بنجاح', 'success');
    } catch (e: any) {
      showToast(e?.message || 'فشل تصدير البيانات', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          showToast('ملف النسخة الاحتياطية غير صالح', 'error');
          return;
        }
        setPendingLocalRestorePayload(parsed);
        setShowLocalRestoreModal(true);
      } catch (err: any) {
        showToast('فشل قراءة ملف النسخة الاحتياطية (تنسيق JSON تالف)', 'error');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmLocalRestore = async () => {
    if (!pendingLocalRestorePayload) return;
    setIsLocalRestoring(true);
    try {
      await backupService.restoreFromPayload(pendingLocalRestorePayload, 'replace');
      await fetchAccounts();
      await fetchRecentTransactions();
      setShowLocalRestoreModal(false);
      setPendingLocalRestorePayload(null);
      showToast('تمت استعادة النسخة الاحتياطية بنجاح وتدقيق كافة الأرصدة', 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشلت عملية استعادة النسخة الاحتياطية', 'error');
    } finally {
      setIsLocalRestoring(false);
    }
  };

  // Integrity & Recalculate Handlers
  const handleCheckIntegrity = async () => {
    setIsCheckingIntegrity(true);
    try {
      const report = await integrityService.verifyFinancialIntegrity();
      setIntegrityReport(report);
      if (report.valid) {
        showToast('تم فحص السجلات: جميع الحسابات والمعاملات سليمة ومطابقة 100%', 'success');
      } else {
        showToast(`تم اكتشاف ${report.inconsistencies.length} ملاحظة في السجلات`, 'info');
      }
    } catch (e: any) {
      showToast('فشل فحص التكامل', 'error');
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      await recalculateAll();
      showToast('تمت إعادة احتساب كافة الأرصدة من واقع المعاملات بنجاح', 'success');
    } catch (e: any) {
      showToast(e?.message || 'فشلت عملية إعادة الاحتساب', 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Database Handlers
  const handleReSeedData = async () => {
    setIsResettingData(true);
    try {
      await seedInitialMockData(true);
      await fetchAccounts();
      await fetchRecentTransactions();
      showToast('تم إعادة تحميل البيانات التجريبية الافتراضية بنجاح', 'success');
    } catch (e) {
      showToast('فشل إعادة التعيين', 'error');
    } finally {
      setIsResettingData(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      await db.transactions.clear();
      await db.accounts.clear();
      await fetchAccounts();
      await fetchRecentTransactions();
      setShowClearConfirm(false);
      showToast('تم مسح جميع البيانات بنجاح', 'info');
    } catch (e) {
      showToast('فشل مسح البيانات', 'error');
    }
  };

  return (
    <div id="data-control-center" className="space-y-5">
      {/* 1. CLOUD SYNC & GOOGLE DRIVE CARD */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Cloud className="w-5 h-5 text-teal-600 dark:text-teal-400" />
              <span>المزامنة السحابية وGoogle Drive</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              مزامنة المعاملات تلقائياً بين أجهزتك وحفظ نسخ احتياطية مشفرة في مساحتك الخاصة
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isDriveConnected ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>متصل بالسحابة</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                <HardDrive className="w-3.5 h-3.5" />
                <span>وضع محلي فقط</span>
              </span>
            )}
          </div>
        </div>

        {/* Not Connected Card */}
        {!isDriveConnected ? (
          <div className="p-4 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900/60 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  تفعيل المزامنة مع Google Drive
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  يتم حفظ بياناتك المالية في مجلد آمن معزول (Hisabati_Backups) بحسابك الشخصي. لا تملك أي جهة خارجية أو نماذج ذكاء اصطناعي حق الوصول لبياناتك.
                </p>
              </div>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2">
              <button
                id="btn-connect-google-drive"
                type="button"
                onClick={handleStartConnect}
                className="px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs transition shadow-xs flex items-center gap-2 min-h-[44px]"
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
                  type="button"
                  onClick={handleManualSync}
                  disabled={syncStatus === 'syncing'}
                  className="px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  <span>{syncStatus === 'syncing' ? 'تتم المزامنة...' : 'مزامنة الآن'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleManualBackup}
                  disabled={isBackingUp}
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center gap-1.5 min-h-[44px] disabled:opacity-50"
                >
                  <CloudUpload className={`w-4 h-4 ${isBackingUp ? 'animate-spin' : ''}`} />
                  <span>{isBackingUp ? 'جارٍ الرفع...' : 'نسخ احتياطي سحابي'}</span>
                </button>

                <button
                  type="button"
                  onClick={disconnectGoogleDrive}
                  className="px-3 py-2 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-bold transition min-h-[44px]"
                  title="إلغاء الربط"
                >
                  فصل
                </button>
              </div>
            </div>

            {/* Sync Metadata & Queue stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs space-y-1">
                <span className="text-slate-400 text-[11px] block">آخر مزامنة ناجحة</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1 font-mono">
                  <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span className="truncate">{lastSyncTime ? formatDate(lastSyncTime, 'full') : 'لم تتم بعد'}</span>
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
          </div>
        )}

        {/* CONFLICTS ALERT CARD */}
        {conflicts.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800/60 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200 font-bold text-xs sm:text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>تم اكتشاف تعارض في المزامنة ({conflicts.length} سجلات)</span>
              </div>
              <button
                type="button"
                onClick={() => setShowConflictModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs transition shadow-xs min-h-[38px]"
              >
                مراجعة وحل التعارضات
              </button>
            </div>
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              تم تعديل نفس السجلات المالية على أكثر من جهاز في وضع عدم الاتصال. يرجى اختيار النسخة المعتمدة لحماية النزاهة المحاسبية.
            </p>
          </div>
        )}

        {/* Cloud Backups History List */}
        {isDriveConnected && (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-teal-600" />
                <span>سجل النسخ الاحتياطية على Google Drive</span>
              </h4>
              <button
                type="button"
                onClick={() => useSyncStore.getState().fetchCloudBackups()}
                disabled={isLoadingBackups}
                className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
                <span>تحديث القائمة</span>
              </button>
            </div>

            {isLoadingBackups ? (
              <div className="p-4 text-center text-xs text-slate-400">جارٍ تحميل قائمة النسخ...</div>
            ) : cloudBackups.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-center text-xs text-slate-400 border border-slate-100 dark:border-slate-800">
                لا توجد نسخ احتياطية محفوظة على السحابة بعد. انقر على "نسخ احتياطي سحابي" لإنشاء أول نسخة.
              </div>
            ) : (
              <div className="space-y-2">
                {cloudBackups.map((backup) => (
                  <div
                    key={backup.id}
                    className="p-3 sm:p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <FileJson className="w-4 h-4 text-teal-600 shrink-0" />
                        <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                          {backup.name}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-mono">
                          V3
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-slate-400">
                        <span>تاريخ الحفظ: {formatDate(backup.createdTime, 'full')}</span>
                        {backup.size && <span>الحجم: {Math.round(backup.size / 1024)} KB</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => handleInitiateDriveRestore(backup)}
                        disabled={isSyncRestoring}
                        className="px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs transition flex items-center gap-1.5 min-h-[38px] disabled:opacity-50"
                      >
                        <CloudDownload className="w-3.5 h-3.5" />
                        <span>استعادة</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteBackup(backup.id)}
                        className="p-2 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition min-h-[38px] min-w-[38px] flex items-center justify-center"
                        title="حذف من السحابة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. LOCAL JSON V3 BACKUP & RESTORE */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <HardDrive className="w-5 h-5 text-teal-600" />
            <span>النسخ الاحتياطي المحلي (JSON V3)</span>
          </h3>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            تشفير SHA-256
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          يمكنك تصدير نسخة احتياطية كاملة محلياً أو استعادة نسخة سابقة. تخضع جميع النسخ للتحقق الصارم من التشفير ولقطة أمان قبل التطبيق.
        </p>

        <div className="pt-1 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/60 transition min-h-[44px] disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-teal-600" />
            <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير نسخة احتياطية محلية (JSON V3)'}</span>
          </button>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition min-h-[44px]"
          >
            <Upload className="w-4 h-4 text-teal-600" />
            <span>استيراد واستعادة نسخة احتياطية (JSON)</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </div>

      {/* 3. FINANCIAL INTEGRITY & BALANCE SAFETY */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-teal-600" />
            <span>سلامة السجلات وتكامل الأرصدة (Integrity Audit)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            المعاملات المالية هي المصدر الأساسي والوحيد للحقيقة المحاسبية. يمكنك تدقيق سجلاتك للتأكد من تطابق مجموع الحركات مع الأرصدة الحالية.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleCheckIntegrity}
            disabled={isCheckingIntegrity}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[44px] disabled:opacity-50"
          >
            <FileCheck className={`w-4 h-4 ${isCheckingIntegrity ? 'animate-pulse' : ''}`} />
            <span>{isCheckingIntegrity ? 'جارٍ التدقيق...' : 'فحص تكامل وسلامة السجلات'}</span>
          </button>

          <button
            type="button"
            onClick={handleRecalculateAll}
            disabled={isRecalculating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-200 text-xs font-bold hover:bg-teal-100 dark:hover:bg-slate-800 transition min-h-[44px] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? 'جارٍ إعادة الاحتساب...' : 'إعادة احتساب كافة الأرصدة (Recalculate)'}</span>
          </button>
        </div>

        {/* Integrity Report Card */}
        {integrityReport && (
          <div
            className={`p-4 rounded-2xl border text-xs space-y-2 mt-2 ${
              integrityReport.valid
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100'
                : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              {integrityReport.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                {integrityReport.valid
                  ? 'جميع الحسابات والمعاملات المالية سليمة ومتطابقة 100%'
                  : `تم العثور على ${integrityReport.inconsistencies.length} ملاحظة تحتاج إلى تدقيق`}
              </span>
            </div>

            <div className="text-[11px] opacity-80">
              تم فحص {formatNumber(integrityReport.totalAccountsChecked)} حساب و {formatNumber(integrityReport.totalTransactionsChecked)} عملية مالية مسجلة.
            </div>

            {integrityReport.inconsistencies.length > 0 && (
              <ul className="list-disc list-inside space-y-1 pt-1 text-[11px]">
                {integrityReport.inconsistencies.map((item, idx) => (
                  <li key={idx}>
                    حساب {item.accountName}: الفرق المسجل ({formatNumber(item.difference)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 4. LOCAL DATABASE MANAGEMENT */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-teal-600" />
            <span>إدارة قاعدة البيانات المحلية (IndexedDB)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            إعادة تحميل البيانات التجريبية أو مسح السجلات للبدء من جديد
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleReSeedData}
            disabled={isResettingData}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isResettingData ? 'animate-spin' : ''}`} />
            <span>إعادة تحميل البيانات التجريبية الافتراضية</span>
          </button>

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition min-h-[44px]"
          >
            <Trash2 className="w-4 h-4" />
            <span>مسح جميع البيانات والبدء من الصفر</span>
          </button>
        </div>
      </div>

      {/* MODALS */}

      {/* 1. Conflict Resolution Modal */}
      <ConflictResolutionModal
        isOpen={showConflictModal}
        onClose={() => setShowConflictModal(false)}
      />

      {/* 2. Google Consent Modal */}
      {showConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center mx-auto">
              <Cloud className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                ربط حساب Google Drive
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                صلاحيات محدودة ومحصورة بنطاق التطبيق فقط
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-2 text-slate-600 dark:text-slate-300">
              <p className="font-bold text-slate-800 dark:text-slate-200">
                🔒 الخصوصية والأمان المالي:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
                <li>يطلب التطبيق فقط نطاق <code>drive.file</code> للوصول إلى الملفات التي ينشئها بنفسه.</li>
                <li>لا يمكن للتطبيق الاطلاع على مستنداتك أو صورك الأخرى في Google Drive.</li>
                <li>النسخ الاحتياطية مشفرة محلياً قبل الرفع لضمان أعلى مستويات السرية.</li>
              </ul>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConsentAccept}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[44px]"
              >
                موافق ومتابعة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Manual Token Input Modal */}
      {showTokenInput && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                إدخال رمز وصول Google Drive يدوياً
              </h3>
              <button
                type="button"
                onClick={() => setShowTokenInput(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              إذا كنت تختبر التطبيق في بيئة تطوير أو لديك Google Access Token مسبق:
            </p>

            <textarea
              rows={3}
              value={customToken}
              onChange={(e) => setCustomToken(e.target.value)}
              placeholder="الصق Bearer Token هنا..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTokenInput(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleSaveCustomToken}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-teal-600 text-white"
              >
                حفظ الرمز وتفعيل
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Google Drive Restore Modal */}
      {showDriveRestoreModal && selectedBackupForRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center mx-auto">
              <CloudDownload className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                تأكيد استعادة النسخة من السحابة
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                ملف: {selectedBackupForRestore.name}
              </p>
            </div>

            {/* Mode selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                طريقة الاستعادة:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRestoreMode('replace')}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col text-start gap-1 ${
                    restoreMode === 'replace'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>استبدال كامل</span>
                  <span className="text-[10px] font-normal opacity-80">
                    استبدال قاعدة البيانات بالكامل مع أخذ لقطة أمان مسبقة
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRestoreMode('merge')}
                  className={`p-3 rounded-xl border text-xs font-bold transition flex flex-col text-start gap-1 ${
                    restoreMode === 'merge'
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span>دمج المعاملات</span>
                  <span className="text-[10px] font-normal opacity-80">
                    دمج السجلات غير المكررة والاحتفاظ بالبيانات الحالية
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowDriveRestoreModal(false);
                  setSelectedBackupForRestore(null);
                }}
                disabled={isSyncRestoring}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleExecuteDriveRestore}
                disabled={isSyncRestoring}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[44px] disabled:opacity-50"
              >
                {isSyncRestoring ? 'جارٍ الاستعادة...' : 'تأكيد واستعادة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Local JSON Restore Confirmation Modal */}
      {showLocalRestoreModal && pendingLocalRestorePayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                تأكيد استعادة النسخة الاحتياطية المحلية
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                سيتم استبدال البيانات المحلية بالنسخة المستوردة مع أخذ لقطة أمان تلقائياً
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ النسخة:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {pendingLocalRestorePayload.metadata?.createdAt
                    ? formatDate(pendingLocalRestorePayload.metadata.createdAt, 'full')
                    : 'غير محدد'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">إصدار المخطط:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  V{pendingLocalRestorePayload.metadata?.backupSchemaVersion || 1}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عدد الحسابات:</span>
                <span className="font-bold text-emerald-600 font-mono">
                  {formatNumber(pendingLocalRestorePayload.accounts?.length || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عدد المعاملات:</span>
                <span className="font-bold text-teal-600 font-mono">
                  {formatNumber(pendingLocalRestorePayload.transactions?.length || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حالة التجزئة (SHA-256):</span>
                <span className="font-bold text-teal-600">
                  {pendingLocalRestorePayload.metadata?.integrityHash ? 'تجزئة مشفرة مؤكدة' : 'بدون تجزئة'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowLocalRestoreModal(false);
                  setPendingLocalRestorePayload(null);
                }}
                disabled={isLocalRestoring}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmLocalRestore}
                disabled={isLocalRestoring}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[44px] disabled:opacity-50"
              >
                {isLocalRestoring ? 'جارٍ الاستعادة والتحقق...' : 'تأكيد واستعادة'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Clear Database Confirm Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                تأكيد مسح البيانات
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                هل أنت متأكد من مسح جميع الحسابات والعمليات؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleClearDatabase}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition min-h-[44px]"
              >
                مسح الكل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
