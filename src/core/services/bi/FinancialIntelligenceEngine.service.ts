import { db } from '@/core/database/db';
import { Transaction, Account } from '@/shared/types';
import {
  FinancialHealthSummary,
  CashFlowAnalysis,
  FinancialRiskAlert,
  FinancialInsight,
  CashFlowForecast,
  CashFlowForecastPeriod,
  FinancialIntelligenceReport,
  CashFlowInterval,
} from '@/shared/types/bi.types';
import { financialHealthEngine } from './FinancialHealthEngine.service';
import { cashFlowAnalyzer } from './CashFlowAnalyzer.service';
import { financialRiskDetector } from './FinancialRiskDetector.service';
import { toMinorUnits, fromMinorUnits } from '@/core/utils/financial';

/**
 * FinancialIntelligenceEngine
 * A purely read-only analytic engine sitting atop FinancialHealthEngine,
 * CashFlowAnalyzer, and FinancialRiskDetector.
 * 
 * Provides:
 * 1. Actionable Arabic financial insights (health trends, debt growth, collection bottlenecks, concentration).
 * 2. Simplified deterministic cash flow forecasting based purely on historical local data.
 * 3. Proactive, non-automated recommendations.
 * 
 * STRICT INVARIANT: Pure read-only. No mutation, insertion, deletion or modification of data.
 */
export class FinancialIntelligenceEngine {
  private static instance: FinancialIntelligenceEngine;

  public static getInstance(): FinancialIntelligenceEngine {
    if (!FinancialIntelligenceEngine.instance) {
      FinancialIntelligenceEngine.instance = new FinancialIntelligenceEngine();
    }
    return FinancialIntelligenceEngine.instance;
  }

  /**
   * Generates practical, human-readable Arabic insights based on deterministic financial metrics.
   */
  public generateInsights(
    summary: FinancialHealthSummary,
    cashFlow: CashFlowAnalysis,
    risks: FinancialRiskAlert[]
  ): FinancialInsight[] {
    const insights: FinancialInsight[] = [];

    // 1. Health Status & Trend Insight
    if (summary.totalAccounts === 0) {
      insights.push({
        id: 'insight-empty-state',
        type: 'HEALTH_STATUS',
        impact: 'NEUTRAL',
        titleAr: 'سجل الحسابات جديد أو خالي من المعاملات',
        descriptionAr: 'لا توجد حركات مالية مسجلة حتى الآن لاحتساب مؤشرات الأداء.',
        recommendationAr: 'ابدأ بتسجيل أول حساب وعملية مالية لتفعيل الرصد والتحليل الذكي للتدفقات النقدية.',
        metricLabelAr: 'عدد الحسابات',
        metricValueFormatted: '0',
        suggestedAction: {
          labelAr: 'إضافة حساب جديد',
          actionType: 'REVIEW_TERMS',
          route: '/accounts',
        },
      });
      return insights;
    }

    // Health score evaluation
    if (summary.healthScore >= 80) {
      insights.push({
        id: 'insight-health-high',
        type: 'HEALTH_STATUS',
        impact: 'POSITIVE',
        titleAr: 'مؤشر أمان مالي متميز ومستقر (الفئة A)',
        descriptionAr: `المركز المالي يتمتع بدرجة أمان عالية (${summary.healthScore}/100) مع تدفقات نقدية متوازنة ونسب تحصيل منضبطة.`,
        recommendationAr: 'حافظ على نفس السياسة الائتمانية مع الاستمرار في وضع سقوف ائتمانية مناسبة للعملاء الجدد.',
        metricLabelAr: 'درجة الصحة المالية',
        metricValueFormatted: `${summary.healthScore} / 100`,
        suggestedAction: {
          labelAr: 'عرض تفاصيل المركز المالي',
          actionType: 'VIEW_REPORT',
          route: '/reports',
        },
      });
    } else if (summary.healthScore >= 60) {
      insights.push({
        id: 'insight-health-moderate',
        type: 'HEALTH_STATUS',
        impact: 'NEUTRAL',
        titleAr: 'مركز مالي مستقر مع هوامش قابلة للتحسين (الفئة B)',
        descriptionAr: `الصحة المالية مقبولة (${summary.healthScore}/100)، مع إمكانية رفع مؤشر الأمان عبر تسريع تحصيل الديون القديمة.`,
        recommendationAr: 'ينصح بإرسال كشوفات حساب ومطالبات منتظمة للعملاء الذين اقتربت ديونهم من 30 يوماً.',
        metricLabelAr: 'درجة الصحة المالية',
        metricValueFormatted: `${summary.healthScore} / 100`,
        suggestedAction: {
          labelAr: 'مراجعة الديون القائمة',
          actionType: 'VIEW_REPORT',
          route: '/reports',
        },
      });
    } else {
      insights.push({
        id: 'insight-health-critical',
        type: 'HEALTH_STATUS',
        impact: 'CRITICAL',
        titleAr: 'تنبيه أمان مالي: ضغط سيولة وتراكم متأخرات (الفئة C/D)',
        descriptionAr: `مؤشر الصحة المالية منخفض (${summary.healthScore}/100) بسبب زيادة المتأخرات أو تراجع نسبة التحصيل النقدي.`,
        recommendationAr: 'تجميد البيع الآجل للحسابات المتأخرة، وتكثيف جهود التحصيل الميداني لتوفير سيولة كافية.',
        metricLabelAr: 'درجة الصحة المالية',
        metricValueFormatted: `${summary.healthScore} / 100`,
        suggestedAction: {
          labelAr: 'فتح كشف المستحقات',
          actionType: 'VIEW_REPORT',
          route: '/reports',
        },
      });
    }

    // 2. Collection Efficiency Insight
    if (summary.totalReceivables > 0) {
      if (summary.collectionRate < 45) {
        insights.push({
          id: 'insight-collection-weak',
          type: 'COLLECTION_EFFICIENCY',
          impact: 'WARNING',
          titleAr: 'ضعف نسبي في وتيرة تحصيل الديون',
          descriptionAr: `معدل التحصيل النقدي الحالي يبلغ (${summary.collectionRate}%)، وهو أقل من المعدل المتوازن (50%+). هذا يعني أن مبالغ الديون الجديدة تزيد عن مقبوضات السداد.`,
          recommendationAr: 'إرسال تذكيرات سداد مسبقة للعملاء قبل حلول مواعيد الاستحقاق مع تقديم خيارات سداد مجزأة.',
          metricLabelAr: 'نسبة التحصيل',
          metricValueFormatted: `${summary.collectionRate}%`,
          suggestedAction: {
            labelAr: 'إرسال رسائل تذكير',
            actionType: 'SEND_REMINDER',
            route: '/messaging',
          },
        });
      } else if (summary.collectionRate >= 75) {
        insights.push({
          id: 'insight-collection-strong',
          type: 'COLLECTION_EFFICIENCY',
          impact: 'POSITIVE',
          titleAr: 'كفاءة تحصيل ممتازة',
          descriptionAr: `تم سداد وتحصيل ${summary.collectionRate}% من إجمالي القيود المالية المترتبة، ما يدعم مرونة السيولة النقدية اليومية.`,
          recommendationAr: 'مواصلة المتابعة الدورية مع مكافأة العملاء الملتزمين بتسهيلات تشجيعية.',
          metricLabelAr: 'نسبة التحصيل',
          metricValueFormatted: `${summary.collectionRate}%`,
        });
      }
    }

    // 3. Overdue & Aging Insights
    if (summary.overdueDebtRatio >= 35 && summary.totalReceivables > 0) {
      insights.push({
        id: 'insight-aging-overdue',
        type: 'OVERDUE_RISK',
        impact: 'CRITICAL',
        titleAr: 'ارتفاع حجم الديون المتأخرة عن 30 يوماً',
        descriptionAr: `الديون المتأخرة تتجاوز ${summary.overdueDebtRatio.toFixed(1)}% من إجمالي ديون السوق، ما يزيد من احتمالية تعثر بعض الحسابات.`,
        recommendationAr: 'فرز الحسابات في شريحتي 61-90 و+90 يوماً والاتصال المباشر بأصحابها للاتفاق على جدول سداد ملزم.',
        metricLabelAr: 'نسبة المتأخرات',
        metricValueFormatted: `${summary.overdueDebtRatio.toFixed(1)}%`,
        suggestedAction: {
          labelAr: 'فحص أعمار الديون',
          actionType: 'VIEW_REPORT',
          route: '/bi',
        },
      });
    }

    // 4. Debt Growth vs Liabilities (Liquidity)
    if (summary.netPosition < 0) {
      insights.push({
        id: 'insight-liquidity-deficit',
        type: 'LIQUIDITY_CONCENTRATION',
        impact: 'WARNING',
        titleAr: 'عجز نقدي في صافي الالتزامات المالية',
        descriptionAr: `إجمالي الديون المطلوبة منك للموردين تفوق مستحقاتك في السوق بفارق صافي (${Math.abs(summary.netPosition).toLocaleString('ar-EG')} ر.ي).`,
        recommendationAr: 'التفاوض مع الموردين لتأجيل أو جدولة الدفعات حتى تحصيل الديون المستحقة لك من العملاء.',
        metricLabelAr: 'صافي العجز',
        metricValueFormatted: `${Math.abs(summary.netPosition).toLocaleString('ar-EG')} ر.ي`,
        suggestedAction: {
          labelAr: 'عرض تقرير الديون عليك',
          actionType: 'VIEW_REPORT',
          route: '/reports',
        },
      });
    }

    // 5. Credit Concentration Insight (from detected risks)
    const concentrationRisks = risks.filter((r) => r.category === 'CONCENTRATION');
    if (concentrationRisks.length > 0) {
      const topConc = concentrationRisks[0];
      insights.push({
        id: 'insight-concentration',
        type: 'LIQUIDITY_CONCENTRATION',
        impact: 'WARNING',
        titleAr: 'تركز ائتماني حرج لدى عدد محدود من العملاء',
        descriptionAr: `حساب (${topConc.affectedAccountName || 'أحد العملاء'}) يستحوذ على نسبة مرتفعة من كامل مستحقاتك المالية، ما يجعل المركز المالي حساساً لالتزامه.`,
        recommendationAr: 'وضع سقف ائتماني لهذا العميل وتجنب فتح حسابات آجلة جديدة له حتى سداد جزء جوهري من الرصيد.',
        metricLabelAr: 'الحساب المعني',
        metricValueFormatted: topConc.affectedAccountName || 'غير محدد',
        suggestedAction: topConc.affectedAccountId
          ? {
              labelAr: 'فتح ملف الحساب',
              actionType: 'VIEW_ACCOUNT',
              accountId: topConc.affectedAccountId,
              route: `/accounts/${topConc.affectedAccountId}`,
            }
          : undefined,
      });
    }

    return insights;
  }

  /**
   * Generates a simplified, statistical cash flow forecast for upcoming periods
   * based purely on local historical transactions.
   * 
   * Strict Invariant: Pure statistical forecast, labeled clearly with an explicit disclaimer.
   */
  public generateForecast(
    cashFlow: CashFlowAnalysis,
    summary: FinancialHealthSummary,
    periodsToProject: number = 3
  ): CashFlowForecast {
    const historicalPoints = cashFlow.dataPoints;
    const interval = cashFlow.interval;
    const count = historicalPoints.length;

    const disclaimerAr =
      'تنبيه استرشادي: هذا التوقع مبني حصرياً على المتوسطات الحسابية للحركات التاريخية المسجلة محلياً في التطبيق، ويعتبر تقديراً إحصائياً للاسترشاد وليس حقيقة محاسبية ملزمة. قد تختلف التدفقات الفعلية وفقاً لظروف السوق والتحصيل الفعلي.';

    const assumptionsAr = [
      'استمرار وتيرة التحصيلات والمقبوضات النقدية وفق المتوسط التاريخي الأخير.',
      'عدم حدوث سحوبات ديون استثنائية خارج النمط المعتاد.',
      'استقرار نسبة التحصيل الحالية دون تغير مفاجئ في التزام العملاء.',
    ];

    if (count === 0) {
      return {
        disclaimerAr,
        forecastInterval: interval,
        periods: [],
        totalProjectedInflow: 0,
        totalProjectedOutflow: 0,
        totalProjectedNet: 0,
        historicalPeriodsAnalyzed: 0,
        assumptionsAr,
      };
    }

    // Take up to the last 4 periods to compute weighted velocity
    const sample = historicalPoints.slice(-4);
    const sampleLength = sample.length;

    let sumInflowMinor = 0;
    let sumOutflowMinor = 0;

    for (const pt of sample) {
      sumInflowMinor += pt.inflowMinor;
      sumOutflowMinor += pt.outflowMinor;
    }

    const baseAvgInflowMinor = Math.round(sumInflowMinor / sampleLength);
    const baseAvgOutflowMinor = Math.round(sumOutflowMinor / sampleLength);

    // Apply slight trend modulation (between -5% and +5%) based on historical velocity
    let trendMultiplier = 1.0;
    if (cashFlow.trend === 'upward') {
      trendMultiplier = 1.03;
    } else if (cashFlow.trend === 'downward') {
      trendMultiplier = 0.97;
    }

    const periods: CashFlowForecastPeriod[] = [];
    let runningCumulativeBalanceMinor = summary.netPositionMinor;
    let totalProjectedInflowMinor = 0;
    let totalProjectedOutflowMinor = 0;

    const intervalNames: Record<CashFlowInterval, string> = {
      daily: 'اليوم القادم',
      weekly: 'الأسبوع القادم',
      monthly: 'الشهر القادم',
    };

    for (let i = 1; i <= periodsToProject; i++) {
      // Moderate progressive confidence score (85% -> 75% -> 65%)
      const confidenceScore = Math.max(50, 85 - (i - 1) * 10);

      // Project inflow and outflow with slight trend dampening over time
      const projectedInflowMinor = Math.round(
        baseAvgInflowMinor * Math.pow(trendMultiplier, i)
      );
      const projectedOutflowMinor = Math.round(baseAvgOutflowMinor);

      const projectedNetFlowMinor = projectedInflowMinor - projectedOutflowMinor;
      runningCumulativeBalanceMinor += projectedNetFlowMinor;

      totalProjectedInflowMinor += projectedInflowMinor;
      totalProjectedOutflowMinor += projectedOutflowMinor;

      const periodLabelAr =
        i === 1
          ? intervalNames[interval]
          : `${intervalNames[interval]} (+${i})`;

      periods.push({
        periodIndex: i,
        periodLabelAr,
        projectedInflow: fromMinorUnits(projectedInflowMinor),
        projectedInflowMinor,
        projectedOutflow: fromMinorUnits(projectedOutflowMinor),
        projectedOutflowMinor,
        projectedNetFlow: fromMinorUnits(projectedNetFlowMinor),
        projectedNetFlowMinor,
        projectedCumulativeBalance: fromMinorUnits(runningCumulativeBalanceMinor),
        projectedCumulativeBalanceMinor: runningCumulativeBalanceMinor,
        confidenceScore,
      });
    }

    const totalProjectedNetMinor = totalProjectedInflowMinor - totalProjectedOutflowMinor;

    return {
      disclaimerAr,
      forecastInterval: interval,
      periods,
      totalProjectedInflow: fromMinorUnits(totalProjectedInflowMinor),
      totalProjectedOutflow: fromMinorUnits(totalProjectedOutflowMinor),
      totalProjectedNet: fromMinorUnits(totalProjectedNetMinor),
      historicalPeriodsAnalyzed: count,
      assumptionsAr,
    };
  }

  /**
   * Builds the comprehensive financial intelligence report by querying sub-engines.
   */
  public async generateFullReport(
    interval: CashFlowInterval = 'monthly',
    customTransactions?: Transaction[],
    customAccounts?: Account[]
  ): Promise<FinancialIntelligenceReport> {
    const transactions = customTransactions ?? (await db.transactions.toArray());
    const accounts = customAccounts ?? (await db.accounts.toArray());

    const [healthSummary, cashFlow, risks] = await Promise.all([
      financialHealthEngine.computeHealthSummary(transactions, accounts),
      cashFlowAnalyzer.analyze(interval, transactions),
      financialRiskDetector.detectRisks(transactions, accounts),
    ]);

    const insights = this.generateInsights(healthSummary, cashFlow, risks);
    const forecast = this.generateForecast(cashFlow, healthSummary, 3);

    return {
      healthSummary,
      cashFlow,
      risks,
      insights,
      forecast,
      generatedAt: new Date().toISOString(),
    };
  }
}

export const financialIntelligenceEngine = FinancialIntelligenceEngine.getInstance();
