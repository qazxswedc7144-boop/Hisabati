import React, { useState, useEffect } from 'react';
import {
  Bell,
  Smartphone,
  Clock,
  Volume2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Layers,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { useSettingsStore, useMessagingStore, useUIStore } from '@/shared/stores';
import { notificationService } from '@/core/services/messaging';
import { useNavigate } from 'react-router-dom';

export const MessagingSettingsSection: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();
  const { openSendMessageModal } = useMessagingStore();
  const { showToast } = useUIStore();
  const navigate = useNavigate();

  const [permissionState, setPermissionState] = useState<string>('default');

  useEffect(() => {
    setPermissionState(notificationService.getPermissionState());
  }, []);

  const handleRequestWebNotificationPermission = async () => {
    const perm = await notificationService.requestPermission();
    setPermissionState(perm);
    if (perm === 'granted') {
      await updateSettings({ enableWebPushNotifications: true });
      showToast('تم تفعيل إشعارات المتصفح بنجاح', 'success');
      await notificationService.sendWebNotification('حساباتي | Hisabati', {
        body: 'تم تفعيل خدمة الإشعارات والتنبيهات بنجاح.',
      });
    } else {
      await updateSettings({ enableWebPushNotifications: false });
      showToast('لم يتم منح إذن الإشعارات من المتصفح', 'info');
    }
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              إعدادات الرسائل والتنبيهات والأتمتة
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold">
                Phase 5
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تخصيص قنوات التذكير، إشعارات المتصفح، وجدولة المواعيد
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/messaging')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition min-h-[38px]"
        >
          <span>مركز الرسائل</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs sm:text-sm">
        {/* Web Push Notifications Permission */}
        <div className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" />
              <span>إشعارات المتصفح وPWA (Web Notifications)</span>
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              استلام تنبيهات الديون والمزامنة على سطح المكتب وشاشة القفل
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {permissionState === 'granted' ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>مفعّل وممنوح</span>
              </span>
            ) : permissionState === 'denied' ? (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-600 dark:text-rose-400 px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950 border border-rose-200 dark:border-rose-800">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>محظور في المتصفح</span>
              </span>
            ) : (
              <button
                onClick={handleRequestWebNotificationPermission}
                className="px-3.5 py-1.5 rounded-xl bg-teal-600 text-white font-bold text-xs hover:bg-teal-700 transition min-h-[36px]"
              >
                طلب إذن الإشعارات
              </button>
            )}
          </div>
        </div>

        {/* WhatsApp Direct Open Toggle */}
        <div className="py-3.5 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>الإرسال المباشر عبر واتساب (WhatsApp Direct)</span>
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              فتح محادثة واتساب الرسمية مع العميل وتجهيز النص المالي تلقائياً
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.enableWhatsAppDirect !== false}
              onChange={(e) => updateSettings({ enableWhatsAppDirect: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
          </label>
        </div>

        {/* Scheduler Toggle */}
        <div className="py-3.5 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-600" />
              <span>محرك الجدولة والتنبيهات الدورية (Scheduler Engine)</span>
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              فحص الرسائل المجدولة وتوليد التنبيهات الدورية تلقائياً عند فتح التطبيق
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.enableScheduler !== false}
              onChange={(e) => updateSettings({ enableScheduler: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
          </label>
        </div>

        {/* Notification Sound Toggle */}
        <div className="py-3.5 flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              <span>أصوات التنبيهات داخل التطبيق</span>
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              تشغيل نغمة خفيفة عند وصول إشعار جديد أو تنفيذ عملية
            </p>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={settings.enableSoundAlerts !== false}
              onChange={(e) => updateSettings({ enableSoundAlerts: e.target.checked })}
              className="sr-only peer"
            />
            <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
          </label>
        </div>
      </div>
    </div>
  );
};
