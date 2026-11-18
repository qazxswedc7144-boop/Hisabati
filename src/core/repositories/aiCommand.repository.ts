import { getDb } from '../database/db';
import {
  AICommandRecord,
  StructuredAICommand,
} from '@/shared/types/ai.types';

export const AI_COMMAND_TTL_MS = 30 * 60 * 1000;

function createPendingRecord(command: StructuredAICommand): AICommandRecord {
  const now = new Date();
  const nowIso = now.toISOString();
  return {
    commandId: command.id,
    operationId: command.operationId,
    status: 'PENDING',
    expiresAt: new Date(now.getTime() + AI_COMMAND_TTL_MS).toISOString(),
    createdAt: nowIso,
    updatedAt: nowIso,
    command,
  };
}

export class AICommandRepository {
  public async add(command: StructuredAICommand): Promise<void> {
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.aiCommands, async () => {
      const existing = await activeDb.aiCommands.get(command.id);
      if (existing) {
        if (existing.status !== 'PENDING') {
          throw new Error(`لا يمكن إضافة أمر موجود في الحالة الحالية: ${existing.status}`);
        }
        await activeDb.aiCommands.put({
          ...existing,
          operationId: command.operationId,
          command,
          updatedAt: new Date().toISOString(),
        });
        return;
      }
      await activeDb.aiCommands.add(createPendingRecord(command));
    });
  }

  public async update(command: StructuredAICommand): Promise<void> {
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.aiCommands, async () => {
      const existing = await activeDb.aiCommands.get(command.id);
      if (!existing) {
        throw new Error(`لا يمكن تحديث الأمر غير الموجود: ${command.id}`);
      }
      if (existing.status !== 'PENDING' && existing.status !== 'RUNNING') {
        throw new Error(`لا يمكن تعديل الأمر من الحالة الحالية: ${existing.status}`);
      }

      await activeDb.aiCommands.put({
        ...existing,
        operationId: command.operationId,
        command,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  public async getById(commandId: string): Promise<StructuredAICommand | undefined> {
    const record = await getDb().aiCommands.get(commandId);
    const expiresAt = record ? Date.parse(record.expiresAt) : Number.NaN;
    if (!record || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;
    return record.command;
  }

  public async getRecordById(commandId: string): Promise<AICommandRecord | undefined> {
    return await getDb().aiCommands.get(commandId);
  }

  public async getAllPending(): Promise<StructuredAICommand[]> {
    const now = new Date().toISOString();
    const records = await getDb().aiCommands
      .where('status')
      .anyOf('PENDING', 'RUNNING')
      .toArray();
    return records
      .filter((record) => record.expiresAt > now)
      .map((record) => record.command);
  }

  /**
   * Atomically claims a pending command. IndexedDB serializes read-write
   * transactions on aiCommands across connections/tabs for this database.
   */
  public async claimCommand(commandId: string): Promise<AICommandRecord> {
    const activeDb = getDb();
    return await activeDb.transaction('rw', activeDb.aiCommands, async () => {
      const record = await activeDb.aiCommands.get(commandId);
      if (!record) {
        throw new Error('الأمر المالي غير موجود أو انتهت صلاحيته');
      }
      if (record.status !== 'PENDING') {
        throw new Error(`لا يمكن امتلاك الأمر من الحالة الحالية: ${record.status}`);
      }
      const expiresAt = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error('انتهت صلاحية الأمر المالي قبل المطالبة به');
      }

      const claimedAt = new Date().toISOString();
      const claimed: AICommandRecord = {
        ...record,
        status: 'RUNNING',
        claimedAt,
        updatedAt: claimedAt,
      };
      await activeDb.aiCommands.put(claimed);
      return claimed;
    });
  }

  /**
   * Re-queues a failed command only when its business status is retryable.
   * claimCommand still accepts PENDING only; this transition is explicit and atomic.
   */
  public async requeueFailedCommand(commandId: string): Promise<void> {
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.aiCommands, async () => {
      const record = await activeDb.aiCommands.get(commandId);
      if (!record) {
        throw new Error('الأمر المالي غير موجود أو انتهت صلاحيته');
      }
      if (record.status === 'PENDING') return;
      if (record.status !== 'FAILED' || record.command.status !== 'READY_FOR_CONFIRMATION') {
        throw new Error(`لا يمكن إعادة محاولة الأمر من الحالة الحالية: ${record.status}`);
      }

      const expiresAt = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        throw new Error('انتهت صلاحية الأمر المالي قبل إعادة المحاولة');
      }

      await activeDb.aiCommands.put({
        ...record,
        status: 'PENDING',
        claimedAt: undefined,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  public async markDone(command: StructuredAICommand): Promise<void> {
    await this.updateLifecycle(command, 'DONE');
  }

  public async markFailed(command: StructuredAICommand): Promise<void> {
    await this.updateLifecycle(command, 'FAILED');
  }

  private async updateLifecycle(
    command: StructuredAICommand,
    status: 'DONE' | 'FAILED'
  ): Promise<void> {
    const activeDb = getDb();
    await activeDb.transaction('rw', activeDb.aiCommands, async () => {
      const existing = await activeDb.aiCommands.get(command.id);
      if (!existing) {
        throw new Error(`لا يمكن تحديث حالة الأمر غير الموجود: ${command.id}`);
      }
      if (existing.status !== 'RUNNING') {
        throw new Error(`لا يمكن إنهاء الأمر من الحالة الحالية: ${existing.status}`);
      }
      await activeDb.aiCommands.put({
        ...existing,
        operationId: command.operationId,
        command,
        status,
        updatedAt: new Date().toISOString(),
      });
    });
  }

  /**
   * Atomically cancels only an unclaimed command. The FAILED lifecycle state
   * makes it non-claimable while preserving the CANCELLED business status for
   * audit/cleanup if the subsequent audit write fails.
   */
  public async cancelPendingCommand(commandId: string): Promise<StructuredAICommand | undefined> {
    const activeDb = getDb();
    return await activeDb.transaction('rw', activeDb.aiCommands, async () => {
      const record = await activeDb.aiCommands.get(commandId);
      if (!record) return undefined;
      if (record.status !== 'PENDING') {
        throw new Error(`لا يمكن إلغاء الأمر من الحالة الحالية: ${record.status}`);
      }

      const expiresAt = Date.parse(record.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return undefined;

      const command: StructuredAICommand = {
        ...record.command,
        status: 'CANCELLED',
      };
      await activeDb.aiCommands.put({
        ...record,
        status: 'FAILED',
        command,
        updatedAt: new Date().toISOString(),
      });
      return command;
    });
  }

  public async delete(commandId: string): Promise<void> {
    await getDb().aiCommands.delete(commandId);
  }

  public async clearExecutedAndCancelled(): Promise<void> {
    const table = getDb().aiCommands;
    const records = await table.toArray();
    const terminalIds = records
      .filter((record) =>
        record.status === 'DONE' ||
        ['EXECUTED', 'CANCELLED', 'REJECTED'].includes(record.command.status)
      )
      .map((record) => record.commandId);
    if (terminalIds.length > 0) {
      await table.bulkDelete(terminalIds);
    }
  }
}

export const aiCommandRepository = new AICommandRepository();
