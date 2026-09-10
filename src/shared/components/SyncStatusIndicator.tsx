import React, { useState, useRef, useEffect } from 'react';
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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    isDriveConnected,
    userEmail,
    userName,
    syncStatus,
    lastSyncTime,
    pendingQueueCount,
    queueStats,
    conflicts,
    triggerManualSync,
    connectGoogleDrive,
    retryFailedQueue,
  } = useSyncStore();

  // Close on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleManualSync = async () => {
    try {
      await triggerManualSync();
      showToast('اكتملت المزامنة السحابية بنجاح', 'success');
      // Auto-close popover after successful sync
      setIsOpen(false);
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
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        id="btn-sync-status-indicator"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="حالة المزامنة والاتصال"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title={`حالة المزامنة: ${statusConfig.label}`}
        className={`relative inline-flex items-center justify-center gap-1.5 p-2 rounded-xl border transition min-h-[40px] min-w-[40px] shrink-0 ${statusConfig.badgeClass} ${className}`}
      >
        <span className="flex items-center justify-center">
          {statusConfig.icon}
        </span>
        {conflicts.length > 0 && (
          <span className="absolute -top-1 -start-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900 shadow-xs" />
        )}
        {pendingQueueCount > 0 && conflicts.length === 0 && (
          <span className="absolute -top-1 -start-1 min-w-[18px] h-[18px] rounded-full bg-sky-600 text-white text-[10px] font-extrabold flex items-center justify-center px-1 shadow-xs">
            {pendingQueueCount > 9 ? '9+' : pendingQueueCount}
          </span>
        )}
        {showLabel && (
          <span className="text-xs font-bold hidden sm:inline whitespace-nowrap">
            {statusConfig.label}
          </span>
        )}
      </button>

      {/* Sync Status Details Popover */}
      {isOpen && (
        <div
          id="sync-status-popover"
          role="dialog"
          aria-modal="true"
          aria-label="تفاصيل المزامنة"
          className="absolute end-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"
          dir="rtl"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 text-teal-600 flex items-center justify-center">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100">
                  حالة المزامنة والاتصال
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Current Overall State Badge */}
          <div className={`p-3 rounded-xl border flex items-center justify-between ${statusConfig.badgeClass}`}>
            <div className="flex items-center gap-2">
              {statusConfig.icon}
              <span className="text-[11px] font-bold">{statusConfig.label}</span>
            </div>
            <span className="text-[10px] font-medium opacity-80">
              {isOnline ? 'الإنترنت متصل' : 'بدون اتصال'}
            </span>
          </div>

          {/* Details Cards */}
          <div className="space-y-2 text-[11px]">
            {/* Cloud Account */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-[10px] block">حساب Google Drive</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px] sm:max-w-none block">
                  {isDriveConnected ? userEmail || userName || 'متصل' : 'غير متصل'}
                </span>
              </div>
              {!isDriveConnected && (
                <button
                  type="button"
                  onClick={async () => {
                    await connectGoogleDrive();
                    setIsOpen(false);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-teal-600 text-white text-[10px] font-bold hover:bg-teal-700 transition"
                >
                  ربط الحساب
                </button>
              )}
            </div>

            {/* Queue Count */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-[10px] block">طابور المزامنة</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {pendingQueueCount === 0
                    ? 'جميع المعاملات مزامنة'
                    : `${pendingQueueCount} عملية بانتظار الإرسال`}
                </span>
              </div>
              {pendingQueueCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950 text-sky-700 dark:text-sky-300 font-bold">
                  معلقة
                </span>
              )}
            </div>

            {/* Conflicts Alert */}
            {conflicts.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    يوجد {conflicts.length} تعارض
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      navigate('/settings');
                    }}
                    className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-bold hover:bg-amber-700 transition"
                  >
                    حل
                  </button>
                </div>
                <p className="text-[10px] leading-relaxed">
                  تم تعديل نفس السجل على جهازين مختلفين. يرجى المراجعة.
                </p>
              </div>
            )}

            {/* Last Sync Time */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <span className="text-slate-400 text-[10px] block">آخر مزامنة ناجحة</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {lastSyncTime ? formatDate(lastSyncTime, 'full') : 'لم تتم بعد'}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={syncStatus === 'syncing' || !isOnline}
              className="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-[11px] font-bold transition flex items-center justify-center gap-1.5 min-h-[38px] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              <span>{syncStatus === 'syncing' ? 'جارٍ...' : 'مزامنة الآن'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/settings');
              }}
              className="flex-1 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-[11px] font-bold transition flex items-center justify-center gap-1.5 min-h-[38px]"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>التحكم</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
