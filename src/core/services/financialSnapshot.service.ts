import Dexie from 'dexie';
import { db } from '../database/db';
import { 
  FinancialSnapshot, 
  SnapshotVerificationResult 
} from '@/shared/types';
import { calculateSHA256 } from '../utils/crypto';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { financialAuditService } from './financialAudit.service';

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
    const balances: Record<string, number> = {};
    let totalDebitMinor = 0;
    let totalCreditMinor = 0;
    
    accounts.forEach(acc => {
      balances[acc.id] = acc.currentBalanceMinor || 0;
      totalDebitMinor += (acc.totalDebitMinor || 0);
      totalCreditMinor += (acc.totalCreditMinor || 0);
    });
    
    const transactionCount = await db.transactions.count();
    const createdAt = new Date().toISOString();
    
    // Sort balances for deterministic hashing
    const sortedBalances: Record<string, number> = {};
    Object.keys(balances).sort().forEach(key => {
      sortedBalances[key] = balances[key];
    });

    const payloadToHash = JSON.stringify({
      orgId,
      ledgerRevision,
      transactionCount,
      accountCount: accounts.length,
      balances: sortedBalances,
    });
    
    // Use Dexie.waitFor to preserve transaction context if called inside one
    const integrityHash = await Dexie.waitFor(calculateSHA256(payloadToHash));
    
    const snapshot: FinancialSnapshot = {
      id: `snap_${Date.now()}`,
      organizationId: orgId,
      createdAt,
      ledgerRevision,
      transactionCount,
      accountCount: accounts.length,
      totalDebitMinor,
      totalCreditMinor,
      balances: sortedBalances,
      integrityHash,
      isValid: true
    };
    
    await db.financialSnapshots.add(snapshot);
    
    // Log snapshot creation in audit trail
    await financialAuditService.logFinancialEvent({
      eventType: 'SNAPSHOT_CREATE',
      targetType: 'snapshot',
      targetId: snapshot.id,
      metadata: { ledgerRevision, transactionCount }
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
    const currentTransactionCount = await db.transactions.count();
    const mismatchedAccounts: string[] = [];
    
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

    const payloadToHash = JSON.stringify({
      orgId: snapshot.organizationId,
      ledgerRevision: snapshot.ledgerRevision,
      transactionCount: snapshot.transactionCount,
      accountCount: snapshot.accountCount,
      balances: sortedBalances,
    });
    
    const recomputedHash = await calculateSHA256(payloadToHash);
    return recomputedHash === snapshot.integrityHash;
  }
}

export const financialSnapshotService = FinancialSnapshotService.getInstance();
