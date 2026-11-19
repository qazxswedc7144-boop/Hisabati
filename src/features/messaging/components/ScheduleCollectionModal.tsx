import React, { useState, useEffect, useRef } from 'react';
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
  const [deadlineDateDisplay, setDeadlineDateDisplay] = useState<string>('');
  const datePickerRef = useRef<HTMLInputElement>(null);
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
      setDeadlineDateDisplay(defaultDate.replace(/-/g, '/'));
      setReminderTime('09:00');
      setRemindDaysBefore(0);
      setChannel('in_app');
      setRepeatRule('once');
      setCustomNote('');

      const targetId = scheduleModalAccount?.id || '';
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
      className="fixed inset-0 z-50 flex items-center justify-center p-1 sm:p-2 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
      dir="rtl"
    >
      <div
        id="schedule-collection-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-collection-modal-title"
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[88dvh] my-auto"
      >
        {/* Modal Header */}
        <div className="relative flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 id="schedule-collection-modal-title" className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">
                جدولة تنبيه تحصيل دين
              </h2>
              {/* Redundant subtitle removed to keep the modal compact */}
            </div>
          </div>

          <button
            id="btn-close-schedule-modal"
            onClick={closeScheduleModal}
            className="absolute top-1 left-1 z-10 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="إغلاق"
            aria-label="إغلاق نافذة جدولة التنبيه"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-2">
          {/* Account Selection */}
          <div className="space-y-1">
            <label htmlFor="input-schedule-account" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <User className="w-4 h-4 text-teal-600" />
              <span>اسم العميل</span>
            </label>

            <input
              id="input-schedule-account"
              type="text"
              list="schedule-debtor-accounts"
              defaultValue={scheduleModalAccount?.name ?? ''}
              placeholder="اسم العميل"
              autoComplete="off"
              onChange={(e) => {
                const enteredName = e.target.value.trim().toLocaleLowerCase();
                const matchedAccount = debtorAccounts.find(
                  (account) => account.name.trim().toLocaleLowerCase() === enteredName,
                );
                setSelectedAccountId(matchedAccount?.id ?? '');
              }}
              className="w-full px-3.5 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
            />
            <datalist id="schedule-debtor-accounts">
              {debtorAccounts.map((acc) => (
                <option
                  key={acc.id}
                  value={acc.name}
                  label={acc.phone ? `${acc.phone} • مطلوب: ${formatCurrency(acc.currentBalance, currency)}` : `مطلوب: ${formatCurrency(acc.currentBalance, currency)}`}
                />
              ))}
            </datalist>

            {currentAccount && (
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
                <div>
                  <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 block">
                    {currentAccount.name}
                  </span>
                  {currentAccount.phone && (
                    <span className="text-xs text-slate-400 font-mono block mt-0.5">
                      {currentAccount.phone}
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
            )}
          </div>

          {/* Due Date & Reminder Group */}
          <section className="rounded-xl border border-teal-200/80 dark:border-teal-800/60 bg-teal-50/40 dark:bg-teal-950/15 p-2 space-y-1">
            <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-teal-600 shrink-0" />
              <span>موعد الاستحقاق والتذكير</span>
            </h3>

            {/* Due date, reminder timing, and send time in one row */}
            <div className="grid grid-cols-3 gap-2">
              <div className="min-w-0 space-y-1">
                <label htmlFor="input-collection-deadline-date" className="min-h-8 text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex items-end leading-tight">
                  <span>تاريخ الاستحقاق</span>
                </label>
                <div className="relative flex min-w-0">
                  <input
                    id="input-collection-deadline-date"
                    type="text"
                    dir="ltr"
                    lang="en"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="YYYY/MM/DD"
                    aria-label="تاريخ الاستحقاق بصيغة سنة/شهر/يوم"
                    value={deadlineDateDisplay}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 8);
                      const formatted = digits.length > 6
                        ? `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6)}`
                        : digits.length > 4
                          ? `${digits.slice(0, 4)}/${digits.slice(4)}`
                          : digits;
                      setDeadlineDateDisplay(formatted);

                      if (digits.length === 8) {
                        const year = Number(digits.slice(0, 4));
                        const month = Number(digits.slice(4, 6));
                        const day = Number(digits.slice(6, 8));
                        const parsed = new Date(Date.UTC(year, month - 1, day));
                        if (
                          parsed.getUTCFullYear() === year &&
                          parsed.getUTCMonth() === month - 1 &&
                          parsed.getUTCDate() === day
                        ) {
                          setDeadlineDate(`${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`);
                        } else {
                          setDeadlineDate('');
                        }
                      } else {
                        setDeadlineDate('');
                      }
                    }}
                    className="block min-w-0 w-full px-2 py-2 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] sm:text-xs font-semibold text-left tabular-nums tracking-tight text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const picker = datePickerRef.current;
                      if (!picker) return;
                      if (typeof picker.showPicker === 'function') picker.showPicker();
                      else picker.click();
                    }}
                    className="absolute left-1 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                    aria-label="فتح التقويم"
                    title="اختيار التاريخ من التقويم"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <input
                    ref={datePickerRef}
                    type="date"
                    dir="ltr"
                    lang="en"
                    tabIndex={-1}
                    aria-hidden="true"
                    value={deadlineDate}
                    onChange={(e) => {
                      setDeadlineDate(e.target.value);
                      setDeadlineDateDisplay(e.target.value.replace(/-/g, '/'));
                    }}
                    className="absolute w-px h-px opacity-0 pointer-events-none"
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-1">
                <label htmlFor="select-remind-days-before" className="min-h-8 text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex items-end gap-1 leading-tight">
                  <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span>توقيت التذكير</span>
                </label>
                <select
                  id="select-remind-days-before"
                  value={remindDaysBefore}
                  onChange={(e) => setRemindDaysBefore(Number(e.target.value))}
                  className="block min-w-0 w-full px-1.5 sm:px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
                >
                  <option value={0}>في نفس يوم الاستحقاق</option>
                  <option value={1}>قبل الاستحقاق بيوم واحد</option>
                  <option value={3}>قبل الاستحقاق بـ 3 أيام</option>
                  <option value={7}>قبل الاستحقاق بأسبوع كامل</option>
                </select>
              </div>

              <div className="min-w-0 space-y-1">
                <label htmlFor="input-reminder-time" className="min-h-8 text-[10px] sm:text-xs font-bold text-slate-700 dark:text-slate-300 flex items-end gap-1 leading-tight">
                  <Clock className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                  <span>ساعة الإرسال</span>
                </label>
                <input
                  id="input-reminder-time"
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="block min-w-0 w-full px-1.5 sm:px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[10px] sm:text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[44px]"
                />
              </div>
            </div>
          </section>

          {/* Channel & Recurrence */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Channel */}
            <div className="space-y-1.5">
              <label htmlFor="select-alert-channel" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
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
              <label htmlFor="select-repeat-rule" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
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
            <label htmlFor="input-custom-collection-note" className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
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
          <div className="p-2.5 rounded-2xl bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-800/60 space-y-1">
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
                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2"
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
          <div className="sticky bottom-0 z-10 -mx-3 -mb-2 px-3 py-1.5 flex items-center justify-end gap-5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
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
