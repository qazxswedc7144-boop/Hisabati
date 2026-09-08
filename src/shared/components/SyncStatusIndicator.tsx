import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Cloud,
  CloudOff,
  CloudUpload,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  WifiOff,
  Clock,
  ExternalLink,
  X,
  RotateCw,
} from 'lucide-react';
import { useSyncStore, useUIStore } from '@/shared/stores';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { formatDate } from '@/core/utils/formatters';
import { SyncStatusType } from '@/shared/types';

interface SyncStatusIndicatorProps {
  className?: string;
  showLabel?: boolean;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  className = '',
  showLabel = false,
}) => {
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const { showToast } = useUIStore();
  const [showModal, setShowModal] = useState(false);

  const {
    isDriveConnected,
    userEmail,
    userName,
    syncStatus,
    lastSyncTime,
    pendingQueueCount,
    conflicts,
    triggerManualSync,
    connectGoogleDrive,
  } = useSyncStore();

  const handleManualSync = async () => {
    try {
      await triggerManualSync();
      showToast('اكتملت المزامنة السحابية بنجاح', 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشلت المزامنة مع Google Drive', 'error');
    }
  };

  // Determine effective status taking offline mode into account
  const effectiveStatus: SyncStatusType = !isOnline
    ? 'offline'
    : conflicts.length > 0
    ? 'conflict'
    : syncStatus;

  // Visual status config (solid colors, no gradients)
  const getStatusConfig = () => {
    if (!isOnline) {
      return {
        label: 'وضع عدم الاتصال',
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
        icon: <WifiOff className="w-4 h-4 text-slate-600 dark:text-slate-400" />,
        color: 'slate',
      };
    }

    if (conflicts.length > 0) {
      return {
        label: `${conflicts.length} تعارض للمراجعة`,
        badgeClass: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        icon: <AlertTriangle className="w-4 h-4 text-amber-600 animate-pulse" />,
        color: 'amber',
      };
    }

    if (syncStatus === 'syncing') {
      return {
        label: 'جارٍ المزامنة...',
        badgeClass: 'bg-teal-50 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-800',
        icon: <RefreshCw className="w-4 h-4 text-teal-600 animate-spin" />,
        color: 'teal',
      };
    }

    if (syncStatus === 'retrying') {
      return {
        label: 'جارٍ إعادة المحاولة...',
        badgeClass: 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-800',
        icon: <RotateCw className="w-4 h-4 text-amber-600 animate-spin" />,
        color: 'amber',
      };
    }

    if (syncStatus === 'error') {
      return {
        label: 'فشلت المزامنة',
        badgeClass: 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300 dark:border-rose-800',
        icon: <AlertCircle className="w-4 h-4 text-rose-600" />,
        color: 'rose',
      };
    }

    if (pendingQueueCount > 0) {
      return {
        label: `${pendingQueueCount} في الانتظار`,
        badgeClass: 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-800',
        icon: <Clock className="w-4 h-4 text-sky-600" />,
        color: 'sky',
      };
    }

    if (isDriveConnected) {
      return {
        label: 'متصل بالسحابة',
        badgeClass: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
        icon: <Cloud className="w-4 h-4 text-emerald-600" />,
        color: 'emerald',
      };
    }

    return {
      label: 'محلي (بدون سحابة)',
      badgeClass: 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-400 border-slate-200 dark:border-slate-700',
      icon: <CloudOff className="w-4 h-4 text-slate-500" />,
      color: 'slate',
    };
  };

  const statusConfig = getStatusConfig();

  return (
    <>
      {/* Trigger Button */}
      <button
        id="btn-sync-status-indicator"
        type="button"
        onClick={() => setShowModal(true)}
        aria-label="حالة المزامنة والاتصال"
        title={`حالة المزامنة: ${statusConfig.label}`}
        className={`inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border transition min-h-[44px] min-w-[44px] ${statusConfig.badgeClass} ${className}`}
      >
        <span className="relative flex items-center justify-center">
          {statusConfig.icon}
          {conflicts.length > 0 && (
            <span className="absolute -top-1.5 -end-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 animate-ping" />
          )}
          {pendingQueueCount > 0 && conflicts.length === 0 && (
            <span className="absolute -top-1.5 -end-1.5 min-w-[14px] h-[14px] rounded-full bg-sky-600 text-white text-[9px] font-bold flex items-center justify-center px-0.5">
              {pendingQueueCount > 9 ? '9+' : pendingQueueCount}
            </span>
          )}
        </span>
        {showLabel && (
          <span className="text-xs font-bold hidden sm:inline whitespace-nowrap">
            {statusConfig.label}
          </span>
        )}
      </button>

      {/* Sync Status Details Modal */}
      {showModal && (
        <div
          id="sync-status-modal-backdrop"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => setShowModal(false)}
        >
          <div
            id="sync-status-modal"
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 text-teal-600 flex items-center justify-center">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                    حالة المزامنة والاتصال
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    مراقبة مزامنة المعاملات والسحابة
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Overall State Badge */}
            <div className={`p-3.5 rounded-2xl border flex items-center justify-between ${statusConfig.badgeClass}`}>
              <div className="flex items-center gap-2">
                {statusConfig.icon}
                <span className="text-xs font-bold">{statusConfig.label}</span>
              </div>
              <span className="text-[11px] font-medium opacity-80">
                {isOnline ? 'الإنترنت متصل' : 'بدون اتصال'}
              </span>
            </div>

            {/* Details Cards */}
            <div className="space-y-2.5 text-xs">
              {/* Cloud Account */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[11px] block">حساب Google Drive</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {isDriveConnected ? userEmail || userName || 'متصل' : 'غير متصل'}
                  </span>
                </div>
                {!isDriveConnected && (
                  <button
                    type="button"
                    onClick={async () => {
                      await connectGoogleDrive();
                      setShowModal(false);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 transition"
                  >
                    ربط الحساب
                  </button>
                )}
              </div>

              {/* Queue Count */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[11px] block">طابور المزامنة المعلق</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {pendingQueueCount === 0
                      ? 'جميع المعاملات مزامنة محلياً وسحابياً'
                      : `${pendingQueueCount} عملية بانتظار الإرسال`}
                  </span>
                </div>
                {pendingQueueCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold text-[11px]">
                    معلقة
                  </span>
                )}
              </div>

              {/* Conflicts Alert */}
              {conflicts.length > 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600" />
                      يوجد {conflicts.length} تعارض بين الأجهزة
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowModal(false);
                        navigate('/settings');
                      }}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px] hover:bg-amber-700 transition"
                    >
                      حل التعارضات
                    </button>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    تم تعديل نفس السجل على جهازين مختلفين. يرجى مراجعة وتحديد النسخة المعتمدة.
                  </p>
                </div>
              )}

              {/* Last Sync Time */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="text-slate-400 text-[11px] block">آخر مزامنة ناجحة</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                    {lastSyncTime ? formatDate(lastSyncTime, 'full') : 'لم تتم بعد'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
              <button
                id="btn-modal-manual-sync"
                type="button"
                onClick={handleManualSync}
                disabled={syncStatus === 'syncing' || !isOnline}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px] disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                <span>{syncStatus === 'syncing' ? 'جارٍ المزامنة...' : 'مزامنة الآن'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowModal(false);
                  navigate('/settings');
                }}
                className="w-full sm:flex-1 py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px]"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>مركز التحكم بالبيانات</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
