import { LanguageCode } from '@/shared/types';

let translations: Record<LanguageCode, Record<string, unknown>> = {
  ar: {},
  en: {},
};

let currentLanguage: LanguageCode = 'ar';

export async function initI18n() {
  try {
    const ar = await import('./ar.json');
    const en = await import('./en.json');
    translations.ar = ar.default;
    translations.en = en.default;
  } catch (err) {
    console.error('Failed to load translations:', err);
  }
}

export function setLanguage(lang: LanguageCode) {
  currentLanguage = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }
}

export function getLanguage(): LanguageCode {
  return currentLanguage;
}

export function t(path: string, fallback?: string): string {
  const keys = path.split('.');
  let current: unknown = translations[currentLanguage] || translations.ar;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      // Try fallback to Arabic
      let fallbackCurrent: unknown = translations.ar;
      for (const fKey of keys) {
        if (fallbackCurrent && typeof fallbackCurrent === 'object' && fKey in fallbackCurrent) {
          fallbackCurrent = (fallbackCurrent as Record<string, unknown>)[fKey];
        } else {
          return fallback || path;
        }
      }
      return typeof fallbackCurrent === 'string' ? fallbackCurrent : fallback || path;
    }
  }

  return typeof current === 'string' ? current : fallback || path;
}
