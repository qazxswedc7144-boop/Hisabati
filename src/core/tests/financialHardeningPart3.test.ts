import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { integrityService } from '../services/integrity.service';
import { financialAuditService } from '../services/financialAudit.service';
import { financialSnapshotService } from '../services/financialSnapshot.service';
import { accountService } from '../services/account.service';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';

export class FinancialHardeningPart3TestSuite {
  static async runAll(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    const results: any[] = [];
    let passed = 0;
    let failed = 0;

    const test = async (title: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ title, passed: true });
        passed++;
      } catch (e: any) {
        results.push({ title, passed: false, error: e.message });
        failed++;
      }
    };

    try {
      // Setup Helper
      const setup = async () => {
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
        const a1 = await accountService.createAccount({ name: 'Hardening Account 1', currency: 'YER' });
        const a2 = await accountService.createAccount({ name: 'Hardening Account 2', currency: 'YER' });
        return { a1, a2 };
      };

      // 1.1 Concurrent CREATE
      await test('1.1 Concurrent CREATE (Duplicate operationId)', async () => {
        const { a1 } = await setup();
        const opId = 'conc_create_' + Date.now();
        const promises = Array(5).fill(0).map(() => 
          transactionEngine.createTransaction({
            accountId: a1.id,
            type: 'debit',
            amountMinor: 1000,
            operationId: opId,
            date: '2026-01-01'
          })
        );
        const res = await Promise.all(promises);
        const uniqueIds = new Set(res.map(r => r.id));
        if (uniqueIds.size !== 1) throw new Error('Duplicate transactions created');
      });

      // 1.2 Concurrent EDIT
      await test('1.2 Concurrent EDIT (Same transaction)', async () => {
        const { a1 } = await setup();
        const trx = await transactionEngine.createTransaction({ accountId: a1.id, type: 'debit', amountMinor: 500, status: 'draft', date: '2026-01-01' });
        const promises = Array(5).fill(0).map((_, i) => 
          transactionEngine.updateTransaction(trx.id, { amountMinor: 1000 + i })
        );
        await Promise.all(promises);
        const integrity = await integrityService.verifyFinancialIntegrity();
        if (!integrity.valid) throw new Error('Integrity failed after concurrent edit');
      });

      // 3.1 Fail after Balance update, before Audit (Atomic Rollback)
      await test('3.1 Fail after Balance update, before Audit (Atomic Rollback)', async () => {
        const { a1 } = await setup();
        const originalLog = financialAuditService.logFinancialEvent;
        // Manual override for test
        (financialAuditService as any).logFinancialEvent = async () => {
          throw new Error('Audit Crash Simulation');
        };
        
        const opId = 'fail_audit_' + Date.now();
        try {
          await transactionEngine.createTransaction({ accountId: a1.id, type: 'debit', amountMinor: 555, operationId: opId, date: '2026-01-01' });
        } catch (e: any) {
          if (e.message !== 'Audit Crash Simulation') throw e;
        } finally {
          (financialAuditService as any).logFinancialEvent = originalLog;
        }
        
        const trx = await db.transactions.where('operationId').equals(opId).first();
        if (trx) throw new Error('Transaction persisted despite audit failure');
      });

      // 6.1 Detect Audit Chain Break
      await test('6.1 Detect Audit Chain Break', async () => {
        const { a1 } = await setup();
        await transactionEngine.createTransaction({ accountId: a1.id, type: 'debit', amountMinor: 1, date: '2026-01-01' });
        await transactionEngine.createTransaction({ accountId: a1.id, type: 'debit', amountMinor: 1, date: '2026-01-01' });
        
        const logs = await db.financialAuditLogs.orderBy('sequenceNumber').toArray();
        const last = logs[logs.length - 1];
        await db.financialAuditLogs.update(last.id, { previousHash: 'corrupted' });
        
        const integrity = await financialAuditService.verifyChainIntegrity();
        if (integrity.isValid) throw new Error('Failed to detect corrupted audit chain');
      });

      // 7.1 Detect Balance Drift
      await test('7.1 Detect Balance Drift from Snapshot', async () => {
        const { a1 } = await setup();
        const snap = await financialSnapshotService.createSnapshot();
        await db.accounts.update(a1.id, { currentBalanceMinor: 987654321 });
        const result = await financialSnapshotService.verifySnapshot(snap.id);
        
        // Cleanup after drift test to avoid leaking inconsistent state to subsequent suites
        await db.accounts.update(a1.id, { currentBalanceMinor: 0 });
        
        if (result.isMatch) throw new Error('Failed to detect balance drift');
      });

    } catch (err: any) {
      console.error('Hardening P3 Suite Internal Error:', err);
    }

    return { total: results.length, passed, failed, results };
  }
}
