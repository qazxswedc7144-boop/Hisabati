import { create } from 'zustand';
import {
  FinancialHealthSummary,
  CashFlowAnalysis,
  FinancialRiskAlert,
  FinancialInsight,
  CashFlowForecast,
  CashFlowInterval,
} from '@/shared/types/bi.types';
import {
  financialHealthEngine,
  cashFlowAnalyzer,
  financialRiskDetector,
  financialIntelligenceEngine,
} from '@/core/services/bi';

interface BIState {
  healthSummary: FinancialHealthSummary | null;
  cashFlow: CashFlowAnalysis | null;
  risks: FinancialRiskAlert[];
  insights: FinancialInsight[];
  forecast: CashFlowForecast | null;
  selectedInterval: CashFlowInterval;
  isLoading: boolean;
  lastRefreshedAt: string | null;
  error: string | null;

  // Actions
  loadBIData: (interval?: CashFlowInterval) => Promise<void>;
  setInterval: (interval: CashFlowInterval) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useBIStore = create<BIState>((set, get) => ({
  healthSummary: null,
  cashFlow: null,
  risks: [],
  insights: [],
  forecast: null,
  selectedInterval: 'monthly',
  isLoading: false,
  lastRefreshedAt: null,
  error: null,

  loadBIData: async (targetInterval) => {
    const interval = targetInterval ?? get().selectedInterval;
    set({ isLoading: true, error: null });

    try {
      const report = await financialIntelligenceEngine.generateFullReport(interval);

      set({
        healthSummary: report.healthSummary,
        cashFlow: report.cashFlow,
        risks: report.risks,
        insights: report.insights,
        forecast: report.forecast,
        selectedInterval: interval,
        isLoading: false,
        lastRefreshedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error('Failed to load BI data:', err);
      set({
        isLoading: false,
        error: err?.message || 'تعذر تحميل بيانات ذكاء الأعمال والصحة المالية',
      });
    }
  },

  setInterval: async (interval: CashFlowInterval) => {
    set({ selectedInterval: interval, isLoading: true, error: null });
    try {
      const flow = await cashFlowAnalyzer.analyze(interval);
      const summary = get().healthSummary;
      const forecast = summary
        ? financialIntelligenceEngine.generateForecast(flow, summary, 3)
        : null;

      set({
        cashFlow: flow,
        forecast,
        isLoading: false,
      });
    } catch (err: any) {
      console.error('Failed to update cash flow interval:', err);
      set({
        isLoading: false,
        error: err?.message || 'تعذر تحديث فترة التدفق النقدي',
      });
    }
  },

  refresh: async () => {
    await get().loadBIData(get().selectedInterval);
  },
}));
