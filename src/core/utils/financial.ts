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
  const currencyDecimals = getCurrencyDecimals(effectiveCurrency);
  
  // Decide on decimal representation for the final summary (decimal fields)
  // If any transaction has fractions, we might need decimals in the display fields even for YER
  const hasFractions = transactions.some((t) => t.amount % 1 !== 0);
  const displayDecimals = (hasFractions || currencyDecimals === 2) ? 2 : currencyDecimals;

  for (const trx of transactions) {
    let amountUnits: number;
    
    // 1. Primary Source: Existing valid amountMinor
    if (trx.amountMinor !== undefined && isValidMinorUnit(trx.amountMinor)) {
      amountUnits = Math.abs(trx.amountMinor);
    } 
    // 2. Secondary Source: Fallback to currency-based conversion from legacy amount
    else {
      // Use displayDecimals to ensure all transactions in this calculation are on the same scale
      amountUnits = toMinorUnits(Math.abs(trx.amount), displayDecimals);
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

  totalDebit = fromMinorUnits(debitUnits, displayDecimals);
  totalCredit = fromMinorUnits(creditUnits, displayDecimals);
  currentBalance = fromMinorUnits(currentBalanceUnits, displayDecimals);

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
  const currencyDecimals = getCurrencyDecimals(effectiveCurrency);
  const hasFractions = transactions.some((t) => t.amount % 1 !== 0);
  const displayDecimals = (hasFractions || currencyDecimals === 2) ? 2 : currencyDecimals;

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
    
    // 1. Primary Source: Existing valid amountMinor
    if (trx.amountMinor !== undefined && isValidMinorUnit(trx.amountMinor)) {
      units = Math.abs(trx.amountMinor);
    } 
    // 2. Fallback: Currency-aware conversion
    else {
      const effectiveDecimals = (trx.amount % 1 !== 0 && currencyDecimals === 0) ? 2 : currencyDecimals;
      units = toMinorUnits(Math.abs(trx.amount), effectiveDecimals);
    }

    if (trx.type === 'debit') {
      runningUnits += units;
    } else {
      runningUnits -= units;
    }

    const decimalVal = fromMinorUnits(runningUnits, displayDecimals);

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
