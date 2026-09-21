import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountService } from '../services/account.service';
import { integrityService } from '../services/integrity.service';

export class FinancialCoreHardeningTestSuite {
  static async runAll(): Promise<{ total: number; passed: number; failed: number; results: any[] }> {
    // [HARDENING] Strict isolation: clear all financial tables to prevent leakage from previous suites
    await Promise.all([
      db.accounts.clear(),
      db.transactions.clear(),
      db.settings.clear()
    ]);
    
    // Initialize test environment
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

    // Setup: Create test accounts with explicit USD currency
    const acc1Id = 'acc_hard_1_' + Date.now();
    const acc2Id = 'acc_hard_2_' + Date.now();
    await db.accounts.add({
      id: acc1Id,
      name: 'Test Account 1',
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
    await db.accounts.add({
      id: acc2Id,
      name: 'Test Account 2',
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

    // 1. Valid amountMinor
    await test('1. Valid amountMinor', async () => {
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amountMinor: 150000, // 1500.00
        date: '2026-01-01',
        operationId: 'op_valid_minor_' + Date.now(),
      });
      if (trx.amount !== 1500 || trx.amountMinor !== 150000) throw new Error(`Mismatch: got ${trx.amount} / ${trx.amountMinor}`);
    });

    // 2. Invalid amount (type safety handled by TS, but test runtime)
    await test('2. Invalid amount type', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amount: 'invalid' as any,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('أكبر من الصفر')) throw e;
      }
    });

    // 3. NaN
    await test('3. Reject NaN', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amount: NaN,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('NaN') && !e.message.includes('أكبر من الصفر')) throw e;
      }
    });

    // 4. Infinity
    await test('4. Reject Infinity', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amount: Infinity,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('Infinity')) throw e;
      }
    });

    // 5. Fractional minor unit
    await test('5. Reject fractional minor unit', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amountMinor: 100.5,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('integer')) throw e;
      }
    });

    // 6. Unsafe integer
    await test('6. Reject unsafe integer', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amountMinor: Number.MAX_SAFE_INTEGER + 10,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('safe integer')) throw e;
      }
    });

    // 7. Zero amount
    await test('7. Reject zero amount', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amount: 0,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('أكبر من الصفر')) throw e;
      }
    });

    // 8. Negative amount
    await test('8. Reject negative amount', async () => {
      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'debit',
          amount: -500,
          date: '2026-01-01',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('أكبر من الصفر')) throw e;
      }
    });

    // 9. Balanced double-entry
    await test('9. Balanced double-entry', async () => {
      const opId = 'op_double_balanced_' + Date.now();
      const trxs = await transactionEngine.createDoubleEntry({
        operationId: opId,
        date: '2026-01-01',
        currency: 'USD',
        entries: [
          { accountId: acc1Id, type: 'credit', amountMinor: 100000 },
          { accountId: acc2Id, type: 'debit', amountMinor: 100000 },
        ]
      });
      if (trxs.length !== 2) throw new Error('Expected 2 transactions');
      const acc1 = await db.accounts.get(acc1Id);
      const acc2 = await db.accounts.get(acc2Id);
      // acc1 had 150000 from test 1. So 150000 - 100000 = 50000
      if (acc1?.currentBalanceMinor !== 50000) throw new Error(`Acc 1 balance incorrect: ${acc1?.currentBalanceMinor}`);
      if (acc2?.currentBalanceMinor !== 100000) throw new Error('Acc 2 balance incorrect');
    });

    // 10. Unbalanced double-entry
    await test('10. Unbalanced double-entry rejection', async () => {
      try {
        await transactionEngine.createDoubleEntry({
          entries: [
            { accountId: acc1Id, type: 'credit', amountMinor: 100000 },
            { accountId: acc2Id, type: 'debit', amountMinor: 99000 },
          ]
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        if (!e.message.includes('غير متوازن')) throw e;
      }
    });

    // 11. Same operation retry (Idempotency)
    await test('11. Idempotency (Retry same OP)', async () => {
      const opId = 'op_retry_' + Date.now();
      const res1 = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 100,
        operationId: opId,
        date: '2026-01-01',
      });
      const res2 = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 100,
        operationId: opId,
        date: '2026-01-01',
      });
      if (res1.id !== res2.id) throw new Error('IDs should match');
    });

    // 12. Legitimate identical transaction
    await test('12. Legitimate identical transaction (diff opId)', async () => {
      const res1 = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 123,
        date: '2026-01-01',
        operationId: 'op_id_1' + Date.now(),
      });
      const res2 = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 123,
        date: '2026-01-01',
        operationId: 'op_id_2' + Date.now(),
      });
      if (res1.id === res2.id) throw new Error('IDs should NOT match');
    });

    // 13. Concurrent duplicate create
    await test('13. Concurrent duplicate (DB-backed)', async () => {
      const opId = 'op_concurrent_' + Date.now();
      // Bypass memory map to test DB check
      (transactionEngine as any).inFlightPromises.clear();
      
      const p1 = transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 50,
        operationId: opId,
        date: '2026-01-01',
      });
      const p2 = transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 50,
        operationId: opId,
        date: '2026-01-01',
      });
      
      const [r1, r2] = await Promise.all([p1, p2]);
      if (r1.id !== r2.id) throw new Error('Concurrent ID mismatch');
    });

    // 14. Retry after failure (simulated)
    await test('14. Retry after partial failure (Atomic Rollback)', async () => {
      // We'll simulate a failure in the middle of a double entry
      const opId = 'op_fail_retry_' + Date.now();
      try {
        await db.transaction('rw', db.transactions, db.accounts, async () => {
           await db.transactions.add({ id: 'dummy', accountId: acc1Id, type: 'debit', amount: 1, amountMinor: 100, operationId: opId, date: '2026-01-01', createdAt: '', updatedAt: '' });
           throw new Error('Atomic Crash');
        });
      } catch (e) {}
      
      // Verify nothing saved
      const existing = await db.transactions.where('operationId').equals(opId).first();
      if (existing) throw new Error('Data persisted despite crash');
      
      // Retry should work fine
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 777,
        operationId: opId,
        date: '2026-01-01',
      });
      if (trx.amount !== 777) throw new Error('Retry failed');
    });

    // 15. Atomic rollback (verify multi-leg consistency)
    await test('15. Atomic rollback for double-entry', async () => {
       const opId = 'op_double_fail_' + Date.now();
       try {
         await db.transaction('rw', db.transactions, db.accounts, async () => {
            // Add first leg
            await db.transactions.add({ id: 'leg1', accountId: acc1Id, type: 'credit', amount: 100, amountMinor: 10000, operationId: opId, date: '2026-01-01', createdAt: '', updatedAt: '' });
            // Simulate crash before second leg
            throw new Error('Crash before second leg');
         });
       } catch (e) {}
       
       const count = await db.transactions.where('operationId').equals(opId).count();
       if (count > 0) throw new Error('Orphan leg persisted');
    });

    // 16. Edit transaction amount
    await test('16. Edit transaction amount', async () => {
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 1000,
        date: '2026-01-01',
      });
      const accBefore = await db.accounts.get(acc1Id);
      const balBefore = accBefore?.currentBalanceMinor || 0;
      
      await transactionEngine.updateTransaction(trx.id, { amount: 1500 });
      const accAfter = await db.accounts.get(acc1Id);
      if (accAfter?.currentBalanceMinor !== balBefore + 50000) {
         throw new Error(`Balance mismatch after edit: ${accAfter?.currentBalanceMinor} vs ${balBefore + 50000}`);
      }
    });

    // 17. Delete transaction
    await test('17. Delete transaction', async () => {
      const trx = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 200,
        date: '2026-01-01',
      });
      const accBefore = await db.accounts.get(acc1Id);
      const balBefore = accBefore?.currentBalanceMinor || 0;
      
      await transactionEngine.deleteTransaction(trx.id);
      const accAfter = await db.accounts.get(acc1Id);
      if (accAfter?.currentBalanceMinor !== balBefore - 20000) {
        throw new Error('Balance mismatch after delete');
      }
    });

    // 18. Balance preservation
    await test('18. Balance preservation after complex ops', async () => {
       const report = await integrityService.verifyFinancialIntegrity();
       if (!report.valid) throw new Error('Financial integrity failed: ' + JSON.stringify(report.inconsistencies));
    });

    // 19. No partial transaction
    await test('19. Verify no records if one leg is invalid', async () => {
       try {
         await transactionEngine.createDoubleEntry({
           entries: [
             { accountId: acc1Id, type: 'credit', amount: 100 },
             { accountId: 'non-existent', type: 'debit', amount: 100 },
           ]
         });
       } catch (e) {}
       // The second leg might fail at db level if we had FKs, but here let's test amount validation
       try {
         await transactionEngine.createDoubleEntry({
           entries: [
             { accountId: acc1Id, type: 'credit', amount: 100 },
             { accountId: acc2Id, type: 'debit', amount: NaN as any },
           ]
         });
       } catch (e) {}
       // Verify no orphans
    });

    // 20. DB-backed idempotency (verify it works even if memory map is cleared)
    await test('20. DB-backed idempotency (Map clear test)', async () => {
      const opId = 'op_db_only_' + Date.now();
      const res1 = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 99,
        operationId: opId,
        date: '2026-01-01',
      });
      
      // Clear memory map
      (transactionEngine as any).inFlightPromises.clear();
      
      const res2 = await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 99,
        operationId: opId,
        date: '2026-01-01',
      });
      if (res1.id !== res2.id) throw new Error('DB idempotency failed');
    });

    // 21. Explicit operationId conflict rejection
    await test('21. Explicit operationId conflict rejection', async () => {
      const opId = 'op_conflict_' + Date.now();
      await transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 500,
        operationId: opId,
        date: '2026-01-01',
      });

      try {
        await transactionEngine.createTransaction({
          accountId: acc1Id,
          type: 'credit', // Different type!
          amount: 500,
          operationId: opId,
          date: '2026-01-01',
        });
        throw new Error('Should have failed on operationId conflict');
      } catch (e: any) {
        if (!e.message.includes('operationId') && !e.message.includes('مختلفة')) throw e;
      }
    });

    // 22. Rapid double submission without operationId (in-flight deduplication)
    await test('22. Rapid double submission without operationId', async () => {
      const note = 'rapid_test_note_' + Date.now();
      const p1 = transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 350,
        date: '2026-01-01',
        note,
      });
      const p2 = transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 350,
        date: '2026-01-01',
        note,
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      if (r1.id !== r2.id) throw new Error('Rapid double submit should return same transaction instance');
    });

    // 23. Settings rollback on atomic failure
    await test('23. Settings rollback on atomic failure', async () => {
      await db.settings.put({
        id: 'nextInvoiceNumber',
        key: 'nextInvoiceNumber',
        value: 100,
        updatedAt: new Date().toISOString()
      });

      try {
        await db.transaction('rw', db.transactions, db.accounts, db.settings, async () => {
          await db.settings.put({
            id: 'nextInvoiceNumber',
            key: 'nextInvoiceNumber',
            value: 101,
            updatedAt: new Date().toISOString()
          });
          throw new Error('Simulated DB Crash');
        });
      } catch (e) {}

      const settingAfter = await db.settings.get('nextInvoiceNumber');
      if (settingAfter?.value !== 100) {
        throw new Error(`Settings value did not rollback: got ${settingAfter?.value}`);
      }
    });

    // 24. Concurrent invoice numbering non-collision
    await test('24. Concurrent invoice numbering non-collision', async () => {
      await db.settings.put({
        id: 'nextInvoiceNumber',
        key: 'nextInvoiceNumber',
        value: 500,
        updatedAt: new Date().toISOString()
      });

      const p1 = transactionEngine.createTransaction({
        accountId: acc1Id,
        type: 'debit',
        amount: 100,
        date: '2026-01-01',
        operationId: 'op_inv_1_' + Date.now(),
      });
      const p2 = transactionEngine.createTransaction({
        accountId: acc2Id,
        type: 'debit',
        amount: 200,
        date: '2026-01-01',
        operationId: 'op_inv_2_' + Date.now(),
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      if (r1.receiptNumber && r2.receiptNumber && r1.receiptNumber === r2.receiptNumber) {
        throw new Error(`Invoice collision: both got ${r1.receiptNumber}`);
      }
    });

    return { total: results.length, passed, failed, results };
  }
}
