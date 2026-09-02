import React, { useState, useEffect } from 'react';
import {
  Bell,
  X,
  CheckCheck,
  Trash2,
  AlertCircle,
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

  const [filterType, setFilterType] = useState<string>('all');
  const navigate = useNavigate();

  useEffect(() => {
    if (isNotificationCenterOpen) {
      fetchNotifications();
    }
  }, [isNotificationCenterOpen, fetchNotifications]);

  if (!isNotificationCenterOpen) return null;

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
    if (notif.actionUrl) {
      openNotificationCenter(false);
      navigate(notif.actionUrl);
    } else if (notif.relatedEntityType === 'account' && notif.relatedEntityId) {
      openNotificationCenter(false);
      navigate(`/accounts/${notif.relatedEntityId}`);
    }
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat('ar-YE', {
        hour: 'numeric',
        minute: 'numeric',
        day: 'numeric',
        month: 'short',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl flex flex-col border-s border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-300"
        role="dialog"
        aria-label="مركز الإشعارات والتنبيهات"
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                مركز الإشعارات
                {unreadNotificationsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-600 text-white">
                    {unreadNotificationsCount} جديد
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">التنبيهات المالية وحالة النظام</p>
            </div>
          </div>

          <button
            onClick={() => openNotificationCenter(false)}
            aria-label="إغلاق"
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          {[
            { id: 'all', label: 'الكل' },
            { id: 'unread', label: `غير المقروءة (${unreadNotificationsCount})` },
            { id: 'financial', label: 'مالي' },
            { id: 'system', label: 'النظام' },
            { id: 'sync', label: 'المزامنة' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition min-h-[36px] ${
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
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
            <button
              onClick={() => markAllNotificationsRead()}
              className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-bold hover:underline"
            >
              <CheckCheck className="w-4 h-4" />
              <span>تحديد الكل كمقروء</span>
            </button>

            <button
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
            <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 stroke-1 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">لا توجد إشعارات هنا</p>
              <p className="text-xs mt-1">كافة التنبيهات والعمليات محدثة ولا يوجد إشعار جديد.</p>
            </div>
          ) : (
            filteredNotifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => handleNotificationClick(notif)}
                className={`group p-3 sm:p-3.5 rounded-2xl transition cursor-pointer flex items-start gap-3 ${
                  !notif.read
                    ? 'bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
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
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteNotification(notif.id);
                      }}
                      title="حذف الإشعار"
                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 p-1 transition"
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
    </div>
  );
};
