import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, BarChart3, Settings, Plus, Wallet2, MessageSquare, Database, Sparkles, ShieldCheck, Activity } from 'lucide-react';
import { useUIStore, useMessagingStore } from '@/shared/stores';
import { useI18n } from '@/shared/hooks/useI18n';

export const Sidebar: React.FC = () => {
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const openAddAccount = useUIStore((state) => state.openAddAccount);
  const unreadNotificationsCount = useMessagingStore((state) => state.unreadNotificationsCount);
  const { t } = useI18n();

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: Home, exact: true },
    { to: '/accounts', label: t('nav.accounts'), icon: Users },
    { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
    { to: '/bi', label: 'الصحة المالية (BI)', icon: Activity },
    { to: '/messaging', label: t('nav.messaging'), icon: MessageSquare, badge: unreadNotificationsCount },
    { to: '/ai', label: 'المساعد الذكي (AI)', icon: Sparkles },
    { to: '/team', label: 'الفريق والتدقيق (RBAC)', icon: ShieldCheck },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <aside
      id="desktop-sidebar-navigation"
      aria-label="القائمة الجانبية"
      className="hidden md:flex flex-col w-64 lg:w-72 shrink-0 border-e border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-screen sticky top-0 z-30 p-5 select-none transition-colors"
    >
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-2 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="w-11 h-11 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-md shadow-teal-600/20 shrink-0">
          <Wallet2 className="w-6 h-6" />
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

      {/* Primary Action Button */}
      <div className="pt-5 pb-4 space-y-2">
        <button
          id="btn-sidebar-quick-add"
          onClick={() => openQuickAdd()}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-sm shadow-md shadow-teal-700/20 active:scale-[0.99] transition-all min-h-[44px]"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>تسجيل عملية سريعة</span>
        </button>

        <button
          id="btn-sidebar-add-account"
          onClick={() => openAddAccount()}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs transition min-h-[38px]"
        >
          <Users className="w-3.5 h-3.5 text-teal-600" />
          <span>إضافة حساب جديد</span>
        </button>
      </div>

      {/* Nav links */}
      <nav className="flex-1 space-y-1 py-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex items-center justify-between px-3.5 py-2.5 rounded-xl font-bold text-sm transition-all min-h-[44px] ${
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
                      isActive ? 'text-teal-600 dark:text-teal-400 stroke-[2.5]' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-teal-600 text-white">
                    {item.badge}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer Info Card */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-2">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
          <Database className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <div className="truncate">
            <p className="font-bold text-slate-700 dark:text-slate-300">IndexedDB Local</p>
            <p className="text-[11px] text-slate-400">تخزين آمن ومحلي بالكامل</p>
          </div>
        </div>
      </div>
    </aside>
  );
};

