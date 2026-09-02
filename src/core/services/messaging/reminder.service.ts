import { accountRepository, transactionRepository } from '@/core/repositories';
import {
  DebtReminderCandidate,
  AppMessage,
  MessageChannel,
  MessageType,
} from '@/shared/types';
import { templateRenderer } from './templateRenderer.service';
import { notificationService } from './notification.service';
import { getDeviceId } from '@/core/utils/deviceId';

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
    const amountStr = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(
      Math.abs(account.currentBalance)
    );
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
    const amountStr = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(tx.amount);
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
}

export const reminderService = new ReminderService();
