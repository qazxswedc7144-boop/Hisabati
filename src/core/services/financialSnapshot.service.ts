import Dexie from 'dexie';
import { db } from '../database/db';
import { 
  FinancialSnapshot, 
  SnapshotVerificationResult 
} from '@/shared/types';
import { calculateSHA256 } from '../utils/crypto';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { financialAuditService } from './financialAudit.service';
import { resolveRequiredCurrency } from '../money/currency';
import { CurrencyCode } from '@/shared/types';

export class FinancialSnapshotService {
  private static instance: FinancialSnapshotService;

  public static getInstance(): FinancialSnapshotService {
    if (!FinancialSnapshotService.instance) {
      FinancialSnapshotService.instance = new FinancialSnapshotService();
    }
    return FinancialSnapshotService.instance;
  }

  /**
   * Captures a point-in-time snapshot of the entire financial state.
   */
  async createSnapshot(): Promise<FinancialSnapshot> {
    const orgId = useTenantStore.getState().activeOrganization?.id || 'local';
    const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
    const ledgerRevision = lastAudit?.sequenceNumber || 0;
    const accounts = await db.accounts.toArray();
    const transactions = await db.transactions.toArray();
    const systemCurrency = ((await db.settings.get('currency'))?.value || 'YER') as CurrencyCode;
    const transactionsByAccount = new Map<string, Set<string>>();

    for (const trx of transactions) {
      if (!trx.currency) continue;
      const currencies = transactionsByAccount.get(trx.accountId) || new Set<string>();
      currencies.add(trx.currency);
      transactionsByAccount.set(trx.accountId, currencies);
    }

    const balances: Record<string, number> = {};
    const balanceCurrencies: Record<string, CurrencyCode> = {};
    const currencyTotals: Partial<Record<CurrencyCode, {
      totalDebitMinor: number;
      totalCreditMinor: number;
    }>> = {};

    for (const acc of accounts) {
      const transactionCurrencies = transactionsByAccount.get(acc.id) || new Set<string>();
      if (transactionCurrencies.size > 1) {
        throw new Error(`[Financial Safety] Cannot snapshot account ${acc.id} with mixed transaction currencies.`);
      }
      const inferredCurrency = Array.from(transactionCurrencies)[0] as CurrencyCode | undefined;
      const currency = resolveRequiredCurrency({
        transactionCurrency: inferredCurrency,
        accountCurrency: acc.currency,
        systemCurrency,
      });
      balanceCurrencies[acc.id] = currency;
      balances[acc.id] = acc.currentBalanceMinor || 0;

      const totals = currencyTotals[currency] || { totalDebitMinor: 0, totalCreditMinor: 0 };
      totals.totalDebitMinor += acc.totalDebitMinor || 0;
      totals.totalCreditMinor += acc.totalCreditMinor || 0;
      if (!Number.isSafeInteger(totals.totalDebitMinor) || !Number.isSafeInteger(totals.totalCreditMinor)) {
        throw new Error(`[Financial Safety] Snapshot totals exceed the safe integer range for ${currency}`);
      }
      currencyTotals[currency] = totals;
    }

    if (Object.keys(currencyTotals).length === 0) {
      currencyTotals[systemCurrency as CurrencyCode] = { totalDebitMinor: 0, totalCreditMinor: 0 };
    }

    const sortedBalances: Record<string, number> = {};
    Object.keys(balances).sort().forEach(key => { sortedBalances[key] = balances[key]; });
    const sortedBalanceCurrencies: Record<string, CurrencyCode> = {};
    Object.keys(balanceCurrencies).sort().forEach(key => { sortedBalanceCurrencies[key] = balanceCurrencies[key]; });
    const sortedCurrencyTotals: typeof currencyTotals = {};
    Object.keys(currencyTotals).sort().forEach(key => {
      sortedCurrencyTotals[key as CurrencyCode] = currencyTotals[key as CurrencyCode]!;
    });

    const currencyCodes = Object.keys(sortedCurrencyTotals);
    const singleCurrencyTotals = currencyCodes.length === 1
      ? sortedCurrencyTotals[currencyCodes[0] as CurrencyCode]
      : undefined;
    const transactionCount = transactions.length;
    const createdAt = new Date().toISOString();
    const payloadToHash = JSON.stringify({
      snapshotVersion: 2,
      orgId,
      ledgerRevision,
      transactionCount,
      accountCount: accounts.length,
      totalDebitMinor: singleCurrencyTotals?.totalDebitMinor,
      totalCreditMinor: singleCurrencyTotals?.totalCreditMinor,
      currencyTotals: sortedCurrencyTotals,
      balances: sortedBalances,
      balanceCurrencies: sortedBalanceCurrencies,
    });

    const integrityHash = await Dexie.waitFor(calculateSHA256(payloadToHash));
    const snapshot: FinancialSnapshot = {
      id: `snap_${crypto.randomUUID()}`,
      snapshotVersion: 2,
      organizationId: orgId,
      createdAt,
      ledgerRevision,
      transactionCount,
      accountCount: accounts.length,
      totalDebitMinor: singleCurrencyTotals?.totalDebitMinor,
      totalCreditMinor: singleCurrencyTotals?.totalCreditMinor,
      currencyTotals: sortedCurrencyTotals,
      balances: sortedBalances,
      balanceCurrencies: sortedBalanceCurrencies,
      integrityHash,
      isValid: true,
    };

    await db.financialSnapshots.add(snapshot);
    await financialAuditService.logFinancialEvent({
      eventType: 'SNAPSHOT_CREATE',
      targetType: 'snapshot',
      targetId: snapshot.id,
      metadata: { ledgerRevision, transactionCount, currencyCount: currencyCodes.length },
    });
    return snapshot;
  }

  /**
   * Verifies a snapshot against current ledger state.
   * Detects drift caused by unrecorded changes or ledger tampering.
   */
  async verifySnapshot(snapshotId: string): Promise<SnapshotVerificationResult> {
    const snapshot = await db.financialSnapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error('اللقطة المالية غير موجودة.');
    }
    
    const accounts = await db.accounts.toArray();
    const transactions = await db.transactions.toArray();
    const currentTransactionCount = transactions.length;
    const mismatchedAccounts: string[] = [];
    const systemCurrency = ((await db.settings.get('currency'))?.value || 'YER') as CurrencyCode;
    const transactionCurrenciesByAccount = new Map<string, Set<string>>();
    for (const trx of transactions) {
      if (!trx.currency) continue;
      const currencies = transactionCurrenciesByAccount.get(trx.accountId) || new Set<string>();
      currencies.add(trx.currency);
      transactionCurrenciesByAccount.set(trx.accountId, currencies);
    }
    
    // Check account count
    if (accounts.length !== snapshot.accountCount) {
      // Not necessarily an error if accounts were added, but we track it
    }
    
    // Verify each balance from snapshot against current state
    for (const [accountId, snapBalance] of Object.entries(snapshot.balances)) {
      const currentAcc = accounts.find(a => a.id === accountId);
      if (!currentAcc) {
        mismatchedAccounts.push(accountId);
        continue;
      }
      
      if ((currentAcc.currentBalanceMinor || 0) !== snapBalance) {
        mismatchedAccounts.push(accountId);
        continue;
      }
      if (snapshot.balanceCurrencies) {
        const currencies = transactionCurrenciesByAccount.get(accountId) || new Set<string>();
        if (currencies.size > 1) {
          mismatchedAccounts.push(accountId);
          continue;
        }
        const inferredCurrency = Array.from(currencies)[0] as CurrencyCode | undefined;
        try {
          const currentCurrency = resolveRequiredCurrency({
            transactionCurrency: inferredCurrency,
            accountCurrency: currentAcc.currency,
            systemCurrency,
          });
          if (snapshot.balanceCurrencies[accountId] !== currentCurrency) {
            mismatchedAccounts.push(accountId);
          }
        } catch {
          mismatchedAccounts.push(accountId);
        }
      }
    }
    
    const transactionCountDelta = currentTransactionCount - snapshot.transactionCount;
    const isMatch = mismatchedAccounts.length === 0 && transactionCountDelta >= 0;
    
    let messageAr = isMatch 
      ? 'الحالة المالية الحالية مطابقة للقطة المختارة.' 
      : `تم رصد اختلاف في ${mismatchedAccounts.length} حسابات.`;
      
    if (transactionCountDelta < 0) {
      messageAr += ' تحذير: عدد العمليات الحالي أقل من المسجل في اللقطة (احتمال حذف سجلات).';
    }

    return {
      isMatch,
      mismatchedAccounts,
      transactionCountDelta,
      messageAr,
      verifiedAt: new Date().toISOString()
    };
  }
  
  /**
   * Re-calculates and verifies the snapshot internal integrity.
   */
  async verifySnapshotIntegrity(snapshot: FinancialSnapshot): Promise<boolean> {
    // Sort balances keys for deterministic hashing
    const sortedBalances: Record<string, number> = {};
    Object.keys(snapshot.balances).sort().forEach(key => {
      sortedBalances[key] = snapshot.balances[key];
    });

    let payloadToHash: string;
    if (snapshot.snapshotVersion === 2) {
      const sortedBalanceCurrencies: Record<string, CurrencyCode> = {};
      Object.keys(snapshot.balanceCurrencies || {}).sort().forEach(key => {
        sortedBalanceCurrencies[key] = snapshot.balanceCurrencies![key];
      });
      const sortedCurrencyTotals: Record<string, { totalDebitMinor: number; totalCreditMinor: number }> = {};
      Object.keys(snapshot.currencyTotals || {}).sort().forEach(key => {
        sortedCurrencyTotals[key] = snapshot.currencyTotals![key as CurrencyCode]!;
      });
      payloadToHash = JSON.stringify({
        snapshotVersion: 2,
        orgId: snapshot.organizationId,
        ledgerRevision: snapshot.ledgerRevision,
        transactionCount: snapshot.transactionCount,
        accountCount: snapshot.accountCount,
        totalDebitMinor: snapshot.totalDebitMinor,
        totalCreditMinor: snapshot.totalCreditMinor,
        currencyTotals: sortedCurrencyTotals,
        balances: sortedBalances,
        balanceCurrencies: sortedBalanceCurrencies,
      });
    } else {
      // Legacy v1 snapshots retain their original hash payload for backward verification.
      payloadToHash = JSON.stringify({
        orgId: snapshot.organizationId,
        ledgerRevision: snapshot.ledgerRevision,
        transactionCount: snapshot.transactionCount,
        accountCount: snapshot.accountCount,
        balances: sortedBalances,
      });
    }

    const recomputedHash = await calculateSHA256(payloadToHash);
    return recomputedHash === snapshot.integrityHash;
  }
}

export const financialSnapshotService = FinancialSnapshotService.getInstance();
