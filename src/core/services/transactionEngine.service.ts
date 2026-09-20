import { db } from '../database/db';
import {
  Transaction,
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

export class FinancialTransactionEngine {
  // In-memory mutex/deduplication registry for rapid in-flight double submission prevention
  private inFlightSubmissions = new Set<string>();

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

    // 3. Idempotency Key Handling (DB-Backed Uniqueness)
    // We use operationId as the definitive idempotency key.
    const idempotencyKey = dto.operationId || `op_${dto.accountId}_${dto.type}_${safeAmountMinor}_${dto.date}_${dto.note?.trim() || ''}`;
    
    // Memory lock (pre-emptive)
    if (this.inFlightSubmissions.has(idempotencyKey)) {
      const existing = await db.transactions.where('operationId').equals(idempotencyKey).first();
      if (existing) return existing;
    }
    this.inFlightSubmissions.add(idempotencyKey);

    try {
      const now = new Date().toISOString();
      const id = 'trx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);

      let createdTransaction: Transaction | null = null;

      // Atomic write transaction
      await db.transaction('rw', db.transactions, db.accounts, db.settings, db.financialAuditLogs, async (transaction) => {
        // Fetch FRESH settings inside the transaction to prevent race conditions
        const freshSettingsInside = await settingsRepository.getSettings();

        // Double-check idempotency inside DB transaction to prevent race conditions
        const existingTrx = await db.transactions.where('operationId').equals(idempotencyKey).first();
        if (existingTrx) {
          createdTransaction = existingTrx;
          return;
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
          operationId: idempotencyKey,
          receiptId: dto.receiptId?.trim() || undefined,
          documentRef: dto.documentRef || undefined,
          documentMetadata: dto.documentMetadata || undefined,
          createdAt: now,
          updatedAt: now,
        };

        // Auto-generate invoice number if needed
        if (!newTransaction.receiptNumber && freshSettingsInside.invoiceNumberingFormat !== 'manual') {
          const nextVal = (freshSettingsInside.nextInvoiceNumber || 1);
          const generated = formatInvoiceNumber(
            freshSettingsInside.invoicePrefix || 'INV-',
            nextVal,
            freshSettingsInside.invoiceNumberingFormat || 'sequential',
            newTransaction.date
          );
          
          if (generated) {
            newTransaction.receiptNumber = generated;
            await db.settings.put({
              id: 'nextInvoiceNumber',
              key: 'nextInvoiceNumber',
              value: nextVal + 1,
              updatedAt: now,
            });
            // Sync settings store
            useSettingsStore.getState().updateSettings({ nextInvoiceNumber: nextVal + 1 });
          }
        }

        await db.transactions.add(newTransaction);
        await this.recalculateAccountBalance(dto.accountId, activeCurrency, transaction);
        
        // Log financial event atomically inside the transaction
        await financialAuditService.logFinancialEvent({
          eventType: 'TRANSACTION_CREATE',
          targetType: 'transaction',
          targetId: id,
          amountMinor: safeAmountMinor,
          currency: activeCurrency,
          operationId: idempotencyKey,
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

      if (!createdTransaction) throw new Error('فشل إنشاء العملية المالية');

      // Audit & Sync side effects (Post-transaction)
      await this.postProcessTransaction(createdTransaction, 'CREATE', currentActor, account, options);

      return createdTransaction;
    } finally {
      setTimeout(() => this.inFlightSubmissions.delete(idempotencyKey), 2000);
    }
  }

  /**
   * Helper for side-effects after transaction persistence
   */
  private async postProcessTransaction(trx: Transaction, action: 'CREATE' | 'UPDATE', actor: AuditActor, account: Account, options?: { isRemote?: boolean }) {
    try {
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
    } catch (e) { console.warn('Audit log failed', e); }

    if (!options?.isRemote) {
      await this.enqueueSyncMutation('transaction', trx.id, action, trx, trx.operationId);
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
    const operationId = dto.operationId || `journal_${Date.now()}_${Math.random().toString(36).substring(7)}`;

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

    const createdTransactions: Transaction[] = [];

    await db.transaction('rw', db.transactions, db.accounts, db.financialAuditLogs, async (transaction) => {
      // Check idempotency
      const existing = await db.transactions.where('operationId').equals(operationId).first();
      if (existing) {
        // Find all siblings
        const allSiblings = await db.transactions.where('operationId').equals(operationId).toArray();
        createdTransactions.push(...allSiblings);
        return;
      }

      for (const leg of validatedLegs) {
        const id = 'trx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
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
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await db.transactions.add(trx);
        await this.recalculateAccountBalance(leg.accountId, currency, transaction);
        
        // Log each leg atomically
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

    // Side effects for each leg
    for (const trx of createdTransactions) {
      const acc = await db.accounts.get(trx.accountId);
      if (acc) await this.postProcessTransaction(trx, 'CREATE', currentActor, acc);
    }

    return createdTransactions;
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

    const existing = await db.transactions.get(id);
    if (!existing) throw new Error(`العملية رقم ${id} غير موجودة`);

    const oldAccountId = existing.accountId;
    const targetAccountId = dto.accountId || oldAccountId;

    const [account, freshSettings] = await Promise.all([
      db.accounts.get(targetAccountId),
      settingsRepository.getSettings()
    ]);

    if (!account) throw new Error('الحساب المرتبط غير موجود');

    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: dto.currency,
      accountCurrency: account.currency,
      systemCurrency: freshSettings.currency,
    });

    // Resolve and validate financial amount (Source of Truth: amountMinor)
    // If a new value is provided in DTO, it takes precedence. 
    // If only one of (amount, amountMinor) is provided, the other is derived.
    let financial;
    if (dto.amountMinor !== undefined || dto.amount !== undefined) {
      financial = validateAndResolveFinancialAmount(dto.amount, dto.amountMinor, activeCurrency);
    } else {
      financial = { amount: existing.amount, amountMinor: existing.amountMinor };
    }

    const updatedTrx: Transaction = {
      ...existing,
      accountId: targetAccountId,
      type: dto.type || existing.type,
      amount: financial.amount,
      amountMinor: financial.amountMinor,
      currency: activeCurrency,
      date: dto.date || existing.date,
      note: dto.note !== undefined ? (dto.note.trim() || undefined) : existing.note,
      receiptNumber: dto.receiptNumber !== undefined ? (dto.receiptNumber.trim() || undefined) : existing.receiptNumber,
      updatedAt: new Date().toISOString(),
    };

    await db.transaction('rw', db.transactions, db.accounts, db.financialAuditLogs, async (transaction) => {
      await db.transactions.put(updatedTrx);
      await this.recalculateAccountBalance(oldAccountId, activeCurrency, transaction);
      if (targetAccountId !== oldAccountId) {
        await this.recalculateAccountBalance(targetAccountId, activeCurrency, transaction);
      }

      // Log update atomically
      await financialAuditService.logFinancialEvent({
        eventType: 'TRANSACTION_UPDATE',
        targetType: 'transaction',
        targetId: id,
        amountMinor: updatedTrx.amountMinor,
        currency: activeCurrency,
        operationId: updatedTrx.operationId,
        beforeState: {
          amountMinor: existing.amountMinor || 0,
          accountId: existing.accountId,
          type: existing.type,
          revision: existing.id,
        },
        afterState: {
          amountMinor: updatedTrx.amountMinor,
          accountId: targetAccountId,
          type: updatedTrx.type,
          revision: id,
        },
        tx: transaction
      });
    });

    await this.postProcessTransaction(updatedTrx, 'UPDATE', currentActor, account, options);

    return updatedTrx;
  }

  /**
   * Deletes a transaction and recalculates the affected account balance.
   */
  async deleteTransaction(id: string, actor?: AuditActor, options?: { isRemote?: boolean }): Promise<boolean> {
    const currentActor = actor || rbacGuard.getActiveActor();

    // Strict RBAC Guard: assert transactions:delete permission
    await rbacGuard.assertPermission('transactions:delete', {
      actor: currentActor,
      targetType: 'transaction',
      targetId: id,
      details: `حذف القيد المالي رقم ${id}`,
    });

    const existing = await db.transactions.get(id);
    if (!existing) {
      return false;
    }

    const accountId = existing.accountId;
    const systemCurrency = await settingsRepository.get<CurrencyCode>('currency', 'YER');

    // Resolve currency for balance recalculation
    const activeCurrency = resolveRequiredCurrency({
      transactionCurrency: existing.currency,
      systemCurrency,
    });

    let deleted = false;
    await db.transaction('rw', db.transactions, db.accounts, db.financialAuditLogs, db.settings, async (transaction) => {
      // Re-verify existence inside transaction to prevent concurrent double-delete/recalculate race
      const trxToDelete = await transaction.table('transactions').get(id);
      if (!trxToDelete) return;

      await transaction.table('transactions').delete(id);
      await this.recalculateAccountBalance(accountId, activeCurrency, transaction);

      // Log deletion atomically
      await financialAuditService.logFinancialEvent({
        eventType: 'TRANSACTION_DELETE',
        targetType: 'transaction',
        targetId: id,
        amountMinor: existing.amountMinor,
        currency: activeCurrency,
        operationId: existing.operationId,
        beforeState: {
          amountMinor: existing.amountMinor || 0,
          accountId: existing.accountId,
          type: existing.type,
          revision: existing.id,
        },
        tx: transaction
      });

      // Phase 2.5: Record Permanent Delete Marker (Permanent Tombstone)
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

    if (deleted && !options?.isRemote) {
      await this.enqueueSyncMutation('transaction', id, 'DELETE', { id }, existing.operationId);
    }

    return deleted;
  }

  /**
   * Recalculates an account's financial balance from all its transactions.
   * Transactions are the absolute Source of Truth.
   * Uses integer arithmetic on minor units to guarantee zero floating point drift.
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
