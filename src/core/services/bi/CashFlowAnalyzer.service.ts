import { db } from '@/core/database/db';
import { Transaction } from '@/shared/types';
import {
  CashFlowAnalysis,
  CashFlowDataPoint,
  CashFlowInterval,
  CashFlowTrend,
} from '@/shared/types/bi.types';
import { toMinorUnits, fromMinorUnits } from '@/core/utils/financial';

/**
 * CashFlowAnalyzer
 * Analyzes cash flow velocity, inflows, outflows, and net balances by Day, Week, or Month.
 * Pure Read-Only Service based strictly on transactions as the single source of truth.
 */
export class CashFlowAnalyzer {
  private static instance: CashFlowAnalyzer;

  public static getInstance(): CashFlowAnalyzer {
    if (!CashFlowAnalyzer.instance) {
      CashFlowAnalyzer.instance = new CashFlowAnalyzer();
    }
    return CashFlowAnalyzer.instance;
  }

  /**
   * Generates a cash flow report for the requested interval ('daily' | 'weekly' | 'monthly').
   */
  public async analyze(
    interval: CashFlowInterval = 'monthly',
    customTransactions?: Transaction[],
    limitPeriods: number = 12
  ): Promise<CashFlowAnalysis> {
    const transactions = customTransactions ?? (await db.transactions.toArray());

    // Sort transactions chronologically (oldest to newest)
    const sorted = [...transactions].sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      return cmp !== 0 ? cmp : a.createdAt.localeCompare(b.createdAt);
    });

    // Group transactions by period key
    const groups = new Map<string, { txs: Transaction[]; labelAr: string }>();

    for (const tx of sorted) {
      const { key, labelAr } = this.getPeriodKey(tx.date, interval);
      const group = groups.get(key) ?? { txs: [], labelAr };
      group.txs.push(tx);
      groups.set(key, group);
    }

    // Convert groups to sorted data points
    const sortedKeys = Array.from(groups.keys()).sort();
    const effectiveKeys =
      sortedKeys.length > limitPeriods
        ? sortedKeys.slice(sortedKeys.length - limitPeriods)
        : sortedKeys;

    let cumulativeMinor = 0;
    let totalInflowMinor = 0;
    let totalOutflowMinor = 0;
    const dataPoints: CashFlowDataPoint[] = [];

    for (const key of effectiveKeys) {
      const group = groups.get(key)!;
      let periodInflowMinor = 0;
      let periodOutflowMinor = 0;

      for (const tx of group.txs) {
        const units = toMinorUnits(Math.abs(tx.amount));
        if (tx.type === 'credit') {
          periodInflowMinor += units;
        } else {
          periodOutflowMinor += units;
        }
      }

      const periodNetMinor = periodInflowMinor - periodOutflowMinor;
      cumulativeMinor += periodNetMinor;
      totalInflowMinor += periodInflowMinor;
      totalOutflowMinor += periodOutflowMinor;

      dataPoints.push({
        period: key,
        periodLabelAr: group.labelAr,
        inflow: fromMinorUnits(periodInflowMinor),
        inflowMinor: periodInflowMinor,
        outflow: fromMinorUnits(periodOutflowMinor),
        outflowMinor: periodOutflowMinor,
        netFlow: fromMinorUnits(periodNetMinor),
        netFlowMinor: periodNetMinor,
        cumulativeBalance: fromMinorUnits(cumulativeMinor),
        cumulativeBalanceMinor: cumulativeMinor,
        transactionCount: group.txs.length,
      });
    }

    const netCashFlowMinor = totalInflowMinor - totalOutflowMinor;
    const count = dataPoints.length || 1;
    const averageInflow = fromMinorUnits(Math.round(totalInflowMinor / count));
    const averageOutflow = fromMinorUnits(Math.round(totalOutflowMinor / count));

    // Calculate overall trend
    const trend = this.calculateTrend(dataPoints);

    return {
      interval,
      dataPoints,
      totalInflow: fromMinorUnits(totalInflowMinor),
      totalInflowMinor,
      totalOutflow: fromMinorUnits(totalOutflowMinor),
      totalOutflowMinor,
      netCashFlow: fromMinorUnits(netCashFlowMinor),
      netCashFlowMinor,
      averageInflow,
      averageOutflow,
      trend,
    };
  }

  /**
   * Helper to format grouping key and friendly Arabic period label.
   */
  private getPeriodKey(
    dateStr: string,
    interval: CashFlowInterval
  ): { key: string; labelAr: string } {
    const d = new Date(dateStr);
    const isValid = !isNaN(d.getTime());
    const safeDate = isValid ? d : new Date();

    const year = safeDate.getFullYear();
    const month = String(safeDate.getMonth() + 1).padStart(2, '0');
    const day = String(safeDate.getDate()).padStart(2, '0');

    if (interval === 'daily') {
      const key = `${year}-${month}-${day}`;
      return { key, labelAr: `${day}/${month}/${year}` };
    }

    if (interval === 'weekly') {
      // Calculate ISO week number
      const target = new Date(safeDate.valueOf());
      const dayNr = (safeDate.getDay() + 6) % 7;
      target.setDate(target.getDate() - dayNr + 3);
      const firstThursday = target.valueOf();
      target.setMonth(0, 1);
      if (target.getDay() !== 4) {
        target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
      }
      const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
      const key = `${year}-W${String(weekNumber).padStart(2, '0')}`;
      return { key, labelAr: `أسبوع ${weekNumber} (${year})` };
    }

    // monthly
    const arabicMonths = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    const key = `${year}-${month}`;
    const labelAr = `${arabicMonths[safeDate.getMonth()]} ${year}`;
    return { key, labelAr };
  }

  /**
   * Compares the momentum between the first and second half of the points.
   */
  private calculateTrend(dataPoints: CashFlowDataPoint[]): CashFlowTrend {
    if (dataPoints.length < 2) return 'stable';

    const mid = Math.floor(dataPoints.length / 2);
    const firstHalf = dataPoints.slice(0, mid);
    const secondHalf = dataPoints.slice(mid);

    const sumNet = (pts: CashFlowDataPoint[]) => pts.reduce((acc, p) => acc + p.netFlowMinor, 0);

    const firstNet = sumNet(firstHalf);
    const secondNet = sumNet(secondHalf);

    // Difference threshold in minor units (e.g. 50.00 currency units)
    const threshold = 5000;
    if (secondNet - firstNet > threshold) return 'upward';
    if (firstNet - secondNet > threshold) return 'downward';
    return 'stable';
  }
}

export const cashFlowAnalyzer = CashFlowAnalyzer.getInstance();
