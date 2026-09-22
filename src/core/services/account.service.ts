import { db, getDb } from '../database/db';
import { Account, CreateAccountDTO, UpdateAccountDTO, AccountFilterType, CurrencyCode } from '@/shared/types';
import { validateAccountForm } from '../utils/validators';
import { transactionEngine } from './transactionEngine.service';
import { roundMoney } from '../utils/financial';
import { rbacGuard } from './rbac/RBACGuard.service';
import { resolveRequiredCurrency } from '../money/currency';
import { settingsRepository } from '../repositories/settings.repository';
import { SyncContextRegistry } from './syncContext';
import { auditTrailService } from './rbac/AuditTrail.service';

export class AccountService {
  public beginSyncApply(): void {
    SyncContextRegistry.beginSyncApply();
  }

  public endSyncApply(): void {
    SyncContextRegistry.endSyncApply();
  }

  public isInsideSyncApply(): boolean {
    return SyncContextRegistry.isInsideSyncApply();
  }

  async getAll(includeArchived = false): Promise<Account[]> {
    if (includeArchived) {
      return await db.accounts.orderBy('name').toArray();
    }
    return await db.accounts.where('archived').equals(0).toArray();
  }

  async getById(id: string): Promise<Account | undefined> {
    return await db.accounts.get(id);
  }

  async createAccount(dto: CreateAccountDTO, options?: { isRemote?: boolean }): Promise<Account> {
    if (options?.isRemote && !this.isInsideSyncApply()) {
      throw new Error('isRemote ممنوع خارج محرك المزامنة (syncEngine)');
    }

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

    // Idempotency Check
    if (dto.operationId) {
      const existing = await db.accounts.where('id').equals(dto.operationId).first() || 
                       await db.accounts.get(dto.operationId);
      if (existing) return existing;
    }

    const now = new Date().toISOString();
    const id = dto.operationId || 'acc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

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
      archived: 0,
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
    if (!options?.isRemote) {
      await this.enqueueSyncMutation('account', id, 'CREATE', newAccount, id);
    }

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

  async updateAccount(id: string, dto: UpdateAccountDTO, options?: { isRemote?: boolean }): Promise<Account | undefined> {
    if (options?.isRemote && !this.isInsideSyncApply()) {
      throw new Error('isRemote ممنوع خارج محرك المزامنة (syncEngine)');
    }

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
    if (!options?.isRemote) {
      await this.enqueueSyncMutation('account', id, 'UPDATE', updated, id);
    }
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
      archived: 1,
      updatedAt: new Date().toISOString(),
    });
    await this.enqueueSyncMutation('account', id, 'UPDATE', { archived: 1 }, id);
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
      archived: 0,
      updatedAt: new Date().toISOString(),
    });
    await this.enqueueSyncMutation('account', id, 'UPDATE', { archived: 0 }, id);
    return await this.getById(id);
  }

  async deleteAccount(id: string, force = false, moveToTrash = false, options?: { isRemote?: boolean }): Promise<boolean> {
    if (options?.isRemote && !this.isInsideSyncApply()) {
      throw new Error('isRemote ممنوع خارج محرك المزامنة (syncEngine)');
    }

    if (moveToTrash && !force) {
      // [أ] Soft Delete (moveToTrash=true && !force)
      // 1. RBAC Guard
      await rbacGuard.assertPermission('accounts:delete', {
        targetType: 'account',
        targetId: id,
      });

      // 2. existing check
      const existing = await this.getById(id);
      if (!existing) return false;

      // 3. existing.deletedAt check
      if (existing.deletedAt) {
        throw new Error('الحساب موجود في سلة المهملات مسبقًا');
      }

      // 4. now and expiresAt
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

      // 5. actor
      const actor = rbacGuard.getActiveActor();

      // 6. checksum
      const checksum = await this.computeAccountChecksum(existing);

      // 7. database transaction (Soft delete — الحساب يبقى، الحركات تبقى)
      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.accounts, activeDb.trash, async () => {

        await activeDb.accounts.update(id, {
          deletedAt: now.toISOString(),
          deletedBy: actor.id,
          deletedReason: 'تم الحذف إلى سلة المهملات',
          updatedAt: now.toISOString(),
        });

        await activeDb.trash.add({
          id: `trash_${Date.now()}_${id}`,
          entityType: 'account',
          entityId: id,
          snapshot: { account: existing },
          status: 'pending',
          deletedAt: now.toISOString(),
          deletedBy: actor.id,
          reasonCode: 'USER_REQUEST',
          expiresAt: expiresAt.toISOString(),
          checksum,
        });
      });

      // 8. auditTrailService log
      await auditTrailService.log({
        actor,
        action: 'ACCOUNT_DELETE', // Since 'ACCOUNT_SOFT_DELETE' is not in AuditAction union type, we use 'ACCOUNT_DELETE'
        targetType: 'account',
        targetId: id,
        riskLevel: 'MEDIUM',
        detailsAr: `حذف الحساب "${existing.name}" إلى سلة المهملات`,
      });

      // 9. enqueue sync mutation
      if (!options?.isRemote) {
        await this.enqueueSyncMutation(
          'account',
          id,
          'UPDATE',
          { deletedAt: now.toISOString(), deletedBy: actor.id },
          id
        );
      }

      // 10. return true
      return true;
    } else if (force) {
      // [ب] Hard Delete (force=true)
      // 1. RBAC Guard
      await rbacGuard.assertPermission('accounts:delete', {
        targetType: 'account',
        targetId: id,
      });

      // 2. existing check
      const existing = await this.getById(id);
      if (!existing) return false;

      // 3. transaction count
      const trxCount = await db.transactions.where('accountId').equals(id).count();

      // 4. check if has any transactions
      if (trxCount > 0) {
        throw new Error(
          `لا يمكن الحذف النهائي: يوجد ${trxCount} حركة مالية مرتبطة. الحركات المالية جزء من الدفتر ولا تُحذف.`
        );
      }

      // 5. delete account from db & permanent tombstone
      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.accounts, activeDb.trash, activeDb.settings, async () => {
        await activeDb.accounts.delete(id);

        const entry = await activeDb.settings.get('hisabati_permanent_tombstones');
        const list = entry && Array.isArray(entry.value) ? entry.value : [];
        if (!list.some((t: any) => t.id === id)) {
          list.push({ id, entityType: 'account', deletedAt: new Date().toISOString() });
          await activeDb.settings.put({
            id: 'hisabati_permanent_tombstones',
            key: 'hisabati_permanent_tombstones',
            value: list,
            updatedAt: new Date().toISOString(),
          });
        }
      });

      // 6. audit trail log
      const actor = rbacGuard.getActiveActor();
      await auditTrailService.log({
        actor,
        action: 'ACCOUNT_DELETE', // Since 'ACCOUNT_HARD_DELETE' is not in AuditAction union type, we use 'ACCOUNT_DELETE'
        targetType: 'account',
        targetId: id,
        riskLevel: 'HIGH',
        detailsAr: `حذف الحساب النهائي "${existing.name}"`,
      });

      // 7. enqueue sync mutation
      if (!options?.isRemote) {
        await this.enqueueSyncMutation('account', id, 'DELETE', { id }, id);
      }

      // 8. return true
      return true;
    } else {
      // [ج] الرفض (بدون force وبدون moveToTrash)
      const trxCount = await db.transactions.where('accountId').equals(id).count();
      throw new Error(
        `لا يمكن حذف حساب له ${trxCount} حركة مالية مباشرة. استخدم الأرشفة أو سلة المهملات.`
      );
    }
  }

  private async computeAccountChecksum(account: Account): Promise<string> {
    const { calculateSHA256 } = await import('../utils/crypto');
    return await calculateSHA256(JSON.stringify({
      id: account.id,
      name: account.name,
      phone: account.phone ?? null,
      currentBalanceMinor: account.currentBalanceMinor ?? 0,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));
  }

  /**
   * Restores an account and its transactions from trash.
   */
  async restoreFromTrash(trashId: string): Promise<boolean> {
    // 1. RBAC Guard
    await rbacGuard.assertPermission('accounts:create', {
      targetType: 'account',
      details: 'استعادة حساب من سلة المهملات',
    });

    // 2. Get trash item
    const trashItem = await db.trash.get(trashId);
    if (!trashItem) {
      throw new Error('البند غير موجود في سلة المهملات');
    }

    // 3. Check status
    if (trashItem.status !== 'pending') {
      throw new Error(`لا يمكن استعادة عنصر بحالة ${trashItem.status}`);
    }

    // 4. Extract account from snapshot
    const account = trashItem.snapshot?.account;
    if (!account) {
      throw new Error('بيانات الحساب غير موجودة في اللقطة');
    }

    // 5. Checksum verification
    const expected = await this.computeAccountChecksum(account);
    if (trashItem.checksum && trashItem.checksum !== expected) {
      throw new Error('فشل التحقق من سلامة اللقطة — تم رفض الاستعادة');
    }

    // 6. Name uniqueness conflict check
    const conflicting = await db.accounts
      .where('name').equals(account.name)
      .filter(a => a.id !== account.id && !a.deletedAt)
      .count();
    if (conflicting > 0) {
      throw new Error(`يوجد حساب آخر بنفس الاسم "${account.name}". أعد تسميته قبل الاستعادة.`);
    }

    // 7. Actor and Timestamp
    const actor = rbacGuard.getActiveActor();
    const now = new Date().toISOString();

    // 8. DB Transaction
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.accounts, activeDb.trash, async () => {

      // تحقق مزدوج
      const freshTrash = await activeDb.trash.get(trashId);
      if (!freshTrash || freshTrash.status !== 'pending') {
        throw new Error('تغيرت حالة العنصر أثناء الاستعادة');
      }

      // إن كان الحساب موجودًا (soft-deleted) ⇒ أزل deletedAt
      const current = await activeDb.accounts.get(account.id);
      if (current) {
        await activeDb.accounts.update(account.id, {
          deletedAt: undefined,
          deletedBy: undefined,
          deletedReason: undefined,
          updatedAt: now,
        });
      } else {
        // الحالة النادرة: الحساب حُذف فعليًا — أعده من snapshot
        await activeDb.accounts.add({
          ...account,
          deletedAt: undefined,
          deletedBy: undefined,
          deletedReason: undefined,
          updatedAt: now,
        });
      }

      await activeDb.trash.update(trashId, {
        status: 'restored',
        restoredAt: now,
        restoredBy: actor.id,
      });
    });

    // 9. Audit trail logging
    await auditTrailService.log({
      actor,
      action: 'ACCOUNT_UPDATE', // ACCOUNT_UPDATE is the valid existing AuditAction
      targetType: 'account',
      targetId: account.id,
      riskLevel: 'MEDIUM',
      detailsAr: `استعادة الحساب "${account.name}" من سلة المهملات`,
    });

    // 10. Enqueue Sync Mutation
    if (!this.isInsideSyncApply()) {
      await this.enqueueSyncMutation(
        'account',
        account.id,
        'UPDATE',
        { deletedAt: undefined, deletedBy: undefined },
        account.id
      );
    }

    // 11. Return true
    return true;
  }

  async getTrashItems(): Promise<any[]> {
    return await db.trash.orderBy('deletedAt').reverse().toArray();
  }

  async deletePermanentlyFromTrash(trashId: string): Promise<void> {
    // 1. RBAC Guard
    await rbacGuard.assertPermission('accounts:delete', {
      targetType: 'account',
      details: 'حذف نهائي من سلة المهملات',
    });

    // 2. Get trash item
    const trashItem = await db.trash.get(trashId);
    if (!trashItem) {
      throw new Error('العنصر غير موجود');
    }
    if (trashItem.status !== 'pending') {
      throw new Error(`لا يمكن إعدام عنصر بحالة ${trashItem.status}`);
    }

    // 3. Extract entity ID
    const entityId = trashItem.entityId;

    // 4. Transaction check
    const trxCount = await db.transactions.where('accountId').equals(entityId).count();
    if (trxCount > 0) {
      throw new Error(
        `لا يمكن الحذف النهائي: يوجد ${trxCount} حركة مالية مرتبطة. الحركات المالية جزء من الدفتر ولا تُحذف.`
      );
    }

    // 5. Checksum verification
    const account = trashItem.snapshot?.account;
    if (account) {
      const expected = await this.computeAccountChecksum(account);
      if (trashItem.checksum && trashItem.checksum !== expected) {
        throw new Error('فشل التحقق من سلامة اللقطة قبل الإعدام');
      }
    }

    // 6. Actor & timestamp
    const actor = rbacGuard.getActiveActor();
    const now = new Date().toISOString();

    // 7. DB Transaction
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.accounts, activeDb.trash, activeDb.settings, activeDb.transactions, async () => {

      // double-check داخل transaction
      const insideTx = await activeDb.transactions.where('accountId').equals(entityId).count();
      if (insideTx > 0) {
        throw new Error('ظهرت حركات مرتبطة أثناء العملية — تم إلغاء الإعدام تلقائيًا.');
      }

      const freshTrash = await activeDb.trash.get(trashId);
      if (!freshTrash || freshTrash.status !== 'pending') {
        throw new Error('تغيرت حالة العنصر أثناء الإعدام');
      }

      // احذف الحساب فعليًا
      await activeDb.accounts.delete(entityId);

      // حدّث trash (لا تحذفه — للتدقيق)
      await activeDb.trash.update(trashId, {
        status: 'purged',
        purgedAt: now,
        purgedBy: actor.id,
      });

      // tombstone دائم
      const entry = await activeDb.settings.get('hisabati_permanent_tombstones');
      const list = entry && Array.isArray(entry.value) ? entry.value : [];
      if (!list.some((t: any) => t.id === entityId)) {
        list.push({
          id: entityId,
          entityType: 'account',
          purgedAt: now,
          purgedBy: actor.id,
        });
        await activeDb.settings.put({
          id: 'hisabati_permanent_tombstones',
          key: 'hisabati_permanent_tombstones',
          value: list,
          updatedAt: now,
        });
      }
    });

    // 8. Audit trail log
    await auditTrailService.log({
      actor,
      action: 'ACCOUNT_DELETE', // القيمة القياسية
      targetType: 'account',
      targetId: entityId,
      riskLevel: 'HIGH',
      detailsAr: `حذف نهائي للحساب "${account?.name || entityId}" من سلة المهملات`,
      metadata: { trashId, purgedAt: now },
    });

    // 9. Sync mutation
    await this.enqueueSyncMutation('account', entityId, 'DELETE', { id: entityId }, entityId);
  }

  async search(query: string, filter?: AccountFilterType): Promise<Account[]> {
    const q = query.trim().toLowerCase();
    let queryObj = db.accounts.toCollection();

    let list = await queryObj.toArray();

    if (filter === 'archived') {
      list = list.filter((a) => a.archived === 1);
    } else {
      list = list.filter((a) => a.archived === 0);

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
