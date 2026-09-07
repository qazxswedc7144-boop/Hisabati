import { CurrencyCode, CurrencyPrecisionConfig } from '@/shared/types';

/**
 * Phase B: Central Currency Precision and Metadata Registry.
 * Defines immutable precision (minorUnitDigits) and factors for all supported currencies in Hisabati.
 */
export const CURRENCY_PRECISION_MAP: Record<CurrencyCode, CurrencyPrecisionConfig> = {
  YER: {
    code: 'YER',
    minorUnitDigits: 0,
    minorUnitFactor: 1,
    minorUnitNameAr: 'ريال',
    nameAr: 'ريال يمني',
    symbolAr: 'ر.ي',
  },
  SAR: {
    code: 'SAR',
    minorUnitDigits: 2,
    minorUnitFactor: 100,
    minorUnitNameAr: 'هللة',
    nameAr: 'ريال سعودي',
    symbolAr: 'ر.س',
  },
  USD: {
    code: 'USD',
    minorUnitDigits: 2,
    minorUnitFactor: 100,
    minorUnitNameAr: 'سنت',
    nameAr: 'دولار أمريكي',
    symbolAr: '$',
  },
  AED: {
    code: 'AED',
    minorUnitDigits: 2,
    minorUnitFactor: 100,
    minorUnitNameAr: 'فلس',
    nameAr: 'درهم إماراتي',
    symbolAr: 'د.إ',
  },
  EGP: {
    code: 'EGP',
    minorUnitDigits: 2,
    minorUnitFactor: 100,
    minorUnitNameAr: 'قرش',
    nameAr: 'جنيه مصري',
    symbolAr: 'ج.م',
  },
  KWD: {
    code: 'KWD',
    minorUnitDigits: 3,
    minorUnitFactor: 1000,
    minorUnitNameAr: 'فلس',
    nameAr: 'دينار كويتي',
    symbolAr: 'د.ك',
  },
  QAR: {
    code: 'QAR',
    minorUnitDigits: 2,
    minorUnitFactor: 100,
    minorUnitNameAr: 'درهم',
    nameAr: 'ريال قطري',
    symbolAr: 'ر.ق',
  },
  OMR: {
    code: 'OMR',
    minorUnitDigits: 3,
    minorUnitFactor: 1000,
    minorUnitNameAr: 'بيسة',
    nameAr: 'ريال عماني',
    symbolAr: 'ر.ع',
  },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'YER';

/**
 * Gets currency configuration safely, falling back to default if unknown.
 */
export function getCurrencyConfig(code?: string | CurrencyCode): CurrencyPrecisionConfig {
  if (!code) return CURRENCY_PRECISION_MAP[DEFAULT_CURRENCY];
  const upper = code.toUpperCase() as CurrencyCode;
  return CURRENCY_PRECISION_MAP[upper] || CURRENCY_PRECISION_MAP[DEFAULT_CURRENCY];
}

/**
 * Returns the minor unit digits (decimal places) for a given currency.
 */
export function getCurrencyDecimals(code?: string | CurrencyCode): number {
  return getCurrencyConfig(code).minorUnitDigits;
}

/**
 * Returns the multiplier factor (10^minorUnitDigits) for a given currency.
 */
export function getCurrencyFactor(code?: string | CurrencyCode): number {
  return getCurrencyConfig(code).minorUnitFactor;
}

/**
 * Verifies if a currency code is one of the supported currencies.
 */
export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CURRENCY_PRECISION_MAP, code);
}
