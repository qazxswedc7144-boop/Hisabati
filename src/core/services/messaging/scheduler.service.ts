import { messagingRepository } from '@/core/repositories';
import {
  ScheduledMessage,
  RepeatRule,
  MessageChannel,
  AppMessage,
} from '@/shared/types';
import { templateRenderer } from './templateRenderer.service';
import { messageQueueService } from './messageQueue.service';
import { getDeviceId } from '@/core/utils/deviceId';

export interface CreateScheduledDTO {
  templateId?: string;
  channel: MessageChannel;
  recipient: string;
  recipientName?: string;
  subject?: string;
  bodyTemplate: string;
  variables: Record<string, string | number>;
  scheduledAt: string; // ISO String
  repeatRule?: RepeatRule;
  relatedEntityType?: 'account' | 'transaction' | 'system';
  relatedEntityId?: string;
  operationId?: string;
}

export class SchedulerService {
  /**
   * Compute the next run date based on repeat rule
   */
  calculateNextRun(currentDateIso: string, rule: RepeatRule): string | undefined {
    if (rule === 'once') return undefined;

    const current = new Date(currentDateIso);
    if (isNaN(current.getTime())) return undefined;

    const next = new Date(current);
    if (rule === 'daily') {
      next.setDate(next.getDate() + 1);
    } else if (rule === 'weekly') {
      next.setDate(next.getDate() + 7);
    } else if (rule === 'monthly') {
      next.setMonth(next.getMonth() + 1);
    }

    return next.toISOString();
  }

  /**
   * Schedule a new message
   */
  async scheduleMessage(dto: CreateScheduledDTO): Promise<ScheduledMessage> {
    const operationId = dto.operationId || `op_sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const repeatRule = dto.repeatRule || 'once';

    const scheduledItem: ScheduledMessage = {
      id: `sched_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      templateId: dto.templateId,
      channel: dto.channel,
      recipient: dto.recipient,
      recipientName: dto.recipientName,
      subject: dto.subject,
      bodyTemplate: dto.bodyTemplate,
      variables: dto.variables,
      scheduledAt: dto.scheduledAt,
      nextRunAt: dto.scheduledAt,
      status: 'active',
      repeatRule,
      retryCount: 0,
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
      operationId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await messagingRepository.saveScheduledMessage(scheduledItem);
    return scheduledItem;
  }

  async getAllScheduledMessages(): Promise<ScheduledMessage[]> {
    return await messagingRepository.getAllScheduledMessages();
  }

  async cancelSchedule(id: string): Promise<void> {
    const existing = await messagingRepository.getAllScheduledMessages();
    const target = existing.find((s) => s.id === id);
    if (target) {
      target.status = 'cancelled';
      target.updatedAt = new Date().toISOString();
      await messagingRepository.saveScheduledMessage(target);
    }
  }

  async pauseSchedule(id: string): Promise<void> {
    const existing = await messagingRepository.getAllScheduledMessages();
    const target = existing.find((s) => s.id === id);
    if (target) {
      target.status = 'paused';
      target.updatedAt = new Date().toISOString();
      await messagingRepository.saveScheduledMessage(target);
    }
  }

  async resumeSchedule(id: string): Promise<void> {
    const existing = await messagingRepository.getAllScheduledMessages();
    const target = existing.find((s) => s.id === id);
    if (target) {
      target.status = 'active';
      target.updatedAt = new Date().toISOString();
      await messagingRepository.saveScheduledMessage(target);
    }
  }

  async deleteSchedule(id: string): Promise<void> {
    await messagingRepository.deleteScheduledMessage(id);
  }

  /**
   * Scans and executes due messages (Best-Effort Local Execution)
   */
  async checkAndTriggerDueMessages(): Promise<{ triggeredCount: number; errors: string[] }> {
    const nowIso = new Date().toISOString();
    const dueSchedules = await messagingRepository.getActiveDueScheduledMessages(nowIso);
    let triggeredCount = 0;
    const errors: string[] = [];

    for (const schedule of dueSchedules) {
      try {
        // Render message body
        const renderRes = templateRenderer.render(schedule.bodyTemplate, schedule.variables);
        
        const messageId = `msg_sched_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const appMessage: AppMessage = {
          id: messageId,
          messageId,
          channel: schedule.channel,
          type: 'due_date_alert',
          recipient: schedule.recipient,
          recipientName: schedule.recipientName,
          subject: schedule.subject,
          body: renderRes.renderedText,
          templateId: schedule.templateId,
          status: 'pending',
          priority: 'high',
          createdAt: nowIso,
          scheduledAt: schedule.scheduledAt,
          retryCount: 0,
          relatedEntityType: schedule.relatedEntityType,
          relatedEntityId: schedule.relatedEntityId,
          operationId: `${schedule.operationId}_run_${Date.now()}`,
          deviceId: getDeviceId(),
        };

        // 1. Save to Messages history
        await messagingRepository.saveMessage(appMessage);

        // 2. Enqueue in Message Queue
        await messageQueueService.enqueue(appMessage);

        // 3. Update schedule status and next run
        schedule.lastRunAt = nowIso;
        if (schedule.repeatRule === 'once') {
          schedule.status = 'completed';
          schedule.nextRunAt = undefined;
        } else {
          schedule.nextRunAt = this.calculateNextRun(nowIso, schedule.repeatRule);
        }
        schedule.updatedAt = nowIso;
        await messagingRepository.saveScheduledMessage(schedule);

        triggeredCount++;
      } catch (err: unknown) {
        const errText = err instanceof Error ? err.message : String(err);
        errors.push(`فشل تشغيل الرسالة المجدولة (${schedule.id}): ${errText}`);
      }
    }

    // Trigger queue processing
    if (triggeredCount > 0) {
      await messageQueueService.processQueue();
    }

    return { triggeredCount, errors };
  }
}

export const schedulerService = new SchedulerService();
