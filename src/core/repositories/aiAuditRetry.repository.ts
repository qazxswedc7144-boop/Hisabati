import { getDb } from '../database/db';
import { AIAuditLogEntry, AIAuditRetryRecord } from '@/shared/types/ai.types';

export class AIAuditRetryRepository {
  public async enqueue(entry: AIAuditLogEntry, error: unknown): Promise<void> {
    const activeDb = getDb();
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    await activeDb.transaction('rw', activeDb.aiAuditRetryQueue, async () => {
      const existing = await activeDb.aiAuditRetryQueue.get(entry.id);
      await activeDb.aiAuditRetryQueue.put({
        id: entry.id,
        eventId: entry.id,
        payload: entry,
        retryCount: existing?.retryCount ?? 0,
        lastError: message.slice(0, 1000),
        nextRetryAt: existing?.nextRetryAt ?? now,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    });
  }

  public async getDue(now = new Date().toISOString(), limit = 50): Promise<AIAuditRetryRecord[]> {
    return await getDb().aiAuditRetryQueue
      .where('nextRetryAt')
      .belowOrEqual(now)
      .limit(limit)
      .toArray();
  }

  public async remove(eventId: string): Promise<void> {
    await getDb().aiAuditRetryQueue.delete(eventId);
  }

  public async recordFailure(record: AIAuditRetryRecord, error: unknown, now = Date.now()): Promise<void> {
    const retryDelaysMs = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
    const retryCount = record.retryCount + 1;
    const delay = retryDelaysMs[Math.min(retryCount - 1, retryDelaysMs.length - 1)];
    const message = error instanceof Error ? error.message : String(error);
    await getDb().aiAuditRetryQueue.put({
      ...record,
      retryCount,
      lastError: message.slice(0, 1000),
      nextRetryAt: new Date(now + delay).toISOString(),
      updatedAt: new Date(now).toISOString(),
    });
  }
}

export const aiAuditRetryRepository = new AIAuditRetryRepository();
