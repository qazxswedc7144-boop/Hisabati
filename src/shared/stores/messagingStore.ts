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
  reminderService,
  templateRenderer,
} from '@/core/services/messaging';
import { CreateScheduledDTO } from '@/core/services/messaging/scheduler.service';
import {
  ScheduleDebtCollectionAlertDTO,
  OverdueDebtSummary,
  DueDebtsOverview,
  DueDebtAlert,
} from '@/shared/types';

interface MessagingState {
  messages: AppMessage[];
  notifications: InAppNotification[];
  unreadNotificationsCount: number;
  templates: MessageTemplate[];
  scheduledMessages: ScheduledMessage[];
  dueDebtsOverview: DueDebtsOverview | null;
  isLoadingDueDebts: boolean;
  isLoading: boolean;
  isNotificationCenterOpen: boolean;
  isSendMessageModalOpen: boolean;
  isScheduleModalOpen: boolean;
  scheduleModalAccount: Account | null;
  activeRecipientAccount: Account | null;
  activeTemplate: MessageTemplate | null;

  // Actions
  fetchNotifications: (filter?: { unreadOnly?: boolean; type?: NotificationType }) => Promise<void>;
  fetchMessages: (filter?: { channel?: MessageChannel; status?: MessageStatus; recipient?: string }) => Promise<void>;
  fetchTemplates: () => Promise<void>;
  fetchScheduledMessages: () => Promise<void>;
  fetchDueDebtsAlerts: (daysAhead?: number) => Promise<DueDebtsOverview>;
  syncDueDebtNotifications: (daysAhead?: number) => Promise<number>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  openNotificationCenter: (open?: boolean) => void;
  openSendMessageModal: (account?: Account | null, template?: MessageTemplate | null) => void;
  closeSendMessageModal: () => void;
  openScheduleModal: (account?: Account | null) => void;
  closeScheduleModal: () => void;
  sendMessage: (dto: SendMessageDTO) => Promise<{ message: AppMessage; whatsAppUrl?: string }>;
  scheduleMessage: (dto: CreateScheduledDTO) => Promise<ScheduledMessage>;
  scheduleDebtCollectionAlert: (dto: ScheduleDebtCollectionAlertDTO) => Promise<ScheduledMessage>;
  scanOverdueDebts: (daysThreshold?: number) => Promise<OverdueDebtSummary>;
  triggerOverdueDebtAlerts: (daysThreshold?: number) => Promise<number>;
  fetchSchedulesForAccount: (accountId: string) => Promise<ScheduledMessage[]>;
  cancelSchedule: (id: string) => Promise<void>;
  pauseSchedule: (id: string) => Promise<void>;
  resumeSchedule: (id: string) => Promise<void>;
  checkDueSchedules: () => Promise<number>;
}

let __dueDebtsDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let __dueDebtsPendingResolvers: Array<(v: DueDebtsOverview | null) => void> = [];

export const useMessagingStore = create<MessagingState>((set, get) => ({
  messages: [],
  notifications: [],
  unreadNotificationsCount: 0,
  templates: [],
  scheduledMessages: [],
  dueDebtsOverview: null,
  isLoadingDueDebts: false,
  isLoading: false,
  isNotificationCenterOpen: false,
  isSendMessageModalOpen: false,
  isScheduleModalOpen: false,
  scheduleModalAccount: null,
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

  markAllAsRead: async () => {
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

  openScheduleModal: (account = null) => {
    set({
      isScheduleModalOpen: true,
      scheduleModalAccount: account,
    });
    get().fetchScheduledMessages();
  },

  closeScheduleModal: () => {
    set({
      isScheduleModalOpen: false,
      scheduleModalAccount: null,
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

  scheduleDebtCollectionAlert: async (dto: ScheduleDebtCollectionAlertDTO) => {
    const res = await reminderService.scheduleDebtCollectionAlert(dto);
    await get().fetchScheduledMessages();
    return res;
  },

  fetchDueDebtsAlerts: async (daysAhead = 7) => {
    if (__dueDebtsDebounceTimer) clearTimeout(__dueDebtsDebounceTimer);
    return new Promise((resolve) => {
      __dueDebtsPendingResolvers.push(resolve);
      __dueDebtsDebounceTimer = setTimeout(async () => {
        __dueDebtsDebounceTimer = null;
        const resolvers = __dueDebtsPendingResolvers;
        __dueDebtsPendingResolvers = [];
        set({ isLoadingDueDebts: true });
        try {
          const overview = await reminderService.getDueDebtAlerts(daysAhead);
          set({ dueDebtsOverview: overview, isLoadingDueDebts: false });
          resolvers.forEach(r => r(overview));
        } catch (e) {
          console.error('Failed fetching due debt alerts:', e);
          set({ isLoadingDueDebts: false });
          resolvers.forEach(r => r(null));
        }
      }, 500);
    }) as Promise<DueDebtsOverview>;
  },

  syncDueDebtNotifications: async (daysAhead = 3) => {
    try {
      const createdCount = await reminderService.syncDueDebtNotifications(daysAhead);
      if (createdCount > 0) {
        await get().fetchNotifications();
      }
      return createdCount;
    } catch (e) {
      console.error('Failed syncing due debt notifications:', e);
      return 0;
    }
  },

  scanOverdueDebts: async (daysThreshold = 30) => {
    return await reminderService.scanOverdueDebts(daysThreshold);
  },

  triggerOverdueDebtAlerts: async (daysThreshold = 14) => {
    const res = await reminderService.triggerOverdueDebtNotifications(daysThreshold);
    if (res.createdCount > 0) {
      await get().fetchNotifications();
    }
    return res.createdCount;
  },

  fetchSchedulesForAccount: async (accountId: string) => {
    return await reminderService.getSchedulesForAccount(accountId);
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
