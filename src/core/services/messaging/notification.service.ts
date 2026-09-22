import { messagingRepository } from '@/core/repositories';
import {
  InAppNotification,
  CreateInAppNotificationDTO,
  NotificationType,
} from '@/shared/types';
import { getDb } from '@/core/database/db';
import { getDeviceId } from '@/core/utils/deviceId';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';

export class NotificationService {
  /**
   * Check if the browser / PWA supports standard Web Notification API
   */
  isWebNotificationSupported(): boolean {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return false;
    }
    // iOS Safari PWA standalone check
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS && (navigator as any).standalone !== true) {
      // On iOS, web notifications only work when installed as PWA standalone mode
      return false;
    }
    return true;
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
   * Send a system Web Notification if permission granted and app not in foreground
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

    // [1.4 b] Prevent web push duplicate if app is visible in foreground
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
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

  private buildIdempotencyKey(dto: CreateInAppNotificationDTO): string {
    const userId = rbacGuard.getActiveActor().id;
    const deviceId = getDeviceId();
    const localDate = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
    const entityId = dto.relatedEntityId || 'global';
    return `${userId}:${deviceId}:${entityId}:${dto.type}:${localDate}`;
  }

  /**
   * Create an in-app notification with idempotency check and optionally trigger a Web Notification
   */
  async createNotification(dto: CreateInAppNotificationDTO): Promise<InAppNotification> {
    const idempotencyKey = this.buildIdempotencyKey(dto);
    const activeDb = getDb();

    return await activeDb.transaction('rw', activeDb.inAppNotifications, async () => {
      const existing = await activeDb.inAppNotifications
        .where('[type+idempotencyKey]')
        .equals([dto.type, idempotencyKey])
        .first();

      if (existing) {
        return existing;
      }

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
        idempotencyKey,
      };

      await activeDb.inAppNotifications.add(notification);

      // Web notification is a side effect, but we keep it here for UX consistency
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        this.sendWebNotification(dto.title, {
          body: dto.body,
          tag: notification.id,
        });
      }

      return notification;
    });
  }

  async invalidateNotificationsForEntity(entityId: string): Promise<void> {
    const db = getDb();
    const notifs = await db.inAppNotifications.where('relatedEntityId').equals(entityId).toArray();
    for (const n of notifs) {
      n.read = true;
      await db.inAppNotifications.put(n);
    }
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
