import { accountRepository } from '../repositories/account.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { settingsRepository } from '../repositories/settings.repository';
import {
  Account,
  AccountStatementItem,
  AccountStatementReport,
  CurrencyCode,
  DatePreset,
  DateRange,
  FinancialSummaryReport,
  DailyFinancialMetric,
  PayablesReport,
  PayablesReportItem,
  ReceivablesReport,
  ReceivablesReportItem,
  TopAccountsReport,
  Transaction,
} from '@/shared/types';
import {
  toMinorUnits,
  fromMinorUnits,
} from '../utils/financial';
import { resolveDateRange } from '../utils/dateRange';
import { getCurrencyDecimals } from '../money/currency';
import { isValidMinorUnit } from '../money/converter';

export interface StatementFilterOptions {
  startDate?: string;
  endDate?: string;
  preset?: DatePreset;
  search?: string;
}

export interface SummaryFilterOptions {
  startDate?: string;
  endDate?: string;
  preset?: DatePreset;
}

export interface AccountsReportFilterOptions {
  search?: string;
  includeArchived?: boolean;
  minBalance?: number;
}

/*
 * Phase B & C Financial Architecture:
 * Canonical integer minor units (amountMinor, currentBalanceMinor, initialBalanceMinor).
 * All financial arithmetic is performed strictly on integer minor units.
 * Floating point decimals are derived only at the final step for presentation.
 */

type TransactionFinancial = Transaction & {
  amountMinor?: number;
};

type AccountFinancial = Account & {
  initialBalanceMinor?: number;
  currentBalanceMinor?: number;
  initialBalance?: number;
};

/**
 * Resolves active currency and effective decimal places for reports.
 * If an account has fractional transactions, enforces 2 decimal places to prevent truncation.
 */
const resolveReportDecimals = async (
  options?: { transactions?: Transaction[]; hasFractions?: boolean }
): Promise<{ currency: CurrencyCode; decimals: number }> => {
  const activeCurrency = (await settingsRepository.get<CurrencyCode>('currency', 'YER')) || 'YER';
  const currencyDecimals = getCurrencyDecimals(activeCurrency);
  const hasFractions = Boolean(
    options?.hasFractions ||
    options?.transactions?.some((t) => t.amount % 1 !== 0)
  );
  const decimals = hasFractions ? Math.max(currencyDecimals, 2) : currencyDecimals;
  return { currency: activeCurrency, decimals };
};

/**
 * Extracts the canonical integer minor units from a transaction.
 * Primary source of truth: `transaction.amountMinor`.
 * Fallback (for legacy un-migrated records only): `toMinorUnits(Math.abs(transaction.amount))`.
 */
const getTransactionMinorUnits = (transaction: Transaction): number => {
  const item = transaction as TransactionFinancial;

  if (
    typeof item.amountMinor === 'number' &&
    Number.isFinite(item.amountMinor) &&
    Number.isInteger(item.amountMinor)
  ) {
    return Math.abs(item.amountMinor);
  }

  // Safe fallback for legacy records missing amountMinor
  if (typeof transaction.amount === 'number' && Number.isFinite(transaction.amount)) {
    return toMinorUnits(Math.abs(transaction.amount));
  }

  return 0;
};

/**
 * Extracts the initial balance in minor units from an account.
 * Primary source of truth: `account.initialBalanceMinor`.
 * Fallback: `toMinorUnits(account.initialBalance)`.
 */
const getAccountInitialBalanceMinor = (account: Account): number => {
  const item = account as AccountFinancial;

  if (
    typeof item.initialBalanceMinor === 'number' &&
    Number.isFinite(item.initialBalanceMinor) &&
    Number.isInteger(item.initialBalanceMinor)
  ) {
    return item.initialBalanceMinor;
  }

  if (
    typeof item.initialBalance === 'number' &&
    Number.isFinite(item.initialBalance)
  ) {
    return toMinorUnits(item.initialBalance);
  }

  return 0;
};

/**
 * Extracts current balance in minor units from an account.
 * Primary source of truth: `account.currentBalanceMinor`.
 * Fallback: `toMinorUnits(account.currentBalance)`.
 */
const getAccountCurrentBalanceMinor = (account: Account): number => {
  const item = account as AccountFinancial;

  if (
    typeof item.currentBalanceMinor === 'number' &&
    Number.isFinite(item.currentBalanceMinor) &&
    Number.isInteger(item.currentBalanceMinor)
  ) {
    return item.currentBalanceMinor;
  }

  if (
    typeof account.currentBalance === 'number' &&
    Number.isFinite(account.currentBalance)
  ) {
    return toMinorUnits(account.currentBalance);
  }

  return 0;
};

/**
 * Matches transactions against a search string for presentation filtering.
 * Never alters running balance or period totals.
 */
const matchesTransactionSearch = (
  transaction: Transaction,
  search: string
): boolean => {
  const query = search.trim().toLowerCase();
  if (!query) return true;

  const amountText = transaction.amount.toString();
  const minorText =
    transaction.amountMinor !== undefined ? transaction.amountMinor.toString() : '';

  return Boolean(
    transaction.note?.toLowerCase().includes(query) ||
      transaction.receiptNumber?.toLowerCase().includes(query) ||
      amountText.includes(query) ||
      (minorText && minorText.includes(query))
  );
};

export class ReportService {
  /**
   * Generates a deterministic, audit-ready Account Statement.
   *
   * Opening balance =
   *   explicit historical initial balance (initialBalanceMinor)
   *   + all signed transactions strictly before report startDate.
   *
   * Running balance =
   *   openingBalanceMinor + sum(debitMinor) - sum(creditMinor)
   *   calculated chronologically over ALL transactions in the period.
   *
   * Search filtering:
   *   Affects displayed items only.
   *   Does NOT mutate opening, closing, running balance, or period totals.
   */
  public async getAccountStatement(
    accountId: string,
    options: StatementFilterOptions = {}
  ): Promise<AccountStatementReport> {
    const account = await accountRepository.getById(accountId);

    if (!account) {
      throw new Error(`الحساب غير موجود: ${accountId}`);
    }

    const preset = options.preset || 'all';
    const dateRange = resolveDateRange(preset, {
      startDate: options.startDate,
      endDate: options.endDate,
    });

    const allTransactions = await transactionRepository.getByAccountId(
      accountId
    );

    const { decimals } = await resolveReportDecimals({ transactions: allTransactions });

    const getTrxAmountMinor = (trx: Transaction): number => {
      if (decimals === 2 && allTransactions.some((t) => t.amount % 1 !== 0)) {
        if (
          trx.amountMinor !== undefined &&
          isValidMinorUnit(trx.amountMinor) &&
          Math.abs(trx.amountMinor) === Math.round(Math.abs(trx.amount) * 100)
        ) {
          return Math.abs(trx.amountMinor);
        }
        return toMinorUnits(Math.abs(trx.amount), 2);
      }
      return getTransactionMinorUnits(trx);
    };

    // Initial balance from account metadata (if present)
    let initialBalanceMinor = getAccountInitialBalanceMinor(account);
    const accFinancial = account as AccountFinancial;
    if (decimals === 2 && allTransactions.some((t) => t.amount % 1 !== 0)) {
      if (typeof accFinancial.initialBalance === 'number' && Number.isFinite(accFinancial.initialBalance)) {
        initialBalanceMinor = toMinorUnits(accFinancial.initialBalance, 2);
      }
    }

    // Opening balance accumulates initial balance + all historical transactions strictly before startDate
    let openingBalanceMinor = initialBalanceMinor;
    const periodTransactions: Transaction[] = [];

    for (const trx of allTransactions) {
      const trxAmountMinor = getTrxAmountMinor(trx);

      if (trx.date < dateRange.startDate) {
        if (trx.type === 'debit') {
          openingBalanceMinor += trxAmountMinor;
        } else {
          openingBalanceMinor -= trxAmountMinor;
        }
      } else if (trx.date <= dateRange.endDate) {
        periodTransactions.push(trx);
      }
    }

    // Deterministic ordering: 1) date, 2) createdAt, 3) id
    periodTransactions.sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;

      const createdComp = (a.createdAt || '').localeCompare(b.createdAt || '');
      if (createdComp !== 0) return createdComp;

      return (a.id || '').localeCompare(b.id || '');
    });

    // Running balance starts at openingBalanceMinor and progresses chronologically across ALL period transactions
    let runningBalanceMinor = openingBalanceMinor;
    let periodDebitMinor = 0;
    let periodCreditMinor = 0;

    const statementItems: AccountStatementItem[] = [];

    for (const trx of periodTransactions) {
      const trxAmountMinor = getTrxAmountMinor(trx);
      const isDebit = trx.type === 'debit';

      if (isDebit) {
        runningBalanceMinor += trxAmountMinor;
        periodDebitMinor += trxAmountMinor;
      } else {
        runningBalanceMinor -= trxAmountMinor;
        periodCreditMinor += trxAmountMinor;
      }

      /*
       * PART 3 — Search Filter:
       * Search affects presentation only!
       * runningBalanceMinor, periodDebitMinor, and periodCreditMinor
       * are updated for ALL transactions in the period regardless of search query.
       */
      if (!matchesTransactionSearch(trx, options.search || '')) {
        continue;
      }

      statementItems.push({
        id: trx.id,
        date: trx.date,
        note: trx.note,
        receiptNumber: trx.receiptNumber,
        type: trx.type,
        amount: trx.amount,
        debitAmount: isDebit ? fromMinorUnits(trxAmountMinor, decimals) : 0,
        creditAmount: !isDebit ? fromMinorUnits(trxAmountMinor, decimals) : 0,
        runningBalance: fromMinorUnits(runningBalanceMinor, decimals),
        receiptId: trx.receiptId,
        documentRef: trx.documentRef,
        documentMetadata: trx.documentMetadata,
      });
    }

    const totalPeriodDebit = fromMinorUnits(periodDebitMinor, decimals);
    const totalPeriodCredit = fromMinorUnits(periodCreditMinor, decimals);
    const periodNetMovementMinor = periodDebitMinor - periodCreditMinor;
    const periodNetMovement = fromMinorUnits(periodNetMovementMinor, decimals);
    const openingBalance = fromMinorUnits(openingBalanceMinor, decimals);
    const closingBalanceMinor = openingBalanceMinor + periodNetMovementMinor;
    const closingBalance = fromMinorUnits(closingBalanceMinor, decimals);

    return {
      account,
      dateRange,
      preset,
      generatedAt: new Date().toISOString(),
      openingBalance,
      totalPeriodDebit,
      totalPeriodCredit,
      periodNetMovement,
      closingBalance,
      transactionCount: periodTransactions.length,
      transactions: statementItems,
    };
  }

  /**
   * Computes comprehensive Financial Summary and Period Activity.
   * All aggregations are performed strictly using integer minor units.
   */
  public async getFinancialSummary(
    options: SummaryFilterOptions = {}
  ): Promise<FinancialSummaryReport> {
    const preset = options.preset || 'this_month';

    const dateRange = resolveDateRange(preset, {
      startDate: options.startDate,
      endDate: options.endDate,
    });

    const [accounts, allTransactions] = await Promise.all([
      accountRepository.getAll(true),
      transactionRepository.getAll(),
    ]);

    const periodTransactions = allTransactions.filter(
      (transaction) =>
        transaction.date >= dateRange.startDate &&
        transaction.date <= dateRange.endDate
    );

    const { decimals } = await resolveReportDecimals({ transactions: periodTransactions });

    let periodDebitMinor = 0;
    let periodCreditMinor = 0;

    const dailyMap = new Map<
      string,
      { debitMinor: number; creditMinor: number; count: number }
    >();

    for (const trx of periodTransactions) {
      const trxAmountMinor = getTransactionMinorUnits(trx);

      if (trx.type === 'debit') {
        periodDebitMinor += trxAmountMinor;
      } else {
        periodCreditMinor += trxAmountMinor;
      }

      const existingDay =
        dailyMap.get(trx.date) || {
          debitMinor: 0,
          creditMinor: 0,
          count: 0,
        };

      if (trx.type === 'debit') {
        existingDay.debitMinor += trxAmountMinor;
      } else {
        existingDay.creditMinor += trxAmountMinor;
      }

      existingDay.count += 1;
      dailyMap.set(trx.date, existingDay);
    }

    const dailyBreakdown: DailyFinancialMetric[] = Array.from(
      dailyMap.entries()
    )
      .map(([date, data]) => ({
        date,
        debit: fromMinorUnits(data.debitMinor, decimals),
        credit: fromMinorUnits(data.creditMinor, decimals),
        net: fromMinorUnits(data.debitMinor - data.creditMinor, decimals),
        transactionCount: data.count,
        debitMinor: data.debitMinor,
        creditMinor: data.creditMinor,
        netMinor: data.debitMinor - data.creditMinor,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    let owedToMeTotalMinor = 0;
    let owedToMeCount = 0;
    let owedByMeTotalMinor = 0;
    let owedByMeCount = 0;
    let settledAccountsCount = 0;
    let activeAccountsCount = 0;

    for (const acc of accounts) {
      if (!acc.archived) activeAccountsCount++;

      const balanceMinor = getAccountCurrentBalanceMinor(acc);

      if (balanceMinor > 0) {
        owedToMeTotalMinor += balanceMinor;
        owedToMeCount++;
      } else if (balanceMinor < 0) {
        owedByMeTotalMinor += Math.abs(balanceMinor);
        owedByMeCount++;
      } else {
        settledAccountsCount++;
      }
    }

    return {
      dateRange,
      preset,
      generatedAt: new Date().toISOString(),
      totalDebit: fromMinorUnits(periodDebitMinor, decimals),
      totalCredit: fromMinorUnits(periodCreditMinor, decimals),
      netBalance: fromMinorUnits(
        periodDebitMinor - periodCreditMinor,
        decimals
      ),
      totalTransactions: periodTransactions.length,
      totalAccounts: accounts.length,
      activeAccountsCount,
      owedToMeTotal: fromMinorUnits(owedToMeTotalMinor, decimals),
      owedToMeCount,
      owedByMeTotal: fromMinorUnits(owedByMeTotalMinor, decimals),
      owedByMeCount,
      settledAccountsCount,
      dailyBreakdown,
      periodDebitMinor,
      periodCreditMinor,
      netMinor: periodDebitMinor - periodCreditMinor,
      owedToMeTotalMinor,
      owedByMeTotalMinor,
    };
  }

  /**
   * Generates Receivables Report (المدينون - مستحقات لك).
   * Calculates balances and sharePercentage with integer minor precision.
   */
  public async getReceivablesReport(
    options: AccountsReportFilterOptions = {}
  ): Promise<ReceivablesReport> {
    const { decimals } = await resolveReportDecimals();

    const accounts = await accountRepository.getAll(
      options.includeArchived ?? false
    );

    // All active/eligible receivable accounts (balance > 0)
    const allReceivableAccounts = accounts.filter(
      (account) => getAccountCurrentBalanceMinor(account) > 0
    );

    let overallTotalAmountMinor = 0;
    for (const account of allReceivableAccounts) {
      overallTotalAmountMinor += getAccountCurrentBalanceMinor(account);
    }
    const overallAccountsCount = allReceivableAccounts.length;
    const overallTotalAmount = fromMinorUnits(overallTotalAmountMinor, decimals);

    let filtered = allReceivableAccounts;

    if (options.minBalance && options.minBalance > 0) {
      const minMinor = toMinorUnits(options.minBalance, decimals);

      filtered = filtered.filter(
        (account) =>
          getAccountCurrentBalanceMinor(account) >= minMinor
      );
    }

    if (options.search && options.search.trim()) {
      const query = options.search.trim().toLowerCase();

      filtered = filtered.filter(
        (account) =>
          account.name.toLowerCase().includes(query) ||
          account.phone?.includes(query)
      );
    }

    // Sort descending by current balance minor with deterministic tie-breaker
    filtered.sort((a, b) => {
      const diff =
        getAccountCurrentBalanceMinor(b) -
        getAccountCurrentBalanceMinor(a);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'ar') || a.id.localeCompare(b.id);
    });

    let totalAmountMinor = 0;
    for (const account of filtered) {
      totalAmountMinor += getAccountCurrentBalanceMinor(account);
    }

    const totalAmount = fromMinorUnits(totalAmountMinor, decimals);

    // Base denominator for share percentage calculation: use overall portfolio total if available, otherwise filtered total
    const baseTotalMinor =
      overallTotalAmountMinor > 0 ? overallTotalAmountMinor : totalAmountMinor;

    const items: ReceivablesReportItem[] = filtered.map((account) => {
      const balanceMinor = getAccountCurrentBalanceMinor(account);
      const balance =
        typeof account.currentBalance === 'number' && Number.isFinite(account.currentBalance)
          ? Math.abs(account.currentBalance)
          : fromMinorUnits(balanceMinor, decimals);
      const sharePercentage =
        baseTotalMinor > 0
          ? (balanceMinor / baseTotalMinor) * 100
          : 0;

      return {
        account,
        balance,
        balanceMinor,
        transactionCount: account.transactionCount,
        lastTransactionDate: account.lastTransactionDate || account.updatedAt,
        sharePercentage: Math.round(sharePercentage * 10) / 10,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalAmount,
      totalAmountMinor,
      accountsCount: items.length,
      overallTotalAmount,
      overallTotalAmountMinor,
      overallAccountsCount,
      items,
    };
  }

  /**
   * Generates Payables Report (الدائنون - ديون عليك).
   * Calculates balances and sharePercentage with integer minor precision.
   */
  public async getPayablesReport(
    options: AccountsReportFilterOptions = {}
  ): Promise<PayablesReport> {
    const { decimals } = await resolveReportDecimals();

    const accounts = await accountRepository.getAll(
      options.includeArchived ?? false
    );

    // All active/eligible payable accounts (balance < 0)
    const allPayableAccounts = accounts.filter(
      (account) => getAccountCurrentBalanceMinor(account) < 0
    );

    let overallTotalAmountMinor = 0;
    for (const account of allPayableAccounts) {
      overallTotalAmountMinor += Math.abs(getAccountCurrentBalanceMinor(account));
    }
    const overallAccountsCount = allPayableAccounts.length;
    const overallTotalAmount = fromMinorUnits(overallTotalAmountMinor, decimals);

    let filtered = allPayableAccounts;

    if (options.minBalance && options.minBalance > 0) {
      const minMinor = toMinorUnits(options.minBalance, decimals);

      filtered = filtered.filter(
        (account) =>
          Math.abs(getAccountCurrentBalanceMinor(account)) >= minMinor
      );
    }

    if (options.search && options.search.trim()) {
      const query = options.search.trim().toLowerCase();

      filtered = filtered.filter(
        (account) =>
          account.name.toLowerCase().includes(query) ||
          account.phone?.includes(query)
      );
    }

    // Sort descending by absolute debt magnitude minor with deterministic tie-breaker
    filtered.sort((a, b) => {
      const diff =
        Math.abs(getAccountCurrentBalanceMinor(b)) -
        Math.abs(getAccountCurrentBalanceMinor(a));
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, 'ar') || a.id.localeCompare(b.id);
    });

    let totalAmountMinor = 0;
    for (const account of filtered) {
      totalAmountMinor += Math.abs(getAccountCurrentBalanceMinor(account));
    }

    const totalAmount = fromMinorUnits(totalAmountMinor, decimals);

    // Base denominator for share percentage calculation
    const baseTotalMinor =
      overallTotalAmountMinor > 0 ? overallTotalAmountMinor : totalAmountMinor;

    const items: PayablesReportItem[] = filtered.map((account) => {
      const magnitudeMinor = Math.abs(
        getAccountCurrentBalanceMinor(account)
      );
      const balance =
        typeof account.currentBalance === 'number' && Number.isFinite(account.currentBalance)
          ? Math.abs(account.currentBalance)
          : fromMinorUnits(magnitudeMinor, decimals);
      const sharePercentage =
        baseTotalMinor > 0
          ? (magnitudeMinor / baseTotalMinor) * 100
          : 0;

      return {
        account,
        balance,
        balanceMinor: magnitudeMinor,
        transactionCount: account.transactionCount,
        lastTransactionDate: account.lastTransactionDate || account.updatedAt,
        sharePercentage: Math.round(sharePercentage * 10) / 10,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalAmount,
      totalAmountMinor,
      accountsCount: items.length,
      overallTotalAmount,
      overallTotalAmountMinor,
      overallAccountsCount,
      items,
    };
  }

  /**
   * Returns Top Debtors and Top Creditors.
   */
  public async getTopAccountsReport(
    limit: number = 5
  ): Promise<TopAccountsReport> {
    const [receivablesReport, payablesReport] = await Promise.all([
      this.getReceivablesReport({ includeArchived: false }),
      this.getPayablesReport({ includeArchived: false }),
    ]);

    return {
      topDebtors: receivablesReport.items.slice(0, limit),
      topCreditors: payablesReport.items.slice(0, limit),
    };
  }
}

export const reportService = new ReportService();
