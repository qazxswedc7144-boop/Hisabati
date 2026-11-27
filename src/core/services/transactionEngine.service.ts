import { db, getDb } from '../database/db';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
  CreateTransactionDTO,
  UpdateTransactionDTO,
  CreateDoubleEntryDTO,
  JournalEntryLeg,
  TransactionSummary,
  Account,
  AuditActor,
  CurrencyCode,
} from '@/shared/types';
import {
  roundMoney,
  computeAccountMetricsFromTransactions,
  computeStatementRunningBalances,
  applyTransactionDelta,
  StatementItem,
} from '../utils/financial';
import { 
  validateTransactionForm,
} from '../utils/validators';
import { formatInvoiceNumber } from '../utils/formatters';
import { rbacGuard } from './rbac/RBACGuard.service';
import { auditTrailService } from './rbac/AuditTrail.service';
import { financialAuditService } from './financialAudit.service';
import { settingsRepository, DEFAULT_SETTINGS } from '../repositories/settings.repository';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { decimalToMinor } from '../money/converter';
import { getCurrencyDecimals, resolveRequiredCurrency } from '../money/currency';
import { assertDualMoneyRepresentation } from '../money/validator';
import { validateAndResolveFinancialAmount } from '../money/financialSafety';
import { SyncContextRegistry } from './syncContext';

export class FinancialTransactionEngine {
  // In-memory mutex/deduplication registry for rapid in-flight double submission prevention
  private inFlightPromises = new Map<string, Promise<any>>();

  /**
   * Status Logic Helpers (Phase 2 Immutable Ledger)
   */
  public beginSyncApply(): void {
    SyncContextRegistry.beginSyncApply();
  }
  public endSyncApply(): void {
    SyncContextRegistry.endSyncApply();
  }
  public isInsideSyncApply(): boolean {
    return SyncContextRegistry.isInsideSyncApply();
  }

  public canEditTransaction(trx: Transaction): boolean {
    const status = trx.status || 'posted'; // Legacy policy
    return status === 'draft';
  }

  public canDeleteTransaction(trx: Transaction): boolean {
    const status = trx.status || 'posted'; // Legacy policy
    return status === 'draft';
  }

  private isOnlyMetadataChange(existing: Transaction, dto: UpdateTransactionDTO): boolean {
    const changedFields: string[] = [];
    const financialFields = ['amount', 'amountMinor', 'type', 'accountId', 'currency', 'date', 'status'];

    for (const key of financialFields) {
      const newVal = (dto as any)[key];
      const oldVal = (existing as any)[key];
      if (newVal !== undefined && newVal !== oldVal) {
        changedFields.push(key);
      }
    }
    return changedFields.length === 0;
  }

  public validateStatusTransition(from: TransactionStatus | undefined, to: TransactionStatus): void {
    const current = from || 'posted';
    
    if (current === 'posted' && to === 'draft') {
      throw new Error('لا يمكن تحويل عملية مرحلة (POSTED) إلى مسودة (DRAFT)');
    }
    
    if (current === 'reversed') {
      throw new Error('لا يمكن تعديل حالة عملية معكوسة (REVERSED)');
    }

    if (current === 'posted' && to === 'posted') return;
  }

  /**
   * Transitions a transaction from DRAFT to POSTED.
   */
  async postTransaction(id: string, actor?: AuditActor): Promise<Transaction> {
    const currentActor = actor || rbacGuard.getActiveActor();
    await rbacGuard.assertPermission('transactions:update', {
      actor: currentActor,
      targetType: 'transaction',
      targetId: id,
      details: 'ترحيل مسودة إلى دفتر القيود',
    });
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error('العملية غير موجودة');
    if (existing.status === 'posted') return existing;
    
    this.validateStatusTransition(existing.status, 'posted');

    const now = new Date().toISOString();
    let actualResult: Transaction = existing;  // ← القيمة النهائية الفعلية

    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, activeDb.settings, async (transaction) => {
      // إعادة فحص الحالة داخل transaction
      const freshTrx = await transaction.table('transactions').get(id);
      if (!freshTrx) throw new Error('العملية اختفت أثناء الترحيل');
      
      const freshStatus = freshTrx.status || 'posted'; // UNIFIED LEGACY POLICY: missing = posted
      if (freshStatus === 'posted') {
        // Already posted (either explicitly or as legacy).
        // If it was already explicitly posted, just return it.
        // If it was legacy (no status), we might want to update it to explicitly have 'posted' status
        // but we MUST NOT apply Delta because it was already included in the account balance.
        if (freshTrx.status === 'posted') {
          actualResult = freshTrx;
          return;
        }
        
        // Legacy transaction: Add explicit status but skip Delta
        await transaction.table('transactions').put(finalUpdatedTrx);
        actualResult = finalUpdatedTrx;
        return;
      }
      if (freshStatus === 'reversed') {
        throw new Error('لا يمكن ترحيل قيد معكوس');
      }

      const settingsTable = transaction.table('settings');
      const currencyEntry = await settingsTable.get('currency');
      const systemCurrency = currencyEntry?.value || 'YER';
      const account = await transaction.table('accounts').get(freshTrx.accountId) as Account | undefined;
      if (!account) throw new Error('الحساب المرتبط بالمسودة غير موجود');

      // Resolve against the account, not just the system setting. Legacy drafts may
      // have no currency field; their account currency is authoritative.
      const activeCurrency = resolveRequiredCurrency({
        transactionCurrency: freshTrx.currency,
        accountCurrency: account.currency,
        systemCurrency,
      });
      const financialAmount = validateAndResolveFinancialAmount(
        freshTrx.amount,
        freshTrx.amountMinor,
        activeCurrency
      );
      const finalUpdatedTrx: Transaction = {
        ...freshTrx,
        amount: financialAmount.amount,
        amountMinor: financialAmount.amountMinor,
        currency: activeCurrency,
        status: 'posted',
        postedAt: now,
        postedBy: currentActor.id,
        updatedAt: now,
      };

      await transaction.table('transactions').put(finalUpdatedTrx);

      // OPTIMIZED: Incremental update instead of O(N) rebuild
      await this.recalculateAccountBalanceIncremental(finalUpdatedTrx.accountId, {
        amountMinor: finalUpdatedTrx.amountMinor,
        type: finalUpdatedTrx.type,
        action: 'add',
        date: finalUpdatedTrx.date
      }, activeCurrency, transaction);

      await financialAuditService.logFinancialEvent({
        eventType: 'TRANSACTION_POST',
        targetType: 'transaction',
        targetId: id,
        amountMinor: finalUpdatedTrx.amountMinor,
        currency: finalUpdatedTrx.currency,
        operationId: finalUpdatedTrx.operationId,
        beforeState: {
          amountMinor: freshTrx.amountMinor || 0,
          accountId: freshTrx.accountId,
          type: freshTrx.type,
          revision: freshTrx.id,
        },
        afterState: {
          amountMinor: finalUpdatedTrx.amountMinor,
          accountId: finalUpdatedTrx.accountId,
          type: finalUpdatedTrx.type,
          revision: id,
        },
        tx: transaction
      });

      actualResult = finalUpdatedTrx;
    });

    // إن كان الترحيل قد حدث فعلًا، نفّذ post-process
    if (actualResult.status === 'posted' && actualResult.postedAt === now) {
      try {
        const account = await db.accounts.get(actualResult.accountId);
        await this.postProcessTransaction(actualResult, 'UPDATE', currentActor, account);
      } catch (e) {
        console.warn('[postTransaction] Post-process side effects failed safely:', e);
      }
    }
    
    return actualResult;
  }

  /**
   * Reverses a posted transaction or an entire multi-leg journal atomically.
   * Original entries remain immutable and posted; opposite posted entries are appended
   * and link back through reversalOfTransactionId (legacy correctedByTransactionId is read-only).
   */
  async reverseTransaction(id: string, reason: string, actor?: AuditActor): Promise<Transaction[]> {
    const currentActor = actor || rbacGuard.getActiveActor();
    await rbacGuard.assertPermission('transactions:reverse', {
      actor: currentActor,
      targetType: 'transaction',
      targetId: id,
      details: 'إنشاء قيد عكسي مرتبط بالقيد الأصلي',
    });

    const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
    if (normalizedReason.length < 5) {
      throw new Error('سبب العكس مطلوب ويجب ألا يقل عن خمسة أحرف');
    }

    const activeDb = getDb();
    let createdNewReversal = false;
    const reversedEntries = await activeDb.transaction(
      'rw',
      activeDb.transactions,
      activeDb.accounts,
      activeDb.financialAuditLogs,
      activeDb.settings,
      async (transaction) => {
        const transactionsTable = transaction.table('transactions');
        const original = await transactionsTable.get(id) as Transaction | undefined;
        if (!original) throw new Error('القيد الأصلي غير موجود');

        const allTransactions = await transactionsTable.toArray() as Transaction[];
        const journalEntries = original.operationId
          ? allTransactions.filter((entry) => entry.operationId === original.operationId && !entry.reversalOfTransactionId)
          : [original];
        if (!journalEntries.length || !journalEntries.some((entry) => entry.id === original.id)) {
          throw new Error('تعذر تحديد مجموعة القيد الأصلي بصورة آمنة');
        }

        const sourceIds = new Set(journalEntries.map((entry) => entry.id));
        const existingReversals = allTransactions.filter((entry) =>
          !!entry.reversalOfTransactionId && sourceIds.has(entry.reversalOfTransactionId)
        );
        const reversalsBySource = new Map<string, Transaction[]>();
        for (const reversal of existingReversals) {
          const sourceId = reversal.reversalOfTransactionId!;
          const matches = reversalsBySource.get(sourceId) || [];
          matches.push(reversal);
          reversalsBySource.set(sourceId, matches);
        }
        const alreadyCorrected = journalEntries.filter((entry) => !!entry.correctedByTransactionId);
        const expectedReverseOperationId = `reverse_${original.operationId || original.id}`;
        const complete = existingReversals.length === journalEntries.length &&
          journalEntries.every((entry) => {
            const matches = reversalsBySource.get(entry.id) || [];
            if (matches.length !== 1) return false;
            const reversal = matches[0];
            return (!entry.correctedByTransactionId || entry.correctedByTransactionId === reversal.id) &&
              reversal.operationId === expectedReverseOperationId &&
              (reversal.status || 'posted') === 'posted' &&
              reversal.accountId === entry.accountId &&
              reversal.type === (entry.type === 'debit' ? 'credit' : 'debit') &&
              reversal.amountMinor === entry.amountMinor &&
              (!entry.currency || reversal.currency === entry.currency);
          });
        if (complete) {
          const orderedReversals = journalEntries.map((entry) => reversalsBySource.get(entry.id)![0]);
          if (orderedReversals.some((reversal) =>
            reversal.reversalReason !== undefined && reversal.reversalReason !== normalizedReason
          )) {
            throw new Error('سبب العكس لا يطابق سبب العملية العكسية المسجلة سابقاً');
          }
          return orderedReversals;
        }
        if (alreadyCorrected.length > 0 || existingReversals.length > 0) {
          throw new Error('حالة العكس غير مكتملة أو متعارضة؛ يلزم فحص النزاهة قبل إعادة المحاولة');
        }

        for (const entry of journalEntries) {
          if ((entry.status || 'posted') !== 'posted') {
            throw new Error('لا يمكن عكس قيد غير مرحّل أو معكوس');
          }
          if (!Number.isSafeInteger(entry.amountMinor) || (entry.amountMinor || 0) <= 0) {
            throw new Error('لا يمكن عكس قيد لا يحتوي على مبلغ صحيح بالوحدات الصغرى');
          }
        }

        const currencyEntry = await transaction.table('settings').get('currency');
        const systemCurrency = currencyEntry?.value || 'YER';
        const journalCurrencies = new Set<string>();
        let totalDebitMinor = 0;
        let totalCreditMinor = 0;
        for (const entry of journalEntries) {
          const account = await transaction.table('accounts').get(entry.accountId) as Account | undefined;
          if (!account) throw new Error(`الحساب المرتبط بالقيد الأصلي غير موجود: ${entry.accountId}`);
          const resolvedCurrency = resolveRequiredCurrency({
            transactionCurrency: entry.currency,
            accountCurrency: account.currency,
            systemCurrency,
          });
          journalCurrencies.add(resolvedCurrency);
          if (entry.type === 'debit') totalDebitMinor += entry.amountMinor!;
          else totalCreditMinor += entry.amountMinor!;
          if (!Number.isSafeInteger(totalDebitMinor) || !Number.isSafeInteger(totalCreditMinor)) {
            throw new Error('إجمالي مجموعة القيود يتجاوز النطاق الآمن للحسابات المالية');
          }
        }
        if (journalCurrencies.size !== 1) {
          throw new Error('لا يمكن عكس مجموعة قيود تحتوي على عملات مختلطة');
        }
        if (journalEntries.length > 1 && totalDebitMinor !== totalCreditMinor) {
          throw new Error('لا يمكن عكس مجموعة قيود غير متوازنة؛ يلزم فحص النزاهة أولاً');
        }

        const reverseOperationId = `reverse_${original.operationId || original.id}`;
        const operationIdCollision = allTransactions.filter((entry) => entry.operationId === reverseOperationId);
        if (operationIdCollision.length) {
          throw new Error('معرف عملية العكس مستخدم مسبقاً ولا يطابق عكساً مكتملاً للقيد الأصلي');
        }

        const created: Transaction[] = [];
        const now = new Date().toISOString();

        for (const source of journalEntries) {
          const account = await transaction.table('accounts').get(source.accountId) as Account | undefined;
          if (!account) throw new Error(`الحساب المرتبط بالقيد الأصلي غير موجود: ${source.accountId}`);
          const currency = resolveRequiredCurrency({
            transactionCurrency: source.currency,
            accountCurrency: account.currency,
            systemCurrency,
          });
          const reversal: Transaction = {
            id: `trx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            accountId: source.accountId,
            type: source.type === 'debit' ? 'credit' : 'debit',
            amount: source.amount,
            amountMinor: source.amountMinor,
            currency,
            date: now.split('T')[0],
            note: `عكس القيد ${source.id}. سبب العكس: ${normalizedReason}${source.note ? `. البيان الأصلي: ${source.note}` : ''}`,
            receiptNumber: undefined,
            operationId: reverseOperationId,
            status: 'posted',
            postedAt: now,
            postedBy: currentActor.id,
            reversalOfTransactionId: source.id,
            reversalReason: normalizedReason,
            createdAt: now,
            updatedAt: now,
          };

          await transactionsTable.add(reversal);
          // Append-only ledger: the original posted row is never mutated by reversal.
          await this.recalculateAccountBalanceIncremental(source.accountId, {
            amountMinor: source.amountMinor!,
            type: reversal.type,
            action: 'add',
            date: reversal.date,
          }, currency, transaction);
          await financialAuditService.logFinancialEvent({
            eventType: 'TRANSACTION_REVERSE',
            targetType: 'transaction',
            targetId: reversal.id,
            amountMinor: reversal.amountMinor,
            currency,
            operationId: reverseOperationId,
            beforeState: {
              amountMinor: source.amountMinor || 0,
              accountId: source.accountId,
              type: source.type,
              revision: source.id,
            },
            afterState: {
              amountMinor: reversal.amountMinor || 0,
              accountId: reversal.accountId,
              type: reversal.type,
              revision: reversal.id,
            },
            metadata: { reversalOfTransactionId: source.id, originalOperationId: source.operationId, reversalReason: normalizedReason },
            tx: transaction,
          });
          created.push(reversal);
        }
        createdNewReversal = true;
        return created;
      }
    );

    if (createdNewReversal) for (const reversal of reversedEntries) {
      try {
        const account = await db.accounts.get(reversal.accountId);
        if (account) await this.postProcessTransaction(reversal, 'CREATE', currentActor, account);
      } catch (error) {
        console.warn('[reverseTransaction] Post-process failed safely:', error);
      }
    }
    return reversedEntries;
  }

  /**
   * Creates a transaction with strict financial validation, precision rounding,
   * deduplication / idempotency check, atomic persistence, and derived balance recalculation.
   */
  async createTransaction(dto: CreateTransactionDTO, actor?: AuditActor, options?: { isRemote?: boolean }): Promise<Transaction> {
    const currentActor = actor || rbacGuard.getActiveActor();

    // REVERSED is produced only by the dedicated append-only reversal operation.
    if (dto.status !== undefined && dto.status !== 'draft' && dto.status !== 'posted') {
      throw new Error('حالة القيد عند الإنشاء يجب أن تكون مسودة أو مرحّلة؛ العكس له مسار مستقل');
    }

    // 0. Strict RBAC Guard Assertion (Guarded Execution Gate)
    await rbacGuard.assertPermission('transactions:create', {
      actor: currentActor,
      targetType: 'transaction',
      details: `تسجيل عملية مالية بمبلغ ${dto.amount} على الحساب ${dto.accountId}`,
    });

    // 1. Validation & Financial Normalization
    const account = await db.accounts.get(dto.accountId);
    if (!account) {
      throw new Error('الحساب المحدد غير موجود في قاعدة البيانات');
    }

    const validation = validateTransactionForm({
      accountId: dto.accountId,
      amount: dto.amount,
      amountMinor: dto.amountMinor,
      date: dto.date,
    });

    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'بيانات العملية غير صحيحة';
      throw new Error(firstError);
    }

    // 2. Resolve Financial Amount (Source of Truth: amountMinor)
    const freshSettings = await settingsRepository.getSettings();
    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: dto.currency,
      accountCurrency: account.currency,
      systemCurrency: freshSettings.currency,
    });

    const financialAmount = validateAndResolveFinancialAmount(dto.amount, dto.amountMinor, activeCurrency);
    const safeAmount = financialAmount.amount;
    const safeAmountMinor = financialAmount.amountMinor;

    // 3. Idempotency Key Handling
    const explicitOpId = dto.operationId?.trim();
    const finalOpId = explicitOpId || (`op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

    // In-flight deduplication / double-click key
    const rapidLockKey = explicitOpId
      ? `op_${explicitOpId}`
      : `rapid_${dto.accountId}_${dto.type}_${safeAmountMinor}_${dto.date || ''}_${dto.note?.trim() || ''}`;

    if (this.inFlightPromises.has(rapidLockKey)) {
      return await this.inFlightPromises.get(rapidLockKey)!;
    }

    const executionPromise = (async () => {
      let createdTransaction: Transaction | null = null;
      let createdNewTransaction = false;
      let nextInvoiceNumberToCommit: number | undefined = undefined;

      const now = new Date().toISOString();
      const id = (options?.isRemote && (dto as any).id) 
        ? (dto as any).id 
        : ('trx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));

      // Atomic write transaction across all financial tables
      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.settings, activeDb.financialAuditLogs, async (transaction) => {
        // Fetch FRESH settings inside the transaction to prevent race conditions
        const settingsTable = transaction.table('settings');
        const settingsEntries = await settingsTable.toArray();
        const freshSettingsInside: any = { ...DEFAULT_SETTINGS };
        for (const e of settingsEntries) freshSettingsInside[e.key] = e.value;

        // Check if explicit operationId exists in DB
        if (explicitOpId) {
          const existingMatches = await transaction.table('transactions').where('operationId').equals(explicitOpId).toArray();
          const existingTrx = existingMatches[0];
          if (existingTrx) {
            if (existingMatches.length !== 1 || existingTrx.reversalOfTransactionId) {
              throw new Error('الرقم المرجعي operationId مرتبط بقيد متعدد الأطراف أو عكسي ولا يمكن إعادة استخدامه كقيد مفرد');
            }
            // Check for conflict: same operationId used for different transaction payload
            if (
              existingTrx.accountId !== dto.accountId ||
              existingTrx.type !== dto.type ||
              existingTrx.amountMinor !== safeAmountMinor ||
              (dto.currency !== undefined && (existingTrx.currency || activeCurrency) !== activeCurrency) ||
              (dto.date !== undefined && existingTrx.date !== dto.date) ||
              (dto.note !== undefined && (existingTrx.note || undefined) !== (dto.note.trim() || undefined)) ||
              (dto.receiptNumber !== undefined && (existingTrx.receiptNumber || undefined) !== (dto.receiptNumber.trim() || undefined)) ||
              (dto.receiptId !== undefined && (existingTrx.receiptId || undefined) !== (dto.receiptId.trim() || undefined)) ||
              (dto.documentRef !== undefined && (existingTrx.documentRef || undefined) !== (dto.documentRef || undefined)) ||
              (dto.documentMetadata !== undefined && JSON.stringify(existingTrx.documentMetadata || null) !== JSON.stringify(dto.documentMetadata || null)) ||
              (existingTrx.status || 'posted') !== (dto.status || 'posted')
            ) {
              throw new Error('الرقم المرجعي operationId مستخدم سابقاً مع بيانات عملية مختلفة');
            }
            createdTransaction = existingTrx;
            return;
          }
        }

        const newTransaction: Transaction = {
          id,
          accountId: dto.accountId,
          type: dto.type,
          amount: safeAmount,
          amountMinor: safeAmountMinor,
          currency: activeCurrency,
          date: dto.date || now.split('T')[0],
          note: dto.note?.trim() || undefined,
          receiptNumber: dto.receiptNumber?.trim() || undefined,
          operationId: finalOpId,
          status: dto.status || 'posted',
          postedAt: (dto.status || 'posted') === 'posted' ? now : undefined,
          postedBy: (dto.status || 'posted') === 'posted' ? currentActor.id : undefined,
          receiptId: dto.receiptId?.trim() || undefined,
          documentRef: dto.documentRef || undefined,
          documentMetadata: dto.documentMetadata || undefined,
          createdAt: now,
          updatedAt: now,
        };

        // Auto-generate invoice number atomically if needed
        if (!newTransaction.receiptNumber && freshSettingsInside.invoiceNumberingFormat !== 'manual') {
          const settingRec = await transaction.table('settings').get('nextInvoiceNumber');
          const nextVal = (settingRec && typeof settingRec.value === 'number')
            ? settingRec.value
            : (freshSettingsInside.nextInvoiceNumber || 1);

          const generated = formatInvoiceNumber(
            freshSettingsInside.invoicePrefix || 'INV-',
            nextVal,
            freshSettingsInside.invoiceNumberingFormat || 'sequential',
            newTransaction.date
          );

          if (generated) {
            newTransaction.receiptNumber = generated;
            await transaction.table('settings').put({
              id: 'nextInvoiceNumber',
              key: 'nextInvoiceNumber',
              value: nextVal + 1,
              updatedAt: now,
            });
            nextInvoiceNumberToCommit = nextVal + 1;
          }
        }

        await transaction.table('transactions').add(newTransaction);

        // OPTIMIZED: Incremental update instead of O(N) rebuild
        if (newTransaction.status === 'posted') {
          await this.recalculateAccountBalanceIncremental(dto.accountId, {
            amountMinor: safeAmountMinor,
            type: dto.type,
            action: 'add',
            date: newTransaction.date
          }, activeCurrency, transaction);
        }

        // Log financial event atomically inside DB transaction
        await financialAuditService.logFinancialEvent({
          eventType: 'TRANSACTION_CREATE',
          targetType: 'transaction',
          targetId: id,
          amountMinor: safeAmountMinor,
          currency: activeCurrency,
          operationId: finalOpId,
          afterState: {
            amountMinor: safeAmountMinor,
            accountId: dto.accountId,
            type: dto.type,
            revision: id,
          },
          tx: transaction
        });

        createdTransaction = newTransaction;
        createdNewTransaction = true;
      });

      if (!createdTransaction) {
        throw new Error('فشل إنشاء العملية المالية');
      }

      // Update Zustand ONLY AFTER DB commit succeeds (avoids TOCTOU drift)
      if (nextInvoiceNumberToCommit !== undefined) {
        try {
          useSettingsStore.getState().updateSettings({ nextInvoiceNumber: nextInvoiceNumberToCommit });
        } catch {
          // Non-blocking
        }
      }

      // Post-commit side effects run only for a newly committed row; an idempotent
      // retry must not enqueue duplicate sync mutations or duplicate audit events.
      if (createdNewTransaction) {
        await this.postProcessTransaction(createdTransaction, 'CREATE', currentActor, account, options);
      }

      return createdTransaction;
    })();

    this.inFlightPromises.set(rapidLockKey, executionPromise);
    try {
      return await executionPromise;
    } finally {
      if (!explicitOpId) {
        setTimeout(() => {
          if (this.inFlightPromises.get(rapidLockKey) === executionPromise) {
            this.inFlightPromises.delete(rapidLockKey);
          }
        }, 2000);
      } else {
        this.inFlightPromises.delete(rapidLockKey);
      }
    }
  }

  /**
   * Helper for side-effects after transaction persistence
   */
  private async postProcessTransaction(trx: Transaction, action: 'CREATE' | 'UPDATE', actor: AuditActor, account?: Account, options?: { isRemote?: boolean }) {
    try {
      if (account) {
        await auditTrailService.log({
          actor,
          action: action === 'CREATE' ? 'TRANSACTION_CREATE' : 'TRANSACTION_UPDATE',
          targetType: 'transaction',
          targetId: trx.id,
          riskLevel: action === 'CREATE' ? 'LOW' : 'MEDIUM',
          detailsAr: `${action === 'CREATE' ? 'تسجيل' : 'تعديل'} قيد مالي (${trx.type === 'debit' ? 'مدين' : 'دائن'}) بمبلغ ${trx.amount} على حساب "${account.name}".${options?.isRemote ? ' (عن طريق المزامنة)' : ''}`,
          afterState: { ...trx },
          metadata: {
            accountId: account.id,
            amount: trx.amount,
            operationId: trx.operationId,
            isRemote: options?.isRemote,
          },
        });
      }
    } catch (e) {
      console.warn('[PostProcess] Non-financial audit log failed', e);
    }

    if (!options?.isRemote) {
      try {
        await this.enqueueSyncMutation('transaction', trx.id, action, trx, trx.operationId);
      } catch (sideEffectErr: any) {
        console.warn('[PostProcess] Sync mutation enqueue failed', sideEffectErr);
        try {
          await db.pendingSideEffects.add({
            id: 'pse_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            sourceType: 'transaction',
            sourceId: trx.id,
            effectType: 'SYNC_ENQUEUE',
            payload: { action, trx },
            createdAt: new Date().toISOString(),
            retries: 0,
            lastError: sideEffectErr?.message,
          });
        } catch (dbErr) {
          console.warn('[PostProcess] Failed to store pending side effect', dbErr);
        }
      }
    }
  }

  /**
   * CREATE DOUBLE ENTRY (Journal Entry)
   * Enforces Double-Entry Invariant: SUM(DEBITS) = SUM(CREDITS)
   */
  async createDoubleEntry(dto: CreateDoubleEntryDTO, actor?: AuditActor): Promise<Transaction[]> {
    const currentActor = actor || rbacGuard.getActiveActor();
    if (dto.status !== undefined && dto.status !== 'draft' && dto.status !== 'posted') {
      throw new Error('حالة القيد عند الإنشاء يجب أن تكون مسودة أو مرحّلة؛ العكس له مسار مستقل');
    }

    await rbacGuard.assertPermission('transactions:create', {
      actor: currentActor,
      targetType: 'transaction',
      details: 'إنشاء قيد يومية مزدوج متعدد الأطراف',
    });

    const freshSettings = await settingsRepository.getSettings();
    const date = dto.date || new Date().toISOString().split('T')[0];

    if (!Array.isArray(dto.entries) || dto.entries.length < 2) {
      throw new Error('القيد المزدوج يجب أن يحتوي على طرفين على الأقل');
    }

    // Resolve every leg against its real account. A journal is single-currency:
    // cross-currency postings require an explicit FX journal, not arithmetic mixing.
    let currency: CurrencyCode | undefined;
    let totalDebitMinor = 0;
    let totalCreditMinor = 0;
    const validatedLegs: (JournalEntryLeg & { resolvedAmountMinor: number; resolvedAmount: number })[] = [];
    const accountsById = new Map<string, Account>();

    for (const leg of dto.entries) {
      if (!leg || typeof leg.accountId !== 'string' || !leg.accountId.trim()) {
        throw new Error('كل طرف في القيد يجب أن يرتبط بحساب صالح');
      }
      if (leg.type !== 'debit' && leg.type !== 'credit') {
        throw new Error(`نوع الطرف غير صالح: ${String(leg.type)}`);
      }

      let account = accountsById.get(leg.accountId);
      if (!account) {
        const found = await db.accounts.get(leg.accountId);
        if (!found) throw new Error(`الحساب المحدد غير موجود: ${leg.accountId}`);
        account = found;
        accountsById.set(leg.accountId, account);
      }

      const legCurrency = resolveRequiredCurrency({
        transactionCurrency: dto.currency,
        accountCurrency: account.currency,
        systemCurrency: freshSettings.currency,
      });
      if (currency && currency !== legCurrency) {
        throw new Error(`[Financial Safety] لا يمكن إنشاء قيد يومية بعملات مختلطة (${currency} و${legCurrency}) دون قيد صرف صريح`);
      }
      currency = legCurrency;

      const { amountMinor, amount } = validateAndResolveFinancialAmount(leg.amount, leg.amountMinor, legCurrency);
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('يجب أن يكون مبلغ كل طرف عدداً صحيحاً موجباً بالوحدات الصغرى');
      }
      validatedLegs.push({
        ...leg,
        resolvedAmountMinor: amountMinor,
        resolvedAmount: amount
      });

      if (leg.type === 'debit') totalDebitMinor += amountMinor;
      else totalCreditMinor += amountMinor;

      if (!Number.isSafeInteger(totalDebitMinor) || !Number.isSafeInteger(totalCreditMinor)) {
        throw new Error('إجمالي القيد يتجاوز النطاق الآمن للحسابات المالية');
      }
    }

    if (!currency) throw new Error('تعذر تحديد عملة القيد');

    // ENFORCE INVARIANT: SUM(DEBITS) = SUM(CREDITS)
    if (totalDebitMinor !== totalCreditMinor) {
      throw new Error(`القيد غير متوازن: إجمالي المدين (${totalDebitMinor}) لا يساوي إجمالي الدائن (${totalCreditMinor})`);
    }

    const explicitOpId = dto.operationId?.trim();
    const operationId = explicitOpId || (`journal_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

    const rapidLockKey = explicitOpId
      ? `journal_op_${explicitOpId}`
      : `journal_rapid_${dto.entries.map(e => `${e.accountId}_${e.type}_${e.amountMinor || e.amount}`).join('_')}_${date}`;

    if (this.inFlightPromises.has(rapidLockKey)) {
      return await this.inFlightPromises.get(rapidLockKey)!;
    }

    const executionPromise = (async () => {
      const createdTransactions: Transaction[] = [];
      let createdNewJournal = false;

      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, activeDb.settings, async (transaction) => {
        // Check idempotency in DB by comparing the complete normalized journal payload.
        const existing = await transaction.table('transactions').where('operationId').equals(operationId).first();
        if (existing) {
          const allSiblings = await transaction.table('transactions').where('operationId').equals(operationId).toArray();
          if (allSiblings.some((entry) => !!entry.reversalOfTransactionId)) {
            throw new Error('الرقم المرجعي operationId مرتبط بقيود عكسية ولا يمكن إعادة استخدامه لإنشاء قيد يومية');
          }
          const compareLegNotes = dto.note !== undefined || dto.entries.some((entry) => entry.note !== undefined);
          const compareLegReceipts = dto.receiptNumber !== undefined || dto.entries.some((entry) => entry.receiptNumber !== undefined);
          const normalizeLeg = (leg: any) => ({
            accountId: leg.accountId,
            type: leg.type,
            amountMinor: leg.resolvedAmountMinor ?? leg.amountMinor,
            currency: dto.currency !== undefined ? (leg.currency || currency) as CurrencyCode : undefined,
            date: dto.date !== undefined ? leg.date : undefined,
            note: compareLegNotes ? (leg.note || undefined) : undefined,
            receiptNumber: compareLegReceipts ? (leg.receiptNumber || undefined) : undefined,
            status: leg.status || 'posted',
          });
          const sortPayload = (items: any[]) => items
            .map(normalizeLeg)
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
          const expectedPayload = sortPayload(validatedLegs.map((leg) => ({
            accountId: leg.accountId,
            type: leg.type,
            amountMinor: leg.resolvedAmountMinor,
            currency,
            date,
            note: leg.note || dto.note || undefined,
            receiptNumber: leg.receiptNumber || dto.receiptNumber || undefined,
            status: dto.status || 'posted',
          })));
          const actualPayload = sortPayload(allSiblings);
          if (
            allSiblings.length !== validatedLegs.length ||
            JSON.stringify(actualPayload) !== JSON.stringify(expectedPayload)
          ) {
            throw new Error('الرقم المرجعي operationId مستخدم لقيد مزدوج ببيانات مختلفة');
          }
          createdTransactions.push(...allSiblings);
          return;
        }

        // Re-read each account inside the same write transaction before any ledger write.
        for (const leg of validatedLegs) {
          const account = await transaction.table('accounts').get(leg.accountId) as Account | undefined;
          if (!account) throw new Error(`الحساب المحدد لم يعد موجوداً: ${leg.accountId}`);
          const currentCurrency = resolveRequiredCurrency({
            transactionCurrency: currency,
            accountCurrency: account.currency,
            systemCurrency: freshSettings.currency,
          });
          if (currentCurrency !== currency) {
            throw new Error(`عملة الحساب ${leg.accountId} تغيرت أثناء إنشاء القيد`);
          }
        }

        for (const leg of validatedLegs) {
          const id = 'trx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
          const trxStatus = dto.status || 'posted';
          const trx: Transaction = {
            id,
            accountId: leg.accountId,
            type: leg.type,
            amount: leg.resolvedAmount,
            amountMinor: leg.resolvedAmountMinor,
            currency,
            date,
            note: leg.note || dto.note,
            receiptNumber: leg.receiptNumber || dto.receiptNumber,
            operationId,
            status: trxStatus,
            postedAt: trxStatus === 'posted' ? new Date().toISOString() : undefined,
            postedBy: trxStatus === 'posted' ? currentActor.id : undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };

          await transaction.table('transactions').add(trx);
          // OPTIMIZED: Incremental update instead of O(N) rebuild
          if (trx.status === 'posted') {
            await this.recalculateAccountBalanceIncremental(leg.accountId, {
              amountMinor: leg.resolvedAmountMinor,
              type: leg.type,
              action: 'add',
              date: trx.date
            }, currency, transaction);
          }

          await financialAuditService.logFinancialEvent({
            eventType: 'DOUBLE_ENTRY_CREATE',
            targetType: 'transaction',
            targetId: trx.id,
            amountMinor: trx.amountMinor,
            currency: trx.currency,
            operationId: operationId,
            afterState: {
              amountMinor: trx.amountMinor,
              accountId: trx.accountId,
              type: trx.type,
              revision: trx.id,
            },
            tx: transaction
          });

          createdTransactions.push(trx);
        }
        createdNewJournal = true;
      });

      if (createdNewJournal) for (const trx of createdTransactions) {
        try {
          const acc = await db.accounts.get(trx.accountId);
          if (acc) await this.postProcessTransaction(trx, 'CREATE', currentActor, acc);
        } catch (e) {
          console.warn('Post-process failed for double-entry leg:', e);
        }
      }

      return createdTransactions;
    })();

    this.inFlightPromises.set(rapidLockKey, executionPromise);
    try {
      return await executionPromise;
    } finally {
      if (!explicitOpId) {
        setTimeout(() => {
          if (this.inFlightPromises.get(rapidLockKey) === executionPromise) {
            this.inFlightPromises.delete(rapidLockKey);
          }
        }, 2000);
      } else {
        this.inFlightPromises.delete(rapidLockKey);
      }
    }
  }

  /**
   * Updates an existing transaction and updates balances of all affected accounts.
   */
  async updateTransaction(id: string, dto: UpdateTransactionDTO, actor?: AuditActor, options?: { isRemote?: boolean }): Promise<Transaction> {
    const currentActor = actor || rbacGuard.getActiveActor();

    await rbacGuard.assertPermission('transactions:update', {
      actor: currentActor,
      targetType: 'transaction',
      targetId: id,
      details: `تعديل القيد المالي رقم ${id}`,
    });

    // Initial lookup is only a fast not-found check. Never use this snapshot
    // for status validation, balance calculations, or audit state.
    const existing = await db.transactions.get(id);
    if (!existing) throw new Error(`العملية رقم ${id} غير موجودة`);

    if (options?.isRemote && !this.isInsideSyncApply()) {
      throw new Error('isRemote ممنوع خارج محرك المزامنة (syncEngine)');
    }

    const freshSettings = await settingsRepository.getSettings();
    const activeDb = getDb();
    const { updatedTrx, targetAccount } = await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, async (transaction) => {
      // Authoritative read and immutable-ledger validation are atomic with write.
      const freshTrx = await transaction.table('transactions').get(id) as Transaction | undefined;
      if (!freshTrx) throw new Error(`العملية رقم ${id} غير موجودة`);

      const currentStatus = freshTrx.status || 'posted'; // Legacy policy: missing = POSTED
      if (!options?.isRemote) {
        if (!this.canEditTransaction(freshTrx)) {
          throw new Error('لا يمكن تعديل عملية مرحلة (POSTED) أو معكوسة (REVERSED)');
        }
      } else {
        if (currentStatus === 'reversed') {
          throw new Error('لا يمكن تعديل قيد معكوس (REVERSED) حتى من المزامنة');
        }
        if (currentStatus === 'posted' && !this.isOnlyMetadataChange(freshTrx, dto)) {
          throw new Error('لا يمكن تعديل الحقول المالية لقيد مرحّل (POSTED) عبر المزامنة. الحقول المسموحة: الملاحظة، رقم الفاتورة، المستند');
        }
      }

      const oldAccountId = freshTrx.accountId;
      const targetAccountId = dto.accountId || oldAccountId;
      const account = await transaction.table('accounts').get(targetAccountId) as Account | undefined;
      if (!account) throw new Error('الحساب المرتبط غير موجود');

      const activeCurrency = resolveRequiredCurrency({
        transactionCurrency: dto.currency,
        accountCurrency: account.currency,
        systemCurrency: freshSettings.currency,
      });

      let financial;
      if (dto.amountMinor !== undefined || dto.amount !== undefined) {
        financial = validateAndResolveFinancialAmount(dto.amount, dto.amountMinor, activeCurrency);
      } else {
        financial = { amount: freshTrx.amount, amountMinor: freshTrx.amountMinor };
      }

      const finalUpdatedTrx: Transaction = {
        ...freshTrx,
        accountId: targetAccountId,
        type: dto.type || freshTrx.type,
        amount: financial.amount,
        amountMinor: financial.amountMinor,
        currency: activeCurrency,
        date: dto.date || freshTrx.date,
        note: dto.note !== undefined ? (dto.note.trim() || undefined) : freshTrx.note,
        receiptNumber: dto.receiptNumber !== undefined ? (dto.receiptNumber.trim() || undefined) : freshTrx.receiptNumber,
        updatedAt: new Date().toISOString(),
      };

      await transaction.table('transactions').put(finalUpdatedTrx);

      const statusChanged = currentStatus !== (finalUpdatedTrx.status || 'posted');
      const amountChanged = freshTrx.amountMinor !== finalUpdatedTrx.amountMinor;
      const typeChanged = freshTrx.type !== finalUpdatedTrx.type;
      const accountChanged = oldAccountId !== targetAccountId;

      if (statusChanged || amountChanged || typeChanged || accountChanged) {
        await this.recalculateAccountBalance(oldAccountId, activeCurrency, transaction);
        if (accountChanged) {
          await this.recalculateAccountBalance(targetAccountId, activeCurrency, transaction);
        }
      }

      await financialAuditService.logFinancialEvent({
        eventType: 'TRANSACTION_UPDATE',
        targetType: 'transaction',
        targetId: id,
        amountMinor: finalUpdatedTrx.amountMinor,
        currency: activeCurrency,
        operationId: finalUpdatedTrx.operationId,
        beforeState: {
          amountMinor: freshTrx.amountMinor || 0,
          accountId: freshTrx.accountId,
          type: freshTrx.type,
          revision: freshTrx.id,
        },
        afterState: {
          amountMinor: finalUpdatedTrx.amountMinor,
          accountId: finalUpdatedTrx.accountId,
          type: finalUpdatedTrx.type,
          revision: finalUpdatedTrx.id,
        },
        tx: transaction
      });

      return { updatedTrx: finalUpdatedTrx, targetAccount: account };
    });

    await this.postProcessTransaction(updatedTrx, 'UPDATE', currentActor, targetAccount, options);
    return updatedTrx;
  }

  async deleteTransaction(id: string, actor?: AuditActor, options?: { isRemote?: boolean }): Promise<boolean> {
    const currentActor = actor || rbacGuard.getActiveActor();

    await rbacGuard.assertPermission('transactions:delete', {
      actor: currentActor,
      targetType: 'transaction',
      targetId: id,
      details: `حذف القيد المالي رقم ${id}`,
    });

    // Initial lookup is only an optimization; state is re-read and revalidated
    // under the same Dexie read-write transaction that performs deletion.
    const existing = await db.transactions.get(id);
    if (!existing) return false;

    if (options?.isRemote && !this.isInsideSyncApply()) {
      throw new Error('isRemote ممنوع خارج محرك المزامنة (syncEngine)');
    }

    const fallbackSystemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');
    const activeDb = getDb();
    const deletedTransaction = await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, activeDb.settings, async (transaction) => {
      const trxToDelete = await transaction.table('transactions').get(id) as Transaction | undefined;
      if (!trxToDelete) return undefined;

      const currentStatus = trxToDelete.status || 'posted'; // Legacy policy: missing = POSTED
      if (!options?.isRemote) {
        if (!this.canDeleteTransaction(trxToDelete)) {
          throw new Error('لا يمكن حذف عملية مرحلة (POSTED) أو معكوسة (REVERSED)');
        }
      } else {
        if (currentStatus === 'posted') {
          throw new Error('لا يمكن حذف قيد مرحّل (POSTED) عبر المزامنة. يجب إنشاء قيد عكسي بدلاً من ذلك');
        }
        if (currentStatus === 'reversed') {
          throw new Error('لا يمكن حذف قيد معكوس (REVERSED)');
        }
        // Only DRAFT transactions may be deleted through Sync.
      }

      const currencyEntry = await transaction.table('settings').get('currency');
      const systemCurrency = (currencyEntry?.value || fallbackSystemCurrency || 'YER') as CurrencyCode;
      const activeCurrency = resolveRequiredCurrency({
        transactionCurrency: trxToDelete.currency,
        systemCurrency,
      });

      await transaction.table('transactions').delete(id);

      // POSTED is rejected above for local and remote deletion. Keep the
      // defensive balance correction tied exclusively to the fresh snapshot.
      if (currentStatus === 'posted') {
        await this.recalculateAccountBalanceIncremental(trxToDelete.accountId, {
          amountMinor: trxToDelete.amountMinor,
          type: trxToDelete.type,
          action: 'subtract',
          date: trxToDelete.date
        }, activeCurrency, transaction);
      }

      await financialAuditService.logFinancialEvent({
        eventType: 'TRANSACTION_DELETE',
        targetType: 'transaction',
        targetId: id,
        amountMinor: trxToDelete.amountMinor,
        currency: activeCurrency,
        operationId: trxToDelete.operationId,
        beforeState: {
          amountMinor: trxToDelete.amountMinor || 0,
          accountId: trxToDelete.accountId,
          type: trxToDelete.type,
          revision: trxToDelete.id,
        },
        tx: transaction
      });

      try {
        const existingTombstones = await transaction.table('settings').get('hisabati_permanent_tombstones');
        const list = existingTombstones && Array.isArray(existingTombstones.value) ? existingTombstones.value : [];
        if (!list.some((t: any) => t.id === id)) {
          list.push({ id, entityType: 'transaction', deletedAt: new Date().toISOString() });
          await transaction.table('settings').put({
            id: 'hisabati_permanent_tombstones',
            key: 'hisabati_permanent_tombstones',
            value: list,
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (e) {
        console.warn('Permanent tombstone write warning:', e);
      }
      return trxToDelete;
    });

    if (deletedTransaction && !options?.isRemote) {
      await this.enqueueSyncMutation('transaction', id, 'DELETE', { id }, deletedTransaction.operationId);
    }

    return Boolean(deletedTransaction);
  }

  /**
   * Authoritative balance rebuild from complete ledger history.
   * STABLE SOURCE OF TRUTH (O(N) Complexity).
   */
  async recalculateAccountBalance(accountId: string, currency?: CurrencyCode, tx?: any): Promise<Account | undefined> {
    const database = tx || db;
    const account = await database.table('accounts').get(accountId);
    if (!account) return undefined;

    const transactions = await database.table('transactions')
      .where('accountId')
      .equals(accountId)
      .toArray();

    const currencyEntry = await database.table('settings').get('currency');
    const systemCurrency = currencyEntry?.value || 'YER';
    const inferredTransactionCurrency = transactions.find((trx: Transaction) => trx.currency)?.currency;
    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: currency || inferredTransactionCurrency,
      accountCurrency: account.currency,
      systemCurrency,
    });
    const metrics = computeAccountMetricsFromTransactions(transactions, activeCurrency);
    const now = new Date().toISOString();

    const updatedFields = {
      currentBalance: metrics.currentBalance,
      currentBalanceMinor: metrics.currentBalanceMinor,
      totalDebit: metrics.totalDebit,
      totalDebitMinor: metrics.totalDebitMinor,
      totalCredit: metrics.totalCredit,
      totalCreditMinor: metrics.totalCreditMinor,
      transactionCount: metrics.transactionCount,
      lastTransactionDate: metrics.lastTransactionDate,
      updatedAt: now,
    };

    await database.table('accounts').update(accountId, updatedFields);
    return await database.table('accounts').get(accountId);
  }

  /**
   * Optimized incremental balance update (O(1) Complexity).
   * Used for standard Create/Post/Delete-posted paths.
   */
  async recalculateAccountBalanceIncremental(
    accountId: string, 
    delta: { amountMinor: number; type: TransactionType; action: 'add' | 'subtract'; date?: string },
    currency?: CurrencyCode, 
    tx?: any
  ): Promise<Account | undefined> {
    const database = tx || db;
    const account = await database.table('accounts').get(accountId);
    if (!account) return undefined;

    const updatedFields = applyTransactionDelta(account, delta, currency);
    
    // Safety check: if drift is detected or invariants are broken, fallback to O(N) authoritative rebuild
    if (updatedFields.isInconsistent) {
      console.warn(`[TransactionEngine] Delta inconsistency detected for account ${accountId}. Falling back to authoritative rebuild.`);
      return await this.recalculateAccountBalance(accountId, currency, database);
    }

    // Secondary safety check for transactionCount
    if (updatedFields.transactionCount! < 0) {
      return await this.recalculateAccountBalance(accountId, currency, database);
    }

    // Remove diagnostic fields before DB persistence to avoid record leakage
    const { isInconsistent, ...accountUpdate } = updatedFields;

    await database.table('accounts').update(accountId, accountUpdate);
    return { ...account, ...accountUpdate } as Account;
  }

  /**
   * Recalculates all balances for every account in the database from scratch in optimized batches.
   * Does NOT alter or delete any transaction records. (PERF-01)
   */
  async recalculateAllBalances(currency?: CurrencyCode): Promise<{ accountsUpdated: number }> {
    const systemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');

    const allAccounts = await db.accounts.toArray();
    let count = 0;

    const batchSize = 50;
    for (let i = 0; i < allAccounts.length; i += batchSize) {
      const batch = allAccounts.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (acc) => {
          const accountTransactions = await db.transactions.where('accountId').equals(acc.id).toArray();
          const inferredTransactionCurrency = accountTransactions.find((trx) => trx.currency)?.currency as CurrencyCode | undefined;
          const accountCurrency = (acc.currency || inferredTransactionCurrency || currency || systemCurrency) as CurrencyCode;
          await this.recalculateAccountBalance(acc.id, accountCurrency);
        })
      );
      count += batch.length;
    }

    return { accountsUpdated: count };
  }

  /**
   * Generates a full account statement with progressive derived running balances.
   */
  async getAccountStatement(accountId: string, currency?: CurrencyCode): Promise<{
    account: Account;
    transactions: StatementItem[];
    summary: {
      totalDebit: number;
      totalCredit: number;
      netBalance: number;
      totalDebitMinor: number;
      totalCreditMinor: number;
      netBalanceMinor: number;
      count: number;
    };
  }> {
    const account = await db.accounts.get(accountId);
    if (!account) {
      throw new Error('الحساب غير موجود');
    }

    const systemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');

    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: currency,
      accountCurrency: account.currency,
      systemCurrency,
    });

    const rawTransactions = await db.transactions
      .where('accountId')
      .equals(accountId)
      .reverse()
      .sortBy('date');

    const statementItems = computeStatementRunningBalances(rawTransactions, activeCurrency);
    const metrics = computeAccountMetricsFromTransactions(rawTransactions, activeCurrency);

    return {
      account,
      transactions: statementItems,
      summary: {
        totalDebit: metrics.totalDebit,
        totalCredit: metrics.totalCredit,
        netBalance: metrics.currentBalance,
        totalDebitMinor: metrics.totalDebitMinor,
        totalCreditMinor: metrics.totalCreditMinor,
        netBalanceMinor: metrics.currentBalanceMinor,
        count: metrics.transactionCount,
      },
    };
  }

  /**
   * Returns global transactions summary across all accounts.
   * Optimized: Uses pre-calculated account balances instead of scanning all transactions.
   */
  async getGlobalSummary(currency?: CurrencyCode): Promise<TransactionSummary & { totalDebitMinor: number; totalCreditMinor: number; netBalanceMinor: number }> {
    const allAccounts = await db.accounts.toArray();

    let totalDebitMinor = 0;
    let totalCreditMinor = 0;
    let totalTransactions = 0;

    const systemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');
    const accountCurrencies = new Set<CurrencyCode>();

    for (const acc of allAccounts) {
      totalDebitMinor += acc.totalDebitMinor || 0;
      totalCreditMinor += acc.totalCreditMinor || 0;
      totalTransactions += acc.transactionCount || 0;
      const accountTransactions = await db.transactions.where('accountId').equals(acc.id).toArray();
      const inferredCurrency = accountTransactions.find((trx) => trx.currency)?.currency as CurrencyCode | undefined;
      accountCurrencies.add((acc.currency || inferredCurrency || systemCurrency) as CurrencyCode);
    }

    if (accountCurrencies.size > 1) {
      throw new Error('[Financial Safety] Global summary cannot combine multiple account currencies without explicit FX conversion.');
    }
    const ledgerCurrency = Array.from(accountCurrencies)[0] || systemCurrency;
    if (currency && currency !== ledgerCurrency) {
      throw new Error(`[Financial Safety] Requested summary currency ${currency} does not match ledger currency ${ledgerCurrency}; FX conversion is required.`);
    }

    const netBalanceMinor = totalDebitMinor - totalCreditMinor;
    const activeCurrency = ledgerCurrency;

    const { minorToDecimal } = await import('../money/converter');

    return {
      totalDebit: minorToDecimal(totalDebitMinor, activeCurrency),
      totalDebitMinor,
      totalCredit: minorToDecimal(totalCreditMinor, activeCurrency),
      totalCreditMinor,
      netBalance: minorToDecimal(netBalanceMinor, activeCurrency),
      netBalanceMinor,
      totalTransactions,
    };
  }

  /**
   * Safe offline-first sync mutation enqueueing.
   * Uses dynamic import to prevent any circular dependency risks at module load time.
   */
  private async enqueueSyncMutation(
    entityType: 'transaction',
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

export const transactionEngine = new FinancialTransactionEngine();
