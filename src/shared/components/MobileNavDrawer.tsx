import React, { useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Wallet2,
  Plus,
  Users,
  Database,
  Sun,
  Moon,
} from 'lucide-react';
import { useUIStore, useMessagingStore, useSettingsStore } from '@/shared/stores';
import { useI18n } from '@/shared/hooks/useI18n';
import { APPLICATION_NAV_ITEMS } from '@/shared/config/navigation';

export const MobileNavDrawer: React.FC = () => {
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);
  const unreadNotificationsCount = useMessagingStore((state) => state.unreadNotificationsCount);
  const theme = useSettingsStore((state) => state.settings.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);

  const { t, isRTL } = useI18n();
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close drawer upon route change
  useEffect(() => {
    if (isSidebarOpen) {
      setSidebarOpen(false);
    }
  }, [location.pathname, setSidebarOpen]);

  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSidebarOpen, setSidebarOpen]);

  // Handle auto-closing when resized to desktop (>= 768px)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && isSidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isSidebarOpen, setSidebarOpen]);

  // Body scroll lock during open state
  useEffect(() => {
    if (isSidebarOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      // Auto-focus the close button for accessibility
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isSidebarOpen]);

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const handleQuickAdd = () => {
    setSidebarOpen(false);
    openQuickAdd();
  };

  const handleAddAccount = () => {
    setSidebarOpen(false);
    openAddAccount();
  };

  return (
    <AnimatePresence>
      {isSidebarOpen && (
        <div
          id="mobile-nav-drawer-portal"
          className="fixed inset-0 z-50 md:hidden flex"
          role="dialog"
          aria-modal="true"
          aria-label="قائمة التنقل الجانبية للهاتف"
        >
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
          />

          {/* Drawer Container */}
          <motion.div
            ref={drawerRef}
            initial={{ x: isRTL ? '100%' : '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: isRTL ? '100%' : '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="relative w-72 sm:w-80 max-w-[85vw] h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col z-10 border-e border-slate-200 dark:border-slate-800"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20 shrink-0">
                  <Wallet2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    {t('app.name')}
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold">
                      v1.0
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t('app.tagline')}
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                ref={closeButtonRef}
                id="btn-close-mobile-drawer"
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="إغلاق القائمة"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[44px] min-h-[44px] flex items-center justify-center shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions */}
            <div className="p-4 pb-2 space-y-2 border-b border-slate-100 dark:border-slate-800/60">
              <button
                id="btn-mobile-drawer-quick-add"
                type="button"
                onClick={handleQuickAdd}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm shadow-md shadow-teal-700/20 active:scale-[0.99] transition-all min-h-[44px]"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>تسجيل عملية سريعة</span>
              </button>

              <button
                id="btn-mobile-drawer-add-account"
                type="button"
                onClick={handleAddAccount}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition min-h-[40px]"
              >
                <Users className="w-3.5 h-3.5 text-teal-600" />
                <span>إضافة حساب جديد</span>
              </button>
            </div>

            {/* Navigation Links (Scrollable) */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1 overscroll-contain">
              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                أقسام التطبيق
              </div>

              {APPLICATION_NAV_ITEMS.map((item) => {
                const label = item.labelKey ? t(item.labelKey, item.fallbackLabel) : item.fallbackLabel;
                const badge = item.hasBadge ? unreadNotificationsCount : 0;

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between px-3.5 py-3 rounded-xl font-bold text-sm transition-all min-h-[44px] ${
                        isActive
                          ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 shadow-xs border border-teal-200/60 dark:border-teal-800/60'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <div className="flex items-center gap-3">
                          <item.icon
                            className={`w-5 h-5 ${
                              isActive
                                ? 'text-teal-600 dark:text-teal-400 stroke-[2.5]'
                                : 'text-slate-400'
                            }`}
                          />
                          <span>{label}</span>
                        </div>
                        {badge > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-600 text-white">
                            {badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-2 bg-slate-50/50 dark:bg-slate-900/50">
              {/* Quick Theme Toggle inside Drawer */}
              <button
                id="btn-mobile-drawer-theme-toggle"
                type="button"
                onClick={toggleTheme}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/80 rounded-xl transition min-h-[40px]"
              >
                <span className="flex items-center gap-2">
                  {theme === 'dark' ? (
                    <Sun className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Moon className="w-4 h-4 text-slate-600" />
                  )}
                  <span>المظهر ({theme === 'dark' ? 'الداكن' : 'الفاتح'})</span>
                </span>
                <span className="text-[11px] text-slate-400">تبديل</span>
              </button>

              {/* IndexedDB Status Info */}
              <div className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 text-xs">
                <Database className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                <div className="truncate">
                  <p className="font-bold text-slate-700 dark:text-slate-300">IndexedDB Local</p>
                  <p className="text-[10px] text-slate-400">تخزين آمن ومحلي بالكامل</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
