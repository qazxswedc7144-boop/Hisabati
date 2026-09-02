import { reportService } from '@/core/services/report.service';
import { accountRepository } from '@/core/repositories/account.repository';
import { transactionEngine } from '@/core/services/transactionEngine.service';
import { aiAuditRepository } from '@/core/repositories/aiAudit.repository';
import {
  Account,
  AccountStatementReport,
  FinancialSummaryReport,
  ReceivablesReport,
  PayablesReport,
  TopAccountsReport,
  Transaction,
  DatePreset,
} from '@/shared/types';
import { StructuredAICommand } from '@/shared/types/ai.types';

export class AITools {
  // ==========================================
  // READ-ONLY FINANCIAL TOOLS (Zero mutation)
  // ==========================================

  public async getTotalReceivables(): Promise<ReceivablesReport> {
    return await reportService.getReceivablesReport({ includeArchived: false });
  }

  public async getTotalPayables(): Promise<PayablesReport> {
    return await reportService.getPayablesReport({ includeArchived: false });
  }

  public async getNetBalance(): Promise<{
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
    totalTransactions: number;
  }> {
    return await transactionEngine.getGlobalSummary();
  }

  public async getAccountBalance(accountId: string): Promise<Account | undefined> {
    return await accountRepository.getById(accountId);
  }

  public async getAccountStatement(
    accountId: string,
    preset: DatePreset = 'all'
  ): Promise<AccountStatementReport> {
    return await reportService.getAccountStatement(accountId, { preset });
  }

  public async getTopDebtors(limit: number = 5): Promise<TopAccountsReport['topDebtors']> {
    const report = await reportService.getTopAccountsReport(limit);
    return report.topDebtors;
  }

  public async getTopCreditors(limit: number = 5): Promise<TopAccountsReport['topCreditors']> {
    const report = await reportService.getTopAccountsReport(limit);
    return report.topCreditors;
  }

  public async getFinancialSummary(preset: DatePreset = 'this_month'): Promise<FinancialSummaryReport> {
    return await reportService.getFinancialSummary({ preset });
  }

  public async searchAccounts(query: string): Promise<Account[]> {
    const accounts = await accountRepository.getAll(false);
    const clean = query.trim().toLowerCase();
    return accounts.filter((a) => a.name.toLowerCase().includes(clean) || (a.phone && a.phone.includes(clean)));
  }

  // =========================================================================
  // WRITE TOOLS (Strictly Guarded by Explicit User Confirmation & Engine)
  // =========================================================================

  /**
   * Executes a structured AI command ONLY after explicit user confirmation.
   * AI has zero direct database writing privileges.
   * The only approved path is: AI -> Intent -> ValidatedCommand -> User Confirmation -> FinancialTransactionEngine.
   */
  public async executeConfirmedCommand(command: StructuredAICommand): Promise<Transaction> {
    if (command.status !== 'CONFIRMED') {
      throw new Error('لا يمكن تنفيذ العملية المالية دون تأكيد صريح ومباشر من المستخدم');
    }

    if (!command.accountId) {
      throw new Error('معرف الحساب مفقود في الأمر المالي');
    }

    if (!command.amount || command.amount <= 0) {
      throw new Error('المبلغ المالي يجب أن يكون أكبر من الصفر');
    }

    // Pass strictly through the FinancialTransactionEngine
    const transaction = await transactionEngine.createTransaction({
      accountId: command.accountId,
      type: command.type,
      amount: command.amount,
      date: command.date || new Date().toISOString().split('T')[0],
      note: command.note || 'عملية مسجلة عبر المساعد الذكي',
      operationId: command.operationId,
    });

    command.status = 'EXECUTED';
    command.executedTransactionId = transaction.id;

    // Log the confirmed execution to the AI audit log
    await aiAuditRepository.addLog({
      id: 'audit_exec_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      requestId: command.id,
      intent: command.intent,
      timestamp: new Date().toISOString(),
      status: 'success',
      provider: 'FinancialTransactionEngine',
      confidence: command.confidence,
      action: `Executed ${command.type} of ${command.amount} ${command.currency}`,
      confirmed: true,
      relatedEntityId: transaction.id,
    });

    return transaction;
  }
}

export const aiTools = new AITools();
