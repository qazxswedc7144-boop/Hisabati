import { db } from '../database/db';
import { Account, CreateAccountDTO, UpdateAccountDTO } from '@/shared/types';
import { accountService } from '../services/account.service';
import { transactionEngine } from '../services/transactionEngine.service';

export class AccountRepository {
  async getAll(includeArchived = false): Promise<Account[]> {
    return await accountService.getAll(includeArchived);
  }

  async getById(id: string): Promise<Account | undefined> {
    return await accountService.getById(id);
  }

  async create(dto: CreateAccountDTO): Promise<Account> {
    return await accountService.createAccount(dto);
  }

  async update(id: string, dto: UpdateAccountDTO): Promise<Account | undefined> {
    return await accountService.updateAccount(id, dto);
  }

  async archive(id: string): Promise<Account | undefined> {
    return await accountService.archiveAccount(id);
  }

  async unarchive(id: string): Promise<Account | undefined> {
    return await accountService.unarchiveAccount(id);
  }

  async delete(id: string, cascade = true): Promise<boolean> {
    return await accountService.deleteAccount(id, cascade);
  }

  async recalculateAccountBalance(accountId: string): Promise<Account | undefined> {
    return await transactionEngine.recalculateAccountBalance(accountId);
  }

  async recalculateAll(): Promise<{ accountsUpdated: number }> {
    return await transactionEngine.recalculateAllBalances();
  }

  async search(query: string): Promise<Account[]> {
    return await accountService.search(query);
  }
}

export const accountRepository = new AccountRepository();

