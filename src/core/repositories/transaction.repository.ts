import { db } from '../database/db';
import { Transaction, CreateTransactionDTO, UpdateTransactionDTO, TransactionSummary } from '@/shared/types';
import { transactionEngine } from '../services/transactionEngine.service';

export class TransactionRepository {
  async getAll(): Promise<Transaction[]> {
    const list = await db.transactions.orderBy('date').reverse().toArray();
    return this.populateAccountNames(list);
  }

  async getById(id: string): Promise<Transaction | undefined> {
    const trx = await db.transactions.get(id);
    if (!trx) return undefined;
    const [populated] = await this.populateAccountNames([trx]);
    return populated;
  }

  async getByAccountId(accountId: string): Promise<Transaction[]> {
    const statement = await transactionEngine.getAccountStatement(accountId);
    return this.populateAccountNames(statement.transactions);
  }

  async getRecent(limit = 10): Promise<Transaction[]> {
    const list = await db.transactions
      .orderBy('date')
      .reverse()
      .limit(limit)
      .toArray();
    return this.populateAccountNames(list);
  }

  async create(dto: CreateTransactionDTO): Promise<Transaction> {
    const trx = await transactionEngine.createTransaction(dto);
    const [populated] = await this.populateAccountNames([trx]);
    return populated || trx;
  }

  async update(id: string, dto: UpdateTransactionDTO): Promise<Transaction | undefined> {
    const trx = await transactionEngine.updateTransaction(id, dto);
    const [populated] = await this.populateAccountNames([trx]);
    return populated || trx;
  }

  async delete(id: string): Promise<boolean> {
    return await transactionEngine.deleteTransaction(id);
  }

  async getSummary(): Promise<TransactionSummary> {
    return await transactionEngine.getGlobalSummary();
  }

  private async populateAccountNames(transactions: Transaction[]): Promise<Transaction[]> {
    if (transactions.length === 0) return [];
    
    // Fetch unique account IDs
    const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
    const accounts = await db.accounts.where('id').anyOf(accountIds).toArray();
    const accountMap = new Map(accounts.map(a => [a.id, a.name]));

    return transactions.map(t => ({
      ...t,
      accountName: accountMap.get(t.accountId) || 'حساب غير معروف',
    }));
  }
}

export const transactionRepository = new TransactionRepository();

