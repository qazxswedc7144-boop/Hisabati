import { db } from '@/core/database/db';
import { Transaction, Account } from '@/shared/types';
import {
  FinancialHealthSummary,
  AgingBucket,
  AgingBucketKey,
  CashFlowTrend,
  HealthGrade,
} from '@/shared/types/bi.types';
import {
  toMinorUnits,
  fromMinorUnits,
  computeAccountMetricsFromTransactions,
} from '@/core/utils/financial';

/**
 * FinancialHealthEngine
 * An independent, strictly READ-ONLY engine for computing financial health indicators,
 * debt aging schedules, and business intelligence metrics.
 *
 * Rules:
 * 1. Transactions are the absolute Source of Truth.
 * 2. All internal calculations are performed using Minor Units (integers).
 * 3. FORBIDDEN from mutating, creating, or deleting any database records.
 */
export class FinancialHealthEngine {
  private static instance: FinancialHealthEngine;

  public static getInstance(): FinancialHealthEngine {
    if (!FinancialHealthEngine.instance) {
      FinancialHealthEngine.instance = new FinancialHealthEngine();
    }
    return FinancialHealthEngine.instance;
  }

  /**
   * Computes complete financial health summary from the database.
   * Can accept optional pre-loaded transactions and accounts for offline/testing scenarios.
   */
  public async computeHealthSummary(
    customTransactions?: Transaction[],
    customAccounts?: Account[]
  ): Promise<FinancialHealthSummary> {
    const transactions = customTransactions ?? (await db.transactions.toArray());
    const accounts = customAccounts ?? (await db.accounts.toArray());

    // 1. Group transactions by account
    const txByAccount = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = txByAccount.get(tx.accountId) ?? [];
      list.push(tx);
      txByAccount.set(tx.accountId, list);
    }

    let totalReceivablesMinor = 0;
    let totalPayablesMinor = 0;
    let debtorCount = 0;
    let creditorCount = 0;
    let balancedCount = 0;

    // Track active debtor balances for aging analysis
    const debtorAccountBalances: Array<{
      accountId: string;
      accountName: string;
      balanceMinor: number;
      transactions: Transaction[];
    }> = [];

    // 2. Compute individual account balances from transactions
    for (const acc of accounts) {
      const accTxs = txByAccount.get(acc.id) ?? [];
      const metrics = computeAccountMetricsFromTransactions(accTxs);
      const balanceMinor = toMinorUnits(metrics.currentBalance);

      if (balanceMinor > 0) {
        // Debtor: owes money to the user (Receivable)
        totalReceivablesMinor += balanceMinor;
        debtorCount++;
        debtorAccountBalances.push({
          accountId: acc.id,
          accountName: acc.name,
          balanceMinor,
          transactions: accTxs,
        });
      } else if (balanceMinor < 0) {
        // Creditor: user owes money to them (Payable)
        totalPayablesMinor += Math.abs(balanceMinor);
        creditorCount++;
      } else {
        balancedCount++;
      }
    }

    // Net Financial Position
    const netPositionMinor = totalReceivablesMinor - totalPayablesMinor;
    const totalReceivables = fromMinorUnits(totalReceivablesMinor);
    const totalPayables = fromMinorUnits(totalPayablesMinor);
    const netPosition = fromMinorUnits(netPositionMinor);

    // 3. Collection Rate
    // Formula: Total Collections (Credits) / Total Debt Issued (Debits)
    let totalDebitsIssuedMinor = 0;
    let totalCreditsCollectedMinor = 0;

    for (const tx of transactions) {
      const units = toMinorUnits(Math.abs(tx.amount));
      if (tx.type === 'debit') {
        totalDebitsIssuedMinor += units;
      } else {
        totalCreditsCollectedMinor += units;
      }
    }

    let collectionRate = 100;
    if (totalDebitsIssuedMinor > 0) {
      collectionRate = Math.min(
        100,
        Math.round((totalCreditsCollectedMinor / totalDebitsIssuedMinor) * 1000) / 10
      );
    }

    // 4. Aging Schedule (FIFO matching of active debts)
    const agingBreakdown = this.computeAgingBreakdown(debtorAccountBalances, totalReceivablesMinor);

    // Overdue debt ratio (> 30 days)
    const overdueMinor =
      agingBreakdown['31_60'].amountMinor +
      agingBreakdown['61_90'].amountMinor +
      agingBreakdown['90_PLUS'].amountMinor;

    const overdueDebtRatio =
      totalReceivablesMinor > 0
        ? Math.round((overdueMinor / totalReceivablesMinor) * 1000) / 10
        : 0;

    // 5. Cash Flow Trend
    const cashFlowTrend = this.computeQuickTrend(transactions);

    // 6. Overall Financial Health Score & Grade
    const { score, grade, statusAr } = this.calculateHealthScoreAndGrade({
      totalReceivablesMinor,
      totalPayablesMinor,
      netPositionMinor,
      collectionRate,
      overdueDebtRatio,
      debtorCount,
      creditorCount,
    });

    return {
      totalReceivables,
      totalReceivablesMinor,
      totalPayables,
      totalPayablesMinor,
      netPosition,
      netPositionMinor,
      collectionRate,
      overdueDebtRatio,
      debtorCount,
      creditorCount,
      balancedCount,
      totalAccounts: accounts.length,
      agingBreakdown,
      cashFlowTrend,
      healthScore: score,
      healthGrade: grade,
      healthStatusAr: statusAr,
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Computes FIFO aging schedule for all accounts with an outstanding balance.
   */
  private computeAgingBreakdown(
    debtorAccounts: Array<{
      accountId: string;
      accountName: string;
      balanceMinor: number;
      transactions: Transaction[];
    }>,
    totalReceivablesMinor: number
  ): Record<AgingBucketKey, AgingBucket> {
    const buckets: Record<AgingBucketKey, { minor: number; accounts: Set<string> }> = {
      '0_30': { minor: 0, accounts: new Set() },
      '31_60': { minor: 0, accounts: new Set() },
      '61_90': { minor: 0, accounts: new Set() },
      '90_PLUS': { minor: 0, accounts: new Set() },
    };

    const now = new Date().getTime();

    for (const { accountId, balanceMinor, transactions } of debtorAccounts) {
      // Sort debit transactions newest first to apply FIFO to active remaining balance
      const debitTxs = transactions
        .filter((t) => t.type === 'debit')
        .sort((a, b) => b.date.localeCompare(a.date));

      let remainingToAllocate = balanceMinor;

      for (const tx of debitTxs) {
        if (remainingToAllocate <= 0) break;

        const txUnits = toMinorUnits(Math.abs(tx.amount));
        const allocatedUnits = Math.min(remainingToAllocate, txUnits);

        const txTime = new Date(tx.date).getTime();
        const diffDays = Math.max(0, Math.floor((now - txTime) / (1000 * 60 * 60 * 24)));

        let bucketKey: AgingBucketKey;
        if (diffDays <= 30) {
          bucketKey = '0_30';
        } else if (diffDays <= 60) {
          bucketKey = '31_60';
        } else if (diffDays <= 90) {
          bucketKey = '61_90';
        } else {
          bucketKey = '90_PLUS';
        }

        buckets[bucketKey].minor += allocatedUnits;
        buckets[bucketKey].accounts.add(accountId);
        remainingToAllocate -= allocatedUnits;
      }

      // If there's any remaining balance without matching debit txs, assign to 90_PLUS
      if (remainingToAllocate > 0) {
        buckets['90_PLUS'].minor += remainingToAllocate;
        buckets['90_PLUS'].accounts.add(accountId);
      }
    }

    const formatBucket = (key: AgingBucketKey, labelAr: string): AgingBucket => {
      const minor = buckets[key].minor;
      const amount = fromMinorUnits(minor);
      const percentage =
        totalReceivablesMinor > 0
          ? Math.round((minor / totalReceivablesMinor) * 1000) / 10
          : 0;

      return {
        bucket: key,
        labelAr,
        amount,
        amountMinor: minor,
        percentage,
        accountCount: buckets[key].accounts.size,
      };
    };

    return {
      '0_30': formatBucket('0_30', '0 - 30 يوم (جارية)'),
      '31_60': formatBucket('31_60', '31 - 60 يوم (متوسطة)'),
      '61_90': formatBucket('61_90', '61 - 90 يوم (متأخرة)'),
      '90_PLUS': formatBucket('90_PLUS', 'أكثر من 90 يوم (حرجة)'),
    };
  }

  /**
   * Determines direction of net cash flow over the recent activity.
   */
  private computeQuickTrend(transactions: Transaction[]): CashFlowTrend {
    if (transactions.length < 2) return 'stable';

    const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date));
    const mid = Math.floor(sorted.length / 2);
    const older = sorted.slice(0, mid);
    const recent = sorted.slice(mid);

    const calcNet = (txs: Transaction[]) =>
      txs.reduce((sum, tx) => {
        const units = toMinorUnits(Math.abs(tx.amount));
        return tx.type === 'credit' ? sum + units : sum - units;
      }, 0);

    const olderNet = calcNet(older);
    const recentNet = calcNet(recent);

    if (recentNet > olderNet + 1000) return 'upward';
    if (recentNet < olderNet - 1000) return 'downward';
    return 'stable';
  }

  /**
   * Deterministic Health Score Calculation (0 - 100)
   */
  private calculateHealthScoreAndGrade(params: {
    totalReceivablesMinor: number;
    totalPayablesMinor: number;
    netPositionMinor: number;
    collectionRate: number;
    overdueDebtRatio: number;
    debtorCount: number;
    creditorCount: number;
  }): { score: number; grade: HealthGrade; statusAr: string } {
    const {
      totalReceivablesMinor,
      totalPayablesMinor,
      netPositionMinor,
      collectionRate,
      overdueDebtRatio,
    } = params;

    // Edge case: completely empty database
    if (totalReceivablesMinor === 0 && totalPayablesMinor === 0) {
      return {
        score: 100,
        grade: 'A',
        statusAr: 'مستقر - لا توجد التزامات أو ديون معلقة',
      };
    }

    let score = 70; // Baseline

    // 1. Solvency / Net Position Component (+/- 15)
    if (netPositionMinor > 0) {
      score += 15;
    } else if (netPositionMinor < 0) {
      const deficitRatio = Math.abs(netPositionMinor) / (totalReceivablesMinor || 1);
      score -= Math.min(25, Math.round(deficitRatio * 20));
    }

    // 2. Collection Rate Component (+/- 15)
    if (collectionRate >= 80) {
      score += 15;
    } else if (collectionRate >= 60) {
      score += 5;
    } else {
      score -= Math.round((60 - collectionRate) * 0.5);
    }

    // 3. Overdue Debt Penalty (-20 max)
    if (overdueDebtRatio > 50) {
      score -= 25;
    } else if (overdueDebtRatio > 30) {
      score -= 15;
    } else if (overdueDebtRatio > 15) {
      score -= 5;
    }

    // Clamp score to [0, 100]
    score = Math.max(0, Math.min(100, Math.round(score)));

    let grade: HealthGrade = 'B';
    let statusAr = 'جيد جداً - وضع مالي مستقر';

    if (score >= 85) {
      grade = 'A';
      statusAr = 'ممتاز - سيولة قوية وتحصيل منتظم';
    } else if (score >= 70) {
      grade = 'B';
      statusAr = 'جيد جداً - وضع مالي مستقر ومخاطر منخفضة';
    } else if (score >= 50) {
      grade = 'C';
      statusAr = 'مقبول - ينصح بمتابعة تحصيل الديون المتأخرة';
    } else {
      grade = 'D';
      statusAr = 'حرج - ارتفاع نسبة الديون المتأخرة والالتزامات';
    }

    return { score, grade, statusAr };
  }
}

export const financialHealthEngine = FinancialHealthEngine.getInstance();
