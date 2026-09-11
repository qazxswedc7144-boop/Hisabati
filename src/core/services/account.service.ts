import { db } from '../database/db';
import { Account, CreateAccountDTO, UpdateAccountDTO, AccountFilterType, CurrencyCode } from '@/shared/types';
import { validateAccountForm } from '../utils/validators';
import { transactionEngine } from './transactionEngine.service';
import { roundMoney } from '../utils/financial';

export class AccountService {
  async getAll(includeArchived = false): Promise<Account[]> {
    if (includeArchived) {
      return await db.accounts.orderBy('name').toArray();
    }
    return await db.accounts.filter((a) => !a.archived).toArray();
  }

  async getById(id: string): Promise<Account | undefined> {
    return await db.accounts.get(id);
  }

  async createAccount(dto: CreateAccountDTO): Promise<Account> {
    const validation = validateAccountForm({
      name: dto.name,
      phone: dto.phone,
    });

    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'بيانات الحساب غير صحيحة';
      throw new Error(firstError);
    }

    const now = new Date().toISOString();
    const id = 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    // Fetch system default currency if not provided
    const settings = await db.settings.get('currency');
    const resolvedCurrency = dto.currency || (settings?.value as CurrencyCode) || 'YER';

    const newAccount: Account = {
      id,
      name: dto.name.trim(),
      phone: dto.phone?.trim() || undefined,
      note: dto.note?.trim() || undefined,
      category: dto.category || 'personal',
      currency: resolvedCurrency,
      createdAt: now,
      updatedAt: now,
      archived: false,
      currentBalance: 0,
      currentBalanceMinor: 0,
      totalDebit: 0,
      totalDebitMinor: 0,
      totalCredit: 0,
      totalCreditMinor: 0,
      transactionCount: 0,
    };

    await db.accounts.add(newAccount);

    // Safe offline-first sync mutation enqueueing
    await this.enqueueSyncMutation('account', id, 'CREATE', newAccount, id);

    // If there is an initial balance, record it as a first transaction through the engine
    if (dto.initialBalance && dto.initialBalance > 0) {
      const type = dto.initialBalanceType === 'owed_by_me' ? 'credit' : 'debit';
      await transactionEngine.createTransaction({
        accountId: id,
        type,
        amount: roundMoney(dto.initialBalance),
        amountMinor: dto.initialBalanceMinor,
        date: now.split('T')[0],
        note: 'رصيد افتتاحي',
        operationId: `op_init_${id}`,
      });
    }

    return (await this.getById(id)) || newAccount;
  }

  async updateAccount(id: string, dto: UpdateAccountDTO): Promise<Account | undefined> {
    const existing = await this.getById(id);
    if (!existing) {
      throw new Error('الحساب غير موجود');
    }

    if (dto.name !== undefined) {
      const validation = validateAccountForm({ name: dto.name, phone: dto.phone });
      if (!validation.isValid) {
        throw new Error(Object.values(validation.errors)[0]);
      }
    }

    const updated: Partial<Account> = {
      ...dto,
      name: dto.name ? dto.name.trim() : existing.name,
      phone: dto.phone !== undefined ? (dto.phone.trim() || undefined) : existing.phone,
      note: dto.note !== undefined ? (dto.note.trim() || undefined) : existing.note,
      updatedAt: new Date().toISOString(),
    };

    await db.accounts.update(id, updated);
    await this.enqueueSyncMutation('account', id, 'UPDATE', updated, id);
    return await this.getById(id);
  }

  async archiveAccount(id: string): Promise<Account | undefined> {
    await db.accounts.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
    });
    await this.enqueueSyncMutation('account', id, 'UPDATE', { archived: true }, id);
    return await this.getById(id);
  }

  async unarchiveAccount(id: string): Promise<Account | undefined> {
    await db.accounts.update(id, {
      archived: false,
      updatedAt: new Date().toISOString(),
    });
    await this.enqueueSyncMutation('account', id, 'UPDATE', { archived: false }, id);
    return await this.getById(id);
  }

  async deleteAccount(id: string, force = false): Promise<boolean> {
    const existing = await this.getById(id);
    if (!existing) return false;

    const trxCount = await db.transactions.where('accountId').equals(id).count();

    if (trxCount > 0 && !force) {
      // Safe guard: Suggest archiving instead of data loss
      throw new Error(
        `لا يمكن حذف هذا الحساب لوجود ${trxCount} عملية مالية مسجلة له. يرجى أرشفة الحساب للحفاظ على السجلات المالية.`
      );
    }

    await db.transaction('rw', db.accounts, db.transactions, async () => {
      await db.transactions.where('accountId').equals(id).delete();
      await db.accounts.delete(id);
    });

    // Safe offline-first sync mutation enqueueing (tombstone)
    await this.enqueueSyncMutation('account', id, 'DELETE', { id }, id);

    return true;
  }

  async search(query: string, filter?: AccountFilterType): Promise<Account[]> {
    const q = query.trim().toLowerCase();
    let queryObj = db.accounts.toCollection();

    let list = await queryObj.toArray();

    if (filter === 'archived') {
      list = list.filter((a) => a.archived);
    } else {
      list = list.filter((a) => !a.archived);

      if (filter === 'owed_to_me') {
        list = list.filter((a) => a.currentBalance > 0);
      } else if (filter === 'owed_by_me') {
        list = list.filter((a) => a.currentBalance < 0);
      } else if (filter === 'settled') {
        list = list.filter((a) => a.currentBalance === 0);
      }
    }

    if (q) {
      list = list.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.phone && a.phone.includes(q)) ||
          (a.note && a.note.toLowerCase().includes(q))
      );
    }

    return list;
  }

  /**
   * Safe offline-first sync mutation enqueueing.
   * Uses dynamic import to avoid circular dependency risks at module load time.
   */
  private async enqueueSyncMutation(
    entityType: 'account',
    entityId: string,
    operation: 'CREATE' | 'UPDATE' | 'DELETE',
    payload?: any,
    operationId?: string
  ): Promise<void> {
    try {
      const { syncEngine } = await import('./syncEngine.service');
      await syncEngine.enqueueMutation(entityType, entityId, operation, payload, operationId);
    } catch {
      // Non-blocking safeguard
    }
  }
}

export const accountService = new AccountService();
