import { aiTools } from './AITools';
import { aiPrivacyService } from './AIPrivacyService';
import { AIIntent } from '@/shared/types/ai.types';

export class AIContextService {
  /**
   * Builds minimal context matching the intent, preventing DB leakage.
   */
  public async getMinimalContextForIntent(
    intent: AIIntent,
    extraParams?: { accountId?: string; accountName?: string }
  ): Promise<Record<string, unknown>> {
    switch (intent) {
      case 'GET_TOTAL_RECEIVABLES': {
        const report = await aiTools.getTotalReceivables();
        return aiPrivacyService.buildMinimalContextSummary({
          totalReceivables: report.totalAmount,
          accountsCount: report.accountsCount,
        });
      }
      case 'GET_TOTAL_PAYABLES': {
        const report = await aiTools.getTotalPayables();
        return aiPrivacyService.buildMinimalContextSummary({
          totalPayables: report.totalAmount,
          accountsCount: report.accountsCount,
        });
      }
      case 'GET_NET_BALANCE': {
        const net = await aiTools.getNetBalance();
        return aiPrivacyService.buildMinimalContextSummary({
          netBalance: net.netBalance,
          totalReceivables: net.totalDebit,
          totalPayables: net.totalCredit,
        });
      }
      case 'GET_ACCOUNT_BALANCE': {
        if (extraParams?.accountId) {
          const account = await aiTools.getAccountBalance(extraParams.accountId);
          if (account) {
            return aiPrivacyService.buildMinimalContextSummary({
              accountName: account.name,
              accountBalance: account.currentBalance,
            });
          }
        }
        return {};
      }
      case 'GET_TOP_DEBTORS': {
        const debtors = await aiTools.getTopDebtors(5);
        return {
          topDebtors: debtors.map((d) => ({
            name: d.account.name,
            balance: d.balance,
          })),
        };
      }
      case 'GET_TOP_CREDITORS': {
        const creditors = await aiTools.getTopCreditors(5);
        return {
          topCreditors: creditors.map((c) => ({
            name: c.account.name,
            balance: c.balance,
          })),
        };
      }
      case 'GET_PERIOD_SUMMARY': {
        const summary = await aiTools.getFinancialSummary('this_month');
        return {
          totalDebit: summary.totalDebit,
          totalCredit: summary.totalCredit,
          netBalance: summary.netBalance,
          totalTransactions: summary.totalTransactions,
        };
      }
      default:
        return {};
    }
  }
}

export const aiContextService = new AIContextService();
