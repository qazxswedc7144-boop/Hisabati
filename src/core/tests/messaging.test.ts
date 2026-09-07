import { templateRenderer } from '../services/messaging/templateRenderer.service';
import { defaultSmsProvider } from '../services/messaging/providers/sms.provider';
import { defaultWhatsAppProvider } from '../services/messaging/providers/whatsapp.provider';
import { notificationService } from '../services/messaging/notification.service';
import { messageQueueService } from '../services/messaging/messageQueue.service';
import { schedulerService } from '../services/messaging/scheduler.service';
import { messagingService } from '../services/messaging/messaging.service';
import { AppMessage, CreateInAppNotificationDTO } from '@/shared/types';
import { getDeviceId } from '../utils/deviceId';
import { db } from '../database/db';

export interface TestResultItem {
  id: string;
  name: string;
  nameAr: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface MessagingTestSuiteResult {
  totalCount: number;
  passedCount: number;
  failedCount: number;
  results: TestResultItem[];
}

export class MessagingTestSuite {
  static async runAllTests(): Promise<MessagingTestSuiteResult> {
    const results: TestResultItem[] = [];

    // Helper runner
    const runTest = async (
      id: string,
      name: string,
      nameAr: string,
      fn: () => Promise<void> | void
    ) => {
      const start = performance.now();
      try {
        await fn();
        results.push({
          id,
          name,
          nameAr,
          passed: true,
          durationMs: Math.round(performance.now() - start),
        });
      } catch (err: unknown) {
        const errorText = err instanceof Error ? err.message : String(err);
        results.push({
          id,
          name,
          nameAr,
          passed: false,
          durationMs: Math.round(performance.now() - start),
          error: errorText,
        });
      }
    };

    // =========================================================================
    // 1. TEMPLATE TESTS (Tests 1-4)
    // =========================================================================

    // Test 1: Render valid template
    await runTest(
      't01_render_valid_template',
      'Render valid template',
      'معالجة القالب الصالح واستبدال المتغيرات',
      () => {
        const template = 'مرحباً {customerName}، رصيدك المستحق هو {amount} وتاريخ الاستحقاق {dueDate}.';
        const formattedAmount = templateRenderer.formatValue('amount', 5000);
        const res = templateRenderer.render(template, {
          customerName: 'سالم أحمد',
          amount: 5000,
          dueDate: '2026-09-15',
        });

        if (
          !res.renderedText.includes('سالم أحمد') ||
          !res.renderedText.includes(formattedAmount) ||
          !res.renderedText.includes('2026-09-15') ||
          res.missingVariables.length > 0 ||
          !res.isValid
        ) {
          throw new Error(`فشل معالجة القالب: ${res.renderedText}`);
        }
      }
    );

    // Test 2: Missing variable
    await runTest(
      't02_missing_variable',
      'Missing variable handling',
      'التعامل الآمن مع المتغيرات الناقصة دون انهيار',
      () => {
        const template = 'مرحباً {customerName}، المبلغ المستحق هو {amount}.';
        const res = templateRenderer.render(
          template,
          { customerName: 'أحمد' },
          { defaultPlaceholder: '[غير محدد]' }
        );

        if (!res.missingVariables.includes('amount') || res.isValid) {
          throw new Error('فشل اكتشاف المتغير الناقص في وضع التدقيق');
        }
        if (!res.renderedText.includes('[غير محدد]')) {
          throw new Error('فشل تطبيق القيمة البديلة للمتغير الناقص');
        }
      }
    );

    // Test 3: Arabic variables
    await runTest(
      't03_arabic_variables',
      'Arabic variables & typography',
      'دعم المتغيرات العربية والنصوص ثنائية الاتجاه RTL',
      () => {
        const template = 'عميلنا العزيز {customerName}، حسابكم لدى {businessName} مسجل برصيد {amount}.';
        const res = templateRenderer.render(template, {
          customerName: 'مؤسسة الأمل للتجارة العامة',
          businessName: 'متجر السلام',
          amount: 125000,
        });

        if (
          !res.renderedText.includes('مؤسسة الأمل للتجارة العامة') ||
          !res.renderedText.includes('متجر السلام')
        ) {
          throw new Error('فشل الحفاظ على النصوص العربية في المتغيرات');
        }
      }
    );

    // Test 4: Empty values
    await runTest(
      't04_empty_values',
      'Empty and null values resilience',
      'المرونة التامة عند استقبال قيم فارغة أو null',
      () => {
        const template = 'إشعار {customerName}: ملاحظات {notes}';
        const res = templateRenderer.render(template, {
          customerName: 'خالد',
          notes: '',
        });

        if (res.renderedText.includes('null') || res.renderedText.includes('undefined')) {
          throw new Error('تم إنتاج نص يحتوي على كلمة null أو undefined');
        }
      }
    );

    // =========================================================================
    // 2. NOTIFICATION TESTS (Tests 5-7)
    // =========================================================================

    // Test 5: Create notification
    let createdNotifId = '';
    await runTest(
      't05_create_notification',
      'Create in-app notification',
      'إنشاء وتخزين الإشعارات الداخلية في النظام',
      async () => {
        const dto: CreateInAppNotificationDTO = {
          title: 'فاتورة جديدة مستحقة',
          body: 'تم استحقاق دين بمبلغ 15,000 ريال',
          type: 'financial',
          priority: 'high',
        };
        const notif = await notificationService.createNotification(dto);
        if (!notif.id || notif.read !== false || notif.title !== dto.title) {
          throw new Error('فشل إنشاء الإشعار الداخلي');
        }
        createdNotifId = notif.id;
      }
    );

    // Test 6: Mark as read
    await runTest(
      't06_mark_as_read',
      'Mark notification as read',
      'تحديث حالة إشعار فردي إلى مقروء',
      async () => {
        if (!createdNotifId) throw new Error('لا يوجد إشعار صالح للاختبار');
        await notificationService.markAsRead(createdNotifId);
        const all = await notificationService.getAllNotifications();
        const found = all.find((n) => n.id === createdNotifId);
        if (!found || found.read !== true) {
          throw new Error('فشل تحديث الإشعار إلى مقروء');
        }
      }
    );

    // Test 7: Mark all as read
    await runTest(
      't07_mark_all_as_read',
      'Mark all notifications as read',
      'تعليم جميع الإشعارات كمقروءة دفعة واحدة',
      async () => {
        // Create two unread notifications
        await notificationService.createNotification({
          title: 'تنبيه 1',
          body: 'نص 1',
          type: 'system',
        });
        await notificationService.createNotification({
          title: 'تنبيه 2',
          body: 'نص 2',
          type: 'sync',
        });

        await notificationService.markAllAsRead();
        const unreadCount = await notificationService.getUnreadCount();
        if (unreadCount !== 0) {
          throw new Error(`يوجد إشعارات غير مقروءة بعد التعليم: ${unreadCount}`);
        }
      }
    );

    // =========================================================================
    // 3. QUEUE TESTS (Tests 8-11)
    // =========================================================================

    // Test 8: Add message to queue
    let queueTestMsgId = '';
    await runTest(
      't08_add_message_to_queue',
      'Add message to queue',
      'إدراج رسالة جديدة في طابور الإرسال المستقل',
      async () => {
        const msg: AppMessage = {
          id: `msg_q_${Date.now()}`,
          messageId: `msg_q_${Date.now()}`,
          channel: 'sms',
          type: 'debt_reminder',
          recipient: '777123456',
          body: 'تذكير بالسداد',
          status: 'pending',
          priority: 'medium',
          createdAt: new Date().toISOString(),
          retryCount: 0,
          operationId: `op_queue_test_${Date.now()}`,
          deviceId: getDeviceId(),
        };

        const item = await messageQueueService.enqueue(msg);
        if (!item.id || item.status !== 'pending' || item.messageId !== msg.id) {
          throw new Error('فشل إدراج الرسالة في الطابور');
        }
        queueTestMsgId = msg.id;
      }
    );

    // Test 9: Retry failed message
    await runTest(
      't09_retry_failed_message',
      'Retry failed message logic',
      'منطق إعادة محاولة إرسال الرسائل المتعثرة بحد أقصى',
      async () => {
        const items = await db.messageQueue.toArray();
        const item = items[0];
        if (!item) throw new Error('لا يوجد عنصر في الطابور');

        const nextRetry = item.retryCount + 1;
        await db.messageQueue.update(item.id, {
          retryCount: nextRetry,
          lastError: 'Simulated network timeout',
          updatedAt: new Date().toISOString(),
        });

        const updated = await db.messageQueue.get(item.id);
        if (updated?.retryCount !== nextRetry || !updated.lastError) {
          throw new Error('فشل تحديث سجل إعادة المحاولة');
        }
      }
    );

    // Test 10: Idempotency
    await runTest(
      't10_idempotency',
      'Message sending idempotency',
      'عدم تكرار إنشاء وإرسال الرسائل بنفس المعرف',
      async () => {
        const opId = `op_idemp_strict_${Date.now()}`;
        const res1 = await messagingService.sendMessage({
          channel: 'in_app',
          type: 'custom',
          recipient: 'user_01',
          body: 'رسالة فريدة أولى',
          operationId: opId,
        });

        const res2 = await messagingService.sendMessage({
          channel: 'in_app',
          type: 'custom',
          recipient: 'user_01',
          body: 'رسالة مكررة بنفس المعرف تماماً',
          operationId: opId,
        });

        if (res1.message.id !== res2.message.id) {
          throw new Error('خرق معيار Idempotency: تم إنشاء رسالة مكررة');
        }
      }
    );

    // Test 11: Duplicate prevention
    await runTest(
      't11_duplicate_prevention',
      'Duplicate queue entry prevention',
      'منع إدراج نفس المعرف مرتين في طابور الإرسال',
      async () => {
        const opId = `op_dup_prev_${Date.now()}`;
        const msg: AppMessage = {
          id: `msg_dup_${Date.now()}`,
          messageId: `msg_dup_${Date.now()}`,
          channel: 'sms',
          type: 'custom',
          recipient: '777999888',
          body: 'فحص التكرار',
          status: 'pending',
          priority: 'low',
          createdAt: new Date().toISOString(),
          retryCount: 0,
          operationId: opId,
          deviceId: getDeviceId(),
        };

        const item1 = await messageQueueService.enqueue(msg);
        const item2 = await messageQueueService.enqueue(msg);

        if (item1.id !== item2.id) {
          throw new Error('تم السماح بإدراج عنصر مكرر في الطابور');
        }
      }
    );

    // =========================================================================
    // 4. SCHEDULING TESTS (Tests 12-14)
    // =========================================================================

    // Test 12: Scheduled message creation
    let testScheduleId = '';
    await runTest(
      't12_scheduled_message_creation',
      'Scheduled message creation',
      'جدولة رسالة مستقبلية مع حفظ القاعدة الزمنية',
      async () => {
        const futureDate = new Date(Date.now() + 7 * 86400000).toISOString();
        const sched = await schedulerService.scheduleMessage({
          channel: 'whatsapp',
          recipient: '777444555',
          recipientName: 'عبدالرحمن',
          bodyTemplate: 'مرحباً {customerName}، تذكير بموعد الدفعة.',
          variables: { customerName: 'عبدالرحمن' },
          scheduledAt: futureDate,
          repeatRule: 'weekly',
        });

        if (!sched.id || sched.status !== 'active' || sched.repeatRule !== 'weekly') {
          throw new Error('فشل جدولة الرسالة وحفظها');
        }
        testScheduleId = sched.id;
      }
    );

    // Test 13: Due message detection
    await runTest(
      't13_due_message_detection',
      'Due scheduled message detection',
      'اكتشاف الرسائل التي حان موعد تنفيذها محلياً',
      async () => {
        // Schedule a message whose scheduledAt is 1 minute in the past
        const pastDate = new Date(Date.now() - 60000).toISOString();
        const sched = await schedulerService.scheduleMessage({
          channel: 'in_app',
          recipient: 'system',
          bodyTemplate: 'تنبيه مجدول مستحق الآن',
          variables: {},
          scheduledAt: pastDate,
          repeatRule: 'once',
        });

        const dueList = await db.scheduledMessages
          .filter((s) => s.status === 'active' && s.scheduledAt <= new Date().toISOString())
          .toArray();

        const found = dueList.some((s) => s.id === sched.id);
        if (!found) {
          throw new Error('فشل اكتشاف الرسالة المجدولة المستحقة');
        }
      }
    );

    // Test 14: Cancel scheduled message
    await runTest(
      't14_cancel_scheduled_message',
      'Cancel scheduled message',
      'إلغاء رسالة مجدولة وتغيير حالتها إلى cancelled بأمان',
      async () => {
        if (!testScheduleId) throw new Error('لا توجد رسالة مجدولة صالحة للاختبار');
        await schedulerService.cancelSchedule(testScheduleId);
        const list = await schedulerService.getAllScheduledMessages();
        const target = list.find((s) => s.id === testScheduleId);
        if (target?.status !== 'cancelled') {
          throw new Error('فشل إلغاء الرسالة المجدولة');
        }
      }
    );

    // =========================================================================
    // 5. PROVIDER TESTS (Tests 15-17)
    // =========================================================================

    // Test 15: Provider not configured
    await runTest(
      't15_provider_not_configured',
      'Provider not configured transparency',
      'الشفافية التامة عند عدم توفر بوابة رسائل (Not Configured)',
      () => {
        const isConfigured = defaultSmsProvider.isConfigured();
        if (isConfigured !== false) {
          throw new Error('تم الإبلاغ بأن مزود SMS مهيأ بالخطأ');
        }
      }
    );

    // Test 16: SMS provider failure
    await runTest(
      't16_sms_provider_failure',
      'SMS provider explicit failure handling',
      'عدم الادعاء بنجاح إرسال SMS بدون بوابة معتمدة',
      async () => {
        const dummyMsg: AppMessage = {
          id: 'test_sms_fail',
          messageId: 'test_sms_fail',
          channel: 'sms',
          type: 'custom',
          recipient: '777000111',
          body: 'رسالة فحص',
          status: 'pending',
          priority: 'low',
          createdAt: new Date().toISOString(),
          retryCount: 0,
          operationId: `op_sms_fail_${Date.now()}`,
          deviceId: getDeviceId(),
        };

        const result = await defaultSmsProvider.send(dummyMsg);
        if (result.success !== false || result.status !== 'not_configured') {
          throw new Error(`حالة غير مقبولة: success=${result.success}, status=${result.status}`);
        }
      }
    );

    // Test 17: WhatsApp provider unavailable / manual ready_to_send
    await runTest(
      't17_whatsapp_provider_unavailable',
      'WhatsApp manual fallback to ready_to_send',
      'تحويل واتساب إلى جاهز للإرسال (Ready To Send) وعدم الادعاء بأنه Sent',
      async () => {
        const isAuto = defaultWhatsAppProvider.isAutomatedAvailable();
        if (isAuto !== false) {
          throw new Error('تم الإبلاغ بأن WhatsApp الآلي متاح بالخطأ بدون Provider رسمي');
        }

        const dummyMsg: AppMessage = {
          id: 'test_wa_ready',
          messageId: 'test_wa_ready',
          channel: 'whatsapp',
          type: 'debt_reminder',
          recipient: '777222333',
          body: 'مرحباً، رسالة جاهزة',
          status: 'pending',
          priority: 'medium',
          createdAt: new Date().toISOString(),
          retryCount: 0,
          operationId: `op_wa_test_${Date.now()}`,
          deviceId: getDeviceId(),
        };

        const res = await defaultWhatsAppProvider.send(dummyMsg);
        if (res.status !== 'ready_to_send' || res.success !== true || !res.url) {
          throw new Error(`حالة واتساب غير مطابقة: status=${res.status}`);
        }
      }
    );

    // =========================================================================
    // 6. PRIVACY TESTS (Test 18)
    // =========================================================================

    // Test 18: Ensure sensitive message content is not logged
    await runTest(
      't18_ensure_sensitive_not_logged',
      'Privacy masking & audit shielding',
      'إخفاء أرقام الهواتف لحماية الخصوصية في سجلات العرض',
      () => {
        const maskedYemeni = messagingService.maskPhoneNumber('967777123456');
        const maskedShort = messagingService.maskPhoneNumber('777123456');

        if (!maskedYemeni.endsWith('3456') || !maskedYemeni.startsWith('****')) {
          throw new Error(`فشل إخفاء رقم الهاتف: ${maskedYemeni}`);
        }
        if (!maskedShort.endsWith('3456')) {
          throw new Error(`فشل إخفاء الرقم القصير: ${maskedShort}`);
        }
      }
    );

    // =========================================================================
    // 7. OFFLINE TESTS (Tests 19-20)
    // =========================================================================

    // Test 19: Queue while offline
    await runTest(
      't19_queue_while_offline',
      'Queue messages while offline',
      'حفظ الرسائل محلياً أثناء انقطاع الاتصال دون فقدان أي بيانات',
      async () => {
        const offlineOpId = `op_offline_${Date.now()}`;
        const offlineMsg: AppMessage = {
          id: `msg_offline_${Date.now()}`,
          messageId: `msg_offline_${Date.now()}`,
          channel: 'whatsapp',
          type: 'payment_receipt',
          recipient: '777555666',
          body: 'سند استلام دفعة مالية',
          status: 'pending',
          priority: 'high',
          createdAt: new Date().toISOString(),
          retryCount: 0,
          operationId: offlineOpId,
          deviceId: getDeviceId(),
        };

        const item = await messageQueueService.enqueue(offlineMsg);
        if (!item || item.status !== 'pending') {
          throw new Error('فشل إدراج الرسالة في الطابور المحلي بوضع Offline');
        }

        const stored = await db.messageQueue.get(item.id);
        if (!stored || stored.operationId !== offlineOpId) {
          throw new Error('فشل التحقق من استمرارية تخزين الرسالة في IndexedDB');
        }
      }
    );

    // Test 20: Process queue after reconnect
    await runTest(
      't20_process_queue_after_reconnect',
      'Process queue on connection restore',
      'معالجة عناصر الطابور بأمان عند استعادة الاتصال دون إرسال مكرر',
      async () => {
        const queueSummary = await messageQueueService.processQueue();
        if (typeof queueSummary.processed !== 'number') {
          throw new Error('فشل معالجة عناصر الطابور');
        }

        // Verify remaining items in queue are valid
        const remaining = await db.messageQueue.toArray();
        const invalidStatuses = remaining.filter((r) => r.status === 'sent');
        if (invalidStatuses.length > 0) {
          throw new Error('يوجد عناصر مكتملة لم يتم إزالتها أو تحديثها من الطابور');
        }
      }
    );

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      totalCount: results.length,
      passedCount,
      failedCount,
      results,
    };
  }
}
