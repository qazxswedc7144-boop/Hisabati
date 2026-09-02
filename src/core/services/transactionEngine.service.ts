import { db } from '../database/db';
import {
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  TransactionSummary,
  Account,
} from '@/shared/types';
import {
  roundMoney,
  computeAccountMetricsFromTransactions,
  computeStatementRunningBalances,
  StatementItem,
} from '../utils/financial';
import { validateTransactionForm } from '../utils/validators';

export class FinancialTransactionEngine {
  // In-memory mutex/deduplication registry for rapid in-flight double submission prevention
  private inFlightSubmissions = new Set<string>();

  /**
   * Creates a transaction with strict financial validation, precision rounding,
   * deduplication / idempotency check, atomic persistence, and derived balance recalculation.
   */
  async createTransaction(dto: CreateTransactionDTO): Promise<Transaction> {
    // 1. Validation
    const validation = validateTransactionForm({
      accountId: dto.accountId,
      amount: dto.amount,
      date: dto.date,
    });

    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'بيانات العملية غير صحيحة';
      throw new Error(firstError);
    }

    // 2. Verify account existence
    const account = await db.accounts.get(dto.accountId);
    if (!account) {
      throw new Error('الحساب المحدد غير موجود في قاعدة البيانات');
    }

    // 3. Idempotency Key Handling
    const idempotencyKey = dto.operationId || `op_${dto.accountId}_${dto.type}_${dto.amount}_${dto.date}_${dto.note || ''}`;
    
    if (this.inFlightSubmissions.has(idempotencyKey)) {
      // In-flight duplicate detected: wait or return existing transaction if already registered
      const existing = await db.transactions
        .where('operationId')
        .equals(idempotencyKey)
        .first();
      if (existing) return existing;
    }

    this.inFlightSubmissions.add(idempotencyKey);

    try {
      // Check if a transaction with the same operationId already exists in IndexedDB
      if (dto.operationId) {
        const existingTrx = await db.transactions
          .where('operationId')
          .equals(dto.operationId)
          .first();
        if (existingTrx) {
          return existingTrx;
        }
      }

      const now = new Date().toISOString();
      const id = 'trx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      const safeAmount = roundMoney(Math.abs(dto.amount));

      const newTransaction: Transaction = {
        id,
        accountId: dto.accountId,
        type: dto.type,
        amount: safeAmount,
        date: dto.date || now.split('T')[0],
        note: dto.note?.trim() || undefined,
        receiptNumber: dto.receiptNumber?.trim() || undefined,
        operationId: dto.operationId || idempotencyKey,
        createdAt: now,
        updatedAt: now,
      };

      // Atomic write transaction
      await db.transaction('rw', db.transactions, db.accounts, async () => {
        await db.transactions.add(newTransaction);
        await this.recalculateAccountBalance(dto.accountId);
      });

      return newTransaction;
    } finally {
      // Release in-flight lock after short timeout or immediately
      setTimeout(() => {
        this.inFlightSubmissions.delete(idempotencyKey);
      }, 1000);
    }
  }

  /**
   * Updates an existing transaction and updates balances of all affected accounts.
   */
  async updateTransaction(id: string, dto: UpdateTransactionDTO): Promise<Transaction> {
    const existing = await db.transactions.get(id);
    if (!existing) {
      throw new Error(`العملية رقم ${id} غير موجودة`);
    }

    const oldAccountId = existing.accountId;
    const targetAccountId = dto.accountId || oldAccountId;

    // Check target account existence if changing account
    if (targetAccountId !== oldAccountId) {
      const targetAcc = await db.accounts.get(targetAccountId);
      if (!targetAcc) {
        throw new Error('الحساب الجديد المحدد غير موجود');
      }
    }

    const safeAmount = dto.amount !== undefined ? roundMoney(Math.abs(dto.amount)) : existing.amount;
    const now = new Date().toISOString();

    const updatedTrx: Transaction = {
      ...existing,
      accountId: targetAccountId,
      type: dto.type || existing.type,
      amount: safeAmount,
      date: dto.date || existing.date,
      note: dto.note !== undefined ? (dto.note.trim() || undefined) : existing.note,
      receiptNumber: dto.receiptNumber !== undefined ? (dto.receiptNumber.trim() || undefined) : existing.receiptNumber,
      updatedAt: now,
    };

    await db.transaction('rw', db.transactions, db.accounts, async () => {
      await db.transactions.put(updatedTrx);
      
      // Recalculate old account balance
      await this.recalculateAccountBalance(oldAccountId);

      // If account changed, recalculate new account balance as well
      if (targetAccountId !== oldAccountId) {
        await this.recalculateAccountBalance(targetAccountId);
      }
    });

    return updatedTrx;
  }

  /**
   * Deletes a transaction and recalculates the affected account balance.
   */
  async deleteTransaction(id: string): Promise<boolean> {
    const existing = await db.transactions.get(id);
    if (!existing) {
      return false;
    }

    const accountId = existing.accountId;

    await db.transaction('rw', db.transactions, db.accounts, async () => {
      await db.transactions.delete(id);
      await this.recalculateAccountBalance(accountId);
    });

    return true;
  }

  /**
   * Recalculates an account's financial balance from all its transactions.
   * Transactions are the absolute Source of Truth.
   */
  async recalculateAccountBalance(accountId: string): Promise<Account | undefined> {
    const account = await db.accounts.get(accountId);
    if (!account) return undefined;

    const transactions = await db.transactions
      .where('accountId')
      .equals(accountId)
      .toArray();

    const metrics = computeAccountMetricsFromTransactions(transactions);
    const now = new Date().toISOString();

    const updatedFields = {
      currentBalance: metrics.currentBalance,
      totalDebit: metrics.totalDebit,
      totalCredit: metrics.totalCredit,
      transactionCount: metrics.transactionCount,
      lastTransactionDate: metrics.lastTransactionDate,
      updatedAt: now,
    };

    await db.accounts.update(accountId, updatedFields);
    return await db.accounts.get(accountId);
  }

  /**
   * Recalculates all balances for every account in the database from scratch.
   * Does NOT alter or delete any transaction records.
   */
  async recalculateAllBalances(): Promise<{ accountsUpdated: number }> {
    const allAccounts = await db.accounts.toArray();
    let count = 0;

    for (const acc of allAccounts) {
      await this.recalculateAccountBalance(acc.id);
      count++;
    }

    return { accountsUpdated: count };
  }

  /**
   * Generates a full account statement with progressive derived running balances.
   */
  async getAccountStatement(accountId: string): Promise<{
    account: Account;
    transactions: StatementItem[];
    summary: {
      totalDebit: number;
      totalCredit: number;
      netBalance: number;
      count: number;
    };
  }> {
    const account = await db.accounts.get(accountId);
    if (!account) {
      throw new Error('الحساب غير موجود');
    }

    const rawTransactions = await db.transactions
      .where('accountId')
      .equals(accountId)
      .reverse()
      .sortBy('date');

    const statementItems = computeStatementRunningBalances(rawTransactions);
    const metrics = computeAccountMetricsFromTransactions(rawTransactions);

    return {
      account,
      transactions: statementItems,
      summary: {
        totalDebit: metrics.totalDebit,
        totalCredit: metrics.totalCredit,
        netBalance: metrics.currentBalance,
        count: metrics.transactionCount,
      },
    };
  }

  /**
   * Returns global transactions summary across all accounts.
   */
  async getGlobalSummary(): Promise<TransactionSummary> {
    const transactions = await db.transactions.toArray();
    const metrics = computeAccountMetricsFromTransactions(transactions);

    return {
      totalDebit: metrics.totalDebit,
      totalCredit: metrics.totalCredit,
      netBalance: metrics.currentBalance,
      totalTransactions: metrics.transactionCount,
    };
  }
}

export const transactionEngine = new FinancialTransactionEngine();
