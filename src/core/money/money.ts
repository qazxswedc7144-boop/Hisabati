import { CurrencyCode, MinorUnit, Money, RoundingMode } from '@/shared/types';
import { assertValidMinorUnit, decimalToMinor, minorToDecimal, minorToDecimalString } from './converter';

/**
 * Creates an immutable Money value object from integer minor units.
 */
export function createMoney(amountMinor: MinorUnit, currency: CurrencyCode): Money {
  assertValidMinorUnit(amountMinor, 'amountMinor');
  return Object.freeze({
    amountMinor,
    currency,
  });
}

/**
 * Creates a Money object from a decimal number or string with safe rounding.
 */
export function moneyFromDecimal(
  amount: number | string,
  currency: CurrencyCode,
  rounding: RoundingMode = 'HALF_UP'
): Money {
  const minor = decimalToMinor(amount, currency, rounding);
  return createMoney(minor, currency);
}

/**
 * Converts a Money object to its standard decimal floating number.
 */
export function moneyToDecimal(money: Money): number {
  return minorToDecimal(money.amountMinor, money.currency);
}

/**
 * Formats a Money object to an exact decimal string representation.
 */
export function moneyToDecimalString(money: Money): string {
  return minorToDecimalString(money.amountMinor, money.currency);
}

/**
 * Asserts that two Money instances share the exact same currency code.
 */
function assertSameCurrency(a: Money, b: Money, operation: string): void {
  if (a.currency !== b.currency) {
    throw new Error(
      `[Financial Safety] Currency mismatch in ${operation}: cannot operate between ${a.currency} and ${b.currency}`
    );
  }
}

/**
 * Deterministically adds two Money objects of identical currency using integer addition.
 */
export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b, 'addMoney');
  const sumMinor = a.amountMinor + b.amountMinor;
  assertValidMinorUnit(sumMinor, 'sumMinor');
  return createMoney(sumMinor, a.currency);
}

/**
 * Deterministically subtracts two Money objects of identical currency using integer subtraction.
 */
export function subtractMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b, 'subtractMoney');
  const diffMinor = a.amountMinor - b.amountMinor;
  assertValidMinorUnit(diffMinor, 'diffMinor');
  return createMoney(diffMinor, a.currency);
}

/**
 * Compares two Money objects. Returns:
 * -1 if a < b
 *  0 if a === b
 *  1 if a > b
 */
export function compareMoney(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b, 'compareMoney');
  if (a.amountMinor < b.amountMinor) return -1;
  if (a.amountMinor > b.amountMinor) return 1;
  return 0;
}

/**
 * Checks equality between two Money objects (currency and amountMinor).
 */
export function equalsMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

/**
 * Returns true if Money > 0.
 */
export function isPositiveMoney(m: Money): boolean {
  return m.amountMinor > 0;
}

/**
 * Returns true if Money < 0.
 */
export function isNegativeMoney(m: Money): boolean {
  return m.amountMinor < 0;
}

/**
 * Returns true if Money === 0.
 */
export function isZeroMoney(m: Money): boolean {
  return m.amountMinor === 0;
}

/**
 * Returns absolute value of Money.
 */
export function absMoney(m: Money): Money {
  return createMoney(Math.abs(m.amountMinor), m.currency);
}

/**
 * Negates the amount of Money.
 */
export function negateMoney(m: Money): Money {
  return createMoney(-m.amountMinor, m.currency);
}
