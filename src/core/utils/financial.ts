import { Transaction, TransactionType, CurrencyCode, Account } from '@/shared/types';
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
  let postedCount = 0;
  let lastDate: string | undefined = undefined;

  const inferredCurrency = transactions.find((trx) => trx.currency)?.currency as CurrencyCode | undefined;
  const activeCurrency = (currency as CurrencyCode) || inferredCurrency || 'YER';

  for (const trx of transactions) {
    if (trx.currency && trx.currency.trim().toUpperCase() !== activeCurrency.trim().toUpperCase()) {
      throw new Error(`[Financial Safety] Cannot aggregate ${trx.currency} transaction into ${activeCurrency} account balance without an explicit FX conversion.`);
    }
    // Phase 2 Fix: Only POSTED transactions (and legacy without status) affect the balance.
    // DRAFT and REVERSED are excluded from financial totals.
    const status = trx.status || 'posted'; 
    if (status !== 'posted') continue;

    postedCount++;
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
    transactionCount: postedCount,
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

  const inferredCurrency = transactions.find((trx) => trx.currency)?.currency as CurrencyCode | undefined;
  const activeCurrency = (currency as CurrencyCode) || inferredCurrency || 'YER';

  // Sort chronological (oldest first)
  const chronological = [...transactions].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let runningUnits = 0;
  const itemMap = new Map<string, { decimal: number; minor: number }>();

  for (const trx of chronological) {
    if (trx.currency && trx.currency.trim().toUpperCase() !== activeCurrency.trim().toUpperCase()) {
      throw new Error(`[Financial Safety] Cannot calculate a ${activeCurrency} running balance for a ${trx.currency} transaction without an explicit FX conversion.`);
    }
    // Phase 2 Fix: Only POSTED transactions affect the running balance.
    const status = trx.status || 'posted';
    if (status !== 'posted') {
      // For non-posted items, the running balance remains what it was before this item
      itemMap.set(trx.id, {
        decimal: minorToDecimal(runningUnits, activeCurrency),
        minor: runningUnits,
      });
      continue;
    }

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
/**
 * Computes incremental changes to an account's metrics based on a single transaction mutation.
 * This enables O(1) balance updates in the hot path.
 * Integrity Policy: If any metric becomes inconsistent (e.g., negative count/totals), 
 * the returned object will have an 'isInconsistent' flag to trigger a full rebuild.
 */
export function applyTransactionDelta(
  account: Account,
  delta: {
    amountMinor: number;
    type: TransactionType;
    action: 'add' | 'subtract';
    date?: string;
  },
  currency?: CurrencyCode
): Partial<Account> & { isInconsistent?: boolean } {
  const accountCurrency = account.currency;
  const requestedCurrency = currency;
  if (
    accountCurrency &&
    requestedCurrency &&
    accountCurrency.trim().toUpperCase() !== requestedCurrency.trim().toUpperCase()
  ) {
    throw new Error(
      `[Financial Safety] Cannot apply a ${requestedCurrency} balance delta to a ${accountCurrency} account without an explicit FX conversion.`
    );
  }
  const activeCurrency = (requestedCurrency || accountCurrency || 'YER') as CurrencyCode;
  
  // Integrity check: amountMinor must be a valid safe integer
  if (typeof delta.amountMinor !== 'number' || !Number.isSafeInteger(delta.amountMinor)) {
    return { isInconsistent: true };
  }

  let currentBalanceMinor = account.currentBalanceMinor || 0;
  let totalDebitMinor = account.totalDebitMinor || 0;
  let totalCreditMinor = account.totalCreditMinor || 0;
  let transactionCount = account.transactionCount || 0;
  let lastTransactionDate = account.lastTransactionDate;

  const amount = Math.abs(delta.amountMinor);

  if (delta.action === 'add') {
    transactionCount += 1;
    if (delta.type === 'debit') {
      currentBalanceMinor += amount;
      totalDebitMinor += amount;
    } else {
      currentBalanceMinor -= amount;
      totalCreditMinor += amount;
    }
    
    // Update last date if newer
    if (delta.date && (!lastTransactionDate || delta.date > lastTransactionDate)) {
      lastTransactionDate = delta.date;
    }
  } else {
    // Subtracting:
    transactionCount -= 1;
    
    if (delta.type === 'debit') {
      currentBalanceMinor -= amount;
      totalDebitMinor -= amount;
    } else {
      currentBalanceMinor += amount;
      totalCreditMinor -= amount;
    }
    
    // Financial Invariant Check: Subtraction cannot result in negative totals or count
    // If it does, the materialized state was already out of sync or we are subtracting 
    // a transaction that wasn't counted.
    if (transactionCount < 0 || totalDebitMinor < 0 || totalCreditMinor < 0) {
      return { isInconsistent: true };
    }

    // Staleness Check for lastTransactionDate:
    // If we subtract a transaction that HAS the latest date, we cannot know the 
    // NEXT latest date without an O(N) scan.
    if (delta.date && delta.date === lastTransactionDate) {
      return { isInconsistent: true };
    }
  }

  // Integer Overflow Protection
  if (
    !Number.isSafeInteger(currentBalanceMinor) || 
    !Number.isSafeInteger(totalDebitMinor) || 
    !Number.isSafeInteger(totalCreditMinor)
  ) {
    return { isInconsistent: true };
  }

  return {
    currentBalanceMinor,
    totalDebitMinor,
    totalCreditMinor,
    transactionCount,
    currentBalance: minorToDecimal(currentBalanceMinor, activeCurrency),
    totalDebit: minorToDecimal(totalDebitMinor, activeCurrency),
    totalCredit: minorToDecimal(totalCreditMinor, activeCurrency),
    lastTransactionDate,
    updatedAt: new Date().toISOString(),
    isInconsistent: false
  };
}

