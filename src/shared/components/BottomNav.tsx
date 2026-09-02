import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, Users, BarChart3, Settings, Plus } from 'lucide-react';
import { useUIStore } from '@/shared/stores';
import { useI18n } from '@/shared/hooks/useI18n';

export const BottomNav: React.FC = () => {
  const openQuickAdd = useUIStore((state) => state.openQuickAddTransaction);
  const { t } = useI18n();

  const navItems = [
    { to: '/', label: t('nav.dashboard'), icon: Home, exact: true },
    { to: '/accounts', label: t('nav.accounts'), icon: Users },
  ];

  const rightNavItems = [
    { to: '/reports', label: t('nav.reports'), icon: BarChart3 },
    { to: '/settings', label: t('nav.settings'), icon: Settings },
  ];

  return (
    <nav
      id="mobile-bottom-navigation"
      aria-label="التنقل الرئيسي"
      className="md:hidden fixed bottom-0 start-0 end-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 pb-safe transition-all"
    >
      <div className="grid grid-cols-5 items-center justify-items-center h-16 max-w-lg mx-auto px-2">
        {/* Left tabs (Dashboard, Accounts) */}
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.exact}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full py-1 gap-1 text-[11px] font-bold transition-all min-h-[44px] ${
                isActive
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 stroke-[2.5]' : 'stroke-2'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}

        {/* Central Prominent Quick Add Button */}
        <div className="flex items-center justify-center -mt-6">
          <button
            id="btn-mobile-quick-add-central"
            onClick={() => openQuickAdd()}
            aria-label="تسجيل عملية سريعة"
            className="w-13 h-13 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center shadow-lg shadow-teal-700/30 active:scale-90 transition-transform focus:ring-4 focus:ring-teal-500/20"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" />
          </button>
        </div>

        {/* Right tabs (Reports, Settings) */}
        {rightNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center w-full h-full py-1 gap-1 text-[11px] font-bold transition-all min-h-[44px] ${
                isActive
                  ? 'text-teal-600 dark:text-teal-400'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={`w-5 h-5 transition-transform ${
                    isActive ? 'scale-110 stroke-[2.5]' : 'stroke-2'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};
