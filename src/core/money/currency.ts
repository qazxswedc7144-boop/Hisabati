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
 * Gets currency configuration safely.
 * @throws Error if currency is invalid and no valid fallback is provided.
 */
export function getCurrencyConfig(code: string | CurrencyCode): CurrencyPrecisionConfig {
  const upper = code.toUpperCase() as CurrencyCode;
  const config = CURRENCY_PRECISION_MAP[upper];
  if (!config) {
    throw new Error(`[Financial Safety] Invalid or unsupported currency code: "${code}"`);
  }
  return config;
}

/**
 * PRODUCTION SECURITY: Centralized currency resolution logic.
 * Explicitly follows the hierarchy: Transaction -> Account -> System -> Throw.
 * NO SILENT FALLBACKS.
 */
export function resolveRequiredCurrency(params: {
  transactionCurrency?: string | CurrencyCode;
  accountCurrency?: string | CurrencyCode;
  systemCurrency?: string | CurrencyCode;
}): CurrencyCode {
  const { transactionCurrency, accountCurrency, systemCurrency } = params;

  // 1. Explicit transaction currency
  if (transactionCurrency && isSupportedCurrency(transactionCurrency)) {
    return transactionCurrency as CurrencyCode;
  }

  // 2. Account currency
  if (accountCurrency && isSupportedCurrency(accountCurrency)) {
    return accountCurrency as CurrencyCode;
  }

  // 3. Valid system currency
  if (systemCurrency && isSupportedCurrency(systemCurrency)) {
    return systemCurrency as CurrencyCode;
  }

  // 4. UNRESOLVED -> THROW
  throw new Error(
    '[Financial Safety] Currency resolution failed. No valid currency provided in transaction, account, or system settings. A valid currency is required for all financial mutations.'
  );
}

/**
 * Returns the minor unit digits (decimal places) for a given currency.
 */
export function getCurrencyDecimals(code: string | CurrencyCode): number {
  return getCurrencyConfig(code).minorUnitDigits;
}

/**
 * Returns the multiplier factor (10^minorUnitDigits) for a given currency.
 */
export function getCurrencyFactor(code: string | CurrencyCode): number {
  return getCurrencyConfig(code).minorUnitFactor;
}

/**
 * Verifies if a currency code is one of the supported currencies.
 */
export function isSupportedCurrency(code: unknown): code is CurrencyCode {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CURRENCY_PRECISION_MAP, code);
}
