import Dexie, { type Table } from 'dexie';
import {
  Account,
  Transaction,
  SettingsEntry,
  SyncQueueItem,
  SyncAuditLogEntry,
  AppMessage,
  MessageTemplate,
  InAppNotification,
  ScheduledMessage,
  MessageQueueItem,
  AIAuditLogEntry,
} from '@/shared/types';

export class HisabatiDatabase extends Dexie {
  accounts!: Table<Account, string>;
  transactions!: Table<Transaction, string>;
  settings!: Table<SettingsEntry, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  syncAuditLogs!: Table<SyncAuditLogEntry, string>;
  
  // Phase 5 Messaging Tables
  messages!: Table<AppMessage, string>;
  messageTemplates!: Table<MessageTemplate, string>;
  inAppNotifications!: Table<InAppNotification, string>;
  scheduledMessages!: Table<ScheduledMessage, string>;
  messageQueue!: Table<MessageQueueItem, string>;

  // Phase 6 AI Audit Logs
  aiAuditLogs!: Table<AIAuditLogEntry, string>;

  constructor() {
    super('HisabatiDatabase');
    
    // Version 1 Schema (Initial Baseline)
    this.version(1).stores({
      accounts: 'id, name, phone, archived, createdAt, updatedAt',
      transactions: 'id, accountId, type, date, createdAt, updatedAt',
      settings: 'id, key, updatedAt',
    });

    // Version 2 Schema (Phase 2 Financial Engine: idempotencyKey/operationId, compound index)
    this.version(2).stores({
      accounts: 'id, name, phone, archived, createdAt, updatedAt',
      transactions: 'id, accountId, type, date, operationId, createdAt, updatedAt, [accountId+date]',
      settings: 'id, key, updatedAt',
    });

    // Version 3 Schema (Phase 4: Cloud Sync Queue & Audit Logs)
    this.version(3).stores({
      accounts: 'id, name, phone, archived, createdAt, updatedAt',
      transactions: 'id, accountId, type, date, operationId, createdAt, updatedAt, [accountId+date]',
      settings: 'id, key, updatedAt',
      syncQueue: 'id, entityType, entityId, operation, operationId, status, createdAt',
      syncAuditLogs: 'id, action, timestamp, deviceId, success',
    });

    // Version 4 Schema (Phase 5: Messaging, Notifications & Automation Foundation)
    this.version(4).stores({
      accounts: 'id, name, phone, archived, createdAt, updatedAt',
      transactions: 'id, accountId, type, date, operationId, createdAt, updatedAt, [accountId+date]',
      settings: 'id, key, updatedAt',
      syncQueue: 'id, entityType, entityId, operation, operationId, status, createdAt',
      syncAuditLogs: 'id, action, timestamp, deviceId, success',
      messages: 'id, messageId, channel, type, status, recipient, priority, operationId, createdAt, scheduledAt',
      messageTemplates: 'id, name, type, defaultChannel, active, createdAt',
      inAppNotifications: 'id, type, priority, read, createdAt',
      scheduledMessages: 'id, channel, status, scheduledAt, nextRunAt, operationId, createdAt',
      messageQueue: 'id, messageId, channel, status, operationId, nextRetryAt, createdAt',
    });

    // Version 5 Schema (Phase 6: AI Accountant & Intent Audit Trail)
    this.version(5).stores({
      accounts: 'id, name, phone, archived, createdAt, updatedAt',
      transactions: 'id, accountId, type, date, operationId, createdAt, updatedAt, [accountId+date]',
      settings: 'id, key, updatedAt',
      syncQueue: 'id, entityType, entityId, operation, operationId, status, createdAt',
      syncAuditLogs: 'id, action, timestamp, deviceId, success',
      messages: 'id, messageId, channel, type, status, recipient, priority, operationId, createdAt, scheduledAt',
      messageTemplates: 'id, name, type, defaultChannel, active, createdAt',
      inAppNotifications: 'id, type, priority, read, createdAt',
      scheduledMessages: 'id, channel, status, scheduledAt, nextRunAt, operationId, createdAt',
      messageQueue: 'id, messageId, channel, status, operationId, nextRetryAt, createdAt',
      aiAuditLogs: 'id, requestId, intent, status, provider, confirmed, timestamp',
    });
  }
}

// Singleton database instance
export const db = new HisabatiDatabase();
