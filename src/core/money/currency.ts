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
  JPY: {
    code: 'JPY',
    minorUnitDigits: 0,
    minorUnitFactor: 1,
    minorUnitNameAr: 'ين',
    nameAr: 'ين ياباني',
    symbolAr: '¥',
  },
};

export const DEFAULT_CURRENCY: CurrencyCode = 'YER';

/**
 * Normalizes a currency code safely.
 *
 * Important:
 * - Never calls string methods on unknown values.
 * - Trims whitespace.
 * - Normalizes to uppercase.
 * - Returns null for missing/unsupported currencies.
 *
 * No silent financial fallback is performed here.
 */
export function normalizeCurrencyCode(
  code: unknown
): CurrencyCode | null {
  if (typeof code !== 'string') {
    return null;
  }

  const normalized = code.trim().toUpperCase();

  if (!normalized) {
    return null;
  }

  return Object.prototype.hasOwnProperty.call(
    CURRENCY_PRECISION_MAP,
    normalized
  )
    ? (normalized as CurrencyCode)
    : null;
}

/**
 * Gets currency configuration safely.
 *
 * Missing or unsupported currencies are rejected explicitly.
 * There is NO silent fallback to the default currency.
 */
export function getCurrencyConfig(
  code: string | CurrencyCode
): CurrencyPrecisionConfig {
  const normalized = normalizeCurrencyCode(code);

  if (!normalized) {
    throw new Error(
      `[Financial Safety] Invalid, missing, or unsupported currency code: "${String(code)}"`
    );
  }

  return CURRENCY_PRECISION_MAP[normalized];
}

/**
 * Production currency resolution.
 *
 * Hierarchy:
 * Transaction -> Account -> System -> Throw
 *
 * NO SILENT FALLBACKS.
 */
export function resolveRequiredCurrency(params: {
  transactionCurrency?: string | CurrencyCode;
  accountCurrency?: string | CurrencyCode;
  systemCurrency?: string | CurrencyCode;
}): CurrencyCode {
  const {
    transactionCurrency,
    accountCurrency,
    systemCurrency,
  } = params;

  // 1. Explicit transaction currency
  const transactionResolved =
    normalizeCurrencyCode(transactionCurrency);

  if (transactionResolved) {
    return transactionResolved;
  }

  // 2. Account currency
  const accountResolved =
    normalizeCurrencyCode(accountCurrency);

  if (accountResolved) {
    return accountResolved;
  }

  // 3. System currency
  const systemResolved =
    normalizeCurrencyCode(systemCurrency);

  if (systemResolved) {
    return systemResolved;
  }

  // 4. Unresolved -> THROW
  throw new Error(
    '[Financial Safety] Currency resolution failed. ' +
    'No valid currency provided in transaction, account, or system settings. ' +
    'A valid currency is required for all financial mutations.'
  );
}

/**
 * Returns the minor unit digits for a currency.
 */
export function getCurrencyDecimals(
  code: string | CurrencyCode
): number {
  return getCurrencyConfig(code).minorUnitDigits;
}

/**
 * Returns the multiplier factor (10^minorUnitDigits).
 */
export function getCurrencyFactor(
  code: string | CurrencyCode
): number {
  return getCurrencyConfig(code).minorUnitFactor;
}

/**
 * Checks whether a currency code is supported.
 *
 * Case-insensitive and safe against undefined/null/non-string values.
 */
export function isSupportedCurrency(
  code: unknown
): code is CurrencyCode {
  return normalizeCurrencyCode(code) !== null;
}
