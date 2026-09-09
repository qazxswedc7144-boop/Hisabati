import React from 'react';
import { Palette, Sun, Moon, Monitor, Check } from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';
import { ThemeMode } from '@/shared/types';

export const AppearanceSection: React.FC = () => {
  const { settings, setTheme } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  const handleThemeChange = async (newTheme: ThemeMode) => {
    if (newTheme === settings.theme) return;
    await setTheme(newTheme);
    const labelMap: Record<ThemeMode, string> = {
      light: 'الفاتح',
      dark: 'الداكن',
      system: 'التلقائي حسب النظام',
    };
    showToast(`تم تفعيل نمط المظهر ${labelMap[newTheme]}`, 'success');
  };

  const themes: Array<{
    id: ThemeMode;
    label: string;
    description: string;
    icon: React.ElementType;
  }> = [
    {
      id: 'system',
      label: 'تلقائي (النظام)',
      description: 'مطابقة إعدادات نظام تشغيل جهازك تلقائياً',
      icon: Monitor,
    },
    {
      id: 'light',
      label: 'فاتح (نهاري)',
      description: 'خلفية ناصعة مريحة للإضاءة النهارية',
      icon: Sun,
    },
    {
      id: 'dark',
      label: 'داكن (ليلي)',
      description: 'خلفية داكنة موفرة للطاقة ومريحة للعين',
      icon: Moon,
    },
  ];

  return (
    <section
      id="appearance-section"
      className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Palette className="w-4 h-4 text-teal-600 shrink-0" />
          <span>المظهر ونمط العرض</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          اختر نمط المظهر المفضل لك. يتم تطبيق التغيير فوراً دون الحاجة لإعادة تحميل التطبيق
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {themes.map((item) => {
          const Icon = item.icon;
          const isSelected = settings.theme === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleThemeChange(item.id)}
              className={`p-4 rounded-2xl border text-start transition flex flex-col justify-between min-h-[56px] ${
                isSelected
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100 shadow-xs ring-1 ring-teal-500/30'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                      isSelected
                        ? 'bg-teal-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className="text-xs sm:text-sm font-bold">{item.label}</span>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {item.description}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
};
