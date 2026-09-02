import { accountRepository } from '../repositories/account.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import {
  Account,
  AccountStatementItem,
  AccountStatementReport,
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
import { toMinorUnits, fromMinorUnits, addMoney, subtractMoney } from '../utils/financial';
import { resolveDateRange } from '../utils/dateRange';

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

export class ReportService {
  /**
   * Generates a deterministic, audit-ready Account Statement with true historical Opening Balance.
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

    const allTransactions = await transactionRepository.getByAccountId(accountId);

    // 1. Calculate historical Opening Balance (all transactions before startDate)
    let openingDebitUnits = 0;
    let openingCreditUnits = 0;

    const periodTransactions: Transaction[] = [];

    for (const trx of allTransactions) {
      const trxAmountUnits = toMinorUnits(Math.abs(trx.amount));

      if (trx.date < dateRange.startDate) {
        if (trx.type === 'debit') {
          openingDebitUnits += trxAmountUnits;
        } else {
          openingCreditUnits += trxAmountUnits;
        }
      } else if (trx.date <= dateRange.endDate) {
        periodTransactions.push(trx);
      }
    }

    const openingBalanceUnits = openingDebitUnits - openingCreditUnits;
    const openingBalance = fromMinorUnits(openingBalanceUnits);

    // 2. Sort period transactions chronologically (oldest to newest for statement progression)
    periodTransactions.sort((a, b) => {
      const dateComp = a.date.localeCompare(b.date);
      if (dateComp !== 0) return dateComp;
      return a.createdAt.localeCompare(b.createdAt);
    });

    // 3. Compute progressive Running Balance for each period transaction
    let runningUnits = openingBalanceUnits;
    let totalPeriodDebitUnits = 0;
    let totalPeriodCreditUnits = 0;

    const statementItems: AccountStatementItem[] = [];

    for (const trx of periodTransactions) {
      const trxUnits = toMinorUnits(Math.abs(trx.amount));
      const isDebit = trx.type === 'debit';

      if (isDebit) {
        runningUnits += trxUnits;
        totalPeriodDebitUnits += trxUnits;
      } else {
        runningUnits -= trxUnits;
        totalPeriodCreditUnits += trxUnits;
      }

      // Check optional text search filter
      if (options.search && options.search.trim()) {
        const query = options.search.trim().toLowerCase();
        const matchesNote = trx.note?.toLowerCase().includes(query);
        const matchesReceipt = trx.receiptNumber?.toLowerCase().includes(query);
        const matchesAmount = trx.amount.toString().includes(query);
        if (!matchesNote && !matchesReceipt && !matchesAmount) {
          continue; // Skip from presentation list, but runningUnits calculation stays intact
        }
      }

      statementItems.push({
        id: trx.id,
        date: trx.date,
        note: trx.note,
        receiptNumber: trx.receiptNumber,
        type: trx.type,
        amount: trx.amount,
        debitAmount: isDebit ? trx.amount : 0,
        creditAmount: !isDebit ? trx.amount : 0,
        runningBalance: fromMinorUnits(runningUnits),
      });
    }

    const totalPeriodDebit = fromMinorUnits(totalPeriodDebitUnits);
    const totalPeriodCredit = fromMinorUnits(totalPeriodCreditUnits);
    const periodNetMovementUnits = totalPeriodDebitUnits - totalPeriodCreditUnits;
    const periodNetMovement = fromMinorUnits(periodNetMovementUnits);
    const closingBalance = fromMinorUnits(openingBalanceUnits + periodNetMovementUnits);

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
      transactionCount: statementItems.length,
      transactions: statementItems,
    };
  }

  /**
   * Computes comprehensive Financial Summary and Period Activity across all accounts.
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

    // Filter transactions within period
    const periodTransactions = allTransactions.filter(
      (t) => t.date >= dateRange.startDate && t.date <= dateRange.endDate
    );

    let periodDebitUnits = 0;
    let periodCreditUnits = 0;
    const dailyMap = new Map<string, { debitUnits: number; creditUnits: number; count: number }>();

    for (const trx of periodTransactions) {
      const units = toMinorUnits(Math.abs(trx.amount));
      if (trx.type === 'debit') {
        periodDebitUnits += units;
      } else {
        periodCreditUnits += units;
      }

      const existingDay = dailyMap.get(trx.date) || { debitUnits: 0, creditUnits: 0, count: 0 };
      if (trx.type === 'debit') {
        existingDay.debitUnits += units;
      } else {
        existingDay.creditUnits += units;
      }
      existingDay.count += 1;
      dailyMap.set(trx.date, existingDay);
    }

    // Convert daily metrics
    const dailyBreakdown: DailyFinancialMetric[] = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        date,
        debit: fromMinorUnits(data.debitUnits),
        credit: fromMinorUnits(data.creditUnits),
        net: fromMinorUnits(data.debitUnits - data.creditUnits),
        transactionCount: data.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Accounts distribution
    let owedToMeTotalUnits = 0;
    let owedToMeCount = 0;
    let owedByMeTotalUnits = 0;
    let owedByMeCount = 0;
    let settledAccountsCount = 0;
    let activeAccountsCount = 0;

    for (const acc of accounts) {
      if (!acc.archived) activeAccountsCount++;

      const balUnits = toMinorUnits(acc.currentBalance);
      if (balUnits > 0) {
        owedToMeTotalUnits += balUnits;
        owedToMeCount++;
      } else if (balUnits < 0) {
        owedByMeTotalUnits += Math.abs(balUnits);
        owedByMeCount++;
      } else {
        settledAccountsCount++;
      }
    }

    return {
      dateRange,
      preset,
      generatedAt: new Date().toISOString(),
      totalDebit: fromMinorUnits(periodDebitUnits),
      totalCredit: fromMinorUnits(periodCreditUnits),
      netBalance: fromMinorUnits(periodDebitUnits - periodCreditUnits),
      totalTransactions: periodTransactions.length,
      totalAccounts: accounts.length,
      activeAccountsCount,
      owedToMeTotal: fromMinorUnits(owedToMeTotalUnits),
      owedToMeCount,
      owedByMeTotal: fromMinorUnits(owedByMeTotalUnits),
      owedByMeCount,
      settledAccountsCount,
      dailyBreakdown,
    };
  }

  /**
   * Generates Receivables Report (ديون لك على الآخرين / Debit balances).
   */
  public async getReceivablesReport(
    options: AccountsReportFilterOptions = {}
  ): Promise<ReceivablesReport> {
    const accounts = await accountRepository.getAll(options.includeArchived ?? false);

    let filtered = accounts.filter((a) => a.currentBalance > 0);

    if (options.minBalance && options.minBalance > 0) {
      filtered = filtered.filter((a) => a.currentBalance >= options.minBalance!);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filtered = filtered.filter((a) => a.name.toLowerCase().includes(q) || a.phone?.includes(q));
    }

    // Sort by largest balance first
    filtered.sort((a, b) => b.currentBalance - a.currentBalance);

    let totalUnits = 0;
    for (const acc of filtered) {
      totalUnits += toMinorUnits(acc.currentBalance);
    }

    const totalAmount = fromMinorUnits(totalUnits);

    const items: ReceivablesReportItem[] = filtered.map((acc) => {
      const sharePercentage = totalAmount > 0 ? (acc.currentBalance / totalAmount) * 100 : 0;
      return {
        account: acc,
        balance: acc.currentBalance,
        transactionCount: acc.transactionCount,
        lastTransactionDate: acc.updatedAt,
        sharePercentage: Math.round(sharePercentage * 10) / 10,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalAmount,
      accountsCount: items.length,
      items,
    };
  }

  /**
   * Generates Payables Report (ديون عليك للآخرين / Credit balances).
   */
  public async getPayablesReport(
    options: AccountsReportFilterOptions = {}
  ): Promise<PayablesReport> {
    const accounts = await accountRepository.getAll(options.includeArchived ?? false);

    let filtered = accounts.filter((a) => a.currentBalance < 0);

    if (options.minBalance && options.minBalance > 0) {
      filtered = filtered.filter((a) => Math.abs(a.currentBalance) >= options.minBalance!);
    }

    if (options.search && options.search.trim()) {
      const q = options.search.trim().toLowerCase();
      filtered = filtered.filter((a) => a.name.toLowerCase().includes(q) || a.phone?.includes(q));
    }

    // Sort by largest payable magnitude first
    filtered.sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance));

    let totalUnits = 0;
    for (const acc of filtered) {
      totalUnits += toMinorUnits(Math.abs(acc.currentBalance));
    }

    const totalAmount = fromMinorUnits(totalUnits);

    const items: PayablesReportItem[] = filtered.map((acc) => {
      const mag = Math.abs(acc.currentBalance);
      const sharePercentage = totalAmount > 0 ? (mag / totalAmount) * 100 : 0;
      return {
        account: acc,
        balance: mag,
        transactionCount: acc.transactionCount,
        lastTransactionDate: acc.updatedAt,
        sharePercentage: Math.round(sharePercentage * 10) / 10,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      totalAmount,
      accountsCount: items.length,
      items,
    };
  }

  /**
   * Returns Top 5 Debtors and Top 5 Creditors for quick analytics and rankings.
   */
  public async getTopAccountsReport(limit: number = 5): Promise<TopAccountsReport> {
    const [recReport, payReport] = await Promise.all([
      this.getReceivablesReport({ includeArchived: false }),
      this.getPayablesReport({ includeArchived: false }),
    ]);

    return {
      topDebtors: recReport.items.slice(0, limit),
      topCreditors: payReport.items.slice(0, limit),
    };
  }
}

export const reportService = new ReportService();
