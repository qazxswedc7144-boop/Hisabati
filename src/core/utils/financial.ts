import { Transaction, TransactionType, CurrencyCode } from '@/shared/types';
import { getAmountMinor } from '../money/compat';
import { minorToDecimal, isValidMinorUnit } from '../money/converter';
import { getCurrencyDecimals } from '../money/currency';

/**
 * Precision configuration for monetary units.
 * Minor units multiplier (e.g. 100 for 2 decimals, 1000 for 3 decimals).
 */
const DEFAULT_DECIMALS = 2;
const PRECISION_MULTIPLIER = Math.pow(10, DEFAULT_DECIMALS);

/**
 * Converts a decimal monetary amount to an integer minor unit (e.g. cents).
 * Uses Math.round to avoid standard JavaScript IEEE-754 floating-point inaccuracies.
 */
export function toMinorUnits(amount: number, decimals: number = DEFAULT_DECIMALS): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round(amount * factor);
}

/**
 * Converts an integer minor unit back to standard floating monetary representation.
 */
export function fromMinorUnits(minorUnits: number, decimals: number = DEFAULT_DECIMALS): number {
  if (isNaN(minorUnits) || !isFinite(minorUnits)) return 0;
  const factor = Math.pow(10, decimals);
  return minorUnits / factor;
}

/**
 * Deterministically rounds a financial amount to standard monetary decimal places.
 */
export function roundMoney(amount: number, decimals: number = DEFAULT_DECIMALS): number {
  return fromMinorUnits(toMinorUnits(amount, decimals), decimals);
}

/**
 * Safe monetary addition.
 */
export function addMoney(a: number, b: number, decimals: number = DEFAULT_DECIMALS): number {
  return fromMinorUnits(toMinorUnits(a, decimals) + toMinorUnits(b, decimals), decimals);
}

/**
 * Safe monetary subtraction.
 */
export function subtractMoney(a: number, b: number, decimals: number = DEFAULT_DECIMALS): number {
  return fromMinorUnits(toMinorUnits(a, decimals) - toMinorUnits(b, decimals), decimals);
}

export interface CalculatedAccountMetrics {
  totalDebit: number;       // إجمالي لك (أعطيته)
  totalCredit: number;      // إجمالي عليك (أخذت منه)
  currentBalance: number;   // totalDebit - totalCredit (positive = لك, negative = عليك)
  transactionCount: number;
  lastTransactionDate?: string;
  totalDebitMinor: number;
  totalCreditMinor: number;
  currentBalanceMinor: number;
}

/**
 * Deterministically calculates an account's financial summary from its complete transaction log.
 * Transactions are the absolute Source of Truth.
 * Uses integer minor units arithmetic for accurate, drift-free financial calculation.
 */
export function computeAccountMetricsFromTransactions(
  transactions: Transaction[],
  currency?: CurrencyCode | string
): CalculatedAccountMetrics {
  let debitUnits = 0;
  let creditUnits = 0;
  let lastDate: string | undefined = undefined;

  const effectiveCurrency = currency || 'YER';
  const hasFractions = transactions.some((t) => t.amount % 1 !== 0);
  const useTwoDecimals = hasFractions || (currency !== undefined && getCurrencyDecimals(effectiveCurrency) === 2);

  for (const trx of transactions) {
    let amountUnits: number;
    if (hasFractions) {
      if (
        trx.amountMinor !== undefined &&
        isValidMinorUnit(trx.amountMinor) &&
        Math.abs(trx.amountMinor) === Math.round(Math.abs(trx.amount) * 100)
      ) {
        amountUnits = Math.abs(trx.amountMinor);
      } else {
        amountUnits = toMinorUnits(Math.abs(trx.amount), 2);
      }
    } else if (trx.amountMinor !== undefined && isValidMinorUnit(trx.amountMinor)) {
      amountUnits = Math.abs(trx.amountMinor);
    } else if (currency) {
      amountUnits = Math.abs(getAmountMinor(trx, currency as CurrencyCode));
    } else {
      amountUnits = Math.abs(getAmountMinor(trx, 'YER'));
    }

    if (trx.type === 'debit') {
      debitUnits += amountUnits;
    } else {
      creditUnits += amountUnits;
    }

    if (!lastDate || trx.date > lastDate) {
      lastDate = trx.date;
    }
  }

  const currentBalanceUnits = debitUnits - creditUnits;

  let totalDebit: number;
  let totalCredit: number;
  let currentBalance: number;

  if (useTwoDecimals) {
    totalDebit = roundMoney(debitUnits / 100, 2);
    totalCredit = roundMoney(creditUnits / 100, 2);
    currentBalance = roundMoney(currentBalanceUnits / 100, 2);
  } else {
    totalDebit = minorToDecimal(debitUnits, effectiveCurrency);
    totalCredit = minorToDecimal(creditUnits, effectiveCurrency);
    currentBalance = minorToDecimal(currentBalanceUnits, effectiveCurrency);
  }

  return {
    totalDebit,
    totalCredit,
    currentBalance,
    totalDebitMinor: debitUnits,
    totalCreditMinor: creditUnits,
    currentBalanceMinor: currentBalanceUnits,
    transactionCount: transactions.length,
    lastTransactionDate: lastDate,
  };
}

export interface StatementItem extends Transaction {
  runningBalance: number;
  runningBalanceMinor: number;
}

/**
 * Computes chronological running balance for an account statement.
 * Transactions are sorted chronologically by date/createdAt to compute the correct progressive balance,
 * and returned with their associated `runningBalance` derived values (both decimal and minor units).
 */
export function computeStatementRunningBalances(
  transactions: Transaction[],
  currency?: CurrencyCode | string
): StatementItem[] {
  if (transactions.length === 0) return [];

  const effectiveCurrency = currency || 'YER';
  const hasFractions = transactions.some((t) => t.amount % 1 !== 0);
  const useTwoDecimals = hasFractions || (currency !== undefined && getCurrencyDecimals(effectiveCurrency) === 2);

  // Sort chronological (oldest first)
  const chronological = [...transactions].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let runningUnits = 0;
  const itemMap = new Map<string, { decimal: number; minor: number }>();

  for (const trx of chronological) {
    let units: number;
    if (hasFractions) {
      if (
        trx.amountMinor !== undefined &&
        isValidMinorUnit(trx.amountMinor) &&
        Math.abs(trx.amountMinor) === Math.round(Math.abs(trx.amount) * 100)
      ) {
        units = Math.abs(trx.amountMinor);
      } else {
        units = toMinorUnits(Math.abs(trx.amount), 2);
      }
    } else if (trx.amountMinor !== undefined && isValidMinorUnit(trx.amountMinor)) {
      units = Math.abs(trx.amountMinor);
    } else if (currency) {
      units = Math.abs(getAmountMinor(trx, currency as CurrencyCode));
    } else {
      units = Math.abs(getAmountMinor(trx, 'YER'));
    }

    if (trx.type === 'debit') {
      runningUnits += units;
    } else {
      runningUnits -= units;
    }

    const decimalVal = useTwoDecimals
      ? roundMoney(runningUnits / 100, 2)
      : minorToDecimal(runningUnits, effectiveCurrency);

    itemMap.set(trx.id, {
      decimal: decimalVal,
      minor: runningUnits,
    });
  }

  // Return transactions maintaining the requested or default newest-first order
  return transactions.map((t) => {
    const balanceInfo = itemMap.get(t.id) ?? { decimal: 0, minor: 0 };
    return {
      ...t,
      runningBalance: balanceInfo.decimal,
      runningBalanceMinor: balanceInfo.minor,
    };
  });
}
