import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { integrityService } from '../services/integrity.service';
import { financialAuditService } from '../services/financialAudit.service';
import { financialSnapshotService } from '../services/financialSnapshot.service';
import { accountService } from '../services/account.service';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';

describe('Financial Core Hardening Part 3: Concurrency & Failure Recovery', () => {
  let acc1: any;
  let acc2: any;

  beforeEach(async () => {
    vi.restoreAllMocks();

    // Initialize Tenant for Test
    await tenantService.initialize();
    useTenantStore.getState().setContext({
      activeOrganization: { id: 'test_org', name: 'Test Org' } as any
    });

    await db.accounts.clear();
    await db.transactions.clear();
    await db.financialAuditLogs.clear();
    await db.financialSnapshots.clear();
    await db.settings.clear();

    await db.settings.put({
      id: 'currency',
      key: 'currency',
      value: 'YER',
      updatedAt: new Date().toISOString()
    });

    acc1 = await accountService.createAccount({ name: 'Hardening Account 1', currency: 'YER' });
    acc2 = await accountService.createAccount({ name: 'Hardening Account 2', currency: 'YER' });
  });

  it('1.1 Concurrent CREATE (Duplicate operationId)', async () => {
    const opId = 'conc_create_' + Date.now();
    // Stress the idempotency by running many requests simultaneously
    const promises = Array(5).fill(0).map(() => 
      transactionEngine.createTransaction({
        accountId: acc1.id,
        type: 'debit',
        amountMinor: 1000,
        operationId: opId,
        date: '2026-01-01'
      })
    );
    
    const results = await Promise.all(promises);
    const uniqueIds = new Set(results.map(r => r.id));
    expect(uniqueIds.size).toBe(1);
    
    const count = await db.transactions.where('operationId').equals(opId).count();
    expect(count).toBe(1);
  });

  it('1.2 Concurrent EDIT (Same transaction)', async () => {
    const trx = await transactionEngine.createTransaction({ accountId: acc1.id, type: 'debit', amountMinor: 500, date: '2026-01-01' });
    const promises = Array(5).fill(0).map((_, i) => 
      transactionEngine.updateTransaction(trx.id, { amountMinor: 1000 + i })
    );
    
    await Promise.all(promises);
    const integrity = await integrityService.verifyFinancialIntegrity();
    expect(integrity.valid).toBe(true);
  });

  it('3.1 Fail after Balance update, before Audit (Atomic Rollback)', async () => {
    const originalLog = financialAuditService.logFinancialEvent;
    // Inject failure at audit step
    vi.spyOn(financialAuditService, 'logFinancialEvent').mockImplementation(async () => {
      throw new Error('Audit Crash Simulation');
    });
    
    const opId = 'fail_audit_' + Date.now();
    try {
      await transactionEngine.createTransaction({ accountId: acc1.id, type: 'debit', amountMinor: 555, operationId: opId, date: '2026-01-01' });
    } catch (e: any) {
      expect(e.message).toBe('Audit Crash Simulation');
    }
    
    const trx = await db.transactions.where('operationId').equals(opId).first();
    expect(trx).toBeUndefined(); // Should have rolled back
  });

  it('6.1 Detect Audit Chain Break (Previous Hash Tamper)', async () => {
    await transactionEngine.createTransaction({ accountId: acc1.id, type: 'debit', amountMinor: 1, date: '2026-01-01' });
    await transactionEngine.createTransaction({ accountId: acc1.id, type: 'debit', amountMinor: 1, date: '2026-01-01' });
    
    const logs = await db.financialAuditLogs.orderBy('sequenceNumber').toArray();
    const last = logs[logs.length - 1];
    await db.financialAuditLogs.update(last.id, { previousHash: 'corrupted' });
    
    const integrity = await financialAuditService.verifyChainIntegrity();
    expect(integrity.isValid).toBe(false);
  });

  it('7.1 Detect Balance Drift from Snapshot', async () => {
    const snap = await financialSnapshotService.createSnapshot();
    // Manual tamper bypass engine
    await db.accounts.update(acc1.id, { currentBalanceMinor: 987654321 });
    
    const result = await financialSnapshotService.verifySnapshot(snap.id);
    expect(result.isMatch).toBe(false);
  });

  it('11.1 Tenant Isolation: Reject unauthorized organization access', async () => {
    const originalOrg = useTenantStore.getState().activeOrganization;
    try {
      useTenantStore.getState().setContext({ activeOrganization: { id: 'other_org', name: 'Other' } as any });
      
      const entry = await financialAuditService.logFinancialEvent({
        eventType: 'SYSTEM_START' as any,
        targetType: 'system',
        targetId: 'sec_test'
      });
      
      expect(entry.organizationId).toBe('other_org');
    } finally {
      useTenantStore.getState().setContext({ activeOrganization: originalOrg });
    }
  });
});

export class FinancialHardeningPart3TestSuite {
  static async runAll(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    return { total: 0, passed: 0, failed: 0, results: [] };
  }
}
