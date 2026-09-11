import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  Clock,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Wallet,
  Info,
} from 'lucide-react';
import { useMessagingStore } from '@/shared/stores';
import { InAppNotification, NotificationType } from '@/shared/types';
import { useNavigate } from 'react-router-dom';
import { toWesternNumerals } from '@/core/utils/formatters';

export const NotificationCenterDrawer: React.FC = () => {
  const {
    notifications,
    unreadNotificationsCount,
    isNotificationCenterOpen,
    openNotificationCenter,
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    deleteNotification,
    clearAllNotifications,
  } = useMessagingStore();

  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync local open state with store
  useEffect(() => {
    setIsOpen(isNotificationCenterOpen);
  }, [isNotificationCenterOpen]);

  const handleToggle = (open?: boolean) => {
    const next = open !== undefined ? open : !isOpen;
    setIsOpen(next);
    openNotificationCenter(next);
  };

  // Handle click outside and Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        handleToggle(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        handleToggle(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const filteredNotifications = notifications.filter((n) => {
    if (filterType === 'unread') return !n.read;
    if (filterType === 'financial') return n.type === 'financial';
    if (filterType === 'system') return n.type === 'system';
    if (filterType === 'sync') return n.type === 'sync';
    return true;
  });

  const getTypeIcon = (type: NotificationType) => {
    switch (type) {
      case 'financial':
        return <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'sync':
        return <RefreshCw className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
      case 'security':
        return <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
      case 'reminder':
        return <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      default:
        return <Info className="w-4 h-4 text-slate-600 dark:text-slate-400" />;
    }
  };

  const handleNotificationClick = (notif: InAppNotification) => {
    if (!notif.read) {
      markNotificationRead(notif.id);
    }
    handleToggle(false);
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    } else if (notif.relatedEntityType === 'account' && notif.relatedEntityId) {
      navigate(`/accounts/${notif.relatedEntityId}`);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const formatted = new Intl.DateTimeFormat('ar-u-nu-latn', {
        hour: 'numeric',
        minute: 'numeric',
        day: 'numeric',
        month: 'short',
      }).format(date);
      return toWesternNumerals(formatted);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Bell Trigger Button */}
      <button
        id="btn-header-notifications"
        type="button"
        onClick={() => handleToggle()}
        aria-label="مركز الإشعارات والتنبيهات"
        aria-expanded={isOpen}
        aria-haspopup="true"
        title="الإشعارات والتنبيهات"
        className="relative p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 transition flex items-center justify-center min-h-[40px] min-w-[40px] shrink-0"
      >
        <Bell className="w-4 h-4" />
        {unreadNotificationsCount > 0 && (
          <span className="absolute -top-1 -start-1 min-w-[18px] h-[18px] rounded-full bg-rose-600 text-white text-[10px] font-extrabold flex items-center justify-center px-1 shadow-xs">
            {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
          </span>
        )}
      </button>

      {/* Popover Card / Dropdown */}
      {isOpen && (
        <div
          id="notification-center-popover"
          role="dialog"
          aria-modal="true"
          aria-label="مركز الإشعارات والتنبيهات"
          className="fixed inset-x-4 top-20 mx-auto max-w-sm sm:absolute sm:inset-auto sm:end-0 sm:top-full sm:mt-2 sm:w-96 sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden max-h-[85vh]"
          dir="rtl"
        >
          {/* Header */}
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60">
                <Bell className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  مركز الإشعارات
                  {unreadNotificationsCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-600 text-white">
                      {unreadNotificationsCount} جديد
                    </span>
                  )}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">التنبيهات المالية وحالة النظام</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleToggle(false)}
              aria-label="إغلاق"
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs shrink-0">
            {[
              { id: 'all', label: 'الكل' },
              { id: 'unread', label: `غير المقروءة (${unreadNotificationsCount})` },
              { id: 'financial', label: 'مالي' },
              { id: 'system', label: 'النظام' },
              { id: 'sync', label: 'المزامنة' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition min-h-[34px] ${
                  filterType === tab.id
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Quick Global Actions Bar */}
          {notifications.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs shrink-0">
              <button
                type="button"
                onClick={() => markAllNotificationsRead()}
                className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-bold hover:underline"
              >
                <CheckCheck className="w-4 h-4" />
                <span>تحديد الكل كمقروء</span>
              </button>

              <button
                type="button"
                onClick={() => clearAllNotifications()}
                className="inline-flex items-center gap-1.5 text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح الكل</span>
              </button>
            </div>
          )}

          {/* Notifications List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 p-2 sm:p-3 space-y-1">
            {filteredNotifications.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                  <Bell className="w-5 h-5 stroke-1 text-slate-400" />
                </div>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">لا توجد إشعارات هنا</p>
                <p className="text-[11px] mt-0.5">كافة التنبيهات والعمليات محدثة ولا يوجد إشعار جديد.</p>
              </div>
            ) : (
              filteredNotifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`group p-3 rounded-xl transition cursor-pointer flex items-start gap-2.5 ${
                    !notif.read
                      ? 'bg-teal-50/60 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/40'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      !notif.read
                        ? 'bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {getTypeIcon(notif.type)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={`text-xs font-bold truncate ${!notif.read ? 'text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'}`}>
                        {notif.title}
                      </h3>
                      <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                        {formatTime(notif.createdAt)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                      {notif.body}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-1">
                      {notif.actionUrl || notif.relatedEntityId ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 dark:text-teal-400">
                          <span>عرض التفاصيل</span>
                          <ExternalLink className="w-3 h-3" />
                        </span>
                      ) : (
                        <span />
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                        aria-label="حذف الإشعار"
                        title="حذف الإشعار"
                        className="text-slate-400 hover:text-rose-600 p-1.5 transition flex items-center justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
