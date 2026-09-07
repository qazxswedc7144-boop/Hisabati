import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { Account, Transaction } from '@/shared/types';
import {
  financialHealthEngine,
  cashFlowAnalyzer,
  financialRiskDetector,
  financialIntelligenceEngine,
} from '../services/bi';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export interface BITestResultItem {
  id: string;
  title: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface BITestSuiteSummary {
  passed: number;
  failed: number;
  total: number;
  durationMs: number;
  errors: string[];
  results: BITestResultItem[];
}

export async function runBITests(): Promise<BITestSuiteSummary> {
  const startTime = performance.now();
  let passed = 0;
  let failed = 0;
  const errors: string[] = [];
  const results: BITestResultItem[] = [];

  const test = async (name: string, fn: () => Promise<void>) => {
    const t0 = performance.now();
    const id = `bi-test-${results.length + 1}`;
    try {
      await fn();
      passed++;
      const durationMs = Math.round(performance.now() - t0);
      results.push({ id, title: name, passed: true, durationMs });
      console.log(`  ✓ ${name}`);
    } catch (err: any) {
      failed++;
      const durationMs = Math.round(performance.now() - t0);
      const msg = `  ✗ ${name}: ${err?.message || err}`;
      errors.push(msg);
      results.push({ id, title: name, passed: false, error: err?.message || String(err), durationMs });
      console.error(msg);
    }
  };

  console.log('--- [Phase 9 - Part 1] Business Intelligence & Financial Health Tests ---');

  // Helper to generate mock accounts and transactions
  const createMockAccount = (id: string, name: string): Account => ({
    id,
    name,
    phone: '770000000',
    category: 'customer',
    currentBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    transactionCount: 0,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const createMockTx = (
    id: string,
    accountId: string,
    amount: number,
    type: 'debit' | 'credit',
    dateOffsetDays: number = 0
  ): Transaction => {
    const txDate = new Date();
    txDate.setDate(txDate.getDate() - dateOffsetDays);
    const dateStr = txDate.toISOString().split('T')[0];

    return {
      id,
      accountId,
      amount,
      type,
      date: dateStr,
      note: `Test transaction ${id}`,
      createdAt: txDate.toISOString(),
      updatedAt: txDate.toISOString(),
    };
  };

  // 1. Zero / Empty State
  await test('1. Zero State: Handles empty database safely with 100 health score', async () => {
    const summary = await financialHealthEngine.computeHealthSummary([], []);
    assert(summary.totalReceivables === 0, 'Receivables should be 0');
    assert(summary.totalPayables === 0, 'Payables should be 0');
    assert(summary.netPosition === 0, 'Net position should be 0');
    assert(summary.debtorCount === 0, 'Debtor count should be 0');
    assert(summary.creditorCount === 0, 'Creditor count should be 0');
    assert(summary.healthScore === 100, 'Empty state health score should be 100');
    assert(summary.healthGrade === 'A', 'Empty state health grade should be A');

    const risks = await financialRiskDetector.detectRisks([], []);
    assert(risks.length === 0, 'No risks should be detected on empty state');

    const cashFlow = await cashFlowAnalyzer.analyze('monthly', [], 12);
    assert(cashFlow.dataPoints.length === 0, 'No cashflow points on empty state');
    assert(cashFlow.netCashFlow === 0, 'Net cash flow should be 0');
  });

  // 2. Deterministic Calculations with Minor Units
  await test('2. Minor Units & Net Position: Computes exact decimals without IEEE floating error', async () => {
    const acc1 = createMockAccount('acc-1', 'عميل الأمانة');
    const acc2 = createMockAccount('acc-2', 'مورد البركة');

    // acc1 owes user: 1500.25 (debit) - 500.10 (credit) = +1000.15 (debtor)
    const tx1 = createMockTx('tx-1', 'acc-1', 1500.25, 'debit', 2);
    const tx2 = createMockTx('tx-2', 'acc-1', 500.1, 'credit', 1);

    // user owes acc2: 400.00 (debit) - 900.50 (credit) = -500.50 (creditor)
    const tx3 = createMockTx('tx-3', 'acc-2', 400.0, 'debit', 5);
    const tx4 = createMockTx('tx-4', 'acc-2', 900.5, 'credit', 3);

    const summary = await financialHealthEngine.computeHealthSummary([tx1, tx2, tx3, tx4], [acc1, acc2]);

    assert(summary.totalReceivablesMinor === 100015, `Expected 100015 minor units, got ${summary.totalReceivablesMinor}`);
    assert(summary.totalReceivables === 1000.15, `Expected 1000.15, got ${summary.totalReceivables}`);

    assert(summary.totalPayablesMinor === 50050, `Expected 50050 minor units, got ${summary.totalPayablesMinor}`);
    assert(summary.totalPayables === 500.5, `Expected 500.5, got ${summary.totalPayables}`);

    // Net position: 1000.15 - 500.50 = 499.65
    assert(summary.netPositionMinor === 49965, `Expected 49965 minor, got ${summary.netPositionMinor}`);
    assert(summary.netPosition === 499.65, `Expected 499.65, got ${summary.netPosition}`);

    assert(summary.debtorCount === 1, 'Should have 1 debtor account');
    assert(summary.creditorCount === 1, 'Should have 1 creditor account');
    assert(summary.balancedCount === 0, 'Should have 0 balanced accounts');
  });

  // 3. Collection Rate
  await test('3. Collection Rate: Computes exact collection ratio from total debits and credits', async () => {
    const acc = createMockAccount('acc-coll', 'عميل التحصيل');
    // Total debit = 10,000, Total credit = 6,500 => collection rate = 65%
    const tx1 = createMockTx('tx-c1', 'acc-coll', 10000, 'debit', 10);
    const tx2 = createMockTx('tx-c2', 'acc-coll', 6500, 'credit', 2);

    const summary = await financialHealthEngine.computeHealthSummary([tx1, tx2], [acc]);
    assert(summary.collectionRate === 65, `Expected 65% collection rate, got ${summary.collectionRate}%`);
  });

  // 4. Aging Schedule (FIFO Bucketing)
  await test('4. Debt Aging Breakdown: Categorizes debts into 0-30, 31-60, 61-90, 90+ buckets', async () => {
    const acc = createMockAccount('acc-aging', 'عميل الآجال');
    // Total debit: 1000 (15 days ago), 2000 (45 days ago), 3000 (75 days ago), 4000 (100 days ago) = 10,000
    // Total credit: 0 => Balance = 10,000
    const tx1 = createMockTx('tx-a1', 'acc-aging', 1000, 'debit', 15);
    const tx2 = createMockTx('tx-a2', 'acc-aging', 2000, 'debit', 45);
    const tx3 = createMockTx('tx-a3', 'acc-aging', 3000, 'debit', 75);
    const tx4 = createMockTx('tx-a4', 'acc-aging', 4000, 'debit', 100);

    const summary = await financialHealthEngine.computeHealthSummary([tx1, tx2, tx3, tx4], [acc]);

    assert(summary.agingBreakdown['0_30'].amount === 1000, `0_30 bucket expected 1000, got ${summary.agingBreakdown['0_30'].amount}`);
    assert(summary.agingBreakdown['31_60'].amount === 2000, `31_60 bucket expected 2000, got ${summary.agingBreakdown['31_60'].amount}`);
    assert(summary.agingBreakdown['61_90'].amount === 3000, `61_90 bucket expected 3000, got ${summary.agingBreakdown['61_90'].amount}`);
    assert(summary.agingBreakdown['90_PLUS'].amount === 4000, `90_PLUS bucket expected 4000, got ${summary.agingBreakdown['90_PLUS'].amount}`);

    // Overdue debt ratio: (2000 + 3000 + 4000) / 10000 = 90%
    assert(summary.overdueDebtRatio === 90, `Expected 90% overdue ratio, got ${summary.overdueDebtRatio}%`);
  });

  // 5. CashFlowAnalyzer
  await test('5. CashFlowAnalyzer: Groups inflows and outflows by interval with cumulative flow', async () => {
    const tx1 = createMockTx('tx-cf1', 'acc-1', 500, 'debit', 20); // outflow
    const tx2 = createMockTx('tx-cf2', 'acc-1', 1200, 'credit', 10); // inflow
    const tx3 = createMockTx('tx-cf3', 'acc-1', 300, 'debit', 2); // outflow

    const analysis = await cashFlowAnalyzer.analyze('daily', [tx1, tx2, tx3]);

    assert(analysis.dataPoints.length === 3, `Expected 3 daily points, got ${analysis.dataPoints.length}`);
    assert(analysis.totalInflow === 1200, `Expected 1200 total inflow, got ${analysis.totalInflow}`);
    assert(analysis.totalOutflow === 800, `Expected 800 total outflow, got ${analysis.totalOutflow}`);
    assert(analysis.netCashFlow === 400, `Expected 400 net cash flow, got ${analysis.netCashFlow}`);
  });

  // 6. FinancialRiskDetector: Concentration Risk
  await test('6. Risk Detector: Identifies high concentration risk (>35% of total receivables)', async () => {
    const accBig = createMockAccount('acc-big', 'شركة الفخامة');
    const accSmall = createMockAccount('acc-small', 'محل النور');

    // accBig balance: 8,000 (80%), accSmall balance: 2,000 (20%)
    const txBig = createMockTx('tx-rb', 'acc-big', 8000, 'debit', 5);
    const txSmall = createMockTx('tx-rs', 'acc-small', 2000, 'debit', 5);

    const alerts = await financialRiskDetector.detectRisks([txBig, txSmall], [accBig, accSmall]);
    const concAlert = alerts.find((a) => a.category === 'CONCENTRATION');

    assert(concAlert !== undefined, 'Should trigger CONCENTRATION risk alert');
    assert(concAlert?.affectedAccountId === 'acc-big', 'Alert should identify acc-big');
    assert(concAlert?.severity === 'CRITICAL', 'Severity should be CRITICAL when >= 50%');
  });

  // 7. FinancialRiskDetector: Stagnant Debt & Deficit
  await test('7. Risk Detector: Detects stagnant accounts (>60 days without payment) and net deficit', async () => {
    const accStag = createMockAccount('acc-stag', 'عميل متأخر');
    const accSupplier = createMockAccount('acc-supp', 'مورد رئيسي');

    // accStag owes 5000 from 70 days ago with no payment
    const txStag = createMockTx('tx-stag', 'acc-stag', 5000, 'debit', 70);

    // user owes supplier 8000 (net deficit = 5000 - 8000 = -3000)
    const txSupp = createMockTx('tx-supp', 'acc-supp', 8000, 'credit', 10);

    const alerts = await financialRiskDetector.detectRisks([txStag, txSupp], [accStag, accSupplier]);

    const stagAlert = alerts.find((a) => a.category === 'STAGNANCY');
    assert(stagAlert !== undefined, 'Should detect STAGNANCY risk for account without payment for 70 days');

    const liqAlert = alerts.find((a) => a.category === 'LIQUIDITY');
    assert(liqAlert !== undefined, 'Should detect LIQUIDITY risk for negative net position');
  });

  // 8. Strict Read-Only Invariant Enforcement
  await test('8. Strict Read-Only Invariant: BI engine does not expose or execute any mutating methods', async () => {
    const checkNoMutationMethods = (instance: any, serviceName: string) => {
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(instance));
      const mutationPrefixes = ['create', 'add', 'update', 'delete', 'put', 'insert', 'remove', 'write', 'save', 'mutate'];

      for (const method of methods) {
        if (method === 'constructor') continue;
        const lower = method.toLowerCase();
        for (const prefix of mutationPrefixes) {
          if (lower.startsWith(prefix) || lower.endsWith(prefix)) {
            throw new Error(`${serviceName} exposes mutating method '${method}' starting or ending with '${prefix}'`);
          }
        }
      }
    };

    checkNoMutationMethods(financialHealthEngine, 'FinancialHealthEngine');
    checkNoMutationMethods(cashFlowAnalyzer, 'CashFlowAnalyzer');
    checkNoMutationMethods(financialRiskDetector, 'FinancialRiskDetector');
    checkNoMutationMethods(financialIntelligenceEngine, 'FinancialIntelligenceEngine');
  });

  // 9. Financial Intelligence Insights Generation
  await test('9. Financial Insights: Produces deterministic Arabic insights and actionable non-automated recommendations', async () => {
    const accLowColl = createMockAccount('acc-low', 'عميل متأخر بالتحصيل');
    // Debit 10,000, credit 2,000 => collection rate = 20% (< 45% threshold)
    const tx1 = createMockTx('tx-li1', 'acc-low', 10000, 'debit', 35);
    const tx2 = createMockTx('tx-li2', 'acc-low', 2000, 'credit', 10);

    const report = await financialIntelligenceEngine.generateFullReport('monthly', [tx1, tx2], [accLowColl]);

    assert(report.insights.length > 0, 'Should generate at least one insight');

    const collectionInsight = report.insights.find((i) => i.type === 'COLLECTION_EFFICIENCY');
    assert(collectionInsight !== undefined, 'Should trigger COLLECTION_EFFICIENCY insight for 20% collection rate');
    assert(collectionInsight?.impact === 'WARNING', 'Collection efficiency should have WARNING impact');
    assert(collectionInsight?.recommendationAr.length! > 0, 'Should provide Arabic actionable recommendation');
    assert(collectionInsight?.suggestedAction !== undefined, 'Should provide non-automated suggested action');

    const healthInsight = report.insights.find((i) => i.type === 'HEALTH_STATUS');
    assert(healthInsight !== undefined, 'Should generate HEALTH_STATUS insight');
  });

  // 10. Cash Flow Forecast: Statistical Historical Projections & Mandatory Disclaimer
  await test('10. Cash Flow Forecast: Generates 3 statistical periods with explicit disclaimer and confidence scores', async () => {
    const acc = createMockAccount('acc-fc', 'عميل التوقع');
    // 3 historical transactions in different periods
    const tx1 = createMockTx('tx-f1', 'acc-fc', 1000, 'credit', 20); // inflow 1000
    const tx2 = createMockTx('tx-f2', 'acc-fc', 500, 'debit', 10);  // outflow 500
    const tx3 = createMockTx('tx-f3', 'acc-fc', 1500, 'credit', 2); // inflow 1500

    const report = await financialIntelligenceEngine.generateFullReport('monthly', [tx1, tx2, tx3], [acc]);
    const forecast = report.forecast;

    assert(forecast.periods.length === 3, `Expected 3 projected periods, got ${forecast.periods.length}`);
    assert(forecast.disclaimerAr.includes('تنبيه استرشادي'), 'Forecast must include statutory Arabic disclaimer');
    assert(forecast.assumptionsAr.length >= 3, 'Must document core statistical assumptions');

    for (const p of forecast.periods) {
      assert(p.confidenceScore > 0 && p.confidenceScore <= 100, `Confidence score must be valid (got ${p.confidenceScore})`);
      assert(typeof p.projectedInflow === 'number', 'Projected inflow must be a valid number');
      assert(typeof p.projectedOutflow === 'number', 'Projected outflow must be a valid number');
      assert(typeof p.projectedNetFlow === 'number', 'Projected net flow must be a valid number');
    }
  });

  // 11. Empty State Forecast Safety
  await test('11. Empty State Forecast Safety: Handles zero transaction state gracefully', async () => {
    const report = await financialIntelligenceEngine.generateFullReport('monthly', [], []);
    assert(report.forecast.periods.length === 0, 'Zero state forecast periods must be empty');
    assert(report.forecast.totalProjectedNet === 0, 'Zero state projected net must be 0');
    assert(report.insights.length === 1 && report.insights[0].id === 'insight-empty-state', 'Should return empty state insight');
  });

  const durationMs = Math.round(performance.now() - startTime);
  console.log(`Phase 9 Result: Passed ${passed}/${passed + failed} (${durationMs}ms)`);
  return { passed, failed, total: passed + failed, durationMs, errors, results };
}

// Direct execution when run via tsx
if (import.meta.url.endsWith(process.argv[1])) {
  runBITests()
    .then(({ failed }) => {
      process.exit(failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('Fatal test error:', err);
      process.exit(1);
    });
}
