import { messagingRepository } from '@/core/repositories';
import {
  InAppNotification,
  CreateInAppNotificationDTO,
  NotificationType,
  MessagePriority,
} from '@/shared/types';

export class NotificationService {
  /**
   * Check if the browser / PWA supports standard Web Notification API
   */
  isWebNotificationSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /**
   * Get current Web Notification permission state
   */
  getPermissionState(): 'granted' | 'denied' | 'default' | 'unsupported' {
    if (!this.isWebNotificationSupported()) {
      return 'unsupported';
    }
    return Notification.permission as 'granted' | 'denied' | 'default';
  }

  /**
   * Request browser notification permission
   */
  async requestPermission(): Promise<NotificationPermission | 'unsupported'> {
    if (!this.isWebNotificationSupported()) {
      return 'unsupported';
    }
    try {
      return await Notification.requestPermission();
    } catch (e) {
      console.warn('Notification permission request failed:', e);
      return 'denied';
    }
  }

  /**
   * Send a system Web Notification if permission granted
   */
  async sendWebNotification(
    title: string,
    options?: { body?: string; icon?: string; tag?: string }
  ): Promise<boolean> {
    if (!this.isWebNotificationSupported()) {
      return false;
    }

    if (Notification.permission !== 'granted') {
      return false;
    }

    try {
      new Notification(title, {
        body: options?.body,
        icon: options?.icon || '/icons/icon-192x192.png',
        tag: options?.tag || 'hisabati-notification',
        lang: 'ar',
        dir: 'rtl',
      });
      return true;
    } catch (e) {
      console.warn('Failed to dispatch Web Notification:', e);
      return false;
    }
  }

  /**
   * Create an in-app notification and optionally trigger a Web Notification
   */
  async createNotification(dto: CreateInAppNotificationDTO): Promise<InAppNotification> {
    const notification: InAppNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: dto.title,
      body: dto.body,
      type: dto.type,
      priority: dto.priority || 'medium',
      read: false,
      createdAt: new Date().toISOString(),
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
      actionUrl: dto.actionUrl,
    };

    await messagingRepository.saveNotification(notification);

    // If web notification permission is granted, also show web push
    if (this.getPermissionState() === 'granted') {
      await this.sendWebNotification(dto.title, {
        body: dto.body,
        tag: notification.id,
      });
    }

    return notification;
  }

  async getAllNotifications(filter?: { unreadOnly?: boolean; type?: NotificationType }): Promise<InAppNotification[]> {
    return await messagingRepository.getAllNotifications(filter);
  }

  async getUnreadCount(): Promise<number> {
    return await messagingRepository.getUnreadNotificationCount();
  }

  async markAsRead(id: string): Promise<void> {
    await messagingRepository.markNotificationAsRead(id);
  }

  async markAllAsRead(): Promise<void> {
    await messagingRepository.markAllNotificationsAsRead();
  }

  async deleteNotification(id: string): Promise<void> {
    await messagingRepository.deleteNotification(id);
  }

  async clearAllNotifications(): Promise<void> {
    await messagingRepository.clearAllNotifications();
  }
}

export const notificationService = new NotificationService();
