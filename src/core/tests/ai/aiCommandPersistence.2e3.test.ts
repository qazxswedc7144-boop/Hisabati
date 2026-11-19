import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { db, HisabatiDatabase } from '@/core/database/db';
import { aiCommandRepository } from '@/core/repositories/aiCommand.repository';
import { AIService } from '@/core/services/ai/AIService';
import { tenantService } from '@/core/services/TenantService';
import { StructuredAICommand } from '@/shared/types/ai.types';

interface AICommandPersistenceResult {
  id: string;
  passed: boolean;
  message: string;
}

function createCommand(id: string, operationId: string): StructuredAICommand {
  return {
    id,
    intent: 'CREATE_TRANSACTION_REQUEST',
    accountId: 'acc_ai_persistence_fixture',
    amount: 25,
    amountMinor: 2500,
    currency: 'SAR',
    type: 'debit',
    date: '2026-11-19',
    confidence: 0.99,
    status: 'READY_FOR_CONFIRMATION',
    operationId,
  };
}

export class AICommandPersistence2E3TestSuite {
  static async runAll(): Promise<{
    total: number;
    passed: number;
    failed: number;
    results: AICommandPersistenceResult[];
  }> {
    const results: AICommandPersistenceResult[] = [];
    const commandIds = new Set<string>();
    const prefix = `2e3_ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

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

      // T-C1: New commands are stored as PENDING in aiCommands, not settings JSON.
      await runTest('T-C1', async () => {
        const command = createCommand(`${prefix}_c1`, `${prefix}_op_c1`);
        commandIds.add(command.id);
        await db.settings.delete('pending_ai_commands');
        await aiCommandRepository.add(command);

        const record = await aiCommandRepository.getRecordById(command.id);
        const legacySetting = await db.settings.get('pending_ai_commands');
        if (!record) throw new Error('Command record was not created');
        if (record.status !== 'PENDING') throw new Error(`Expected PENDING, got ${record.status}`);
        if (record.operationId !== command.operationId) throw new Error('operationId was not preserved');
        if (legacySetting) throw new Error('Legacy pending_ai_commands JSON setting still exists');
        if (Date.parse(record.expiresAt) <= Date.now()) throw new Error('New command TTL is not in the future');
      });

      // T-C2: A pending command is atomically claimed and records claimedAt.
      await runTest('T-C2', async () => {
        const command = createCommand(`${prefix}_c2`, `${prefix}_op_c2`);
        commandIds.add(command.id);
        await aiCommandRepository.add(command);

        const claimed = await aiCommandRepository.claimCommand(command.id);
        if (claimed.status !== 'RUNNING') throw new Error(`Expected RUNNING, got ${claimed.status}`);
        if (!claimed.claimedAt) throw new Error('claimedAt was not written');
        if (claimed.commandId !== command.id) throw new Error('Claim returned a different command');
      });

      // T-C3: Two claim attempts for one command produce exactly one winner.
      await runTest('T-C3', async () => {
        const command = createCommand(`${prefix}_c3`, `${prefix}_op_c3`);
        commandIds.add(command.id);
        await aiCommandRepository.add(command);

        const results = await Promise.allSettled([
          aiCommandRepository.claimCommand(command.id),
          aiCommandRepository.claimCommand(command.id),
        ]);
        const fulfilled = results.filter(result => result.status === 'fulfilled');
        const rejected = results.filter(result => result.status === 'rejected');
        if (fulfilled.length !== 1 || rejected.length !== 1) {
          throw new Error(`Expected one successful claim and one rejection; got ${fulfilled.length}/${rejected.length}`);
        }
        const stored = await aiCommandRepository.getRecordById(command.id);
        if (stored?.status !== 'RUNNING' || !stored.claimedAt) {
          throw new Error('Winning claim was not persisted as RUNNING');
        }
      });

      // T-C4: Expired commands cannot be claimed.
      await runTest('T-C4', async () => {
        const command = createCommand(`${prefix}_c4`, `${prefix}_op_c4`);
        commandIds.add(command.id);
        await aiCommandRepository.add(command);
        await db.aiCommands.update(command.id, {
          expiresAt: new Date(Date.now() - 1000).toISOString(),
        });

        let rejected = false;
        try {
          await aiCommandRepository.claimCommand(command.id);
        } catch (error: any) {
          rejected = String(error?.message || error).includes('انتهت صلاحية');
        }
        if (!rejected) throw new Error('Expired command claim was not rejected');
        const stored = await aiCommandRepository.getRecordById(command.id);
        if (stored?.status !== 'PENDING') throw new Error('Expired command state changed unexpectedly');
      });

      // T-C5: A fresh AIService instance reads PENDING and RUNNING state from Dexie.
      await runTest('T-C5', async () => {
        const command = createCommand(`${prefix}_c5`, `${prefix}_op_c5`);
        commandIds.add(command.id);
        await aiCommandRepository.add(command);

        const firstService = new AIService();
        const pending = await firstService.getPendingCommand(command.id);
        if (!pending || pending.operationId !== command.operationId) {
          throw new Error('Fresh AIService instance could not read PENDING command from Dexie');
        }

        await aiCommandRepository.claimCommand(command.id);
        const restartedService = new AIService();
        const recovered = await restartedService.getPendingCommand(command.id);
        const record = await aiCommandRepository.getRecordById(command.id);
        if (!recovered) throw new Error('Command disappeared after service restart simulation');
        if (record?.status !== 'RUNNING' || !record.claimedAt) {
          throw new Error('RUNNING state/claimedAt did not survive service restart simulation');
        }
      });

      // T-C7: Cancellation and claim cannot both win the same command.
      await runTest('T-C7', async () => {
        const command = createCommand(`${prefix}_c7`, `${prefix}_op_c7`);
        commandIds.add(command.id);
        await aiCommandRepository.add(command);

        const [claimResult, cancelResult] = await Promise.allSettled([
          aiCommandRepository.claimCommand(command.id),
          aiCommandRepository.cancelPendingCommand(command.id),
        ]);
        const stored = await aiCommandRepository.getRecordById(command.id);

        if (claimResult.status === 'fulfilled') {
          if (cancelResult.status !== 'rejected') {
            throw new Error('Cancellation also succeeded after the claim won');
          }
          if (stored?.status !== 'RUNNING') {
            throw new Error('Claim winner was not retained as RUNNING');
          }
        } else {
          if (cancelResult.status !== 'fulfilled' || !cancelResult.value) {
            throw new Error('Cancellation did not win cleanly when it acquired the transaction first');
          }
          if (stored?.status !== 'FAILED' || stored.command.status !== 'CANCELLED') {
            throw new Error('Cancelled command was not durably made non-claimable');
          }
        }
      });

      // T-C8: operationId remains immutable across command updates.
      await runTest('T-C8', async () => {
        const command = createCommand(`${prefix}_c8`, `${prefix}_op_c8`);
        commandIds.add(command.id);
        await aiCommandRepository.add(command);

        const altered = { ...command, operationId: `${prefix}_changed_op_c8` };
        let rejected = false;
        try {
          await aiCommandRepository.update(altered);
        } catch (error: any) {
          rejected = String(error?.message || error).includes('operationId');
        }
        if (!rejected) throw new Error('Changing operationId was not rejected');

        const stored = await aiCommandRepository.getRecordById(command.id);
        if (stored?.operationId !== command.operationId) {
          throw new Error('Persisted operationId changed after rejected update');
        }
      });

      // T-C6: A v12 legacy settings JSON payload migrates atomically into v14 aiCommands.
      await runTest('T-C6', async () => {
        const migrationDbName = `hisabati_ai_v12_migration_${prefix}`;
        const legacyCommand = createCommand(`${prefix}_legacy`, `${prefix}_legacy_op`);
        const legacyPayload = {
          [legacyCommand.id]: legacyCommand,
        };
        let legacyDb: Dexie | null = null;
        let upgradedDb: HisabatiDatabase | null = null;

        try {
          legacyDb = new Dexie(migrationDbName);
          legacyDb.version(12).stores({
            accounts: 'id, name, phone, archived, dueDate, createdAt, updatedAt, [archived+dueDate]',
            transactions: 'id, accountId, type, date, operationId, status, createdAt, updatedAt, [accountId+date]',
            settings: 'id, key, updatedAt',
            syncQueue: 'id, entityType, entityId, operation, operationId, status, createdAt',
            syncAuditLogs: 'id, action, timestamp, deviceId, success',
            messages: 'id, messageId, channel, type, status, recipient, priority, operationId, createdAt, scheduledAt',
            messageTemplates: 'id, name, type, defaultChannel, active, createdAt',
            inAppNotifications: 'id, type, priority, read, createdAt, idempotencyKey, relatedEntityId, [type+idempotencyKey]',
            scheduledMessages: 'id, channel, status, scheduledAt, nextRunAt, operationId, createdAt',
            messageQueue: 'id, messageId, channel, status, operationId, nextRetryAt, createdAt',
            aiAuditLogs: 'id, requestId, intent, status, provider, confirmed, timestamp',
            users: 'id, email, phone, role, activeTeamId, createdAt',
            teams: 'id, name, ownerId, createdAt',
            teamMembers: 'id, teamId, userId, role, status, [teamId+userId], createdAt',
            auditTrail: 'id, sequenceNumber, timestamp, action, targetType, targetId, riskLevel, [targetType+targetId]',
            trash: 'id, entityType, entityId, deletedAt, expiresAt, deletedBy, status, [entityType+entityId]',
            safetyBackups: 'id, createdAt, type',
            debts: 'id, accountId, dueDate, status, [accountId+status], [status+dueDate]',
            financialAuditLogs: 'id, sequenceNumber, eventType, operationId, targetType, targetId, organizationId, timestamp',
            financialSnapshots: 'id, organizationId, ledgerRevision, createdAt',
            pendingSideEffects: 'id, sourceType, sourceId, effectType, createdAt',
          });
          await legacyDb.open();
          await legacyDb.table('settings').put({
            id: 'currency',
            key: 'currency',
            value: 'SAR',
            updatedAt: new Date().toISOString(),
          });
          await legacyDb.table('settings').put({
            id: 'pending_ai_commands',
            key: 'pending_ai_commands',
            value: JSON.stringify(legacyPayload),
            updatedAt: new Date().toISOString(),
          });
          await legacyDb.close();
          legacyDb = null;

          upgradedDb = new HisabatiDatabase(migrationDbName);
          await upgradedDb.open();

          const migrated = await upgradedDb.aiCommands.get(legacyCommand.id);
          const oldSetting = await upgradedDb.settings.get('pending_ai_commands');
          const preservedCurrency = await upgradedDb.settings.get('currency');
          if (!preservedCurrency || preservedCurrency.value !== 'SAR') {
            throw new Error('Migration did not preserve unrelated v12 settings data');
          }
          if (upgradedDb.verno !== 14) throw new Error(`Expected schema v14, got v${upgradedDb.verno}`);
          if (!migrated) throw new Error('Legacy command was not migrated into aiCommands');
          if (migrated.status !== 'PENDING') throw new Error(`Expected migrated PENDING, got ${migrated.status}`);
          if (migrated.operationId !== legacyCommand.operationId) throw new Error('Migration lost operationId');
          if (migrated.command.id !== legacyCommand.id) throw new Error('Migration changed command payload identity');
          if (oldSetting) throw new Error('Legacy settings key was not removed after successful migration');
        } finally {
          if (legacyDb?.isOpen()) legacyDb.close();
          if (upgradedDb?.isOpen()) upgradedDb.close();
          await Dexie.delete(migrationDbName);
        }
      });
    } finally {
      if (commandIds.size > 0) {
        await db.aiCommands.bulkDelete([...commandIds]);
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
