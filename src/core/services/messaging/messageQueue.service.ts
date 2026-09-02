import { messagingRepository } from '@/core/repositories';
import {
  AppMessage,
  MessageQueueItem,
  MessageStatus,
} from '@/shared/types';
import { defaultSmsProvider } from './providers/sms.provider';
import { defaultWhatsAppProvider } from './providers/whatsapp.provider';

export class MessageQueueService {
  private isProcessing = false;
  private readonly MAX_RETRIES = 3;

  /**
   * Enqueue a message for sending
   */
  async enqueue(message: AppMessage): Promise<MessageQueueItem> {
    if (message.operationId) {
      const existing = await messagingRepository.getQueueItemByOperationId(message.operationId);
      if (existing) {
        return existing;
      }
    }

    const queueItem: MessageQueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      messageId: message.id,
      channel: message.channel,
      status: 'pending',
      retryCount: 0,
      maxRetries: this.MAX_RETRIES,
      operationId: message.operationId,
      payload: message,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await messagingRepository.enqueueItem(queueItem);
    return queueItem;
  }

  /**
   * Process all pending items in the messaging queue
   */
  async processQueue(): Promise<{
    processed: number;
    sent: number;
    readyToSend: number;
    failed: number;
    notConfigured: number;
  }> {
    if (this.isProcessing) {
      return { processed: 0, sent: 0, readyToSend: 0, failed: 0, notConfigured: 0 };
    }

    this.isProcessing = true;
    let processed = 0;
    let sent = 0;
    let readyToSend = 0;
    let failed = 0;
    let notConfigured = 0;

    try {
      const items = await messagingRepository.getPendingQueueItems();

      for (const item of items) {
        processed++;
        await messagingRepository.updateQueueItem(item.id, { status: 'processing' });

        try {
          let outcomeStatus: MessageStatus = 'failed';
          let errorMessage: string | undefined;

          if (item.channel === 'whatsapp') {
            // Check user-initiated vs automated
            const waResult = defaultWhatsAppProvider.prepareUserInitiatedSend(item.payload);
            outcomeStatus = waResult.status;
            if (outcomeStatus === 'ready_to_send') {
              readyToSend++;
            }
          } else if (item.channel === 'sms') {
            const smsResult = await defaultSmsProvider.send(item.payload);
            outcomeStatus = smsResult.status;
            errorMessage = smsResult.errorMessage;
            if (outcomeStatus === 'not_configured') {
              notConfigured++;
            } else if (outcomeStatus === 'sent') {
              sent++;
            } else {
              failed++;
            }
          } else if (item.channel === 'in_app' || item.channel === 'web_notification') {
            outcomeStatus = 'sent';
            sent++;
          }

          // Update underlying message
          await messagingRepository.updateMessageStatus(item.payload.id, outcomeStatus, {
            sentAt: outcomeStatus === 'sent' ? new Date().toISOString() : undefined,
            failedAt: outcomeStatus === 'failed' || outcomeStatus === 'not_configured' ? new Date().toISOString() : undefined,
            errorMessage,
            retryCount: item.retryCount,
          });

          // If processed cleanly
          if (outcomeStatus === 'sent') {
            // Sent successfully, remove from pending queue
            await messagingRepository.deleteQueueItem(item.id);
          } else if (outcomeStatus === 'ready_to_send' || outcomeStatus === 'not_configured') {
            await messagingRepository.updateQueueItem(item.id, {
              status: outcomeStatus,
              lastError: errorMessage,
            });
          } else {
            // Failure with retry count
            const newRetry = item.retryCount + 1;
            if (newRetry < item.maxRetries) {
              await messagingRepository.updateQueueItem(item.id, {
                status: 'pending',
                retryCount: newRetry,
                lastError: errorMessage,
                nextRetryAt: new Date(Date.now() + newRetry * 30000).toISOString(), // 30s exponential delay
              });
            } else {
              await messagingRepository.updateQueueItem(item.id, {
                status: 'failed',
                retryCount: newRetry,
                lastError: errorMessage || 'تم تجاوز الحد الأقصى لمحاولات الإرسال',
              });
              failed++;
            }
          }
        } catch (err: unknown) {
          const errText = err instanceof Error ? err.message : String(err);
          await messagingRepository.updateQueueItem(item.id, {
            status: 'failed',
            lastError: errText,
          });
          failed++;
        }
      }
    } finally {
      this.isProcessing = false;
    }

    return { processed, sent, readyToSend, failed, notConfigured };
  }
}

export const messageQueueService = new MessageQueueService();
