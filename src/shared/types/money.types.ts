import { CurrencyCode } from './common.types';

/**
 * Phase B: Financial Money Model Foundation
 * Canonical Minor Unit type representing money in indivisible integer units (e.g., cents, halalas, fils).
 * Must ALWAYS be a safe integer (Number.isSafeInteger(val)).
 */
export type MinorUnit = number;

/**
 * Supported rounding modes for decimal to minor unit conversions.
 */
export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'FLOOR' | 'CEIL' | 'TRUNCATE';

/**
 * Canonical Money representation.
 * Immutable value object holding integer minor units and its currency code.
 */
export interface Money {
  readonly amountMinor: MinorUnit;
  readonly currency: CurrencyCode;
}

/**
 * Precision and metadata specifications for each currency.
 */
export interface CurrencyPrecisionConfig {
  readonly code: CurrencyCode;
  readonly minorUnitDigits: number; // e.g. 0 for YER, 2 for SAR/USD, 3 for KWD/OMR
  readonly minorUnitFactor: number; // 10^minorUnitDigits (1, 100, 1000)
  readonly minorUnitNameAr: string; // e.g. هللة, فلس, قرش, بيسة, ريال
  readonly nameAr: string;
  readonly symbolAr: string;
}

/**
 * Dual Representation structure for gradual transition.
 */
export interface DualMoneyRepresentation {
  readonly amount: number;         // Legacy decimal float
  readonly amountMinor: MinorUnit; // Phase B canonical integer minor units
}
