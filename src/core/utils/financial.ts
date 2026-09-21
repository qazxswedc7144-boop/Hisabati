import { Transaction, TransactionType, CurrencyCode } from '@/shared/types';
import { getAmountMinor } from '../money/compat';
import { decimalToMinor, minorToDecimal, isValidMinorUnit } from '../money/converter';
import { getCurrencyDecimals } from '../money/currency';

/**
 * Converts a decimal monetary amount to an integer minor unit (e.g. cents/fils).
 * Accepts either a currency code or explicit numeric decimal count.
 */
export function toMinorUnits(amount: number, currencyOrDecimals: CurrencyCode | string | number = 'YER'): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  if (typeof currencyOrDecimals === 'number') {
    const factor = Math.pow(10, currencyOrDecimals);
    return Math.round(amount * factor);
  }
  return decimalToMinor(amount, currencyOrDecimals as CurrencyCode);
}

/**
 * Converts an integer minor unit back to standard floating monetary representation.
 * Accepts either a currency code or explicit numeric decimal count.
 */
export function fromMinorUnits(minorUnits: number, currencyOrDecimals: CurrencyCode | string | number = 'YER'): number {
  if (isNaN(minorUnits) || !isFinite(minorUnits)) return 0;
  if (typeof currencyOrDecimals === 'number') {
    const factor = Math.pow(10, currencyOrDecimals);
    return minorUnits / factor;
  }
  return minorToDecimal(minorUnits, currencyOrDecimals as CurrencyCode);
}

/**
 * Deterministically rounds a financial amount to standard monetary decimal places.
 */
export function roundMoney(amount: number, currencyOrDecimals: CurrencyCode | string | number = 'YER'): number {
  return fromMinorUnits(toMinorUnits(amount, currencyOrDecimals), currencyOrDecimals);
}

/**
 * Safe monetary addition.
 */
export function addMoney(a: number, b: number, currencyOrDecimals: CurrencyCode | string | number = 'YER'): number {
  return fromMinorUnits(toMinorUnits(a, currencyOrDecimals) + toMinorUnits(b, currencyOrDecimals), currencyOrDecimals);
}

/**
 * Safe monetary subtraction.
 */
export function subtractMoney(a: number, b: number, currencyOrDecimals: CurrencyCode | string | number = 'YER'): number {
  return fromMinorUnits(toMinorUnits(a, currencyOrDecimals) - toMinorUnits(b, currencyOrDecimals), currencyOrDecimals);
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

  const activeCurrency = (currency as CurrencyCode) || 'YER';

  for (const trx of transactions) {
    let amountUnits: number;

    // 1. Primary Source: Existing valid amountMinor
    if (trx.amountMinor !== undefined && isValidMinorUnit(trx.amountMinor)) {
      amountUnits = Math.abs(trx.amountMinor);
    } 
    // 2. Secondary Source: Fallback to currency-based conversion from legacy amount
    else {
      const trxCurrency = (trx.currency as CurrencyCode) || activeCurrency;
      amountUnits = Math.abs(getAmountMinor(trx, trxCurrency));
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

  const totalDebit = minorToDecimal(debitUnits, activeCurrency);
  const totalCredit = minorToDecimal(creditUnits, activeCurrency);
  const currentBalance = minorToDecimal(currentBalanceUnits, activeCurrency);

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

  const activeCurrency = (currency as CurrencyCode) || 'YER';

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
      const trxCurrency = (trx.currency as CurrencyCode) || activeCurrency;
      units = Math.abs(getAmountMinor(trx, trxCurrency));
    }

    if (trx.type === 'debit') {
      runningUnits += units;
    } else {
      runningUnits -= units;
    }

    const decimalVal = minorToDecimal(runningUnits, activeCurrency);

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
