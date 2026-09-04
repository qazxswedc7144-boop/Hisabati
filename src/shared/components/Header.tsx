import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Sun, Moon, Wallet2, Cloud, RefreshCw, Bell, Sparkles, ScanLine, ShieldCheck } from 'lucide-react';
import { useUIStore, useSettingsStore, useSyncStore, useMessagingStore, useOCRStore } from '@/shared/stores';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { useI18n } from '@/shared/hooks/useI18n';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showQuickAdd?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showQuickAdd = true,
}) => {
  const navigate = useNavigate();
  const theme = useSettingsStore((state) => state.settings.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const { isDriveConnected, syncStatus, triggerManualSync } = useSyncStore();
  const { unreadNotificationsCount, openNotificationCenter, fetchNotifications } = useMessagingStore();
  const openScannerModal = useOCRStore((state) => state.openScannerModal);
  const { t } = useI18n();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 sm:px-6 py-3 transition-colors"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Logo & Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20 shrink-0">
            <Wallet2 className="w-5 h-5" />
          </div>

          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-1.5 truncate">
              {title || t('app.name')}
              <span className="hidden sm:inline-block text-[11px] font-bold px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60">
                v1.0
              </span>
            </h1>
            {subtitle ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
            ) : (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate hidden xs:block">
                {t('app.tagline')}
              </p>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Team and RBAC Audit Navigation Button */}
          <button
            id="btn-header-team-rbac"
            onClick={() => navigate('/team')}
            aria-label="إدارة الفريق وسجل التدقيق"
            title="إدارة الفريق والصلاحيات وسجل التدقيق"
            className="p-2.5 rounded-xl text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/80 dark:border-purple-800/80 transition flex items-center justify-center min-h-[40px] min-w-[40px]"
          >
            <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          </button>

          {/* OCR Receipt Scanner Entry Button */}
          <button
            id="btn-header-ocr-scanner"
            onClick={() => openScannerModal()}
            aria-label="مسح الفواتير والإيصالات الذكي"
            title="مسح الفواتير والإيصالات الذكي"
            className="p-2.5 rounded-xl text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 border border-sky-200/80 dark:border-sky-800/80 transition flex items-center justify-center min-h-[40px] min-w-[40px]"
          >
            <ScanLine className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </button>

          {/* AI Assistant Quick Entry Button */}
          <button
            id="btn-header-ai-assistant"
            onClick={() => navigate('/ai')}
            aria-label="المساعد المالي الذكي"
            title="المساعد المالي الذكي"
            className="p-2.5 rounded-xl text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200/80 dark:border-teal-800/80 transition flex items-center justify-center min-h-[40px] min-w-[40px]"
          >
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          </button>

          {/* Notification Bell Button */}
          <button
            id="btn-header-notifications"
            onClick={() => openNotificationCenter(true)}
            aria-label="مركز الإشعارات والتنبيهات"
            title="الإشعارات والتنبيهات"
            className="relative p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 transition flex items-center justify-center min-h-[40px] min-w-[40px]"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute -top-1 -start-1 min-w-[18px] h-[18px] rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center px-1 shadow-xs animate-pulse">
                {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Cloud Sync Status Indicator */}
          {isDriveConnected && (
            <button
              onClick={() => triggerManualSync()}
              title={syncStatus === 'syncing' ? 'جارٍ المزامنة السحابية...' : 'مزامنة مع Google Drive'}
              className="p-2 rounded-xl text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/40 border border-teal-200/60 dark:border-teal-800/60 transition flex items-center justify-center min-h-[40px] min-w-[40px]"
            >
              {syncStatus === 'syncing' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
            </button>
          )}

          {/* In-App PWA Install */}
          <PWAInstallPrompt variant="button" id="header-pwa-install" />

          {/* Quick Add Button (Desktop / Top bar) */}
          {showQuickAdd && (
            <button
              id="btn-header-quick-add"
              onClick={() => openQuickAdd()}
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs sm:text-sm font-bold shadow-sm shadow-teal-700/20 active:scale-[0.98] transition-all min-h-[40px]"
            >
              <Plus className="w-4 h-4" />
              <span>عملية جديدة</span>
            </button>
          )}

          {/* Theme Toggle Button */}
          <button
            id="btn-theme-toggle"
            onClick={toggleTheme}
            aria-label="تبديل المظهر"
            className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-slate-200/60 dark:border-slate-800"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

