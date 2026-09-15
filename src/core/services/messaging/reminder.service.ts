import { accountRepository, transactionRepository, messagingRepository } from '@/core/repositories';
import {
  DebtReminderCandidate,
  AppMessage,
  MessageChannel,
  MessageType,
  ScheduleDebtCollectionAlertDTO,
  OverdueDebtSummary,
  OverdueDebtItem,
  ScheduledMessage,
} from '@/shared/types';
import { templateRenderer } from './templateRenderer.service';
import { notificationService } from './notification.service';
import { schedulerService } from './scheduler.service';
import { getDeviceId } from '@/core/utils/deviceId';
import { formatNumber } from '@/core/utils/formatters';

export class ReminderService {
  /**
   * Scan accounts to identify candidates for debt reminders.
   * STRICTLY READ-ONLY: Never modifies balances or financial state.
   */
  async scanDebtReminderCandidates(): Promise<DebtReminderCandidate[]> {
    const accounts = await accountRepository.getAll();
    const candidates: DebtReminderCandidate[] = [];

    for (const acc of accounts) {
      if (acc.archived) continue;

      if (acc.currentBalance > 0) {
        candidates.push({
          accountId: acc.id,
          accountName: acc.name,
          phone: acc.phone,
          balance: acc.currentBalance,
          balanceType: 'owed_to_me',
          lastTransactionDate: acc.lastTransactionDate,
          transactionCount: acc.transactionCount,
        });
      } else if (acc.currentBalance < 0) {
        candidates.push({
          accountId: acc.id,
          accountName: acc.name,
          phone: acc.phone,
          balance: Math.abs(acc.currentBalance),
          balanceType: 'owed_by_me',
          lastTransactionDate: acc.lastTransactionDate,
          transactionCount: acc.transactionCount,
        });
      }
    }

    return candidates;
  }

  /**
   * Generate an alert or message payload for a specific debtor account
   */
  async generateDebtReminderPayload(
    accountId: string,
    options?: {
      channel?: MessageChannel;
      customNote?: string;
      dueDate?: string;
      businessName?: string;
    }
  ): Promise<AppMessage> {
    const account = await accountRepository.getById(accountId);
    if (!account) {
      throw new Error(`الحساب غير موجود: ${accountId}`);
    }

    const channel = options?.channel || 'whatsapp';
    const amountStr = formatNumber(Math.abs(account.currentBalance), 2);
    const balanceTypeAr = account.currentBalance >= 0 ? 'مستحق لك' : 'مستحق عليك';

    const defaultBody = `مرحباً ${account.name}،\nنود تذكيركم بأن الرصيد الحالي المسجل في كشف الحساب هو ${amountStr} (${balanceTypeAr}).${
      options?.dueDate ? `\nتاريخ الاستحقاق المتفق عليه: ${options.dueDate}` : ''
    }${options?.customNote ? `\nملاحظة: ${options.customNote}` : ''}\nشاكرين ومقدرين حسن تعاونكم.`;

    const messageId = `msg_rem_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    return {
      id: messageId,
      messageId,
      channel,
      type: 'debt_reminder',
      recipient: account.phone || '',
      recipientName: account.name,
      subject: `تذكير بمستحقات مالية - ${account.name}`,
      body: defaultBody,
      status: 'pending',
      priority: 'high',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      relatedEntityType: 'account',
      relatedEntityId: account.id,
      operationId: `op_rem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deviceId: getDeviceId(),
    };
  }

  /**
   * Generate payment receipt message payload
   */
  async generateTransactionReceiptPayload(
    transactionId: string,
    channel: MessageChannel = 'whatsapp'
  ): Promise<AppMessage> {
    const tx = await transactionRepository.getById(transactionId);
    if (!tx) {
      throw new Error(`العملية غير موجودة: ${transactionId}`);
    }
    const account = await accountRepository.getById(tx.accountId);
    const accountName = account?.name || 'العميل';
    const amountStr = formatNumber(tx.amount, 2);
    const typeLabel = tx.type === 'debit' ? 'قيد لك (مبلغ عليك)' : 'سند قبض (دفعة مستلمة)';

    const body = `إشعار عملية مالية:\nالعميل: ${accountName}\nنوع العملية: ${typeLabel}\nالمبلغ: ${amountStr}\nالتاريخ: ${tx.date}${
      tx.receiptNumber ? `\nرقم السند: ${tx.receiptNumber}` : ''
    }${tx.note ? `\nالبيان: ${tx.note}` : ''}\nتم التوثيق في تطبيق حساباتي.`;

    const messageId = `msg_tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    return {
      id: messageId,
      messageId,
      channel,
      type: 'payment_receipt',
      recipient: account?.phone || '',
      recipientName: accountName,
      subject: `إشعار سند مالي - ${accountName}`,
      body,
      status: 'pending',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      retryCount: 0,
      relatedEntityType: 'transaction',
      relatedEntityId: tx.id,
      operationId: `op_txmsg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      deviceId: getDeviceId(),
    };
  }

  /**
   * Trigger in-app notification for backup reminder
   */
  async triggerBackupReminder(): Promise<void> {
    await notificationService.createNotification({
      title: 'تذكير بالنسخ الاحتياطي',
      body: 'يُرجى إنشاء نسخة احتياطية محلية أو سحابية لضمان سلامة بياناتك وسجلاتك المالية.',
      type: 'system',
      priority: 'medium',
      actionUrl: '/settings',
    });
  }

  /**
   * Scan overdue debts and collection candidates.
   * STRICTLY READ-ONLY regarding financial records.
   */
  async scanOverdueDebts(daysThreshold: number = 30): Promise<OverdueDebtSummary> {
    const accounts = await accountRepository.getAll();
    const scheduledList = await messagingRepository.getAllScheduledMessages();
    const now = Date.now();

    const items: OverdueDebtItem[] = [];
    let totalDebt = 0;
    let totalDebtMinor = 0;
    let dueNowCount = 0;
    let upcomingCount = 0;
    let stagnantCount = 0;

    for (const acc of accounts) {
      if (acc.archived) continue;

      // Only evaluate positive balances (debts owed TO the user / مطلوب منه)
      if (acc.currentBalance > 0) {
        const balMinor = acc.currentBalanceMinor ?? Math.round(acc.currentBalance * 100);
        totalDebt += acc.currentBalance;
        totalDebtMinor += balMinor;

        // Calculate days since last transaction or account creation
        let daysSinceLast = 0;
        if (acc.lastTransactionDate) {
          const txTime = new Date(acc.lastTransactionDate).getTime();
          daysSinceLast = Math.max(0, Math.floor((now - txTime) / (1000 * 60 * 60 * 24)));
        } else if (acc.createdAt) {
          const createTime = new Date(acc.createdAt).getTime();
          daysSinceLast = Math.max(0, Math.floor((now - createTime) / (1000 * 60 * 60 * 24)));
        }

        // Check if there are active scheduled collection alerts for this account
        const accSchedules = scheduledList.filter(
          (s) => s.relatedEntityType === 'account' && s.relatedEntityId === acc.id && s.status === 'active'
        );

        const hasScheduledAlert = accSchedules.length > 0;
        let nextScheduledRunAt: string | undefined;

        if (hasScheduledAlert) {
          // Sort by nextRunAt or scheduledAt
          accSchedules.sort((a, b) => {
            const timeA = new Date(a.nextRunAt || a.scheduledAt).getTime();
            const timeB = new Date(b.nextRunAt || b.scheduledAt).getTime();
            return timeA - timeB;
          });
          nextScheduledRunAt = accSchedules[0].nextRunAt || accSchedules[0].scheduledAt;
        }

        let status: 'due_now' | 'upcoming' | 'stagnant' | 'normal' = 'normal';

        if (nextScheduledRunAt) {
          const nextTime = new Date(nextScheduledRunAt).getTime();
          const diffDays = (nextTime - now) / (1000 * 60 * 60 * 24);
          if (nextTime <= now) {
            status = 'due_now';
            dueNowCount++;
          } else if (diffDays <= 3) {
            status = 'upcoming';
            upcomingCount++;
          }
        } else if (daysSinceLast >= daysThreshold) {
          status = 'stagnant';
          stagnantCount++;
        }

        items.push({
          accountId: acc.id,
          accountName: acc.name,
          phone: acc.phone,
          balance: acc.currentBalance,
          balanceMinor: balMinor,
          daysSinceLastTransaction: daysSinceLast,
          lastTransactionDate: acc.lastTransactionDate,
          hasScheduledAlert,
          nextScheduledRunAt,
          status,
        });
      }
    }

    // Sort items: due_now first, then stagnant, then upcoming, then normal, descending by balance
    items.sort((a, b) => {
      const priorityWeight: Record<string, number> = {
        due_now: 4,
        stagnant: 3,
        upcoming: 2,
        normal: 1,
      };
      const diffWeight = (priorityWeight[b.status] || 0) - (priorityWeight[a.status] || 0);
      if (diffWeight !== 0) return diffWeight;
      return b.balance - a.balance;
    });

    return {
      totalDebt,
      totalDebtMinor,
      candidateCount: items.length,
      dueNowCount,
      upcomingCount,
      stagnantCount,
      items,
    };
  }

  /**
   * Schedule a debt collection deadline alert for an account.
   */
  async scheduleDebtCollectionAlert(dto: ScheduleDebtCollectionAlertDTO): Promise<ScheduledMessage> {
    const account = await accountRepository.getById(dto.accountId);
    if (!account) {
      throw new Error(`الحساب غير موجود: ${dto.accountId}`);
    }

    // Compute exact alert time based on deadlineDate, remindDaysBefore, and reminderTime
    const daysBefore = dto.remindDaysBefore ?? 0;
    const timeParts = (dto.reminderTime || '09:00').split(':');
    const hours = parseInt(timeParts[0], 10) || 9;
    const minutes = parseInt(timeParts[1], 10) || 0;

    let targetDate = new Date(dto.deadlineDate);
    if (isNaN(targetDate.getTime())) {
      targetDate = new Date();
    }
    // Subtract reminder days before deadline
    targetDate.setDate(targetDate.getDate() - daysBefore);
    targetDate.setHours(hours, minutes, 0, 0);

    // If calculated trigger date is in the past, default to 1 minute in the future
    if (targetDate.getTime() <= Date.now()) {
      targetDate = new Date(Date.now() + 60000);
    }

    const scheduledAtIso = targetDate.toISOString();
    const balanceAmount = dto.amount ?? Math.abs(account.currentBalance);
    const amountStr = formatNumber(balanceAmount, 2);

    const bodyTemplate = `تنبيه موعد تحصيل دين: العميل {customerName} مطلوب منه {amount}. الموعد النهائي المحدد للتحصيل: {deadlineDate}.{note}`;

    const scheduled = await schedulerService.scheduleMessage({
      channel: dto.channel || 'in_app',
      recipient: account.phone || 'system',
      recipientName: account.name,
      subject: `تنبيه موعد تحصيل - ${account.name}`,
      bodyTemplate,
      variables: {
        customerName: account.name,
        amount: amountStr,
        deadlineDate: dto.deadlineDate,
        note: dto.customNote ? ` ملاحظة: ${dto.customNote}` : '',
      },
      scheduledAt: scheduledAtIso,
      repeatRule: dto.repeatRule || 'once',
      relatedEntityType: 'account',
      relatedEntityId: account.id,
    });

    return scheduled;
  }

  /**
   * Trigger immediate in-app and browser notifications for overdue debts.
   */
  async triggerOverdueDebtNotifications(daysThreshold: number = 14): Promise<{
    createdCount: number;
    notifiedAccounts: string[];
  }> {
    const summary = await this.scanOverdueDebts(daysThreshold);
    // Find candidates that need alerting: due_now, stagnant, or upcoming
    const candidates = summary.items.filter(
      (item) => item.status === 'due_now' || item.status === 'stagnant' || (item.status === 'upcoming' && item.daysSinceLastTransaction >= 14)
    );

    const existingNotifications = await notificationService.getAllNotifications({ type: 'reminder' });
    const todayStr = new Date().toISOString().split('T')[0];
    const notifiedAccounts: string[] = [];
    let createdCount = 0;

    for (const item of candidates) {
      // Avoid duplicate alert for same account on the same day
      const alreadyNotifiedToday = existingNotifications.some(
        (n) => n.relatedEntityId === item.accountId && n.createdAt.startsWith(todayStr)
      );

      if (alreadyNotifiedToday) continue;

      const title = item.status === 'due_now'
        ? `موعد تحصيل مستحق: ${item.accountName}`
        : `تنبيه دين متأخر: ${item.accountName}`;

      const body = item.status === 'due_now'
        ? `حان الموعد المحدد لتحصيل الرصيد المستحق (${formatNumber(item.balance, 2)}) من ${item.accountName}.`
        : `الرصيد المستحق ${formatNumber(item.balance, 2)} متأخر منذ ${item.daysSinceLastTransaction} يوم دون سداد. يرجى المتابعة.`;

      await notificationService.createNotification({
        title,
        body,
        type: 'reminder',
        priority: item.daysSinceLastTransaction >= 60 || item.status === 'due_now' ? 'urgent' : 'high',
        relatedEntityType: 'account',
        relatedEntityId: item.accountId,
        actionUrl: `/accounts/${item.accountId}`,
      });

      notifiedAccounts.push(item.accountName);
      createdCount++;
    }

    return { createdCount, notifiedAccounts };
  }

  /**
   * Get all schedules associated with a specific account
   */
  async getSchedulesForAccount(accountId: string): Promise<ScheduledMessage[]> {
    const all = await messagingRepository.getAllScheduledMessages();
    return all.filter(
      (s) => s.relatedEntityType === 'account' && s.relatedEntityId === accountId
    );
  }
}

export const reminderService = new ReminderService();
