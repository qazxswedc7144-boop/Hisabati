import { db } from '../database/db';
import { syncEngine } from './syncEngine.service';
import { PendingSideEffect } from '@/shared/types';

export class PendingSideEffectsWorker {
  private isProcessing = false;

  /**
   * Process all pending side effects in chronological order.
   * Retries up to 5 times. Deletes on success.
   */
  public async processPendingSideEffects(): Promise<number> {
    if (this.isProcessing) {
      return 0;
    }

    this.isProcessing = true;
    let processedCount = 0;

    try {
      if (!db.pendingSideEffects) {
        return 0;
      }

      // Fetch pending effects ordered chronologically by createdAt
      const pendingList: PendingSideEffect[] = await db.pendingSideEffects
        .orderBy('createdAt')
        .toArray();

      for (const item of pendingList) {
        if ((item.retries || 0) >= 5) {
          // Exceeded maximum retry attempts (5), discard to prevent poison pills
          await db.pendingSideEffects.delete(item.id);
          continue;
        }

        try {
          if (item.effectType === 'SYNC_ENQUEUE') {
            const operation = (item.payload?.action as 'CREATE' | 'UPDATE' | 'DELETE') || 'CREATE';
            const entityPayload = item.payload?.trx || item.payload?.account || item.payload;
            const opId = entityPayload?.operationId || item.sourceId;

            await syncEngine.enqueueMutation(
              item.sourceType,
              item.sourceId,
              operation,
              entityPayload,
              opId
            );
          }
          // Successfully handled effect
          await db.pendingSideEffects.delete(item.id);
          processedCount++;
        } catch (err: any) {
          const nextRetries = (item.retries || 0) + 1;
          if (nextRetries >= 5) {
            console.warn(`[PendingSideEffectsWorker] Max retries (5) reached for ${item.id}. Dropping.`);
            await db.pendingSideEffects.delete(item.id);
          } else {
            await db.pendingSideEffects.update(item.id, {
              retries: nextRetries,
              lastError: err?.message || String(err),
            });
          }
        }
      }

      console.info(`Processed ${processedCount} pending side effects`);
    } catch (error) {
      console.warn('[PendingSideEffectsWorker] Error processing pending side effects:', error);
    } finally {
      this.isProcessing = false;
    }

    return processedCount;
  }
}

export const pendingSideEffectsWorker = new PendingSideEffectsWorker();
export const processPendingSideEffects = () => pendingSideEffectsWorker.processPendingSideEffects();
