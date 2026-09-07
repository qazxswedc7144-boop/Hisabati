import {
  CurrencyCode,
  DualMoneyRepresentation,
  MinorUnit,
  Money,
} from '@/shared/types';
import { decimalToMinor, isValidMinorUnit, minorToDecimal } from './converter';
import { createMoney } from './money';
import { DEFAULT_CURRENCY } from './currency';

export interface LegacyMoneyHolder {
  amount: number;
  amountMinor?: number;
}

/**
 * Phase B Compatibility Adapter:
 * Safely extracts or calculates the minor unit value from a transaction or money-bearing record.
 * 1. If `amountMinor` exists and is a valid safe integer, returns it directly.
 * 2. Otherwise, deterministically computes minor units from legacy `amount`.
 * 3. Crucially, NEVER mutates the input record.
 */
export function getAmountMinor(
  record: LegacyMoneyHolder,
  currency: CurrencyCode = DEFAULT_CURRENCY
): MinorUnit {
  if (record.amountMinor !== undefined && isValidMinorUnit(record.amountMinor)) {
    return record.amountMinor;
  }

  // Fallback to legacy amount
  return decimalToMinor(record.amount, currency);
}

/**
 * Resolves a legacy or dual-represented record into a canonical Money object.
 */
export function resolveMoney(
  record: LegacyMoneyHolder,
  currency: CurrencyCode = DEFAULT_CURRENCY
): Money {
  const minor = getAmountMinor(record, currency);
  return createMoney(minor, currency);
}

/**
 * Produces an aligned Dual Representation without mutating inputs.
 */
export function toDualRepresentation(
  amount: number | string,
  currency: CurrencyCode = DEFAULT_CURRENCY
): DualMoneyRepresentation {
  const amountMinor = decimalToMinor(amount, currency);
  const decimalVal = minorToDecimal(amountMinor, currency);

  return {
    amount: decimalVal,
    amountMinor,
  };
}
