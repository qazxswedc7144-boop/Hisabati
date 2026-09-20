import { db } from '../database/db';
import { DebtRecord } from '@/shared/types';

export const debtRepository = {
  async getAll(): Promise<DebtRecord[]> {
    return await db.debts.toArray();
  },

  async getByAccountId(accountId: string): Promise<DebtRecord[]> {
    return await db.debts.where('accountId').equals(accountId).toArray();
  },

  async getOpenDebts(): Promise<DebtRecord[]> {
    return await db.debts.where('status').anyOf(['open', 'partial', 'overdue']).toArray();
  },

  async save(debt: DebtRecord): Promise<string> {
    return await db.debts.put(debt);
  },

  async bulkSave(debts: DebtRecord[]): Promise<void> {
    await db.debts.bulkPut(debts);
  },

  async delete(id: string): Promise<void> {
    await db.debts.delete(id);
  }
};
