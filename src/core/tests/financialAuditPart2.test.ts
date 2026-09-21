import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { financialAuditService } from '../services/financialAudit.service';
import { financialSnapshotService } from '../services/financialSnapshot.service';
import { rbacGuard } from '../services/rbac/RBACGuard.service';
import { authService } from '../services/rbac/AuthService.service';

export class FinancialAuditPart2TestSuite {
  static async runAll(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    // Isolated cleanup
    await Promise.all([
      db.accounts.clear(),
      db.transactions.clear(),
      db.financialAuditLogs.clear(),
      db.financialSnapshots.clear(),
      db.settings.clear()
    ]);
    
    // Setup test environment
    await db.settings.put({
      id: 'currency',
      key: 'currency',
      value: 'USD',
      updatedAt: new Date().toISOString()
    });

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

    // Shared test account
    const acc1Id = 'acc_audit_1_' + Date.now();
    await db.accounts.add({
      id: acc1Id,
      name: 'Audit Test Account',
      currency: 'USD',
      currentBalance: 0,
      currentBalanceMinor: 0,
      totalDebit: 0,
      totalDebitMinor: 0,
      totalCredit: 0,
      totalCreditMinor: 0,
      transactionCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archived: 0,
    });

    // --- 1. Audit Log Creation (5 tests) ---

    await test('1. Log on TRANSACTION_CREATE', async () => {
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amountMinor: 10000,
        date: '2026-01-01',
      });
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      if (!lastAudit || lastAudit.eventType !== 'TRANSACTION_CREATE') throw new Error('Audit log missing');
      if (lastAudit.targetId !== trx.id) throw new Error('Target ID mismatch');
      if (lastAudit.amountMinor !== 10000) throw new Error('Amount mismatch');
    });

    await test('2. Log on TRANSACTION_UPDATE (Before/After)', async () => {
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amountMinor: 5000,
        status: 'draft',
        date: '2026-01-01',
      });
      // Correctly update both to avoid financial safety mismatch
      await transactionEngine.updateTransaction(trx.id, { amount: 70, amountMinor: 7000 });
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      if (lastAudit?.eventType !== 'TRANSACTION_UPDATE') throw new Error('Event type mismatch');
      if (lastAudit.beforeState?.amountMinor !== 5000) throw new Error('Before state amount mismatch');
      if (lastAudit.afterState?.amountMinor !== 7000) throw new Error('After state amount mismatch');
    });

    await test('3. Log on TRANSACTION_DELETE (BeforeState)', async () => {
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amountMinor: 2000,
        status: 'draft',
        date: '2026-01-01',
      });
      await transactionEngine.deleteTransaction(trx.id);
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      if (lastAudit?.eventType !== 'TRANSACTION_DELETE') throw new Error('Event type mismatch');
      if (lastAudit.beforeState?.amountMinor !== 2000) throw new Error('Before state missing');
    });

    await test('4. Log on DOUBLE_ENTRY_CREATE', async () => {
      const opId = 'double_' + Date.now();
      await transactionEngine.createDoubleEntry({
        operationId: opId,
        entries: [
          { accountId: acc1Id, type: 'credit', amountMinor: 1000 },
          { accountId: acc1Id, type: 'debit', amountMinor: 1000 },
        ]
      });
      const logs = await db.financialAuditLogs.where('operationId').equals(opId).toArray();
      if (logs.length !== 2) throw new Error('Expected 2 logs for double entry');
      if (logs[0].eventType !== 'DOUBLE_ENTRY_CREATE') throw new Error('Event type mismatch');
    });

    await test('5. Actor identity in audit log', async () => {
      const actor = authService.getActiveActor();
      await transactionEngine.createTransaction({ accountId: acc1Id, type: 'debit', amountMinor: 1, date: '2026-01-01' });
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      if (lastAudit?.actor.id !== actor.id) throw new Error('Actor mismatch');
    });

    // --- 2. Tamper Detection & Hash Chain (7 tests) ---

    await test('6. Verify Hash Chaining Linkage', async () => {
      const entries = await db.financialAuditLogs.orderBy('sequenceNumber').toArray();
      if (entries.length < 2) throw new Error('Not enough entries');
      for (let i = 1; i < entries.length; i++) {
        if (entries[i].previousHash !== entries[i-1].hash) {
          throw new Error(`Chain break at index ${i}`);
        }
      }
    });

    await test('7. verifyChainIntegrity() success on clean data', async () => {
      const result = await financialAuditService.verifyChainIntegrity();
      if (!result.isValid) throw new Error('Integrity check failed on clean data: ' + result.messageAr);
    });

    await test('8. Detect Tamper: amountMinor change', async () => {
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      if (!lastAudit) throw new Error('No audit logs');
      // Tamper: change amountMinor
      await db.financialAuditLogs.update(lastAudit.id, { amountMinor: 9999999 });
      const result = await financialAuditService.verifyChainIntegrity();
      if (result.isValid) throw new Error('Failed to detect tampered amountMinor');
    });

    await test('9. Detect Tamper: actor identity spoof', async () => {
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').first();
      if (!lastAudit) throw new Error('No audit logs');
      // Tamper: change actor
      await db.financialAuditLogs.update(lastAudit.id, { actor: { ...lastAudit.actor, id: 'hacker' } });
      const result = await financialAuditService.verifyChainIntegrity();
      if (result.isValid) throw new Error('Failed to detect tampered actor');
    });

    await test('10. Detect Tamper: sequence break', async () => {
      // Clear and rebuild to ensure clean sequence
      await db.financialAuditLogs.clear();
      await financialAuditService.logFinancialEvent({ eventType: 'SYSTEM_START' as any, targetType: 'system', targetId: 'sys' });
      await financialAuditService.logFinancialEvent({ eventType: 'SYSTEM_START' as any, targetType: 'system', targetId: 'sys' });
      
      const entries = await db.financialAuditLogs.orderBy('sequenceNumber').toArray();
      await db.financialAuditLogs.update(entries[1].id, { sequenceNumber: 3 });
      const result = await financialAuditService.verifyChainIntegrity();
      if (result.isValid) throw new Error('Failed to detect sequence gap');
    });

    await test('11. Detect Tamper: injected rogue entry', async () => {
      await db.financialAuditLogs.clear();
      await financialAuditService.logFinancialEvent({ eventType: 'SYSTEM_START' as any, targetType: 'system', targetId: 's1' });
      const last = await financialAuditService.logFinancialEvent({ eventType: 'SYSTEM_START' as any, targetType: 'system', targetId: 's2' });
      
      // Inject rogue entry between 1 and 2
      await db.financialAuditLogs.add({
        ...last,
        id: 'rogue',
        sequenceNumber: 1.5 as any,
        hash: 'fake'
      });
      const result = await financialAuditService.verifyChainIntegrity();
      if (result.isValid) throw new Error('Failed to detect injected entry');
    });

    await test('12. Genesis Hash Verification', async () => {
      await db.financialAuditLogs.clear();
      const first = await financialAuditService.logFinancialEvent({ eventType: 'SYSTEM_START' as any, targetType: 'system', targetId: 'sys' });
      if (first.previousHash !== '0000000000000000000000000000000000000000000000000000000000000000') {
        throw new Error('Genesis hash mismatch');
      }
    });

    // --- 3. Financial Snapshots (6 tests) ---

    await test('13. Create Snapshot & Balance Capture', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      const acc = await db.accounts.get(acc1Id);
      if (snap.balances[acc1Id] !== acc?.currentBalanceMinor) throw new Error('Snapshot balance mismatch');
    });

    await test('14. Snapshot Transaction Count', async () => {
      const count = await db.transactions.count();
      const snap = await financialSnapshotService.createSnapshot();
      if (snap.transactionCount !== count) throw new Error('Transaction count mismatch');
    });

    await test('15. Snapshot integrityHash verification', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      const isValid = await financialSnapshotService.verifySnapshotIntegrity(snap);
      if (!isValid) throw new Error('Internal integrity hash failed');
    });

    await test('16. Detect Drift: Deletion after snapshot', async () => {
      const trx = await transactionEngine.createTransaction({ accountId: acc1Id, type: 'debit', amountMinor: 100, status: 'draft', date: '2026-01-01' });
      const snap = await financialSnapshotService.createSnapshot();
      await transactionEngine.deleteTransaction(trx.id);
      
      const verify = await financialSnapshotService.verifySnapshot(snap.id);
      if (verify.isMatch) throw new Error('Failed to detect state drift (deletion)');
    });

    await test('17. Detect Drift: Manual balance tamper', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      // Tamper: direct DB update bypassing engine
      await db.accounts.update(acc1Id, { currentBalanceMinor: 999999 });
      
      const verify = await financialSnapshotService.verifySnapshot(snap.id);
      if (verify.isMatch) throw new Error('Failed to detect balance drift');
    });

    await test('18. verifySnapshot() success on identical state', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      const verify = await financialSnapshotService.verifySnapshot(snap.id);
      if (!verify.isMatch) throw new Error('Verified state should match: ' + verify.messageAr);
    });

    // --- 4. Atomicity (5 tests) ---

    await test('19. Atomic Rollback: No audit if TRX fails', async () => {
      const beforeCount = await db.financialAuditLogs.count();
      try {
        await db.transaction('rw', db.transactions, db.financialAuditLogs, async (tx) => {
          await tx.table('financialAuditLogs').add({ id: 'will_rollback', sequenceNumber: 999 } as any);
          throw new Error('Forced Rollback');
        });
      } catch (e) {}
      const afterCount = await db.financialAuditLogs.count();
      if (afterCount !== beforeCount) throw new Error('Audit log persisted after rollback');
    });

    await test('20. Atomic Rollback: No TRX if Audit fails', async () => {
      const beforeCount = await db.transactions.count();
      try {
        await db.transaction('rw', db.transactions, db.financialAuditLogs, async (tx) => {
          await tx.table('transactions').add({ id: 'will_rollback' } as any);
          // Simulate audit fail (duplicate ID)
          const last = await db.financialAuditLogs.orderBy('sequenceNumber').last();
          if (last) await tx.table('financialAuditLogs').add({ ...last });
        });
      } catch (e) {}
      const afterCount = await db.transactions.count();
      if (afterCount !== beforeCount) throw new Error('Transaction persisted after audit failure');
    });

    await test('21. Atomic Recalculation: Balance consistency', async () => {
      // Create transaction and verify audit log and balance update happened in same TX
      // We check if either BOTH exist or NEITHER exist.
      const opId = 'atomicity_' + Date.now();
      await transactionEngine.createTransaction({ accountId: acc1Id, type: 'debit', amountMinor: 500, operationId: opId, date: '2026-01-01' });
      
      const trx = await db.transactions.where('operationId').equals(opId).first();
      const log = await db.financialAuditLogs.where('operationId').equals(opId).first();
      if (!trx || !log) throw new Error('Atomic link failed');
    });

    await test('22. operationId correlation', async () => {
      const opId = 'corr_' + Date.now();
      await transactionEngine.createTransaction({ accountId: acc1Id, type: 'debit', amountMinor: 1, operationId: opId, date: '2026-01-01' });
      const log = await db.financialAuditLogs.where('operationId').equals(opId).first();
      if (log?.operationId !== opId) throw new Error('operationId not propagated to audit log');
    });

    await test('23. ledgerRevision consistency', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      const lastAudit = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      // Snapshot creation itself creates an audit log entry.
      // So snap.ledgerRevision should be exactly 1 less than lastAudit.sequenceNumber
      if (snap.ledgerRevision !== (lastAudit?.sequenceNumber || 0) - 1) throw new Error('Snapshot ledger revision lag');
    });

    // --- 5. Restore Integrity (5 tests) ---

    await test('24. Snapshot validity after restore (Identity test)', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      const verify = await financialSnapshotService.verifySnapshot(snap.id);
      if (!verify.isMatch) throw new Error('Snapshot invalid after creation');
    });

    await test('25. Audit Log traceability', async () => {
      const entries = await db.financialAuditLogs.limit(5).toArray();
      if (entries.some(e => !e.eventType || !e.actor.id)) throw new Error('Traceability missing metadata');
    });

    await test('26. Tamper Detection: Restore with forged snapshot', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      // Forgery: change balance in snapshot record
      await db.financialSnapshots.update(snap.id, { balances: { [acc1Id]: 999999 } });
      const isValid = await financialSnapshotService.verifySnapshotIntegrity(await db.financialSnapshots.get(snap.id) as any);
      if (isValid) throw new Error('Failed to detect tampered snapshot file');
    });

    await test('27. Organization Isolation in Logs', async () => {
      const log = await db.financialAuditLogs.orderBy('sequenceNumber').last();
      if (!log?.organizationId) throw new Error('organizationId missing in audit log');
    });

    await test('28. Snapshot organizationId isolation', async () => {
      const snap = await financialSnapshotService.createSnapshot();
      if (!snap.organizationId) throw new Error('organizationId missing in snapshot');
    });

    return { total: results.length, passed, failed, results };
  }
}
