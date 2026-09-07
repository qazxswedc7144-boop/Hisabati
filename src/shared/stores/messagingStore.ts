import { create } from 'zustand';
import {
  AppMessage,
  InAppNotification,
  MessageTemplate,
  ScheduledMessage,
  SendMessageDTO,
  MessageChannel,
  MessageStatus,
  NotificationType,
  Account,
} from '@/shared/types';
import {
  messagingService,
  notificationService,
  schedulerService,
  templateRenderer,
} from '@/core/services/messaging';
import { CreateScheduledDTO } from '@/core/services/messaging/scheduler.service';

interface MessagingState {
  messages: AppMessage[];
  notifications: InAppNotification[];
  unreadNotificationsCount: number;
  templates: MessageTemplate[];
  scheduledMessages: ScheduledMessage[];
  isLoading: boolean;
  isNotificationCenterOpen: boolean;
  isSendMessageModalOpen: boolean;
  activeRecipientAccount: Account | null;
  activeTemplate: MessageTemplate | null;

  // Actions
  fetchNotifications: (filter?: { unreadOnly?: boolean; type?: NotificationType }) => Promise<void>;
  fetchMessages: (filter?: { channel?: MessageChannel; status?: MessageStatus; recipient?: string }) => Promise<void>;
  fetchTemplates: () => Promise<void>;
  fetchScheduledMessages: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  openNotificationCenter: (open?: boolean) => void;
  openSendMessageModal: (account?: Account | null, template?: MessageTemplate | null) => void;
  closeSendMessageModal: () => void;
  sendMessage: (dto: SendMessageDTO) => Promise<{ message: AppMessage; whatsAppUrl?: string }>;
  scheduleMessage: (dto: CreateScheduledDTO) => Promise<ScheduledMessage>;
  cancelSchedule: (id: string) => Promise<void>;
  pauseSchedule: (id: string) => Promise<void>;
  resumeSchedule: (id: string) => Promise<void>;
  checkDueSchedules: () => Promise<number>;
}

export const useMessagingStore = create<MessagingState>((set, get) => ({
  messages: [],
  notifications: [],
  unreadNotificationsCount: 0,
  templates: [],
  scheduledMessages: [],
  isLoading: false,
  isNotificationCenterOpen: false,
  isSendMessageModalOpen: false,
  activeRecipientAccount: null,
  activeTemplate: null,

  fetchNotifications: async (filter) => {
    try {
      const notifications = await notificationService.getAllNotifications(filter);
      const unreadCount = await notificationService.getUnreadCount();
      set({ notifications, unreadNotificationsCount: unreadCount });
    } catch (e) {
      console.error('Failed fetching notifications:', e);
    }
  },

  fetchMessages: async (filter) => {
    try {
      set({ isLoading: true });
      const messages = await messagingService.getAllMessages(filter);
      set({ messages, isLoading: false });
    } catch (e) {
      console.error('Failed fetching messages:', e);
      set({ isLoading: false });
    }
  },

  fetchTemplates: async () => {
    try {
      const templates = await messagingService.getAllTemplates();
      set({ templates });
    } catch (e) {
      console.error('Failed fetching templates:', e);
    }
  },

  fetchScheduledMessages: async () => {
    try {
      const scheduledMessages = await schedulerService.getAllScheduledMessages();
      set({ scheduledMessages });
    } catch (e) {
      console.error('Failed fetching scheduled messages:', e);
    }
  },

  markNotificationRead: async (id: string) => {
    try {
      await notificationService.markAsRead(id);
      await get().fetchNotifications();
    } catch (e) {
      console.error('Failed marking notification read:', e);
    }
  },

  markAllNotificationsRead: async () => {
    try {
      await notificationService.markAllAsRead();
      await get().fetchNotifications();
    } catch (e) {
      console.error('Failed marking all notifications read:', e);
    }
  },

  deleteNotification: async (id: string) => {
    try {
      await notificationService.deleteNotification(id);
      await get().fetchNotifications();
    } catch (e) {
      console.error('Failed deleting notification:', e);
    }
  },

  clearAllNotifications: async () => {
    try {
      await notificationService.clearAllNotifications();
      await get().fetchNotifications();
    } catch (e) {
      console.error('Failed clearing notifications:', e);
    }
  },

  openNotificationCenter: (open = true) => {
    set({ isNotificationCenterOpen: open });
    if (open) {
      get().fetchNotifications();
    }
  },

  openSendMessageModal: (account = null, template = null) => {
    set({
      isSendMessageModalOpen: true,
      activeRecipientAccount: account,
      activeTemplate: template,
    });
    get().fetchTemplates();
  },

  closeSendMessageModal: () => {
    set({
      isSendMessageModalOpen: false,
      activeRecipientAccount: null,
      activeTemplate: null,
    });
  },

  sendMessage: async (dto: SendMessageDTO) => {
    const res = await messagingService.sendMessage(dto);
    await get().fetchMessages();
    return res;
  },

  scheduleMessage: async (dto: CreateScheduledDTO) => {
    const res = await schedulerService.scheduleMessage(dto);
    await get().fetchScheduledMessages();
    return res;
  },

  cancelSchedule: async (id: string) => {
    await schedulerService.cancelSchedule(id);
    await get().fetchScheduledMessages();
  },

  pauseSchedule: async (id: string) => {
    await schedulerService.pauseSchedule(id);
    await get().fetchScheduledMessages();
  },

  resumeSchedule: async (id: string) => {
    await schedulerService.resumeSchedule(id);
    await get().fetchScheduledMessages();
  },

  checkDueSchedules: async () => {
    const res = await schedulerService.checkAndTriggerDueMessages();
    if (res.triggeredCount > 0) {
      await get().fetchScheduledMessages();
      await get().fetchMessages();
      await get().fetchNotifications();
    }
    return res.triggeredCount;
  },
}));
