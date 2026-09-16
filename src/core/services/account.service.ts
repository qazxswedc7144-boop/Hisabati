import { db } from '../database/db';
import { Account, CreateAccountDTO, UpdateAccountDTO, AccountFilterType, CurrencyCode } from '@/shared/types';
import { validateAccountForm } from '../utils/validators';
import { transactionEngine } from './transactionEngine.service';
import { roundMoney } from '../utils/financial';
import { rbacGuard } from './rbac/RBACGuard.service';
import { resolveRequiredCurrency } from '../money/currency';
import { settingsRepository } from '../repositories/settings.repository';

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
    // 0. RBAC Guard
    await rbacGuard.assertPermission('accounts:create', {
      targetType: 'account',
      details: `إنشاء حساب جديد باسم ${dto.name}`,
    });

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

    // Fetch system default currency and resolve strictly
    const systemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');
    
    const resolvedCurrency = resolveRequiredCurrency({
      transactionCurrency: dto.currency,
      systemCurrency,
    });

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
    // 0. RBAC Guard
    await rbacGuard.assertPermission('accounts:update', {
      targetType: 'account',
      targetId: id,
    });

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
    // 0. RBAC Guard
    await rbacGuard.assertPermission('accounts:update', {
      targetType: 'account',
      targetId: id,
      details: 'أرشفة الحساب',
    });

    await db.accounts.update(id, {
      archived: true,
      updatedAt: new Date().toISOString(),
    });
    await this.enqueueSyncMutation('account', id, 'UPDATE', { archived: true }, id);
    return await this.getById(id);
  }

  async unarchiveAccount(id: string): Promise<Account | undefined> {
    // 0. RBAC Guard
    await rbacGuard.assertPermission('accounts:update', {
      targetType: 'account',
      targetId: id,
      details: 'إلغاء أرشفة الحساب',
    });

    await db.accounts.update(id, {
      archived: false,
      updatedAt: new Date().toISOString(),
    });
    await this.enqueueSyncMutation('account', id, 'UPDATE', { archived: false }, id);
    return await this.getById(id);
  }

  async deleteAccount(id: string, force = false): Promise<boolean> {
    // 0. RBAC Guard
    await rbacGuard.assertPermission('accounts:delete', {
      targetType: 'account',
      targetId: id,
    });

    const existing = await this.getById(id);
    if (!existing) return false;

    const trxCount = await db.transactions.where('accountId').equals(id).count();

    if (trxCount > 0 && !force) {
      // Safe guard: Suggest archiving instead of data loss
      throw new Error(
        `لا يمكن حذف هذا الحساب لوجود ${trxCount} عملية مالية مسجلة له. يرجى أرشفة الحساب للحفاظ على السجلات المالية.`
      );
    }

    const childTrx = await db.transactions.where('accountId').equals(id).toArray();

    await db.transaction('rw', db.accounts, db.transactions, db.settings, async () => {
      await db.transactions.where('accountId').equals(id).delete();
      await db.accounts.delete(id);

      // Phase 2.5: Record Permanent Delete Marker (Permanent Tombstone)
      const existingTombstones = await db.settings.get('hisabati_permanent_tombstones');
      const list = existingTombstones && Array.isArray(existingTombstones.value) ? existingTombstones.value : [];
      let updated = false;

      if (!list.some((t: any) => t.id === id)) {
        list.push({ id, entityType: 'account', deletedAt: new Date().toISOString() });
        updated = true;
      }
      for (const trx of childTrx) {
        if (!list.some((t: any) => t.id === trx.id)) {
          list.push({ id: trx.id, entityType: 'transaction', deletedAt: new Date().toISOString() });
          updated = true;
        }
      }

      if (updated) {
        await db.settings.put({
          id: 'hisabati_permanent_tombstones',
          key: 'hisabati_permanent_tombstones',
          value: list,
          updatedAt: new Date().toISOString(),
        });
      }
    });

    // Safe offline-first sync mutation enqueueing (tombstone)
    await this.enqueueSyncMutation('account', id, 'DELETE', { id }, id);
    for (const trx of childTrx) {
      await this.enqueueSyncMutation('transaction', trx.id, 'DELETE', { id: trx.id }, trx.id);
    }

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
    entityType: 'account' | 'transaction',
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
