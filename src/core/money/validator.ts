import { CurrencyCode, MinorUnit } from '@/shared/types';
import { getCurrencyDecimals } from './currency';
import { minorToDecimal, decimalToMinor } from './converter';

export interface DualMoneyValidationResult {
  isValid: boolean;
  error?: string;
  expectedMinor?: MinorUnit;
  receivedMinor?: number;
  currency?: string;
}

/**
 * Phase B: Central Dual Money Representation Validator.
 * Validates strict mathematical and type consistency between legacy floating amount
 * and canonical integer minor units according to the currency's precision.
 * FAILS FAST on any discrepancy, NaN, Infinity, or precision violation.
 */
export function validateDualMoneyRepresentation(
  amount: number,
  amountMinor: number,
  currency: CurrencyCode | string = 'YER'
): DualMoneyValidationResult {
  // 1. Check NaN
  if (Number.isNaN(amount) || Number.isNaN(amountMinor)) {
    return {
      isValid: false,
      error: '[Financial Safety] Amount and amountMinor cannot be NaN',
      currency,
    };
  }

  // 2. Check Infinity
  if (!Number.isFinite(amount) || !Number.isFinite(amountMinor)) {
    return {
      isValid: false,
      error: '[Financial Safety] Amount and amountMinor cannot be Infinity or -Infinity',
      currency,
    };
  }

  // 3. Check amountMinor is Integer
  if (!Number.isInteger(amountMinor)) {
    return {
      isValid: false,
      error: `[Financial Safety] amountMinor must be an integer, received float ${amountMinor}`,
      receivedMinor: amountMinor,
      currency,
    };
  }

  // 4. Check amountMinor is Safe Integer
  if (!Number.isSafeInteger(amountMinor)) {
    return {
      isValid: false,
      error: `[Financial Safety] amountMinor exceeds Number.MAX_SAFE_INTEGER bounds: ${amountMinor}`,
      receivedMinor: amountMinor,
      currency,
    };
  }

  // 5. Check currency code
  if (typeof currency !== 'string' || currency.trim().length === 0) {
    return {
      isValid: false,
      error: '[Financial Safety] Invalid or missing currency code',
      currency,
    };
  }

  const decimals = getCurrencyDecimals(currency);

  // 6. Check sign consistency (unless zero)
  if (amount > 0 && amountMinor < 0) {
    return {
      isValid: false,
      error: `[Financial Safety] Sign mismatch: amount is positive (${amount}) but amountMinor is negative (${amountMinor})`,
      currency,
    };
  }
  if (amount < 0 && amountMinor > 0) {
    return {
      isValid: false,
      error: `[Financial Safety] Sign mismatch: amount is negative (${amount}) but amountMinor is positive (${amountMinor})`,
      currency,
    };
  }
  if ((amount === 0 && amountMinor !== 0) || (amount !== 0 && amountMinor === 0)) {
    return {
      isValid: false,
      error: `[Financial Safety] Zero mismatch: amount=${amount}, amountMinor=${amountMinor}`,
      currency,
    };
  }

  // 7. Value match check
  const expectedMinorStandard = decimalToMinor(amount, currency, 'HALF_UP');
  if (amountMinor === expectedMinorStandard) {
    return {
      isValid: true,
      expectedMinor: expectedMinorStandard,
      receivedMinor: amountMinor,
      currency,
    };
  }

  // If currency has 0 decimals (like YER) but amount has decimal fractions (legacy 2-decimal representation)
  if (decimals === 0 && amount % 1 !== 0) {
    const expectedMinor2Dec = decimalToMinor(amount, 'SAR', 'HALF_UP');
    if (amountMinor === expectedMinor2Dec) {
      return {
        isValid: true,
        expectedMinor: expectedMinor2Dec,
        receivedMinor: amountMinor,
        currency,
      };
    }
  }

  return {
    isValid: false,
    error: `[Financial Safety] Dual representation mismatch: amount (${amount}) does not match amountMinor (${amountMinor}) for currency ${currency} (expected: ${expectedMinorStandard})`,
    expectedMinor: expectedMinorStandard,
    receivedMinor: amountMinor,
    currency,
  };
}

/**
 * Asserts dual money consistency, throwing immediately (FAIL FAST) if invalid.
 */
export function assertDualMoneyRepresentation(
  amount: number,
  amountMinor: number,
  currency: CurrencyCode | string = 'YER'
): void {
  const result = validateDualMoneyRepresentation(amount, amountMinor, currency);
  if (!result.isValid) {
    throw new Error(result.error || '[Financial Safety] Dual money representation validation failed');
  }
}
