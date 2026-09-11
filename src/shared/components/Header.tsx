import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sun,
  Moon,
  Wallet2,
  Cloud,
  RefreshCw,
  Sparkles,
  ScanLine,
  ShieldCheck,
  MoreVertical,
  SlidersHorizontal,
} from 'lucide-react';
import { useSettingsStore, useOCRStore } from '@/shared/stores';
import { PWAInstallPrompt } from './PWAInstallPrompt';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { NotificationCenterDrawer } from '@/features/messaging/components/NotificationCenterDrawer';
import { useI18n } from '@/shared/hooks/useI18n';

interface HeaderProps {
  title?: string;
  subtitle?: string;
  showQuickAdd?: boolean;
  showOCR?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showQuickAdd = true,
  showOCR = true,
}) => {
  const navigate = useNavigate();
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const theme = useSettingsStore((state) => state.settings.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const openScannerModal = useOCRStore((state) => state.openScannerModal);
  const { t } = useI18n();

  // Handle click outside tools menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(event.target as Node)) {
        setIsToolsOpen(false);
      }
    };
    if (isToolsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isToolsOpen]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  return (
    <header
      id="main-app-header"
      className="sticky top-0 z-30 w-full bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-3.5 sm:px-6 py-2.5 sm:py-3 transition-colors"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2.5 sm:gap-4">
        {/* Left (Start): Logo + Title + v1.0 */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-xs shadow-teal-600/20 shrink-0">
            <Wallet2 className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm sm:text-lg font-black tracking-tight text-slate-900 dark:text-slate-100 truncate">
                {title || t('app.name')}
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800/60 shrink-0">
                v1.0
              </span>
            </div>
            {subtitle ? (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate hidden sm:block">
                {t('app.tagline')}
              </p>
            )}
          </div>
        </div>

        {/* Right (End): Actions (Utility Icons) */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Notification Center Dropdown */}
          <NotificationCenterDrawer />

          {/* Cloud & Connection Sync Status Indicator */}
          <SyncStatusIndicator />

          {/* Theme Toggle Button */}
          <button
            id="btn-theme-toggle-desktop"
            onClick={toggleTheme}
            aria-label="تبديل المظهر"
            title={theme === 'dark' ? 'المظهر الفاتح' : 'المظهر الداكن'}
            className="hidden sm:flex p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] items-center justify-center border border-slate-200/60 dark:border-slate-800 shrink-0"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Desktop inline quick access to primary tools */}
          <div className="hidden lg:flex items-center gap-1.5">
            <button
              id="btn-header-ai-desktop"
              onClick={() => navigate('/ai')}
              aria-label="المساعد المالي الذكي"
              title="المساعد المالي الذكي"
              className="p-2 rounded-xl text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/60 hover:bg-teal-100 dark:hover:bg-teal-900/60 border border-teal-200/80 dark:border-teal-800/80 transition flex items-center justify-center min-h-[40px] min-w-[40px] shrink-0"
            >
              <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </button>

            <button
              id="btn-header-team-desktop"
              onClick={() => navigate('/team')}
              aria-label="إدارة الفريق وسجل التدقيق"
              title="إدارة الفريق والصلاحيات"
              className="p-2 rounded-xl text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/60 hover:bg-purple-100 dark:hover:bg-purple-900/60 border border-purple-200/80 dark:border-purple-800/80 transition flex items-center justify-center min-h-[40px] min-w-[40px] shrink-0"
            >
              <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </button>
          </div>

          {/* More Tools Menu Dropdown (Organized Secondary Actions for Mobile & Tablet) */}
          <div className="relative" ref={toolsMenuRef}>
            <button
              id="btn-header-tools-menu"
              onClick={() => setIsToolsOpen(!isToolsOpen)}
              aria-label="أدوات النظام والميزات المتقدمة"
              title="أدوات النظام"
              className={`p-2 rounded-xl transition min-w-[40px] min-h-[40px] flex items-center justify-center border ${
                isToolsOpen
                  ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-600 border-teal-300 dark:border-teal-800'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/60 dark:border-slate-800'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
            </button>

            {isToolsOpen && (
              <div className="fixed inset-x-4 top-20 mx-auto max-w-xs sm:absolute sm:inset-auto sm:end-0 sm:top-full sm:mt-2 sm:w-56 p-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-150 divide-y divide-slate-100 dark:divide-slate-800">
                <div className="py-1">
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      openScannerModal();
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-sky-50 dark:hover:bg-sky-950/50 rounded-xl transition text-start"
                  >
                    <ScanLine className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
                    <span>مسح فاتورة (OCR)</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      navigate('/ai');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-teal-50 dark:hover:bg-teal-950/50 rounded-xl transition text-start"
                  >
                    <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                    <span>المساعد المالي الذكي</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      navigate('/team');
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-purple-50 dark:hover:bg-purple-950/50 rounded-xl transition text-start"
                  >
                    <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
                    <span>الفريق وسجل التدقيق</span>
                  </button>
                </div>

                <div className="py-1">
                  {/* Theme Toggle (Mobile in dropdown) */}
                  <button
                    onClick={() => {
                      toggleTheme();
                      setIsToolsOpen(false);
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl transition text-start"
                  >
                    <span className="flex items-center gap-2.5">
                      {theme === 'dark' ? (
                        <Sun className="w-4 h-4 text-amber-400 shrink-0" />
                      ) : (
                        <Moon className="w-4 h-4 text-slate-600 shrink-0" />
                      )}
                      <span>المظهر ({theme === 'dark' ? 'داكن' : 'فاتح'})</span>
                    </span>
                  </button>

                  {/* In-App PWA Install inside dropdown */}
                  <div className="px-1 py-1">
                    <PWAInstallPrompt variant="button" id="header-pwa-install" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

