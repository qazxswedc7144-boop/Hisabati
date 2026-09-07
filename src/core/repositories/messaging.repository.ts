import { db } from '../database/db';
import {
  AppMessage,
  MessageTemplate,
  InAppNotification,
  ScheduledMessage,
  MessageQueueItem,
  MessageChannel,
  MessageStatus,
  NotificationType,
} from '@/shared/types';

export class MessagingRepository {
  // ===================== TEMPLATES =====================
  async getAllTemplates(): Promise<MessageTemplate[]> {
    return await db.messageTemplates.toArray();
  }

  async getTemplateById(id: string): Promise<MessageTemplate | undefined> {
    return await db.messageTemplates.get(id);
  }

  async saveTemplate(template: MessageTemplate): Promise<void> {
    await db.messageTemplates.put(template);
  }

  async deleteTemplate(id: string): Promise<void> {
    await db.messageTemplates.delete(id);
  }

  // ===================== MESSAGES (HISTORY) =====================
  async getAllMessages(filter?: {
    channel?: MessageChannel;
    status?: MessageStatus;
    recipient?: string;
  }): Promise<AppMessage[]> {
    let collection = db.messages.orderBy('createdAt').reverse();
    const all = await collection.toArray();
    return all.filter((m) => {
      if (filter?.channel && m.channel !== filter.channel) return false;
      if (filter?.status && m.status !== filter.status) return false;
      if (filter?.recipient && !m.recipient.includes(filter.recipient)) return false;
      return true;
    });
  }

  async getMessageById(id: string): Promise<AppMessage | undefined> {
    return await db.messages.get(id);
  }

  async getMessageByOperationId(operationId: string): Promise<AppMessage | undefined> {
    return await db.messages.where('operationId').equals(operationId).first();
  }

  async saveMessage(message: AppMessage): Promise<void> {
    await db.messages.put(message);
  }

  async updateMessageStatus(
    id: string,
    status: MessageStatus,
    extra?: { sentAt?: string; failedAt?: string; errorCode?: string; errorMessage?: string; retryCount?: number }
  ): Promise<void> {
    const existing = await db.messages.get(id);
    if (!existing) return;
    await db.messages.put({
      ...existing,
      status,
      ...(extra || {}),
    });
  }

  async deleteMessage(id: string): Promise<void> {
    await db.messages.delete(id);
  }

  // ===================== IN-APP NOTIFICATIONS =====================
  async getAllNotifications(filter?: { unreadOnly?: boolean; type?: NotificationType }): Promise<InAppNotification[]> {
    const all = await db.inAppNotifications.orderBy('createdAt').reverse().toArray();
    return all.filter((n) => {
      if (filter?.unreadOnly && n.read) return false;
      if (filter?.type && n.type !== filter.type) return false;
      return true;
    });
  }

  async getUnreadNotificationCount(): Promise<number> {
    return await db.inAppNotifications.filter((n) => !n.read).count();
  }

  async saveNotification(notification: InAppNotification): Promise<void> {
    await db.inAppNotifications.put(notification);
  }

  async markNotificationAsRead(id: string): Promise<void> {
    const notif = await db.inAppNotifications.get(id);
    if (notif) {
      await db.inAppNotifications.put({ ...notif, read: true });
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    const unread = await db.inAppNotifications.filter((n) => !n.read).toArray();
    const updated = unread.map((n) => ({ ...n, read: true }));
    if (updated.length > 0) {
      await db.inAppNotifications.bulkPut(updated);
    }
  }

  async deleteNotification(id: string): Promise<void> {
    await db.inAppNotifications.delete(id);
  }

  async clearAllNotifications(): Promise<void> {
    await db.inAppNotifications.clear();
  }

  // ===================== SCHEDULED MESSAGES =====================
  async getAllScheduledMessages(): Promise<ScheduledMessage[]> {
    return await db.scheduledMessages.orderBy('createdAt').reverse().toArray();
  }

  async getActiveDueScheduledMessages(nowIso: string): Promise<ScheduledMessage[]> {
    return await db.scheduledMessages
      .filter((s) => s.status === 'active' && (s.nextRunAt ? s.nextRunAt <= nowIso : s.scheduledAt <= nowIso))
      .toArray();
  }

  async saveScheduledMessage(scheduled: ScheduledMessage): Promise<void> {
    await db.scheduledMessages.put(scheduled);
  }

  async deleteScheduledMessage(id: string): Promise<void> {
    await db.scheduledMessages.delete(id);
  }

  // ===================== MESSAGE QUEUE =====================
  async getQueueItemByOperationId(operationId: string): Promise<MessageQueueItem | undefined> {
    return await db.messageQueue.where('operationId').equals(operationId).first();
  }

  async enqueueItem(item: MessageQueueItem): Promise<void> {
    // Idempotency check on queue: don't enqueue duplicate operationId if already pending/processing
    const existing = await db.messageQueue.where('operationId').equals(item.operationId).first();
    if (existing && (existing.status === 'pending' || existing.status === 'processing')) {
      return;
    }
    await db.messageQueue.put(item);
  }

  async getPendingQueueItems(): Promise<MessageQueueItem[]> {
    return await db.messageQueue
      .filter((q) => q.status === 'pending' || q.status === 'processing')
      .toArray();
  }

  async updateQueueItem(id: string, updates: Partial<MessageQueueItem>): Promise<void> {
    const existing = await db.messageQueue.get(id);
    if (!existing) return;
    await db.messageQueue.put({
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteQueueItem(id: string): Promise<void> {
    await db.messageQueue.delete(id);
  }
}

export const messagingRepository = new MessagingRepository();
