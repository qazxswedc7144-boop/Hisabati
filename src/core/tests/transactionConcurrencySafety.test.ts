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

async function createDraftFixture(prefix: string) {
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
    amount: 1200,
    amountMinor: 1200,
    currency: 'YER',
    status: 'draft',
    date: '2026-11-18',
    note: 'draft-before-concurrent-post',
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

    const passed = results.filter((result) => result.passed).length;
    return { total: results.length, passed, failed: results.length - passed, results };
  },
};
