export type CashFlowTrend = 'upward' | 'downward' | 'stable';

export type HealthGrade = 'A' | 'B' | 'C' | 'D';

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskCategory = 'CONCENTRATION' | 'AGING' | 'LIQUIDITY' | 'ANOMALY' | 'STAGNANCY';

export type AgingBucketKey = '0_30' | '31_60' | '61_90' | '90_PLUS';

export interface AgingBucket {
  bucket: AgingBucketKey;
  labelAr: string;
  amount: number;
  amountMinor: number;
  percentage: number;
  accountCount: number;
}

export interface FinancialRiskAlert {
  id: string;
  category: RiskCategory;
  severity: RiskSeverity;
  titleAr: string;
  descriptionAr: string;
  recommendationAr: string;
  affectedAccountId?: string;
  affectedAccountName?: string;
  metricValue?: number;
  threshold?: number;
  detectedAt: string;
}

export type CashFlowInterval = 'daily' | 'weekly' | 'monthly';

export interface CashFlowDataPoint {
  period: string;
  periodLabelAr: string;
  inflow: number; // المقبوضات النقدية والتحصيلات
  inflowMinor: number;
  outflow: number; // المدفوعات والديون المسجلة الجديدة
  outflowMinor: number;
  netFlow: number;
  netFlowMinor: number;
  cumulativeBalance: number;
  cumulativeBalanceMinor: number;
  transactionCount: number;
}

export interface CashFlowAnalysis {
  interval: CashFlowInterval;
  dataPoints: CashFlowDataPoint[];
  totalInflow: number;
  totalInflowMinor: number;
  totalOutflow: number;
  totalOutflowMinor: number;
  netCashFlow: number;
  netCashFlowMinor: number;
  averageInflow: number;
  averageOutflow: number;
  trend: CashFlowTrend;
}

export interface FinancialHealthSummary {
  totalReceivables: number; // إجمالي المستحقات لك
  totalReceivablesMinor: number;
  totalPayables: number; // إجمالي الديون عليك
  totalPayablesMinor: number;
  netPosition: number; // صافي المركز المالي
  netPositionMinor: number;
  collectionRate: number; // نسبة التحصيل (0-100%)
  overdueDebtRatio: number; // نسبة الديون المتأخرة > 30 يوم من إجمالي الديون
  debtorCount: number; // عدد الحسابات المدينة
  creditorCount: number; // عدد الحسابات الدائنة
  balancedCount: number; // عدد الحسابات المصفرة
  totalAccounts: number;
  agingBreakdown: Record<AgingBucketKey, AgingBucket>;
  cashFlowTrend: CashFlowTrend;
  healthScore: number; // مؤشر الصحة المالية من 0 إلى 100
  healthGrade: HealthGrade; // A / B / C / D
  healthStatusAr: string;
  calculatedAt: string;
}

export type FinancialInsightType =
  | 'HEALTH_STATUS'
  | 'DEBT_GROWTH'
  | 'COLLECTION_EFFICIENCY'
  | 'LIQUIDITY_CONCENTRATION'
  | 'OVERDUE_RISK';

export type FinancialInsightImpact = 'POSITIVE' | 'WARNING' | 'CRITICAL' | 'NEUTRAL';

export interface ActionRecommendation {
  labelAr: string;
  actionType: 'VIEW_ACCOUNT' | 'SEND_REMINDER' | 'VIEW_REPORT' | 'REVIEW_TERMS';
  route?: string;
  accountId?: string;
}

export interface FinancialInsight {
  id: string;
  type: FinancialInsightType;
  impact: FinancialInsightImpact;
  titleAr: string;
  descriptionAr: string;
  recommendationAr: string;
  metricLabelAr?: string;
  metricValueFormatted?: string;
  suggestedAction?: ActionRecommendation;
}

export interface CashFlowForecastPeriod {
  periodIndex: number;
  periodLabelAr: string;
  projectedInflow: number;
  projectedInflowMinor: number;
  projectedOutflow: number;
  projectedOutflowMinor: number;
  projectedNetFlow: number;
  projectedNetFlowMinor: number;
  projectedCumulativeBalance: number;
  projectedCumulativeBalanceMinor: number;
  confidenceScore: number;
}

export interface CashFlowForecast {
  disclaimerAr: string;
  forecastInterval: CashFlowInterval;
  periods: CashFlowForecastPeriod[];
  totalProjectedInflow: number;
  totalProjectedOutflow: number;
  totalProjectedNet: number;
  historicalPeriodsAnalyzed: number;
  assumptionsAr: string[];
}

export interface FinancialIntelligenceReport {
  healthSummary: FinancialHealthSummary;
  cashFlow: CashFlowAnalysis;
  risks: FinancialRiskAlert[];
  insights: FinancialInsight[];
  forecast: CashFlowForecast;
  generatedAt: string;
}
