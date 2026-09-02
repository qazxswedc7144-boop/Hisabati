import { Transaction, TransactionType } from '@/shared/types';

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
}

/**
 * Deterministically calculates an account's financial summary from its complete transaction log.
 * Transactions are the absolute Source of Truth.
 */
export function computeAccountMetricsFromTransactions(
  transactions: Transaction[]
): CalculatedAccountMetrics {
  let debitUnits = 0;
  let creditUnits = 0;
  let lastDate: string | undefined = undefined;

  for (const trx of transactions) {
    const amountUnits = toMinorUnits(Math.abs(trx.amount));
    if (trx.type === 'debit') {
      debitUnits += amountUnits;
    } else {
      creditUnits += amountUnits;
    }

    if (!lastDate || trx.date > lastDate) {
      lastDate = trx.date;
    }
  }

  const totalDebit = fromMinorUnits(debitUnits);
  const totalCredit = fromMinorUnits(creditUnits);
  const currentBalance = fromMinorUnits(debitUnits - creditUnits);

  return {
    totalDebit,
    totalCredit,
    currentBalance,
    transactionCount: transactions.length,
    lastTransactionDate: lastDate,
  };
}

export interface StatementItem extends Transaction {
  runningBalance: number;
}

/**
 * Computes chronological running balance for an account statement.
 * Transactions are sorted chronologically by date/createdAt to compute the correct progressive balance,
 * and returned with their associated `runningBalance` derived values.
 */
export function computeStatementRunningBalances(
  transactions: Transaction[]
): StatementItem[] {
  if (transactions.length === 0) return [];

  // Sort chronological (oldest first)
  const chronological = [...transactions].sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.createdAt.localeCompare(b.createdAt);
  });

  let runningUnits = 0;
  const itemMap = new Map<string, number>();

  for (const trx of chronological) {
    const units = toMinorUnits(Math.abs(trx.amount));
    if (trx.type === 'debit') {
      runningUnits += units;
    } else {
      runningUnits -= units;
    }
    itemMap.set(trx.id, fromMinorUnits(runningUnits));
  }

  // Return transactions maintaining the requested or default newest-first order
  return transactions.map((t) => ({
    ...t,
    runningBalance: itemMap.get(t.id) ?? 0,
  }));
}
