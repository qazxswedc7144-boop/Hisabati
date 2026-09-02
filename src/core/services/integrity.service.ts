import { db } from '../database/db';
import { computeAccountMetricsFromTransactions } from '../utils/financial';
import { transactionEngine } from './transactionEngine.service';

export interface IntegrityInconsistency {
  type: 'orphan_transaction' | 'invalid_amount' | 'invalid_type' | 'invalid_date' | 'duplicate_operation_id' | 'balance_mismatch';
  entityId: string;
  details: string;
  expected?: string | number;
  actual?: string | number;
}

export interface IntegrityReport {
  valid: boolean;
  checkedAt: string;
  accountsChecked: number;
  transactionsChecked: number;
  inconsistencies: IntegrityInconsistency[];
}

export class FinancialIntegrityService {
  /**
   * Performs an exhaustive check across all accounts and transactions to verify financial consistency.
   */
  async verifyFinancialIntegrity(): Promise<IntegrityReport> {
    const allAccounts = await db.accounts.toArray();
    const allTransactions = await db.transactions.toArray();

    const accountMap = new Map(allAccounts.map((a) => [a.id, a]));
    const inconsistencies: IntegrityInconsistency[] = [];
    const operationIdSet = new Set<string>();

    // 1. Check all transactions
    for (const trx of allTransactions) {
      // Check orphan transaction
      if (!accountMap.has(trx.accountId)) {
        inconsistencies.push({
          type: 'orphan_transaction',
          entityId: trx.id,
          details: `عملية مالية بدون حساب مرتبط (accountId: ${trx.accountId})`,
        });
      }

      // Check amount validity
      if (typeof trx.amount !== 'number' || isNaN(trx.amount) || trx.amount <= 0) {
        inconsistencies.push({
          type: 'invalid_amount',
          entityId: trx.id,
          details: `مبلغ غير صالح في العملية: ${trx.amount}`,
          expected: '> 0',
          actual: trx.amount,
        });
      }

      // Check type validity
      if (trx.type !== 'debit' && trx.type !== 'credit') {
        inconsistencies.push({
          type: 'invalid_type',
          entityId: trx.id,
          details: `نوع العملية غير معروف: ${trx.type}`,
          expected: 'debit | credit',
          actual: trx.type,
        });
      }

      // Check date validity
      if (!trx.date || isNaN(Date.parse(trx.date))) {
        inconsistencies.push({
          type: 'invalid_date',
          entityId: trx.id,
          details: `تاريخ العملية غير صالح: ${trx.date}`,
        });
      }

      // Check duplicate operationId if present
      if (trx.operationId) {
        if (operationIdSet.has(trx.operationId)) {
          inconsistencies.push({
            type: 'duplicate_operation_id',
            entityId: trx.id,
            details: `تكرار في معرف العملية (operationId: ${trx.operationId})`,
          });
        } else {
          operationIdSet.add(trx.operationId);
        }
      }
    }

    // 2. Check derived balance consistency for each account
    for (const account of allAccounts) {
      const accountTransactions = allTransactions.filter((t) => t.accountId === account.id);
      const computed = computeAccountMetricsFromTransactions(accountTransactions);

      const balanceDiff = Math.abs(account.currentBalance - computed.currentBalance);
      const debitDiff = Math.abs(account.totalDebit - computed.totalDebit);
      const creditDiff = Math.abs(account.totalCredit - computed.totalCredit);

      if (balanceDiff > 0.001 || debitDiff > 0.001 || creditDiff > 0.001) {
        inconsistencies.push({
          type: 'balance_mismatch',
          entityId: account.id,
          details: `عدم تطابق الرصيد المخزن للحساب "${account.name}" مع مجموع العمليات`,
          expected: `رصيد: ${computed.currentBalance} (لك: ${computed.totalDebit}, عليك: ${computed.totalCredit})`,
          actual: `رصيد: ${account.currentBalance} (لك: ${account.totalDebit}, عليك: ${account.totalCredit})`,
        });
      }
    }

    return {
      valid: inconsistencies.length === 0,
      checkedAt: new Date().toISOString(),
      accountsChecked: allAccounts.length,
      transactionsChecked: allTransactions.length,
      inconsistencies,
    };
  }

  /**
   * Alias for verifyFinancialIntegrity returning healthy boolean and issues
   */
  async auditIntegrity(): Promise<{ healthy: boolean; issues: { messageAr: string }[] }> {
    const report = await this.verifyFinancialIntegrity();
    return {
      healthy: report.valid,
      issues: report.inconsistencies.map((i) => ({ messageAr: i.details })),
    };
  }

  /**
   * Repairs derived balance mismatches by executing full recalculation.
   */
  async repairFinancialIntegrity(): Promise<{ repairedCount: number }> {
    const result = await transactionEngine.recalculateAllBalances();
    return { repairedCount: result.accountsUpdated };
  }

  /**
   * Alias for repairFinancialIntegrity
   */
  async autoFixAll(): Promise<{ repairedCount: number }> {
    return await this.repairFinancialIntegrity();
  }
}

export const integrityService = new FinancialIntegrityService();
