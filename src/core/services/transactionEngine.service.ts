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
      const finalUpdatedTrx: Transaction = {
        ...freshTrx,
        status: 'posted',
        postedAt: now,
        postedBy: currentActor.id,
        updatedAt: now,
      };

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

      await transaction.table('transactions').put(finalUpdatedTrx);
      
      const settingsTable = transaction.table('settings');
      const currencyEntry = await settingsTable.get('currency');
      const systemCurrency = currencyEntry?.value || 'YER';
      
      const activeCurrency = resolveRequiredCurrency({
        transactionCurrency: finalUpdatedTrx.currency,
        systemCurrency,
      });
      
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
   * Creates a transaction with strict financial validation, precision rounding,
   * deduplication / idempotency check, atomic persistence, and derived balance recalculation.
   */
  async createTransaction(dto: CreateTransactionDTO, actor?: AuditActor, options?: { isRemote?: boolean }): Promise<Transaction> {
    const currentActor = actor || rbacGuard.getActiveActor();

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
          const existingTrx = await transaction.table('transactions').where('operationId').equals(explicitOpId).first();
          if (existingTrx) {
            // Check for conflict: same operationId used for different transaction payload
            if (
              existingTrx.accountId !== dto.accountId ||
              existingTrx.type !== dto.type ||
              existingTrx.amountMinor !== safeAmountMinor
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

      // Post-commit side effects (Audit trail & Sync enqueue)
      await this.postProcessTransaction(createdTransaction, 'CREATE', currentActor, account, options);

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
    const freshSettings = await settingsRepository.getSettings();
    const currency = dto.currency || freshSettings.currency || 'YER';
    const date = dto.date || new Date().toISOString().split('T')[0];

    if (dto.entries.length < 2) {
      throw new Error('القيد المزدوج يجب أن يحتوي على طرفين على الأقل');
    }

    // Resolve and validate all legs
    let totalDebitMinor = 0;
    let totalCreditMinor = 0;
    const validatedLegs: (JournalEntryLeg & { resolvedAmountMinor: number; resolvedAmount: number })[] = [];

    for (const leg of dto.entries) {
      const { amountMinor, amount } = validateAndResolveFinancialAmount(leg.amount, leg.amountMinor, currency);
      validatedLegs.push({
        ...leg,
        resolvedAmountMinor: amountMinor,
        resolvedAmount: amount
      });

      if (leg.type === 'debit') totalDebitMinor += amountMinor;
      else totalCreditMinor += amountMinor;
    }

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

      const activeDb = getDb();
      await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, activeDb.settings, async (transaction) => {
        // Check idempotency in DB
        const existing = await transaction.table('transactions').where('operationId').equals(operationId).first();
        if (existing) {
          const allSiblings = await transaction.table('transactions').where('operationId').equals(operationId).toArray();
          const existingDebitSum = allSiblings.filter(t => t.type === 'debit').reduce((s, t) => s + (t.amountMinor || 0), 0);
          if (allSiblings.length !== validatedLegs.length || existingDebitSum !== totalDebitMinor) {
            throw new Error('الرقم المرجعي operationId مستخدم لقيد مزدوج مختلف');
          }
          createdTransactions.push(...allSiblings);
          return;
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
      });

      for (const trx of createdTransactions) {
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
    let updatedTrx!: Transaction;
    let targetAccount!: Account;

    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, async (transaction) => {
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

      updatedTrx = finalUpdatedTrx;
      targetAccount = account;
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
    let deleted = false;
    let deletedTransaction: Transaction | undefined;

    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.transactions, activeDb.accounts, activeDb.financialAuditLogs, activeDb.settings, async (transaction) => {
      const trxToDelete = await transaction.table('transactions').get(id) as Transaction | undefined;
      if (!trxToDelete) return;

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

      deletedTransaction = trxToDelete;
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
      deleted = true;
    });

    if (deleted && !options?.isRemote && deletedTransaction) {
      await this.enqueueSyncMutation('transaction', id, 'DELETE', { id }, deletedTransaction.operationId);
    }

    return deleted;
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

    const metrics = computeAccountMetricsFromTransactions(transactions, currency);
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

    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: currency,
      systemCurrency,
    });
    const allAccounts = await db.accounts.toArray();
    let count = 0;

    const batchSize = 50;
    for (let i = 0; i < allAccounts.length; i += batchSize) {
      const batch = allAccounts.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (acc) => {
          await this.recalculateAccountBalance(acc.id, activeCurrency);
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

    for (const acc of allAccounts) {
      totalDebitMinor += acc.totalDebitMinor || 0;
      totalCreditMinor += acc.totalCreditMinor || 0;
      totalTransactions += acc.transactionCount || 0;
    }

    const systemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');

    const netBalanceMinor = totalDebitMinor - totalCreditMinor;
    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: currency,
      systemCurrency,
    });

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
