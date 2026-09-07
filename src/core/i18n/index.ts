import arTranslations from './ar.json';
import enTranslations from './en.json';
import { LanguageCode } from '@/shared/types';

export type TranslationSchema = typeof arTranslations;

const translations: Record<LanguageCode, Record<string, unknown>> = {
  ar: arTranslations,
  en: enTranslations,
};

let currentLanguage: LanguageCode = 'ar';

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
