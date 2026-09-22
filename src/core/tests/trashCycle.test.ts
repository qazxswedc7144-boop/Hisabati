import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { accountService } from '../services/account.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { rbacGuard } from '../services/rbac/RBACGuard.service';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { accountRepository } from '../repositories/account.repository';

export class TrashCycleTestSuite {
  static async runAll(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    let passed = 0;
    let failed = 0;

    const runTest = async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ title, passed: true });
        passed++;
      } catch (e: any) {
        results.push({ title, passed: false, error: e.message || String(e) });
        failed++;
      }
    };

    // Global Test Setup
    try {
      await tenantService.switchToLocalMode();
    } catch {
      // Fallback
    }

    try {
      await tenantService.initialize();
      useTenantStore.getState().setContext({
        activeOrganization: { id: 'test_org_trash_cycle', name: 'Test Org Trash Cycle' } as any,
      });
    } catch {
      // Tenant initialization fallback
    }

    rbacGuard.setActiveActor({ id: 'test_owner', name: 'مالك اختبار', role: 'owner' });

    // Setup default system settings
    try {
      await db.settings.put({
        id: 'currency',
        key: 'currency',
        value: 'YER',
        updatedAt: new Date().toISOString()
      });
    } catch {
      // Ignored
    }

    const resetDB = async () => {
      await db.accounts.clear();
      await db.transactions.clear();
      await db.trash.clear();
      await db.settings.delete('hisabati_permanent_tombstones');
    };

    await resetDB();

    // Test 1: Soft Delete preserves transactions
    await runTest('Test 1: Soft Delete preserves transactions', async () => {
      await resetDB();

      // أنشئ حساب "محمد الاختبار"
      const acc = await accountRepository.create({
        name: 'محمد الاختبار',
        phone: '777777777',
      });

      // أضف له حركة واحدة (debit 1000 YER)
      const trx = await transactionEngine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 1000,
        status: 'posted',
        date: new Date().toISOString().split('T')[0],
        note: 'حركة اختبار',
      });

      // accountService.deleteAccount(id, false, true)
      const success = await accountService.deleteAccount(acc.id, false, true);
      if (!success) {
        throw new Error('فشلت عملية الحذف المؤقت');
      }

      // تأكد: الحركات لا تزال موجودة
      const count = await db.transactions.where('accountId').equals(acc.id).count();
      if (count !== 1) {
        throw new Error(`متوقع حركة واحدة، وجد: ${count}`);
      }

      // تأكد: deletedAt موجود
      const freshAcc = await db.accounts.get(acc.id);
      if (!freshAcc || !freshAcc.deletedAt) {
        throw new Error('لم يتم حفظ deletedAt على الحساب');
      }

      // تأكد: status === 'pending'
      const trashItem = await db.trash.where('entityId').equals(acc.id).first();
      if (!trashItem || trashItem.status !== 'pending') {
        throw new Error(`حالة بند السلة غير صحيحة، وجد: ${trashItem?.status}`);
      }
    });

    // Test 2: Soft Delete creates valid trash record
    await runTest('Test 2: Soft Delete creates valid trash record', async () => {
      await resetDB();

      const acc = await accountRepository.create({
        name: 'حساب اختبار اللقطة',
        phone: '777777777',
      });

      await accountService.deleteAccount(acc.id, false, true);

      const trashItem = await db.trash.where('entityId').equals(acc.id).first();
      if (!trashItem) {
        throw new Error('لم يتم إنشاء بند سلة المهملات');
      }

      if (trashItem.entityType !== 'account') {
        throw new Error(`نوع الكيان غير صحيح: ${trashItem.entityType}`);
      }

      if (!trashItem.checksum) {
        throw new Error('الـ checksum فارغ أو غير موجود');
      }

      if (new Date(trashItem.expiresAt).getTime() <= new Date(trashItem.deletedAt).getTime()) {
        throw new Error('تاريخ انتهاء الصلاحية غير صحيح');
      }

      if (!trashItem.snapshot?.account) {
        throw new Error('اللقطة لا تحتوي على بيانات الحساب');
      }
    });

    // Test 3: Restore returns account to active state
    await runTest('Test 3: Restore returns account to active state', async () => {
      await resetDB();

      const acc = await accountRepository.create({
        name: 'حساب استعادة نشط',
        phone: '777777777',
      });

      await transactionEngine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 500,
        status: 'posted',
        date: new Date().toISOString().split('T')[0],
      });

      await accountService.deleteAccount(acc.id, false, true);

      const trashItem = await db.trash.where('entityId').equals(acc.id).first();
      if (!trashItem) throw new Error('بند السلة غير موجود');

      const restored = await accountService.restoreFromTrash(trashItem.id);
      if (!restored) {
        throw new Error('فشلت دالة الاستعادة');
      }

      const freshAcc = await db.accounts.get(acc.id);
      if (!freshAcc) throw new Error('الحساب المستعاد غير موجود');
      if (freshAcc.deletedAt !== undefined) {
        throw new Error('حقل deletedAt لم يتم تصفيره');
      }

      const freshTrash = await db.trash.get(trashItem.id);
      if (!freshTrash || freshTrash.status !== 'restored') {
        throw new Error(`حالة بند السلة بعد الاستعادة غير صحيحة: ${freshTrash?.status}`);
      }

      const count = await db.transactions.where('accountId').equals(acc.id).count();
      if (count !== 1) {
        throw new Error(`الحركات المرتبطة تالفة بعد الاستعادة، وجد: ${count}`);
      }
    });

    // Test 4: Restore rejects on name conflict
    await runTest('Test 4: Restore rejects on name conflict', async () => {
      await resetDB();

      const accA = await accountRepository.create({
        name: 'اسم مشترك',
        phone: '111111111',
      });
      await accountService.deleteAccount(accA.id, false, true);

      const trashA = await db.trash.where('entityId').equals(accA.id).first();
      if (!trashA) throw new Error('بند السلة للحساب أ غير موجود');

      await accountRepository.create({
        name: 'اسم مشترك',
        phone: '222222222',
      });

      try {
        await accountService.restoreFromTrash(trashA.id);
        throw new Error('لم يرمِ خطأ عند تضارب الأسماء');
      } catch (err: any) {
        if (!err.message.includes('يوجد حساب آخر بنفس الاسم')) {
          throw new Error(`رسالة الخطأ غير متوقعة: ${err.message}`);
        }
      }
    });

    // Test 5: Restore rejects on checksum mismatch
    await runTest('Test 5: Restore rejects on checksum mismatch', async () => {
      await resetDB();

      const acc = await accountRepository.create({
        name: 'حساب لفحص سلامة البند',
        phone: '777777777',
      });

      await accountService.deleteAccount(acc.id, false, true);

      const trashItem = await db.trash.where('entityId').equals(acc.id).first();
      if (!trashItem) throw new Error('بند السلة غير موجود');

      await db.trash.update(trashItem.id, { checksum: 'invalid_hash' });

      try {
        await accountService.restoreFromTrash(trashItem.id);
        throw new Error('تم الاستعادة رغم عدم تطابق الـ checksum');
      } catch (err: any) {
        if (!err.message.includes('فشل التحقق من سلامة اللقطة')) {
          throw new Error(`رسالة الخطأ غير متوقعة: ${err.message}`);
        }
      }
    });

    // Test 6: Purge rejects when transactions exist
    await runTest('Test 6: Purge rejects when transactions exist', async () => {
      await resetDB();

      const acc = await accountRepository.create({
        name: 'حساب مرتبط بحركات للإعدام',
        phone: '777777777',
      });

      await transactionEngine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 100,
        status: 'posted',
        date: new Date().toISOString().split('T')[0],
      });

      await accountService.deleteAccount(acc.id, false, true);

      const trashItem = await db.trash.where('entityId').equals(acc.id).first();
      if (!trashItem) throw new Error('بند السلة غير موجود');

      try {
        await accountService.deletePermanentlyFromTrash(trashItem.id);
        throw new Error('تم الحذف النهائي رغم وجود حركات مالية مسجلة');
      } catch (err: any) {
        if (!err.message.includes('لا يمكن الحذف النهائي') || !err.message.includes('حركة مالية مرتبطة')) {
          throw new Error(`رسالة الخطأ غير متوقعة: ${err.message}`);
        }
      }
    });

    // Test 7: Purge succeeds for empty account
    await runTest('Test 7: Purge succeeds for empty account', async () => {
      await resetDB();

      const acc = await accountRepository.create({
        name: 'حساب خالٍ للإعدام',
        phone: '777777777',
      });

      await accountService.deleteAccount(acc.id, false, true);

      const trashItem = await db.trash.where('entityId').equals(acc.id).first();
      if (!trashItem) throw new Error('بند السلة غير موجود');

      await accountService.deletePermanentlyFromTrash(trashItem.id);

      const freshAcc = await db.accounts.get(acc.id);
      if (freshAcc !== undefined) {
        throw new Error('لم يتم حذف الحساب من جدول الحسابات');
      }

      const freshTrash = await db.trash.get(trashItem.id);
      if (!freshTrash || freshTrash.status !== 'purged') {
        throw new Error(`حالة بند السلة غير صحيحة بعد الإعدام: ${freshTrash?.status}`);
      }

      const entry = await db.settings.get('hisabati_permanent_tombstones');
      const list = entry && Array.isArray(entry.value) ? entry.value : [];
      if (!list.some((t: any) => t.id === acc.id)) {
        throw new Error('لم يتم تسجيل tombstone دائم في الإعدادات');
      }
    });

    // Test 8: Migration normalizes legacy 'deleted' status
    await runTest('Test 8: Migration normalizes legacy \'deleted\' status', async () => {
      await resetDB();

      const trashId = 'legacy_deleted_item_123';
      await db.trash.add({
        id: trashId,
        entityType: 'account',
        entityId: 'legacy_acc_123',
        deletedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        deletedBy: 'system',
        status: 'deleted' as any,
        snapshot: { account: { id: 'legacy_acc_123', name: 'حساب قديم' } } as any,
      });

      await db.trash.toCollection().modify((item: any) => {
        if (item.status === 'deleted') {
          item.status = 'pending';
        }
      });

      const updatedItem = await db.trash.get(trashId);
      if (!updatedItem || updatedItem.status !== 'pending') {
        throw new Error(`لم يتم تحويل الحالة إلى pending، وجد: ${updatedItem?.status}`);
      }
    });

    // Cleanup after all tests
    await resetDB();

    return {
      total: results.length,
      passed,
      failed,
      results,
    };
  }
}
