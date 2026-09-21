import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Wallet2,
  Database,
} from 'lucide-react';
import { useUIStore, useMessagingStore } from '@/shared/stores';
import { useI18n } from '@/shared/hooks/useI18n';
import { APPLICATION_NAV_ITEMS } from '@/shared/config/navigation';
import { getDb } from '@/core/database/db';

import { UserAuthSection } from './UserAuthSection';

export const MobileNavDrawer: React.FC = () => {
  const isSidebarOpen = useUIStore((state) => state.isSidebarOpen);
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen);
  const unreadCount = useMessagingStore((s) => s.unreadNotificationsCount);

  const [trashCount, setTrashCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const db = getDb();
        const count = await db.trash.where('status').equals('pending').count().catch(() => db.trash.count());
        if (!cancelled) setTrashCount(count);
      } catch { /* ignore */ }
    };
    if (isSidebarOpen) {
      load();
      // 1.3: Force refresh notification count on drawer open to ensure badge parity
      useMessagingStore.getState().fetchNotifications();
    }
    return () => { cancelled = true; };
  }, [isSidebarOpen]);

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

  const DRAWER_EXCLUDED = new Set(['/', '/accounts', '/reports', '/settings']);
  const drawerItems = APPLICATION_NAV_ITEMS.filter((i) => !DRAWER_EXCLUDED.has(i.to));

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

            {/* Navigation Links (Scrollable) */}
            <nav className="flex-1 overflow-y-auto p-3 space-y-1 overscroll-contain">
              <div className="px-2 py-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                الأقسام
              </div>

              {drawerItems.map((item) => {
                const label = item.labelKey ? t(item.labelKey, item.fallbackLabel) : item.fallbackLabel;

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
                        {item.to === '/messaging' && unreadCount > 0 && (
                          <span className="ms-auto min-w-[20px] h-5 px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center">
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
                        {item.to === '/trash' && trashCount > 0 && (
                          <span className="ms-auto min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                            {trashCount > 99 ? '99+' : trashCount}
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
              <UserAuthSection />

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
