import 'fake-indexeddb/auto';
import { db } from '../database/db';
import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { tenantService } from '../services/TenantService';
import { DATABASE_SCHEMA_VERSION } from '../database/schemaVersion';

interface SyncQueueAtomicityResult {
  id: string;
  passed: boolean;
  message: string;
}

export class SyncQueueAtomicityTestSuite {
  static async runAll(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: SyncQueueAtomicityResult[];
  }> {
    const results: SyncQueueAtomicityResult[] = [];
    const testOperationIds = new Set<string>();
    const originalIsConnected = googleDriveService.isConnected.bind(googleDriveService);
    const prefix = `e2_atomic_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const runTest = async (id: string, testFn: () => Promise<void>) => {
      try {
        await testFn();
        results.push({ id, passed: true, message: 'PASS' });
      } catch (error: any) {
        results.push({ id, passed: false, message: error?.message || String(error) });
      }
    };

    try {
      await tenantService.switchToLocalMode();
      // Prevent best-effort network sync from mutating queue rows during assertions.
      googleDriveService.isConnected = () => false;

      // T-S1: Sequential duplicate operationId returns the persisted queue item.
      await runTest('T-S1', async () => {
        const operationId = `${prefix}_sequential`;
        testOperationIds.add(operationId);
        const first = await syncEngine.enqueueMutation(
          'transaction', 'trx_e2_sequential', 'CREATE', { marker: 'first' }, operationId
        );

        const second = await syncEngine.enqueueMutation(
          'transaction', 'trx_e2_sequential', 'CREATE', { marker: 'second' }, operationId
        );

        const count = await db.syncQueue.where('operationId').equals(operationId).count();
        if (count !== 1) throw new Error(`Expected one queue row; found ${count}`);
        if (second.id !== first.id) throw new Error('Second call did not return the existing queue row');
        if (second.payload?.marker !== 'first') throw new Error('Existing row was replaced or mutated');
      });

      // T-S2: Concurrent duplicate operationId calls are serialized atomically.
      await runTest('T-S2', async () => {
        const operationId = `${prefix}_concurrent`;
        testOperationIds.add(operationId);
        const [first, second] = await Promise.all([
          syncEngine.enqueueMutation('transaction', 'trx_e2_concurrent', 'CREATE', { call: 1 }, operationId),
          syncEngine.enqueueMutation('transaction', 'trx_e2_concurrent', 'CREATE', { call: 2 }, operationId),
        ]);

        const rows = await db.syncQueue.where('operationId').equals(operationId).toArray();
        if (rows.length !== 1) throw new Error(`Expected one concurrent row; found ${rows.length}`);
        if (first.id !== second.id || first.id !== rows[0].id) {
          throw new Error('Concurrent calls did not resolve to the same persisted row');
        }
      });

      // T-S3: Distinct operationIds must not be treated as duplicates.
      await runTest('T-S3', async () => {
        const firstOpId = `${prefix}_distinct_a`;
        const secondOpId = `${prefix}_distinct_b`;
        testOperationIds.add(firstOpId);
        testOperationIds.add(secondOpId);
        const [first, second] = await Promise.all([
          syncEngine.enqueueMutation('transaction', 'trx_e2_distinct_a', 'CREATE', undefined, firstOpId),
          syncEngine.enqueueMutation('transaction', 'trx_e2_distinct_b', 'CREATE', undefined, secondOpId),
        ]);

        const firstCount = await db.syncQueue.where('operationId').equals(firstOpId).count();
        const secondCount = await db.syncQueue.where('operationId').equals(secondOpId).count();
        if (firstCount !== 1 || secondCount !== 1) {
          throw new Error(`Distinct operationIds were not both stored (a=${firstCount}, b=${secondCount})`);
        }
        if (first.id === second.id) throw new Error('Distinct operations unexpectedly share a queue row');
      });

      // T-S4: v13 is active for durable AI commands; syncQueue.operationId remains non-unique.
      await runTest('T-S4', async () => {
        if (DATABASE_SCHEMA_VERSION !== 13 || db.verno !== DATABASE_SCHEMA_VERSION) {
          throw new Error(`Expected Dexie v13 to match DATABASE_SCHEMA_VERSION; found db=${db.verno}, constant=${DATABASE_SCHEMA_VERSION}`);
        }
        const operationIdIndex = db.syncQueue.schema.indexes.find(index => index.name === 'operationId');
        if (!operationIdIndex) throw new Error('syncQueue.operationId index is missing');
        if (operationIdIndex.unique) throw new Error('syncQueue.operationId must remain non-unique; no unique index was authorized in ROUND 2-E.2');
      });

      // T-S5: Pre-existing pending/processing rows are retained and no new row is added.
      await runTest('T-S5', async () => {
        const operationId = `${prefix}_existing_active`;
        testOperationIds.add(operationId);
        const pendingId = `${prefix}_pending`;
        const processingId = `${prefix}_processing`;

        await db.syncQueue.bulkAdd([
          {
            id: pendingId,
            entityType: 'transaction',
            entityId: 'trx_e2_existing_pending',
            operation: 'CREATE',
            operationId,
            payload: { marker: 'pending-before-call' },
            createdAt: new Date().toISOString(),
            retryCount: 0,
            status: 'pending',
          },
          {
            id: processingId,
            entityType: 'transaction',
            entityId: 'trx_e2_existing_processing',
            operation: 'UPDATE',
            operationId,
            payload: { marker: 'processing-before-call' },
            createdAt: new Date().toISOString(),
            retryCount: 1,
            status: 'processing',
          },
        ]);

        const returned = await syncEngine.enqueueMutation(
          'transaction', 'trx_e2_should_not_be_added', 'CREATE', { marker: 'new' }, operationId
        );
        const rows = await db.syncQueue.where('operationId').equals(operationId).toArray();

        if (rows.length !== 2) throw new Error(`Expected both existing rows to remain; found ${rows.length}`);
        if (!rows.some(row => row.id === pendingId && row.status === 'pending')) {
          throw new Error('Existing pending row was removed or changed');
        }
        if (!rows.some(row => row.id === processingId && row.status === 'processing')) {
          throw new Error('Existing processing row was removed or changed');
        }
        if (returned.id !== pendingId && returned.id !== processingId) {
          throw new Error('Call did not return one of the existing active rows');
        }
      });
    } finally {
      googleDriveService.isConnected = originalIsConnected;
      for (const operationId of testOperationIds) {
        await db.syncQueue.where('operationId').equals(operationId).delete();
      }
    }

    const passed = results.filter(result => result.passed).length;
    return {
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    };
  }
}
