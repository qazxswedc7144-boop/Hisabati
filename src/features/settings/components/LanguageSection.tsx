import React from 'react';
import { Globe, Check } from 'lucide-react';
import { useI18n } from '@/shared/hooks/useI18n';
import { useUIStore } from '@/shared/stores';
import { LanguageCode } from '@/shared/types';

export const LanguageSection: React.FC = () => {
  const { language, changeLanguage } = useI18n();
  const showToast = useUIStore((state) => state.showToast);

  const handleLanguageChange = async (newLang: LanguageCode) => {
    if (newLang === language) return;
    await changeLanguage(newLang);
    showToast(
      newLang === 'ar' ? 'تم ضبط لغة التطبيق إلى العربية' : 'Application language set to English',
      'success'
    );
  };

  const languages: Array<{
    id: LanguageCode;
    name: string;
    nativeName: string;
    directionBadge: string;
  }> = [
    {
      id: 'ar',
      name: 'العربية',
      nativeName: 'Arabic',
      directionBadge: 'RTL (من اليمين لليسار)',
    },
    {
      id: 'en',
      name: 'English',
      nativeName: 'الإنجليزية',
      directionBadge: 'LTR (Left to Right)',
    },
  ];

  return (
    <section
      id="language-section"
      className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4"
    >
      <div>
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Globe className="w-4 h-4 text-teal-600 shrink-0" />
          <span>لغة التطبيق واتجاه الواجهة</span>
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          يتم ضبط اتجاه النصوص ورموز العملات تلقائياً وفق اللغة المختارة دون التأثير على السجلات المحاسبية
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {languages.map((item) => {
          const isSelected = language === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleLanguageChange(item.id)}
              className={`p-4 rounded-2xl border text-start transition flex items-center justify-between min-h-[56px] ${
                isSelected
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-100 shadow-xs ring-1 ring-teal-500/30'
                  : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-bold">{item.name}</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    ({item.nativeName})
                  </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 inline-block">
                  {item.directionBadge}
                </span>
              </div>

              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  isSelected
                    ? 'bg-teal-600 text-white'
                    : 'border border-slate-300 dark:border-slate-600'
                }`}
              >
                {isSelected && <Check className="w-3 h-3" />}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
