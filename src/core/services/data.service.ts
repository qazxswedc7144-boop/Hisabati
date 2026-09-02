import { accountRepository } from '../repositories/account.repository';
import { transactionRepository } from '../repositories/transaction.repository';
import { settingsRepository } from '../repositories/settings.repository';
import { seedMockDataIfEmpty, resetToMockData, clearAllData } from '@/shared/data/mockData';
import { Account, Transaction, TransactionSummary, CreateAccountDTO, CreateTransactionDTO } from '@/shared/types';

export class DataService {
  async initialize(): Promise<void> {
    await seedMockDataIfEmpty();
  }

  async getDashboardSummary(): Promise<{
    summary: TransactionSummary;
    totalAccounts: number;
    recentTransactions: Transaction[];
    accounts: Account[];
  }> {
    await this.initialize();
    const [summary, accounts, recentTransactions] = await Promise.all([
      transactionRepository.getSummary(),
      accountRepository.getAll(),
      transactionRepository.getRecent(5),
    ]);

    return {
      summary,
      totalAccounts: accounts.length,
      recentTransactions,
      accounts,
    };
  }

  async addAccount(dto: CreateAccountDTO): Promise<Account> {
    return await accountRepository.create(dto);
  }

  async addTransaction(dto: CreateTransactionDTO): Promise<Transaction> {
    return await transactionRepository.create(dto);
  }

  async resetData(): Promise<void> {
    await resetToMockData();
  }

  async clearData(): Promise<void> {
    await clearAllData();
  }

  async exportJsonBackup(): Promise<string> {
    const accounts = await accountRepository.getAll(true);
    const transactions = await transactionRepository.getAll();
    const settings = await settingsRepository.getSettings();

    const backupData = {
      version: 1,
      appName: 'Hisabati',
      exportedAt: new Date().toISOString(),
      data: {
        accounts,
        transactions,
        settings,
      },
    };

    return JSON.stringify(backupData, null, 2);
  }
}

export const dataService = new DataService();
