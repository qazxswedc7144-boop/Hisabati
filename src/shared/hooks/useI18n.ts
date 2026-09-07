import { useSettingsStore } from '@/shared/stores';
import { t, setLanguage as setLangCore } from '@/core/i18n';
import { LanguageCode } from '@/shared/types';

export function useI18n() {
  const language = useSettingsStore((state) => state.settings.language);
  const setLanguageInStore = useSettingsStore((state) => state.setLanguage);

  const changeLanguage = async (lang: LanguageCode) => {
    setLangCore(lang);
    await setLanguageInStore(lang);
  };

  return {
    t,
    language,
    changeLanguage,
    isRTL: language === 'ar',
  };
}
