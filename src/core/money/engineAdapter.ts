import {
  Account,
  CurrencyCode,
  MinorUnit,
  Money,
  Transaction,
  TransactionType,
} from '@/shared/types';
import { decimalToMinor, minorToDecimal } from './converter';
import { getAmountMinor } from './compat';
import { DEFAULT_CURRENCY } from './currency';
import { createMoney } from './money';

export interface MinorMetricsResult {
  readonly totalDebitMinor: MinorUnit;
  readonly totalCreditMinor: MinorUnit;
  readonly currentBalanceMinor: MinorUnit;
  readonly transactionCount: number;
  readonly lastTransactionDate?: string;
}

export interface DualMetricsResult extends MinorMetricsResult {
  readonly totalDebit: number;
  readonly totalCredit: number;
  readonly currentBalance: number;
}

/**
 * Phase B: Financial Engine Compatibility Adapter.
 * Bridges legacy floating amounts and future integer-based minor unit engine calculations.
 * Does NOT mutate existing database records or alter historical transactions.
 */
export class FinancialEngineMoneyAdapter {
  /**
   * Resolves the canonical minor unit amount of a transaction, safely falling back to decimal conversion.
   */
  static getTransactionAmountMinor(
    trx: Pick<Transaction, 'amount' | 'amountMinor'>,
    currency: CurrencyCode = DEFAULT_CURRENCY
  ): MinorUnit {
    return getAmountMinor(trx, currency);
  }

  /**
   * Computes exact integer metrics from a collection of transactions.
   * Eliminates any floating-point accumulation drift across large transaction sets.
   */
  static computeMetricsMinor(
    transactions: Transaction[],
    currency: CurrencyCode = DEFAULT_CURRENCY
  ): MinorMetricsResult {
    let debitUnits = 0;
    let creditUnits = 0;
    let lastDate: string | undefined = undefined;

    for (const trx of transactions) {
      const units = Math.abs(getAmountMinor(trx, currency));
      if (trx.type === 'debit') {
        debitUnits += units;
      } else {
        creditUnits += units;
      }

      if (!lastDate || trx.date > lastDate) {
        lastDate = trx.date;
      }
    }

    return {
      totalDebitMinor: debitUnits,
      totalCreditMinor: creditUnits,
      currentBalanceMinor: debitUnits - creditUnits,
      transactionCount: transactions.length,
      lastTransactionDate: lastDate,
    };
  }

  /**
   * Produces dual metrics containing both integer minor units and aligned decimal floats.
   */
  static computeDualMetrics(
    transactions: Transaction[],
    currency: CurrencyCode = DEFAULT_CURRENCY
  ): DualMetricsResult {
    const minorMetrics = this.computeMetricsMinor(transactions, currency);

    return {
      ...minorMetrics,
      totalDebit: minorToDecimal(minorMetrics.totalDebitMinor, currency),
      totalCredit: minorToDecimal(minorMetrics.totalCreditMinor, currency),
      currentBalance: minorToDecimal(minorMetrics.currentBalanceMinor, currency),
    };
  }
}
