import { CurrencyCode } from '@/shared/types';
import { decimalToMinor, minorToDecimal, assertValidMinorUnit, isValidMinorUnit } from './converter';
import { assertDualMoneyRepresentation } from './validator';

export interface ValidatedFinancialAmount {
  amountMinor: number;
  amount: number;
}

/**
 * Phase Financial Core Hardening: Central Financial Amount Validator & Normalizer.
 * Enforces:
 * 1. amountMinor is the single authoritative source of truth.
 * 2. Rejection of NaN, Infinity, -Infinity, negative zero (-0), zero (<= 0), and negative amounts.
 * 3. Rejection of fractional minor units and unsafe integers.
 * 4. Deterministic conversion from decimal amount to integer minor units once.
 * 5. Rejection of floating point representations as the financial source.
 */
export function validateAndResolveFinancialAmount(
  amount?: unknown,
  amountMinor?: unknown,
  currency: CurrencyCode | string = 'YER'
): ValidatedFinancialAmount {
  // 1. Both missing or null
  if (amount === undefined && amountMinor === undefined) {
    throw new Error('يرجى إدخال مبلغ صحيح للعملية');
  }

  // 2. Reject non-number types if provided
  if (amount !== undefined && typeof amount !== 'number') {
    throw new TypeError('[Financial Safety] Amount must be a valid number, received ' + typeof amount);
  }
  if (amountMinor !== undefined && typeof amountMinor !== 'number') {
    throw new TypeError('[Financial Safety] amountMinor must be a valid number, received ' + typeof amountMinor);
  }

  // 3. Reject NaN
  if (typeof amount === 'number' && Number.isNaN(amount)) {
    throw new RangeError('[Financial Safety] Amount cannot be NaN');
  }
  if (typeof amountMinor === 'number' && Number.isNaN(amountMinor)) {
    throw new RangeError('[Financial Safety] amountMinor cannot be NaN');
  }

  // 4. Reject Infinity / -Infinity
  if (typeof amount === 'number' && !Number.isFinite(amount)) {
    throw new RangeError('[Financial Safety] Amount cannot be Infinity or -Infinity');
  }
  if (typeof amountMinor === 'number' && !Number.isFinite(amountMinor)) {
    throw new RangeError('[Financial Safety] amountMinor cannot be Infinity or -Infinity');
  }

  // 5. Reject negative zero (-0)
  if (typeof amount === 'number' && Object.is(amount, -0)) {
    throw new RangeError('[Financial Safety] Amount cannot be negative zero (-0)');
  }
  if (typeof amountMinor === 'number' && Object.is(amountMinor, -0)) {
    throw new RangeError('[Financial Safety] amountMinor cannot be negative zero (-0)');
  }

  // 6. If amountMinor is explicitly passed, validate integer constraints strictly
  if (amountMinor !== undefined) {
    const minorNum = amountMinor as number;
    if (!Number.isInteger(minorNum)) {
      throw new RangeError(`[Financial Safety] amountMinor must be an integer, received fractional ${minorNum}`);
    }
    if (!Number.isSafeInteger(minorNum)) {
      throw new RangeError(`[Financial Safety] amountMinor exceeds safe integer bounds: ${minorNum}`);
    }
    if (minorNum === 0) {
      throw new RangeError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
    }
    if (minorNum < 0) {
      throw new RangeError('يرجى إدخال مبلغ موجب، ويتم تحديد الاتجاه بنوع العملية (مدين أو دائن)');
    }

    // If decimal amount was also provided, verify dual consistency
    if (amount !== undefined) {
      const amountNum = amount as number;
      if (amountNum === 0) {
        throw new RangeError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
      }
      if (amountNum < 0) {
        throw new RangeError('يرجى إدخال مبلغ موجب، ويتم تحديد الاتجاه بنوع العملية (مدين أو دائن)');
      }
      assertDualMoneyRepresentation(amountNum, minorNum, currency);
    }

    const derivedAmount = minorToDecimal(minorNum, currency);
    return {
      amountMinor: minorNum,
      amount: derivedAmount,
    };
  }

  // 7. If only decimal amount is provided, validate and convert to canonical minor units
  const numAmount = amount as number;
  if (numAmount === 0) {
    throw new RangeError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
  }
  if (numAmount < 0) {
    throw new RangeError('يرجى إدخال مبلغ موجب، ويتم تحديد الاتجاه بنوع العملية (مدين أو دائن)');
  }

  const resolvedMinor = decimalToMinor(numAmount, currency, 'HALF_UP');
  assertValidMinorUnit(resolvedMinor, 'amountMinor');

  if (resolvedMinor <= 0) {
    throw new RangeError('يرجى إدخال مبلغ صحيح أكبر من الصفر');
  }

  const derivedAmount = minorToDecimal(resolvedMinor, currency);
  return {
    amountMinor: resolvedMinor,
    amount: derivedAmount,
  };
}
