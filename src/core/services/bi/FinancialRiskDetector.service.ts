import { db } from '@/core/database/db';
import { Transaction, Account } from '@/shared/types';
import { FinancialRiskAlert } from '@/shared/types/bi.types';
import {
  toMinorUnits,
  fromMinorUnits,
  computeAccountMetricsFromTransactions,
} from '@/core/utils/financial';
import { financialHealthEngine } from './FinancialHealthEngine.service';

/**
 * FinancialRiskDetector
 * Scans accounts and transactions to identify liquidity threats, concentration hazards,
 * stagnant debts, and abnormal cash flow behaviors without altering any underlying data.
 * Pure Read-Only service.
 */
export class FinancialRiskDetector {
  private static instance: FinancialRiskDetector;

  public static getInstance(): FinancialRiskDetector {
    if (!FinancialRiskDetector.instance) {
      FinancialRiskDetector.instance = new FinancialRiskDetector();
    }
    return FinancialRiskDetector.instance;
  }

  /**
   * Scans the full financial state and returns prioritized risk alerts.
   */
  public async detectRisks(
    customTransactions?: Transaction[],
    customAccounts?: Account[]
  ): Promise<FinancialRiskAlert[]> {
    const transactions = customTransactions ?? (await db.transactions.toArray());
    const accounts = customAccounts ?? (await db.accounts.toArray());
    const alerts: FinancialRiskAlert[] = [];

    if (accounts.length === 0 || transactions.length === 0) {
      return alerts;
    }

    const healthSummary = await financialHealthEngine.computeHealthSummary(
      transactions,
      accounts
    );
    const totalReceivablesMinor = healthSummary.totalReceivablesMinor;

    // Group transactions by account
    const txByAccount = new Map<string, Transaction[]>();
    for (const tx of transactions) {
      const list = txByAccount.get(tx.accountId) ?? [];
      list.push(tx);
      txByAccount.set(tx.accountId, list);
    }

    const now = new Date().getTime();

    // 1. Concentration Risk (مخاطر تركز الديون)
    if (totalReceivablesMinor > 0) {
      for (const acc of accounts) {
        const accTxs = txByAccount.get(acc.id) ?? [];
        const metrics = computeAccountMetricsFromTransactions(accTxs);
        const balanceMinor = toMinorUnits(metrics.currentBalance);

        if (balanceMinor > 0) {
          const ratio = (balanceMinor / totalReceivablesMinor) * 100;
          if (ratio >= 35) {
            const isCritical = ratio >= 50;
            alerts.push({
              id: `risk-conc-${acc.id}`,
              category: 'CONCENTRATION',
              severity: isCritical ? 'CRITICAL' : 'HIGH',
              titleAr: `تركز مالي مرتفع على حساب: ${acc.name}`,
              descriptionAr: `يمثل هذا الحساب ${ratio.toFixed(1)}% من إجمالي المستحقات والديون المترتبة لك، بمبلغ ${fromMinorUnits(balanceMinor).toLocaleString('ar-EG')} ر.ي.`,
              recommendationAr: `ينصح بتجميد السحب الآجل مؤقتاً لهذا الحساب وتقسيم مبالغ السداد إلى أقساط سريعة لتخفيف مخاطر التعثر.`,
              affectedAccountId: acc.id,
              affectedAccountName: acc.name,
              metricValue: ratio,
              threshold: 35,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // 2. Stagnant Debts (ديون راكدة متأخرة السداد)
    for (const acc of accounts) {
      const accTxs = txByAccount.get(acc.id) ?? [];
      const metrics = computeAccountMetricsFromTransactions(accTxs);
      const balanceMinor = toMinorUnits(metrics.currentBalance);

      if (balanceMinor > 0) {
        // Find last payment (credit transaction)
        const creditTxs = accTxs
          .filter((t) => t.type === 'credit')
          .sort((a, b) => b.date.localeCompare(a.date));

        const lastPaymentDate = creditTxs.length > 0 ? creditTxs[0].date : accTxs[0]?.date;

        if (lastPaymentDate) {
          const lastTime = new Date(lastPaymentDate).getTime();
          const daysSincePayment = Math.floor((now - lastTime) / (1000 * 60 * 60 * 24));

          if (daysSincePayment >= 60) {
            const isHigh = daysSincePayment >= 90;
            alerts.push({
              id: `risk-stag-${acc.id}`,
              category: 'STAGNANCY',
              severity: isHigh ? 'HIGH' : 'MEDIUM',
              titleAr: `حساب راكد دون سداد منذ ${daysSincePayment} يوم`,
              descriptionAr: `لم يسجل العميل (${acc.name}) أي عملية سداد منذ تاريخ ${lastPaymentDate}، والمبلغ المستحق ${fromMinorUnits(balanceMinor).toLocaleString('ar-EG')} ر.ي.`,
              recommendationAr: `إرسال كشف حساب فوري عبر واتساب أو الاتصال المباشر لطلب تسوية فورية وتجنب انتقال الدين للشطب.`,
              affectedAccountId: acc.id,
              affectedAccountName: acc.name,
              metricValue: daysSincePayment,
              threshold: 60,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    // 3. Negative Cash Flow Deficit (عجز التدفقات النقدية)
    if (healthSummary.netPositionMinor < 0) {
      alerts.push({
        id: 'risk-deficit-net-position',
        category: 'LIQUIDITY',
        severity: 'HIGH',
        titleAr: 'عجز في صافي المركز المالي',
        descriptionAr: `إجمالي الديون والالتزامات عليك (${healthSummary.totalPayables.toLocaleString('ar-EG')} ر.ي) تفوق إجمالي مستحقاتك (${healthSummary.totalReceivables.toLocaleString('ar-EG')} ر.ي).`,
        recommendationAr: 'ينصح بالتركيز الفوري على تحصيل الديون القائمة وتقنين النفقات والالتزامات الخارجية حتى استعادة التوازن.',
        metricValue: healthSummary.netPosition,
        threshold: 0,
        detectedAt: new Date().toISOString(),
      });
    }

    // 4. Overdue Spike (> 40% overdue debt)
    if (healthSummary.overdueDebtRatio >= 40 && totalReceivablesMinor > 0) {
      alerts.push({
        id: 'risk-overdue-spike',
        category: 'AGING',
        severity: 'CRITICAL',
        titleAr: 'ارتفاع مؤشر الديون المتأخرة المتعثرة',
        descriptionAr: `الديون التي تجاوزت 30 يوماً تمثل ${healthSummary.overdueDebtRatio.toFixed(1)}% من كامل ديونك، مما يهدد السيولة التشغيلية.`,
        recommendationAr: 'مراجعة سياسة البيع بالآجل وتكثيف المتابعة الميدانية للديون المتأخرة.',
        metricValue: healthSummary.overdueDebtRatio,
        threshold: 40,
        detectedAt: new Date().toISOString(),
      });
    }

    // 5. Rapid Debt Accumulation (تراكم ديون متسارع دون سداد)
    for (const acc of accounts) {
      const accTxs = txByAccount.get(acc.id) ?? [];
      const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

      const recentDebits = accTxs.filter(
        (t) => t.type === 'debit' && new Date(t.date).getTime() >= twoWeeksAgo
      );
      const recentCredits = accTxs.filter(
        (t) => t.type === 'credit' && new Date(t.date).getTime() >= twoWeeksAgo
      );

      if (recentDebits.length >= 3 && recentCredits.length === 0) {
        alerts.push({
          id: `risk-rapid-${acc.id}`,
          category: 'ANOMALY',
          severity: 'MEDIUM',
          titleAr: `سحوبات ديون متكررة للعميل: ${acc.name}`,
          descriptionAr: `تم تسجيل ${recentDebits.length} عمليات قيد (أعطيته) خلال الأسبوعين الماضيين دون أي عملية سداد موازية.`,
          recommendationAr: `طلب سداد دفعة مقدمة قبل السماح بمزيد من السحوبات الآجلة.`,
          affectedAccountId: acc.id,
          affectedAccountName: acc.name,
          metricValue: recentDebits.length,
          threshold: 3,
          detectedAt: new Date().toISOString(),
        });
      }
    }

    // Sort by severity (CRITICAL first, then HIGH, then MEDIUM, then LOW)
    const severityWeights: Record<string, number> = {
      CRITICAL: 4,
      HIGH: 3,
      MEDIUM: 2,
      LOW: 1,
    };

    return alerts.sort((a, b) => severityWeights[b.severity] - severityWeights[a.severity]);
  }
}

export const financialRiskDetector = FinancialRiskDetector.getInstance();
