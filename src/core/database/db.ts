/**
 * CHANGELOG
 * - 0.4: Added getDb() utility for stable database access within transactions.
 * - 3.1: Protected Proxy access with tenantDbManager.isSwitching() check.
 */

import Dexie, { type Table } from 'dexie';
import { decimalToMinor } from '../money/converter';
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
  UserProfile,
  Team,
  TeamMember,
  AuditTrailEntry,
  TrashItem,
  DebtRecord,
  FinancialAuditEntry,
  FinancialSnapshot,
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

  // Phase 8: RBAC, Teams & Tamper-Resistant Audit Trail
  users!: Table<UserProfile, string>;
  teams!: Table<Team, string>;
  teamMembers!: Table<TeamMember, string>;
  auditTrail!: Table<AuditTrailEntry, string>;
  trash!: Table<TrashItem, string>;
  safetyBackups!: Table<{
    id: string;
    payload: any;
    createdAt: string;
    type: 'automatic' | 'manual' | 'rollback';
  }, string>;
  debts!: Table<DebtRecord, string>;
  financialAuditLogs!: Table<FinancialAuditEntry, string>;
  financialSnapshots!: Table<FinancialSnapshot, string>;

  constructor(dbName: string = 'HisabatiDatabase') {
    super(dbName);
    
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

    // Version 6 Schema (Phase 8: Teams, RBAC & Tamper-Resistant Audit Trail)
    this.version(6).stores({
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
      users: 'id, email, phone, role, activeTeamId, createdAt',
      teams: 'id, name, ownerId, createdAt',
      teamMembers: 'id, teamId, userId, role, status, [teamId+userId], createdAt',
      auditTrail: 'id, sequenceNumber, timestamp, action, targetType, targetId, riskLevel, [targetType+targetId]',
    });

    // Version 7 Schema (Recycle Bin / Trash Integration)
    this.version(7).stores({
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
      users: 'id, email, phone, role, activeTeamId, createdAt',
      teams: 'id, name, ownerId, createdAt',
      teamMembers: 'id, teamId, userId, role, status, [teamId+userId], createdAt',
      auditTrail: 'id, sequenceNumber, timestamp, action, targetType, targetId, riskLevel, [targetType+targetId]',
      trash: 'id, entityType, deletedAt, expiresAt',
    });

    // Version 8 Schema (Safety Backups & Enhanced Trash Indexing)
    // - 1.1: Added safetyBackups table for Dexie-based pre-restore snapshots.
    // - 1.3: Expanded trash indexing for audit and search.
    this.version(8).stores({
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
      users: 'id, email, phone, role, activeTeamId, createdAt',
      teams: 'id, name, ownerId, createdAt',
      teamMembers: 'id, teamId, userId, role, status, [teamId+userId], createdAt',
      auditTrail: 'id, sequenceNumber, timestamp, action, targetType, targetId, riskLevel, [targetType+targetId]',
      trash: 'id, entityType, entityId, deletedAt, expiresAt, deletedBy, status, [entityType+entityId]',
      safetyBackups: 'id, createdAt, type',
    });

    // Version 9 Schema (Multi-Debt & Notification Idempotency Hardening)
    this.version(9).stores({
      accounts: 'id, name, phone, archived, dueDate, createdAt, updatedAt, [archived+dueDate]',
      transactions: 'id, accountId, type, date, operationId, createdAt, updatedAt, [accountId+date]',
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
    }).upgrade(async (tx) => {
      const accounts = await tx.table('accounts').toArray();
      const now = new Date().toISOString();
      for (const acc of accounts) {
        const amountMinor = typeof acc.currentBalanceMinor === 'number' 
          ? acc.currentBalanceMinor 
          : decimalToMinor(acc.currentBalance || 0, acc.currency || 'YER');

        if (acc.dueDate && amountMinor > 0) {
          const debtId = 'debt_mig_' + acc.id;
          await tx.table('debts').put({
            id: debtId,
            accountId: acc.id,
            amountMinor,
            paidMinor: 0,
            remainingMinor: amountMinor,
            dueDate: acc.dueDate,
            status: 'open',
            createdAt: now,
            updatedAt: now,
          });
        }
        if (typeof acc.archived === 'boolean') {
          await tx.table('accounts').update(acc.id, { archived: acc.archived ? 1 : 0 });
        }
      }
      const notifs = await tx.table('inAppNotifications').toArray();
      for (const n of notifs) {
        if (!n.idempotencyKey) {
          n.idempotencyKey = 'legacy_' + n.id;
          await tx.table('inAppNotifications').put(n);
        }
      }
    });

    // Version 10 Schema (Phase 2 Part 1: Immutable Ledger Status)
    this.version(10).stores({
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
    }).upgrade(async (tx) => {
      // Legacy Policy: Existing transactions without status are treated as 'posted'
      // to ensure immutability by default for historically confirmed data.
      await tx.table('transactions').toCollection().modify(trx => {
        if (!trx.status) {
          trx.status = 'posted';
          trx.updatedAt = new Date().toISOString();
        }
      });
    });
  }
}

import { tenantDbManager } from './TenantDatabaseManager';

/**
 * 0.4: Stable database accessor for use inside transactions.
 */
export function getDb(): HisabatiDatabase {
  return tenantDbManager.getActiveDatabase();
}

// We use a Proxy to keep the 'db' export stable while switching the underlying Dexie instance
// This prevents having to update 40+ files and allows dynamic multi-tenancy.
export const db = new Proxy({} as HisabatiDatabase, {
  get(_, prop) {
    // 3.1: Protect access if switching is in progress
    if (tenantDbManager.getIsSwitching()) {
      throw new Error('Database is currently switching tenants. Proxy access denied.');
    }

    const activeDb = tenantDbManager.getActiveDatabase();
    const value = (activeDb as any)[prop];
    if (typeof value === 'function') {
      return value.bind(activeDb);
    }
    return value;
  }
});

