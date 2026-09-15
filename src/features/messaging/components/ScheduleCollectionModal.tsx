import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Calendar,
  Bell,
  CheckCircle2,
  AlertCircle,
  Smartphone,
  MessageSquare,
  Repeat,
  Pause,
  Play,
  Trash2,
  FileText,
  User,
  ArrowRight,
} from 'lucide-react';
import { useMessagingStore, useAccountStore, useUIStore, useSettingsStore } from '@/shared/stores';
import {
  MessageChannel,
  RepeatRule,
  ScheduledMessage,
  Account,
} from '@/shared/types';
import { formatCurrency, formatNumber } from '@/core/utils/formatters';
import { useLockBody } from '@/shared/hooks';

export const ScheduleCollectionModal: React.FC = () => {
  const {
    isScheduleModalOpen,
    closeScheduleModal,
    scheduleModalAccount,
    scheduleDebtCollectionAlert,
    fetchSchedulesForAccount,
    pauseSchedule,
    resumeSchedule,
    cancelSchedule,
  } = useMessagingStore();

  const { accounts } = useAccountStore();
  const { showToast } = useUIStore();
  const currency = useSettingsStore((state) => state.settings.currency);

  useLockBody(isScheduleModalOpen);

  // Form State
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [deadlineDate, setDeadlineDate] = useState<string>('');
  const [reminderTime, setReminderTime] = useState<string>('09:00');
  const [remindDaysBefore, setRemindDaysBefore] = useState<number>(0);
  const [channel, setChannel] = useState<MessageChannel>('in_app');
  const [repeatRule, setRepeatRule] = useState<RepeatRule>('once');
  const [customNote, setCustomNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Active schedules for selected account
  const [accountSchedules, setAccountSchedules] = useState<ScheduledMessage[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState<boolean>(false);

  // Filter debtor accounts (where money is owed to the user: currentBalance > 0)
  const debtorAccounts = accounts.filter((a) => !a.archived && a.currentBalance > 0);

  // Initialize or update fields when modal opens or target account changes
  useEffect(() => {
    if (isScheduleModalOpen) {
      const defaultDate = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      setDeadlineDate(defaultDate);
      setReminderTime('09:00');
      setRemindDaysBefore(0);
      setChannel('in_app');
      setRepeatRule('once');
      setCustomNote('');

      const targetId = scheduleModalAccount?.id || (debtorAccounts[0]?.id ?? '');
      setSelectedAccountId(targetId);
    }
  }, [isScheduleModalOpen, scheduleModalAccount]);

  // Fetch existing schedules whenever selected account changes
  useEffect(() => {
    if (selectedAccountId) {
      setIsLoadingSchedules(true);
      fetchSchedulesForAccount(selectedAccountId)
        .then((list) => setAccountSchedules(list))
        .catch(() => setAccountSchedules([]))
        .finally(() => setIsLoadingSchedules(false));
    } else {
      setAccountSchedules([]);
    }
  }, [selectedAccountId, fetchSchedulesForAccount]);

  if (!isScheduleModalOpen) return null;

  const currentAccount = accounts.find((a) => a.id === selectedAccountId);
  const currentDebtAmount = currentAccount ? Math.abs(currentAccount.currentBalance) : 0;

  // Shortcut helpers for deadline dates
  const setQuickDeadline = (daysAhead: number) => {
    const d = new Date(Date.now() + daysAhead * 86400000);
    setDeadlineDate(d.toISOString().split('T')[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId || !currentAccount) {
      showToast('يرجى تحديد الحساب المعني بالتحصيل', 'error');
      return;
    }

    if (!deadlineDate) {
      showToast('يرجى تحديد الموعد النهائي للتحصيل', 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      await scheduleDebtCollectionAlert({
        accountId: currentAccount.id,
        accountName: currentAccount.name,
        phone: currentAccount.phone,
        amount: currentDebtAmount,
        deadlineDate,
        reminderTime,
        remindDaysBefore,
        channel,
        repeatRule,
        customNote: customNote.trim() || undefined,
      });

      showToast(`تمت جدولة تنبيه التحصيل بنجاح لحساب ${currentAccount.name}`, 'success');
      closeScheduleModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل حفظ موعد التنبيه';
      showToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePause = async (id: string) => {
    await pauseSchedule(id);
    if (selectedAccountId) {
      const updated = await fetchSchedulesForAccount(selectedAccountId);
      setAccountSchedules(updated);
    }
  };

  const handleResume = async (id: string) => {
    await resumeSchedule(id);
    if (selectedAccountId) {
      const updated = await fetchSchedulesForAccount(selectedAccountId);
      setAccountSchedules(updated);
    }
  };

  const handleCancel = async (id: string) => {
    await cancelSchedule(id);
    if (selectedAccountId) {
      const updated = await fetchSchedulesForAccount(selectedAccountId);
      setAccountSchedules(updated);
    }
    showToast('تم إلغاء التنبيه المجدول', 'info');
  };

  return (
    <div
      id="schedule-collection-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        id="schedule-collection-modal"
        className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-auto"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                جدولة تنبيه تحصيل دين
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                تحديد موعد الاستحقاق النهائي وتلقي إشعارات المتابعة
              </p>
            </div>
          </div>

          <button
            id="btn-close-schedule-modal"
            onClick={closeScheduleModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[75dvh] overflow-y-auto">
          {/* Account Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-4 h-4 text-teal-600" />
              <span>العميل / الحساب المعني</span>
            </label>

            {scheduleModalAccount ? (
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 block">
                    {scheduleModalAccount.name}
                  </span>
                  {scheduleModalAccount.phone && (
                    <span className="text-xs text-slate-400 font-mono block mt-0.5">
                      {scheduleModalAccount.phone}
                    </span>
                  )}
                </div>
                <div className="text-end">
                  <span className="text-[10px] font-bold text-slate-400 block">المبلغ المطلوب منه</span>
                  <span className="text-sm font-black text-rose-600 dark:text-rose-400">
                    {formatCurrency(currentDebtAmount, currency)}
                  </span>
                </div>
              </div>
            ) : (
              <select
                id="select-schedule-account"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
              >
                <option value="">-- اختر حساباً مطلوباً منه دين --</option>
                {debtorAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (مطلوب: {formatCurrency(acc.currentBalance, currency)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Collection Deadline Date */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-teal-600" />
                <span>الموعد النهائي للتحصيل (تاريخ الاستحقاق)</span>
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setQuickDeadline(3)}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950 font-bold transition"
                >
                  +3 أيام
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDeadline(7)}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950 font-bold transition"
                >
                  +أسبوع
                </button>
                <button
                  type="button"
                  onClick={() => setQuickDeadline(14)}
                  className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-teal-50 hover:text-teal-700 dark:hover:bg-teal-950 font-bold transition"
                >
                  +أسبوعين
                </button>
              </div>
            </div>

            <input
              id="input-collection-deadline-date"
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
              required
            />
          </div>

          {/* Alert Timing & Days Before */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* When to Remind */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-amber-500" />
                <span>موعد إرسال التنبيه</span>
              </label>
              <select
                id="select-remind-days-before"
                value={remindDaysBefore}
                onChange={(e) => setRemindDaysBefore(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
              >
                <option value={0}>في نفس يوم الاستحقاق</option>
                <option value={1}>قبل الاستحقاق بيوم واحد</option>
                <option value={3}>قبل الاستحقاق بـ 3 أيام</option>
                <option value={7}>قبل الاستحقاق بأسبوع كامل</option>
              </select>
            </div>

            {/* Alert Time */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>ساعة التنبيه</span>
              </label>
              <input
                id="input-reminder-time"
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
              />
            </div>
          </div>

          {/* Channel & Recurrence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Channel */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-teal-600" />
                <span>قناة استلام التنبيه</span>
              </label>
              <select
                id="select-alert-channel"
                value={channel}
                onChange={(e) => setChannel(e.target.value as MessageChannel)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
              >
                <option value="in_app">إشعار للمستخدم (داخل التطبيق والمتصفح)</option>
                <option value="whatsapp">رسالة تذكير للعميل عبر واتساب</option>
                <option value="sms">رسالة تذكير SMS للعميل</option>
              </select>
            </div>

            {/* Recurrence Rule */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-teal-600" />
                <span>تكرار التنبيه</span>
              </label>
              <select
                id="select-repeat-rule"
                value={repeatRule}
                onChange={(e) => setRepeatRule(e.target.value as RepeatRule)}
                className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
              >
                <option value="once">مرة واحدة فقط</option>
                <option value="daily">يومياً حتى اكتمال التحصيل</option>
                <option value="weekly">أسبوعياً</option>
                <option value="monthly">شهرياً</option>
              </select>
            </div>
          </div>

          {/* Custom Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-slate-500" />
              <span>ملاحظة أو تعليمات إضافية للتحصيل (اختياري)</span>
            </label>
            <input
              id="input-custom-collection-note"
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="مثال: استلام دفعة 50% نقداً أو طلب شيك مصرفي"
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
            />
          </div>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800/60 space-y-1">
            <span className="text-[11px] font-bold text-teal-800 dark:text-teal-300 block">
              نص التنبيه المتوقع:
            </span>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              تنبيه موعد تحصيل دين: العميل {currentAccount?.name || 'العميل'} مطلوب منه{' '}
              {formatNumber(currentDebtAmount, 2)}. الموعد النهائي المحدد للتحصيل: {deadlineDate || '---'}
              {customNote ? ` (ملاحظة: ${customNote})` : ''}.
            </p>
          </div>

          {/* Existing Schedules for this Account */}
          {accountSchedules.length > 0 && (
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                المواعيد والتنبيهات المجدولة حالياً لهذا الحساب ({accountSchedules.length}):
              </span>
              <div className="space-y-2 max-h-36 overflow-y-auto text-xs">
                {accountSchedules.map((sched) => (
                  <div
                    key={sched.id}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                        موعد التنفيذ: {new Date(sched.nextRunAt || sched.scheduledAt).toLocaleString('ar-YE')}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {sched.channel === 'in_app' ? 'إشعار للمستخدم' : sched.channel === 'whatsapp' ? 'واتساب' : 'SMS'} |{' '}
                        {sched.status === 'active' ? 'نشط' : sched.status === 'paused' ? 'متوقف مؤقتاً' : 'مكتمل'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {sched.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => handlePause(sched.id)}
                          className="p-1.5 rounded-lg border border-amber-300 text-amber-700 dark:text-amber-300 hover:bg-amber-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="إيقاف مؤقت"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {sched.status === 'paused' && (
                        <button
                          type="button"
                          onClick={() => handleResume(sched.id)}
                          className="p-1.5 rounded-lg border border-teal-300 text-teal-700 dark:text-teal-300 hover:bg-teal-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                          title="استئناف"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCancel(sched.id)}
                        className="p-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 min-h-[36px] min-w-[36px] flex items-center justify-center"
                        title="إلغاء التنبيه"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={closeScheduleModal}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px]"
            >
              إلغاء
            </button>

            <button
              id="btn-confirm-schedule-alert"
              type="submit"
              disabled={isSubmitting || !selectedAccountId}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white font-bold text-xs shadow-md shadow-teal-600/20 transition min-h-[44px] flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جارٍ الحفظ...' : 'حفظ وجدولة التنبيه'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
