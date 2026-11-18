import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { settingsRepository } from '../repositories/settings.repository';
import { tenantService } from '../services/TenantService';
import { transactionEngine } from '../services/transactionEngine.service';

export interface TransactionConcurrencySafetyResult {
  total: number;
  passed: number;
  failed: number;
  results: { id: number; title: string; passed: boolean; error?: string }[];
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitForGate(promise: Promise<void>, label: string): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out waiting for concurrency gate: ${label}`)), 5000);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

let sequence = 0;

async function createDraftFixture(
  prefix: string,
  amountMinor = 1200,
  note = 'draft-before-concurrent-post',
) {
  const suffix = `${Date.now()}_${++sequence}`;
  const accountId = `acc_${prefix}_${suffix}`;
  await db.accounts.add({
    id: accountId,
    name: `حساب اختبار التزامن ${prefix}`,
    currency: 'YER',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: 0,
    currentBalance: 0,
    currentBalanceMinor: 0,
    totalDebit: 0,
    totalDebitMinor: 0,
    totalCredit: 0,
    totalCreditMinor: 0,
    transactionCount: 0,
  } as any);

  const draft = await transactionEngine.createTransaction({
    accountId,
    type: 'debit',
    amount: amountMinor,
    amountMinor,
    currency: 'YER',
    status: 'draft',
    date: '2026-11-18',
    note,
    operationId: `op_${prefix}_${suffix}`,
  });
  return { accountId, draft };
}

export const TransactionConcurrencySafetyTestSuite = {
  async runAll(): Promise<TransactionConcurrencySafetyResult> {
    const results: TransactionConcurrencySafetyResult['results'] = [];
    const addResult = (id: number, title: string, passed: boolean, error?: string) => {
      results.push({ id, title, passed, error });
    };

    await tenantService.switchToLocalMode();

    // Deterministically interleave public operations: pause after the initial
    // DRAFT read, commit POSTED in a competing operation, then resume.
    {
      const { accountId, draft } = await createDraftFixture('update_race');
      const gateReached = deferred<void>();
      const releaseGate = deferred<void>();
      const originalGetSettings = settingsRepository.getSettings;

      (settingsRepository as any).getSettings = async () => {
        gateReached.resolve();
        await releaseGate.promise;
        return originalGetSettings.call(settingsRepository);
      };

      const updatePromise = transactionEngine.updateTransaction(draft.id, {
        note: 'late-update-must-not-overwrite-posted',
      }).then(
        () => '',
        (error: unknown) => error instanceof Error ? error.message : String(error),
      );

      try {
        await waitForGate(gateReached.promise, 'update pre-transaction settings read');
        await transactionEngine.postTransaction(draft.id);
      } finally {
        releaseGate.resolve();
        (settingsRepository as any).getSettings = originalGetSettings;
      }

      const updateError = await updatePromise;
      const saved = await db.transactions.get(draft.id);
      const account = await db.accounts.get(accountId);
      addResult(
        1,
        'سباق الترحيل مع التعديل: إعادة قراءة POSTED داخل معاملة Dexie تمنع الكتابة القديمة',
        updateError.includes('لا يمكن تعديل') &&
          saved?.status === 'posted' &&
          saved.note === 'draft-before-concurrent-post' &&
          account?.currentBalanceMinor === 1200,
        updateError || undefined,
      );
    }

    // Race 2: deletion also must re-check the status after the competing post.
    {
      const { accountId, draft } = await createDraftFixture('delete_race');
      const gateReached = deferred<void>();
      const releaseGate = deferred<void>();
      const originalGet = settingsRepository.get;

      (settingsRepository as any).get = async (key: string, defaultValue?: unknown) => {
        if (key === 'currency') {
          gateReached.resolve();
          await releaseGate.promise;
        }
        return originalGet.call(settingsRepository, key, defaultValue);
      };

      const deletePromise = transactionEngine.deleteTransaction(draft.id).then(
        () => '',
        (error: unknown) => error instanceof Error ? error.message : String(error),
      );

      try {
        await waitForGate(gateReached.promise, 'delete pre-transaction currency read');
        await transactionEngine.postTransaction(draft.id);
      } finally {
        releaseGate.resolve();
        (settingsRepository as any).get = originalGet;
      }

      const deleteError = await deletePromise;
      const saved = await db.transactions.get(draft.id);
      const account = await db.accounts.get(accountId);
      const deleteAudit = await db.financialAuditLogs
        .where('targetId')
        .equals(draft.id)
        .filter((entry) => entry.eventType === 'TRANSACTION_DELETE')
        .toArray();

      addResult(
        2,
        'سباق الترحيل مع الحذف: لا يُحذف POSTED ولا يُفقد أثره من الرصيد أو التدقيق',
        deleteError.includes('لا يمكن حذف') &&
          saved?.status === 'posted' &&
          account?.currentBalanceMinor === 1200 &&
          deleteAudit.length === 0,
        deleteError || undefined,
      );
    }


    // T3: A DRAFT update must persist the new amount before a later post.
    {
      try {
        const { accountId, draft } = await createDraftFixture('update_then_post', 1000);
        const initialAccount = await db.accounts.get(accountId);
        const initialBalance = initialAccount?.currentBalanceMinor ?? 0;

        await transactionEngine.updateTransaction(draft.id, { amountMinor: 1500 });
        const updated = await db.transactions.get(draft.id);
        const updateAudit = await db.financialAuditLogs
          .where('targetId')
          .equals(draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_UPDATE')
          .toArray();
        const afterDraftUpdate = await db.accounts.get(accountId);

        await transactionEngine.postTransaction(draft.id);
        const posted = await db.transactions.get(draft.id);
        const postAudit = await db.financialAuditLogs
          .where('targetId')
          .equals(draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_POST')
          .toArray();
        const afterPost = await db.accounts.get(accountId);

        const passed =
          updated?.amountMinor === 1500 &&
          updateAudit.some((entry) =>
            entry.amountMinor === 1500 && entry.afterState?.amountMinor === 1500
          ) &&
          afterDraftUpdate?.currentBalanceMinor === initialBalance &&
          posted?.status === 'posted' &&
          posted.amountMinor === 1500 &&
          afterPost?.currentBalanceMinor === initialBalance + 1500 &&
          postAudit.some((entry) =>
            entry.amountMinor === 1500 && entry.afterState?.amountMinor === 1500
          );

        addResult(
          3,
          'T3 — تحديث DRAFT يُحفظ ويُرحّل لاحقًا بالقيمة الجديدة مع Audit صحيح',
          passed,
          passed ? undefined : 'فشل حفظ amountMinor أو Audit أو تطبيق القيمة المحدّثة عند الترحيل',
        );
      } catch (error: unknown) {
        addResult(3, 'T3 — تحديث DRAFT يُحفظ ويُرحّل لاحقًا بالقيمة الجديدة مع Audit صحيح', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T4: Deleting a DRAFT removes it, records the original amount, and leaves
    // the posted balance untouched.
    {
      try {
        const { accountId, draft } = await createDraftFixture('delete_draft', 1000);
        const initialAccount = await db.accounts.get(accountId);
        const initialBalance = initialAccount?.currentBalanceMinor ?? 0;

        const deleted = await transactionEngine.deleteTransaction(draft.id);
        const saved = await db.transactions.get(draft.id);
        const account = await db.accounts.get(accountId);
        const deleteAudit = await db.financialAuditLogs
          .where('targetId')
          .equals(draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_DELETE')
          .toArray();

        const passed =
          deleted === true &&
          saved === undefined &&
          account?.currentBalanceMinor === initialBalance &&
          deleteAudit.some((entry) => entry.amountMinor === 1000);

        addResult(
          4,
          'T4 — حذف DRAFT يزيل السجل ويسجل المبلغ الصحيح دون تغيير الرصيد',
          passed,
          passed ? undefined : 'فشل الحذف أو تغير الرصيد أو غاب Audit بالمبلغ الأصلي',
        );
      } catch (error: unknown) {
        addResult(4, 'T4 — حذف DRAFT يزيل السجل ويسجل المبلغ الصحيح دون تغيير الرصيد', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T5(a): Updating a DRAFT succeeds and does not affect the posted balance.
    {
      try {
        const { accountId, draft } = await createDraftFixture('t5_update_draft', 1000, 'x');
        const initialAccount = await db.accounts.get(accountId);
        const initialBalance = initialAccount?.currentBalanceMinor ?? 0;

        await transactionEngine.updateTransaction(draft.id, { note: 'y', amountMinor: 2000 });
        const saved = await db.transactions.get(draft.id);
        const account = await db.accounts.get(accountId);
        const audit = await db.financialAuditLogs
          .where('targetId')
          .equals(draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_UPDATE')
          .toArray();

        const passed =
          saved?.note === 'y' &&
          saved.amountMinor === 2000 &&
          account?.currentBalanceMinor === initialBalance &&
          audit.some((entry) => entry.amountMinor === 2000);
        addResult(5, 'T5(a) — تعديل DRAFT ينجح ويحفظ note وamountMinor دون تغيير الرصيد', passed,
          passed ? undefined : 'فشل تعديل DRAFT أو سجل التدقيق أو تغير الرصيد');
      } catch (error: unknown) {
        addResult(5, 'T5(a) — تعديل DRAFT ينجح ويحفظ note وamountMinor دون تغيير الرصيد', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T5(b): Deleting a DRAFT succeeds and leaves the posted balance unchanged.
    {
      try {
        const { accountId, draft } = await createDraftFixture('t5_delete_draft', 500);
        const initialAccount = await db.accounts.get(accountId);
        const initialBalance = initialAccount?.currentBalanceMinor ?? 0;

        const deleted = await transactionEngine.deleteTransaction(draft.id);
        const saved = await db.transactions.get(draft.id);
        const account = await db.accounts.get(accountId);
        const audit = await db.financialAuditLogs
          .where('targetId')
          .equals(draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_DELETE')
          .toArray();

        const passed =
          deleted === true &&
          saved === undefined &&
          account?.currentBalanceMinor === initialBalance &&
          audit.some((entry) => entry.amountMinor === 500);
        addResult(6, 'T5(b) — حذف DRAFT ينجح ويعيد الحالة دون أثر على الرصيد', passed,
          passed ? undefined : 'فشل حذف DRAFT أو Audit أو تغير الرصيد');
      } catch (error: unknown) {
        addResult(6, 'T5(b) — حذف DRAFT ينجح ويعيد الحالة دون أثر على الرصيد', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T5(c): Updating a POSTED transaction is rejected without mutation.
    {
      try {
        const { draft } = await createDraftFixture('t5_update_posted', 1000);
        await transactionEngine.postTransaction(draft.id);
        const before = await db.transactions.get(draft.id);
        let errorMessage = '';

        try {
          await transactionEngine.updateTransaction(draft.id, { amountMinor: 2000 });
        } catch (error: unknown) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }

        const after = await db.transactions.get(draft.id);
        const passed =
          errorMessage.includes('لا يمكن تعديل') &&
          after?.amountMinor === before?.amountMinor &&
          after?.status === 'posted';
        addResult(7, 'T5(c) — تعديل POSTED مرفوض برسالة عربية دون تغيير السجل', passed,
          passed ? undefined : errorMessage || 'لم يُرفض التعديل أو تغير السجل المرحّل');
      } catch (error: unknown) {
        addResult(7, 'T5(c) — تعديل POSTED مرفوض برسالة عربية دون تغيير السجل', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T5(d): Deleting a POSTED transaction is rejected without removing it.
    {
      try {
        const { draft } = await createDraftFixture('t5_delete_posted', 1000);
        await transactionEngine.postTransaction(draft.id);
        let errorMessage = '';

        try {
          await transactionEngine.deleteTransaction(draft.id);
        } catch (error: unknown) {
          errorMessage = error instanceof Error ? error.message : String(error);
        }

        const after = await db.transactions.get(draft.id);
        const passed =
          errorMessage.includes('لا يمكن حذف') &&
          after !== undefined &&
          after.status === 'posted';
        addResult(8, 'T5(d) — حذف POSTED مرفوض برسالة عربية مع بقاء السجل مرحّلًا', passed,
          passed ? undefined : errorMessage || 'لم يُرفض الحذف أو اختفى السجل');
      } catch (error: unknown) {
        addResult(8, 'T5(d) — حذف POSTED مرفوض برسالة عربية مع بقاء السجل مرحّلًا', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T5(e): Preserve the established missing-ID contract.
    {
      try {
        const missingDeleteResult = await transactionEngine.deleteTransaction('nonexistent');
        let updateThrew = false;
        try {
          await transactionEngine.updateTransaction('nonexistent', {});
        } catch {
          updateThrew = true;
        }

        const passed = missingDeleteResult === false && updateThrew;
        addResult(9, 'T5(e) — ID غير الموجود: الحذف false والتعديل يرمي', passed,
          passed ? undefined : 'تغير عقد التعامل مع ID غير الموجود');
      } catch (error: unknown) {
        addResult(9, 'T5(e) — ID غير الموجود: الحذف false والتعديل يرمي', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    // T5(f): Audit coverage for every successful DRAFT update/delete and POST.
    {
      try {
        const updateFixture = await createDraftFixture('t5_audit_update', 1000);
        await transactionEngine.updateTransaction(updateFixture.draft.id, { amountMinor: 2000 });
        const updateAudit = await db.financialAuditLogs
          .where('targetId')
          .equals(updateFixture.draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_UPDATE')
          .toArray();

        const deleteFixture = await createDraftFixture('t5_audit_delete', 500);
        await transactionEngine.deleteTransaction(deleteFixture.draft.id);
        const deleteAudit = await db.financialAuditLogs
          .where('targetId')
          .equals(deleteFixture.draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_DELETE')
          .toArray();

        const postFixture = await createDraftFixture('t5_audit_post', 700);
        await transactionEngine.postTransaction(postFixture.draft.id);
        const postAudit = await db.financialAuditLogs
          .where('targetId')
          .equals(postFixture.draft.id)
          .filter((entry) => entry.eventType === 'TRANSACTION_POST')
          .toArray();

        const passed =
          updateAudit.some((entry) => entry.amountMinor === 2000) &&
          deleteAudit.some((entry) => entry.amountMinor === 500) &&
          postAudit.some((entry) => entry.amountMinor === 700);
        addResult(10, 'T5(f) — اكتمال Audit للتعديل والحذف والترحيل الناجحة', passed,
          passed ? undefined : 'سجل التدقيق مفقود أو يحمل amountMinor غير صحيح');
      } catch (error: unknown) {
        addResult(10, 'T5(f) — اكتمال Audit للتعديل والحذف والترحيل الناجحة', false,
          error instanceof Error ? error.message : String(error));
      }
    }

    const passed = results.filter((result) => result.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  },
};
