import { getDb } from '@/core/database/db';
import { aiAuditRetryRepository } from '@/core/repositories/aiAuditRetry.repository';

export interface AIAuditRetryResult {
  attempted: number;
  delivered: number;
  deferred: number;
}

/** Retries due audit events without coupling audit persistence to financial writes. */
export class AIAuditRetryService {
  public async retryDue(limit = 50, now = Date.now()): Promise<AIAuditRetryResult> {
    const due = await aiAuditRetryRepository.getDue(new Date(now).toISOString(), limit);
    let delivered = 0;
    let deferred = 0;

    for (const record of due) {
      try {
        await getDb().aiAuditLogs.put(record.payload);
        await aiAuditRetryRepository.remove(record.eventId);
        delivered += 1;
      } catch (error) {
        await aiAuditRetryRepository.recordFailure(record, error, now);
        deferred += 1;
      }
    }

    return { attempted: due.length, delivered, deferred };
  }
}

export const aiAuditRetryService = new AIAuditRetryService();
