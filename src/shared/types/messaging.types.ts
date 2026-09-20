import { CurrencyCode, LanguageCode, ThemeMode } from './common.types';

export type MessageChannel = 'in_app' | 'web_notification' | 'sms' | 'whatsapp';

export type MessageStatus =
  | 'draft'
  | 'pending'
  | 'processing'
  | 'ready_to_send'
  | 'sent'
  | 'failed'
  | 'cancelled'
  | 'not_configured';

export type MessagePriority = 'low' | 'medium' | 'high' | 'urgent';

export type MessageType =
  | 'debt_reminder'
  | 'payment_receipt'
  | 'due_date_alert'
  | 'statement_summary'
  | 'system_alert'
  | 'welcome'
  | 'custom';

export type NotificationType = 'financial' | 'system' | 'sync' | 'reminder' | 'security';

export type ScheduleStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export type RepeatRule = 'once' | 'daily' | 'weekly' | 'monthly';

export interface MessageTemplate {
  id: string;
  name: string;
  nameAr: string;
  type: MessageType;
  defaultChannel: MessageChannel;
  body: string;
  variables: string[]; // e.g. ['customerName', 'amount', 'dueDate', 'balance', 'accountName', 'businessName']
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AppMessage {
  id: string;
  messageId: string;
  channel: MessageChannel;
  type: MessageType;
  recipient: string; // phone or identifier
  recipientName?: string;
  subject?: string;
  body: string;
  templateId?: string;
  status: MessageStatus;
  priority: MessagePriority;
  createdAt: string;
  scheduledAt?: string;
  sentAt?: string;
  failedAt?: string;
  errorCode?: string;
  errorMessage?: string;
  retryCount: number;
  relatedEntityType?: 'account' | 'transaction' | 'backup' | 'sync' | 'system';
  relatedEntityId?: string;
  operationId: string; // Idempotency key
  deviceId: string;
  actionUrl?: string;
}

export interface InAppNotification {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
  priority: MessagePriority;
  read: boolean;
  createdAt: string;
  relatedEntityType?: 'account' | 'transaction' | 'backup' | 'sync' | 'system';
  relatedEntityId?: string;
  actionUrl?: string;
}

export interface ScheduledMessage {
  id: string;
  templateId?: string;
  channel: MessageChannel;
  recipient: string;
  recipientName?: string;
  subject?: string;
  bodyTemplate: string;
  variables: Record<string, string | number>;
  scheduledAt: string;
  status: ScheduleStatus;
  repeatRule: RepeatRule;
  lastRunAt?: string;
  nextRunAt?: string;
  retryCount: number;
  relatedEntityType?: 'account' | 'transaction' | 'system';
  relatedEntityId?: string;
  operationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface MessageQueueItem {
  id: string;
  messageId: string;
  channel: MessageChannel;
  status: 'pending' | 'processing' | 'sent' | 'failed' | 'cancelled' | 'not_configured' | 'ready_to_send';
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  nextRetryAt?: string;
  operationId: string;
  payload: AppMessage;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateDTO {
  name: string;
  nameAr: string;
  type: MessageType;
  defaultChannel: MessageChannel;
  body: string;
  variables: string[];
  active?: boolean;
}

export interface SendMessageDTO {
  channel: MessageChannel;
  type: MessageType;
  recipient: string;
  recipientName?: string;
  subject?: string;
  body?: string;
  templateId?: string;
  variables?: Record<string, string | number>;
  priority?: MessagePriority;
  scheduledAt?: string;
  repeatRule?: RepeatRule;
  relatedEntityType?: 'account' | 'transaction' | 'backup' | 'sync' | 'system';
  relatedEntityId?: string;
  operationId?: string;
}

export interface CreateInAppNotificationDTO {
  title: string;
  body: string;
  type: NotificationType;
  priority?: MessagePriority;
  relatedEntityType?: 'account' | 'transaction' | 'backup' | 'sync' | 'system';
  relatedEntityId?: string;
  actionUrl?: string;
}

export interface DebtReminderCandidate {
  accountId: string;
  accountName: string;
  phone?: string;
  balance: number;
  balanceType: 'owed_to_me' | 'owed_by_me';
  lastTransactionDate?: string;
  transactionCount: number;
}

export interface ScheduleDebtCollectionAlertDTO {
  accountId: string;
  accountName: string;
  phone?: string;
  amountMinor?: number;
  amount?: number;
  deadlineDate: string; // YYYY-MM-DD or ISO string
  reminderTime?: string; // HH:mm (e.g. 09:00)
  remindDaysBefore?: number; // 0 = on deadline day, 1, 3, 7
  channel?: MessageChannel; // 'in_app', 'whatsapp', 'sms'
  repeatRule?: RepeatRule; // 'once', 'daily', 'weekly', 'monthly'
  customNote?: string;
}

export interface OverdueDebtItem {
  accountId: string;
  accountName: string;
  phone?: string;
  balance: number;
  balanceMinor: number;
  daysSinceLastTransaction: number;
  lastTransactionDate?: string;
  hasScheduledAlert: boolean;
  nextScheduledRunAt?: string;
  status: 'due_now' | 'upcoming' | 'stagnant' | 'normal';
}

export interface OverdueDebtSummary {
  totalDebtMinor: number;
  totalDebt: number;
  candidateCount: number;
  dueNowCount: number;
  upcomingCount: number;
  stagnantCount: number;
  items: OverdueDebtItem[];
}

export type DueDebtUrgency = 'overdue' | 'due_today' | 'due_tomorrow' | 'due_soon';

export interface DueDebtAlert {
  id: string;
  accountId: string;
  accountName: string;
  phone?: string;
  balance: number;
  balanceMinor?: number;
  balanceType: 'owed_to_me' | 'owed_by_me';
  dueDate: string; // YYYY-MM-DD
  daysRemaining: number; // < 0 overdue, 0 today, > 0 upcoming
  urgency: DueDebtUrgency;
  urgencyLabel: string;
  scheduleId?: string;
  note?: string;
}

export interface DueDebtsOverview {
  totalUpcomingCount: number;
  totalOverdueCount: number;
  totalDueTodayCount: number;
  totalReceivableMinor: number;
  totalPayableMinor: number;
  alerts: DueDebtAlert[];
}

