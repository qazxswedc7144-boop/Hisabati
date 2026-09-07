import { messagingRepository } from '@/core/repositories';
import {
  AppMessage,
  MessageTemplate,
  SendMessageDTO,
  MessageChannel,
  MessageStatus,
} from '@/shared/types';
import { templateRenderer } from './templateRenderer.service';
import { defaultSmsProvider } from './providers/sms.provider';
import { defaultWhatsAppProvider } from './providers/whatsapp.provider';
import { notificationService } from './notification.service';
import { messageQueueService } from './messageQueue.service';
import { getDeviceId } from '@/core/utils/deviceId';

export class MessagingService {
  private isInitialized = false;

  /**
   * Seed default Arabic message templates if not already seeded
   */
  async ensureDefaultTemplates(): Promise<void> {
    if (this.isInitialized) return;

    const existing = await messagingRepository.getAllTemplates();
    if (existing.length > 0) {
      this.isInitialized = true;
      return;
    }

    const defaultTemplates: MessageTemplate[] = [
      {
        id: 'tpl_debt_reminder_1',
        name: 'Debt Reminder Standard',
        nameAr: 'تذكير بمستحقات مالية (رسمي)',
        type: 'debt_reminder',
        defaultChannel: 'whatsapp',
        body: 'مرحباً {customerName}،\nنود تذكيركم بأن إجمالي الرصيد المستحق في حسابكم هو {amount}.\nتاريخ الاستحقاق: {dueDate}\nشاكرين لكم حسن تعاونكم الدائم.',
        variables: ['customerName', 'amount', 'dueDate'],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl_payment_receipt_1',
        name: 'Payment Receipt Notice',
        nameAr: 'إشعار استلام دفعة / سند قبض',
        type: 'payment_receipt',
        defaultChannel: 'whatsapp',
        body: 'عزيزي {customerName}،\nتم قيد واستلام دفعة مالية بمبلغ {amount} بنجاح.\nرقم السند: {receiptNumber}\nالرصيد المتبقي بعد العملية: {balance}\nشكراً لتعاملكم معنا.',
        variables: ['customerName', 'amount', 'receiptNumber', 'balance'],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl_statement_summary_1',
        name: 'Statement Summary Notice',
        nameAr: 'إشعار ملخص كشف الحساب',
        type: 'statement_summary',
        defaultChannel: 'whatsapp',
        body: 'الأخ/الأخت {customerName} المحترم،\nمرفق ملخص حسابكم حتى تاريخ {date}:\n- إجمالي المسجل لكم: {totalDebit}\n- إجمالي المسجل عليكم: {totalCredit}\n- صافي الرصيد الحالي: {balance}\nتطبيق حساباتي.',
        variables: ['customerName', 'date', 'totalDebit', 'totalCredit', 'balance'],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'tpl_welcome_1',
        name: 'Welcome New Account',
        nameAr: 'رسالة ترحيب بحساب جديد',
        type: 'welcome',
        defaultChannel: 'whatsapp',
        body: 'أهلاً بك {customerName}،\nتم فتح وتفعيل حسابكم المالي لدينا بنجاح.\nيمكنكم التواصل معنا لأي استفسارات حول سجل العمليات.\nمع تحيات: {businessName}.',
        variables: ['customerName', 'businessName'],
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    for (const tpl of defaultTemplates) {
      await messagingRepository.saveTemplate(tpl);
    }
    this.isInitialized = true;
  }

  /**
   * Mask sensitive phone numbers for safe audit display (e.g. *******1234)
   */
  maskPhoneNumber(phone?: string): string {
    if (!phone) return '—';
    const clean = phone.trim();
    if (clean.length <= 4) return '****';
    const visibleEnd = clean.slice(-4);
    return '*'.repeat(Math.max(clean.length - 4, 4)) + visibleEnd;
  }

  /**
   * Send or prepare a message based on the chosen channel
   */
  async sendMessage(dto: SendMessageDTO): Promise<{
    message: AppMessage;
    whatsAppUrl?: string;
  }> {
    await this.ensureDefaultTemplates();

    const nowIso = new Date().toISOString();
    const operationId = dto.operationId || `op_msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. Idempotency Check: Don't recreate duplicate message if already exists
    const existingMsg = await messagingRepository.getMessageByOperationId(operationId);
    if (existingMsg) {
      let whatsAppUrl: string | undefined;
      if (existingMsg.channel === 'whatsapp') {
        whatsAppUrl = defaultWhatsAppProvider.generateWhatsAppUrl(existingMsg.recipient, existingMsg.body);
      }
      return { message: existingMsg, whatsAppUrl };
    }

    // 2. Render body from template or direct text
    let messageBody = dto.body || '';
    if (dto.templateId) {
      const template = await messagingRepository.getTemplateById(dto.templateId);
      if (template && dto.variables) {
        const renderRes = templateRenderer.render(template.body, dto.variables);
        messageBody = renderRes.renderedText;
      }
    }

    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const appMessage: AppMessage = {
      id: messageId,
      messageId,
      channel: dto.channel,
      type: dto.type,
      recipient: dto.recipient,
      recipientName: dto.recipientName,
      subject: dto.subject,
      body: messageBody,
      templateId: dto.templateId,
      status: 'pending',
      priority: dto.priority || 'medium',
      createdAt: nowIso,
      scheduledAt: dto.scheduledAt,
      retryCount: 0,
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
      operationId,
      deviceId: getDeviceId(),
    };

    let whatsAppUrl: string | undefined;

    // 3. Channel Execution Logic
    if (dto.channel === 'whatsapp') {
      const waResult = defaultWhatsAppProvider.prepareUserInitiatedSend(appMessage);
      appMessage.status = waResult.status; // 'ready_to_send'
      whatsAppUrl = waResult.url;
    } else if (dto.channel === 'sms') {
      const smsResult = await defaultSmsProvider.send(appMessage);
      appMessage.status = smsResult.status; // 'not_configured'
      appMessage.errorCode = smsResult.errorCode;
      appMessage.errorMessage = smsResult.errorMessage;
      appMessage.failedAt = nowIso;
    } else if (dto.channel === 'in_app' || dto.channel === 'web_notification') {
      await notificationService.createNotification({
        title: dto.subject || 'إشعار جديد',
        body: messageBody,
        type: 'financial',
        priority: dto.priority,
        relatedEntityType: dto.relatedEntityType,
        relatedEntityId: dto.relatedEntityId,
      });
      appMessage.status = 'sent';
      appMessage.sentAt = nowIso;
    }

    // 4. Persist to message history
    await messagingRepository.saveMessage(appMessage);

    // 5. Enqueue for queue tracking
    await messageQueueService.enqueue(appMessage);

    return { message: appMessage, whatsAppUrl };
  }

  /**
   * Open WhatsApp directly with prepared message text
   */
  openWhatsAppDirect(phone: string, text: string): void {
    const url = defaultWhatsAppProvider.generateWhatsAppUrl(phone, text);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  async getAllMessages(filter?: { channel?: MessageChannel; status?: MessageStatus; recipient?: string }): Promise<AppMessage[]> {
    return await messagingRepository.getAllMessages(filter);
  }

  async getAllTemplates(): Promise<MessageTemplate[]> {
    await this.ensureDefaultTemplates();
    return await messagingRepository.getAllTemplates();
  }
}

export const messagingService = new MessagingService();
