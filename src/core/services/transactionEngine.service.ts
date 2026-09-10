import { db } from '../database/db';
import {
  Transaction,
  CreateTransactionDTO,
  UpdateTransactionDTO,
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
import { settingsRepository } from '../repositories/settings.repository';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { decimalToMinor } from '../money/converter';
import { getCurrencyDecimals } from '../money/currency';
import { assertDualMoneyRepresentation } from '../money/validator';

export class FinancialTransactionEngine {
  // In-memory mutex/deduplication registry for rapid in-flight double submission prevention
  private inFlightSubmissions = new Set<string>();

  /**
   * Creates a transaction with strict financial validation, precision rounding,
   * deduplication / idempotency check, atomic persistence, and derived balance recalculation.
   */
  async createTransaction(dto: CreateTransactionDTO, actor?: AuditActor): Promise<Transaction> {
    const currentActor = actor || rbacGuard.getActiveActor();

    // 0. Strict RBAC Guard Assertion (Guarded Execution Gate)
    await rbacGuard.assertPermission('transactions:create', {
      actor: currentActor,
      targetType: 'transaction',
      details: `تسجيل عملية مالية بمبلغ ${dto.amount} على الحساب ${dto.accountId}`,
    });

    // 1. Validation
    const validation = validateTransactionForm({
      accountId: dto.accountId,
      amount: dto.amount,
      date: dto.date,
    });

    if (!validation.isValid) {
      const firstError = Object.values(validation.errors)[0] || 'بيانات العملية غير صحيحة';
      throw new Error(firstError);
    }

    // 2. Verify account existence
    const account = await db.accounts.get(dto.accountId);
    if (!account) {
      throw new Error('الحساب المحدد غير موجود في قاعدة البيانات');
    }

    // 3. Idempotency Key Handling
    const idempotencyKey = dto.operationId || `op_${dto.accountId}_${dto.type}_${dto.amount}_${dto.date}_${dto.note || ''}`;
    
    if (this.inFlightSubmissions.has(idempotencyKey)) {
      // In-flight duplicate detected: wait or return existing transaction if already registered
      const existing = await db.transactions
        .where('operationId')
        .equals(idempotencyKey)
        .first();
      if (existing) return existing;
    }

    this.inFlightSubmissions.add(idempotencyKey);

    try {
      // Check if a transaction with the same operationId already exists in IndexedDB
      if (dto.operationId) {
        const existingTrx = await db.transactions
          .where('operationId')
          .equals(dto.operationId)
          .first();
        if (existingTrx) {
          return existingTrx;
        }
      }

      const now = new Date().toISOString();
      const id = 'trx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
      const safeAmount = roundMoney(Math.abs(dto.amount));

      // Resolve active settings and compute/validate canonical integer minor units
      const settings = await settingsRepository.getSettings();
      const activeCurrency = settings.currency || 'YER';
      let amountMinor: number;

      if (dto.amountMinor !== undefined) {
        assertDualMoneyRepresentation(safeAmount, dto.amountMinor, activeCurrency);
        amountMinor = dto.amountMinor;
      } else {
        if (safeAmount % 1 !== 0 && getCurrencyDecimals(activeCurrency) === 0) {
          amountMinor = decimalToMinor(safeAmount, 'SAR', 'HALF_UP');
        } else {
          amountMinor = decimalToMinor(safeAmount, activeCurrency, 'HALF_UP');
        }
        assertDualMoneyRepresentation(safeAmount, amountMinor, activeCurrency);
      }

      const newTransaction: Transaction = {
        id,
        accountId: dto.accountId,
        type: dto.type,
        amount: safeAmount,
        amountMinor,
        date: dto.date || now.split('T')[0],
        note: dto.note?.trim() || undefined,
        receiptNumber: dto.receiptNumber?.trim() || undefined,
        operationId: dto.operationId || idempotencyKey,
        receiptId: dto.receiptId?.trim() || undefined,
        documentRef: dto.documentRef || undefined,
        documentMetadata: dto.documentMetadata || undefined,
        createdAt: now,
        updatedAt: now,
      };

      // Atomic write transaction
      await db.transaction('rw', db.transactions, db.accounts, db.settings, async () => {
        // Auto-generate invoice number if needed inside the transaction
        if (!newTransaction.receiptNumber && settings.invoiceNumberingFormat !== 'manual') {
          const generated = formatInvoiceNumber(
            settings.invoicePrefix,
            settings.nextInvoiceNumber,
            settings.invoiceNumberingFormat,
            newTransaction.date
          );
          
          if (generated) {
            newTransaction.receiptNumber = generated;
            
            // Increment next sequence number in database directly
            const nextVal = (settings.nextInvoiceNumber || 1) + 1;
            await db.settings.put({
              id: 'nextInvoiceNumber',
              key: 'nextInvoiceNumber',
              value: nextVal,
              updatedAt: now,
            });
            
            // Also update the store to keep UI in sync
            useSettingsStore.getState().updateSettings({
              nextInvoiceNumber: nextVal,
            });
          }
        }

        await db.transactions.add(newTransaction);
        await this.recalculateAccountBalance(dto.accountId, activeCurrency);
      });

      // Log in immutable tamper-resistant audit trail
      try {
        await auditTrailService.log({
          actor: currentActor,
          action: 'TRANSACTION_CREATE',
          targetType: 'transaction',
          targetId: newTransaction.id,
          riskLevel: 'LOW',
          detailsAr: `تسجيل قيد مالي (${newTransaction.type === 'debit' ? 'مدين/له' : 'دائن/عليه'}) بمبلغ ${safeAmount} على حساب "${account.name}".`,
          afterState: { ...newTransaction },
          metadata: {
            accountId: account.id,
            accountName: account.name,
            amount: safeAmount,
            operationId: newTransaction.operationId,
          },
        });
      } catch (logErr) {
        console.warn('Audit trail write warning:', logErr);
      }

      // Safe offline-first sync mutation enqueueing
      await this.enqueueSyncMutation(
        'transaction',
        newTransaction.id,
        'CREATE',
        newTransaction,
        newTransaction.operationId
      );

      return newTransaction;
    } finally {
      // Release in-flight lock after short timeout or immediately
      setTimeout(() => {
        this.inFlightSubmissions.delete(idempotencyKey);
      }, 1000);
    }
  }

  /**
   * Updates an existing transaction and updates balances of all affected accounts.
   */
  async updateTransaction(id: string, dto: UpdateTransactionDTO, actor?: AuditActor): Promise<Transaction> {
    const currentActor = actor || rbacGuard.getActiveActor();

    // Strict RBAC Guard: assert transactions:update permission
    await rbacGuard.assertPermission('transactions:update', {
      actor: currentActor,
      targetType: 'transaction',
      targetId: id,
      details: `تعديل القيد المالي رقم ${id}`,
    });

    const existing = await db.transactions.get(id);
    if (!existing) {
      throw new Error(`العملية رقم ${id} غير موجودة`);
    }

    const oldAccountId = existing.accountId;
    const targetAccountId = dto.accountId || oldAccountId;

    // Check target account existence if changing account
    if (targetAccountId !== oldAccountId) {
      const targetAcc = await db.accounts.get(targetAccountId);
      if (!targetAcc) {
        throw new Error('الحساب الجديد المحدد غير موجود');
      }
    }

    const safeAmount = dto.amount !== undefined ? roundMoney(Math.abs(dto.amount)) : existing.amount;
    const now = new Date().toISOString();

    const activeCurrency = (await settingsRepository.get<CurrencyCode>('currency', 'YER')) || 'YER';
    let amountMinor: number;

    if (dto.amountMinor !== undefined) {
      assertDualMoneyRepresentation(safeAmount, dto.amountMinor, activeCurrency);
      amountMinor = dto.amountMinor;
    } else if (dto.amount !== undefined) {
      if (safeAmount % 1 !== 0 && getCurrencyDecimals(activeCurrency) === 0) {
        amountMinor = decimalToMinor(safeAmount, 'SAR', 'HALF_UP');
      } else {
        amountMinor = decimalToMinor(safeAmount, activeCurrency, 'HALF_UP');
      }
      assertDualMoneyRepresentation(safeAmount, amountMinor, activeCurrency);
    } else {
      amountMinor = existing.amountMinor !== undefined
        ? existing.amountMinor
        : decimalToMinor(existing.amount, activeCurrency, 'HALF_UP');
    }

    const updatedTrx: Transaction = {
      ...existing,
      accountId: targetAccountId,
      type: dto.type || existing.type,
      amount: safeAmount,
      amountMinor,
      date: dto.date || existing.date,
      note: dto.note !== undefined ? (dto.note.trim() || undefined) : existing.note,
      receiptNumber: dto.receiptNumber !== undefined ? (dto.receiptNumber.trim() || undefined) : existing.receiptNumber,
      updatedAt: now,
    };

    await db.transaction('rw', db.transactions, db.accounts, async () => {
      await db.transactions.put(updatedTrx);
      
      // Recalculate old account balance
      await this.recalculateAccountBalance(oldAccountId, activeCurrency);

      // If account changed, recalculate new account balance as well
      if (targetAccountId !== oldAccountId) {
        await this.recalculateAccountBalance(targetAccountId, activeCurrency);
      }
    });

    // Record update in audit trail
    try {
      await auditTrailService.log({
        actor: currentActor,
        action: 'TRANSACTION_UPDATE',
        targetType: 'transaction',
        targetId: updatedTrx.id,
        riskLevel: 'MEDIUM',
        detailsAr: `تعديل قيد مالي رقم ${updatedTrx.id} على حساب ID ${targetAccountId}.`,
        beforeState: { ...existing },
        afterState: { ...updatedTrx },
      });
    } catch (logErr) {
      console.warn('Audit trail update write warning:', logErr);
    }

    // Safe offline-first sync mutation enqueueing
    await this.enqueueSyncMutation(
      'transaction',
      updatedTrx.id,
      'UPDATE',
      updatedTrx,
      updatedTrx.operationId || updatedTrx.id
    );

    return updatedTrx;
  }

  /**
   * Deletes a transaction and recalculates the affected account balance.
   */
  async deleteTransaction(id: string, actor?: AuditActor): Promise<boolean> {
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
    const activeCurrency = (await settingsRepository.get<CurrencyCode>('currency', 'YER')) || 'YER';

    await db.transaction('rw', db.transactions, db.accounts, async () => {
      await db.transactions.delete(id);
      await this.recalculateAccountBalance(accountId, activeCurrency);
    });

    // Record deletion in audit trail
    try {
      await auditTrailService.log({
        actor: currentActor,
        action: 'TRANSACTION_DELETE',
        targetType: 'transaction',
        targetId: id,
        riskLevel: 'HIGH',
        detailsAr: `حذف قيد مالي رقم ${id} بمبلغ ${existing.amount} من حساب ID ${accountId}.`,
        beforeState: { ...existing },
      });
    } catch (logErr) {
      console.warn('Audit trail delete write warning:', logErr);
    }

    // Safe offline-first sync mutation enqueueing (tombstone)
    await this.enqueueSyncMutation(
      'transaction',
      id,
      'DELETE',
      { id, accountId },
      id
    );

    return true;
  }

  /**
   * Recalculates an account's financial balance from all its transactions.
   * Transactions are the absolute Source of Truth.
   * Uses integer arithmetic on minor units to guarantee zero floating point drift.
   */
  async recalculateAccountBalance(accountId: string, currency?: CurrencyCode): Promise<Account | undefined> {
    const account = await db.accounts.get(accountId);
    if (!account) return undefined;

    const transactions = await db.transactions
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

    await db.accounts.update(accountId, updatedFields);
    return await db.accounts.get(accountId);
  }

  /**
   * Recalculates all balances for every account in the database from scratch.
   * Does NOT alter or delete any transaction records.
   */
  async recalculateAllBalances(currency?: CurrencyCode): Promise<{ accountsUpdated: number }> {
    const activeCurrency = currency || (await settingsRepository.get<CurrencyCode>('currency', 'YER')) || 'YER';
    const allAccounts = await db.accounts.toArray();
    let count = 0;

    for (const acc of allAccounts) {
      await this.recalculateAccountBalance(acc.id, activeCurrency);
      count++;
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

    const activeCurrency = currency || (await settingsRepository.get<CurrencyCode>('currency', 'YER')) || 'YER';

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
   */
  async getGlobalSummary(currency?: CurrencyCode): Promise<TransactionSummary & { totalDebitMinor: number; totalCreditMinor: number; netBalanceMinor: number }> {
    const activeCurrency = currency || (await settingsRepository.get<CurrencyCode>('currency', 'YER')) || 'YER';
    const transactions = await db.transactions.toArray();
    const metrics = computeAccountMetricsFromTransactions(transactions, activeCurrency);

    return {
      totalDebit: metrics.totalDebit,
      totalCredit: metrics.totalCredit,
      netBalance: metrics.currentBalance,
      totalTransactions: metrics.transactionCount,
      totalDebitMinor: metrics.totalDebitMinor,
      totalCreditMinor: metrics.totalCreditMinor,
      netBalanceMinor: metrics.currentBalanceMinor,
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
