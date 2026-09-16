import React, { useState, useEffect, useTransition } from 'react';
import {
  Bell,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Plus,
  RefreshCw,
  Send,
  User,
  Smartphone,
  ExternalLink,
  ShieldAlert,
  ChevronLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  useMessagingStore,
  useAccountStore,
  useUIStore,
  useSettingsStore,
} from '@/shared/stores';
import { OverdueDebtItem, OverdueDebtSummary } from '@/shared/types';
import { formatCurrency, formatNumber } from '@/core/utils/formatters';
import { notificationService, defaultWhatsAppProvider } from '@/core/services/messaging';

export const DebtCollectionManager: React.FC = () => {
  const navigate = useNavigate();
  const {
    openScheduleModal,
    openSendMessageModal,
    scanOverdueDebts,
    triggerOverdueDebtAlerts,
    checkDueSchedules,
  } = useMessagingStore();

  const { accounts } = useAccountStore();
  const { showToast } = useUIStore();
  const currency = useSettingsStore((state) => state.settings.currency);

  const [summary, setSummary] = useState<OverdueDebtSummary | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAlerting, setIsAlerting] = useState<boolean>(false);
  const [daysFilter, setDaysFilter] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [permissionState, setPermissionState] = useState<string>('default');

  const [isPending, startTransition] = useTransition();

  const loadData = async (threshold = daysFilter) => {
    try {
      setIsLoading(true);
      const res = await scanOverdueDebts(threshold);
      setSummary(res);
    } catch (e) {
      showToast('فشل تحميل قائمة الديون والمواعيد المستحقة', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData(daysFilter);
    setPermissionState(notificationService.getPermissionState());
  }, [daysFilter]);

  const handleRequestNotificationPermission = async () => {
    const res = await notificationService.requestPermission();
    setPermissionState(notificationService.getPermissionState());
    if (res === 'granted') {
      showToast('تم تفعيل إشعارات النظام بنجاح!', 'success');
    } else if (res === 'denied') {
      showToast('تم رفض إذن الإشعارات من المتصفح', 'info');
    } else {
      showToast('المتصفح لا يدعم خدمة إشعارات الويب المباشرة', 'info');
    }
  };

  const handleTriggerInstantAlerts = async () => {
    try {
      setIsAlerting(true);
      const scheduledCount = await checkDueSchedules();
      const debtAlertsCount = await triggerOverdueDebtAlerts(daysFilter);
      const total = scheduledCount + debtAlertsCount;

      await loadData(daysFilter);

      if (total > 0) {
        showToast(`تم إرسال ${total} إشعار حول مواعيد التحصيل والديون المستحقة`, 'success');
      } else {
        showToast('كافة المواعيد والديون محدثة، لا توجد تنبيهات مستحقة جديدة الآن', 'info');
      }
    } catch (e) {
      showToast('حدث خطأ أثناء فحص وإرسال التنبيهات', 'error');
    } finally {
      setIsAlerting(false);
    }
  };

  const handleSendInstantWhatsApp = (item: OverdueDebtItem) => {
    const account = accounts.find((a) => a.id === item.accountId);
    if (!account) return;

    if (!account.phone) {
      showToast('لا يتوفر رقم هاتف مسجل لهذا العميل لإرسال واتساب', 'info');
      return;
    }

    const body = `مرحباً ${account.name}،\nنود تذكيركم بلطف بأن الرصيد المستحق في كشف الحساب هو ${formatNumber(
      item.balance,
      2
    )} ${currency}.\nيُرجى التكرم بترتيب سداد المبلغ أو التواصل معنا في أقرب وقت.\nشاكرين ومقدرين حسن تعاونكم.`;

    const url = defaultWhatsAppProvider.generateWhatsAppUrl(account.phone, body);
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast(`تم فتح واتساب لتذكير ${account.name}`, 'success');
  };

  // Filter items
  const filteredItems = (summary?.items || []).filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.accountName.toLowerCase().includes(q);
      const matchPhone = item.phone?.toLowerCase().includes(q);
      if (!matchName && !matchPhone) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5 animate-in fade-in duration-200" dir="rtl">
      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Debts */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold">إجمالي الديون المطلوبة</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 dark:bg-teal-950/70 text-teal-600 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100">
            {formatCurrency(summary?.totalDebt || 0, currency)}
          </div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            من إجمالي {summary?.candidateCount || 0} عميلاً مطلوباً منهم ديون
          </span>
        </div>

        {/* Due Now */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-rose-200/80 dark:border-rose-900/40 shadow-xs">
          <div className="flex items-center justify-between text-rose-600 dark:text-rose-400 mb-2">
            <span className="text-xs font-bold">حان موعد استحقاقها</span>
            <div className="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400">
            {summary?.dueNowCount || 0}
          </div>
          <span className="text-[11px] font-semibold text-rose-600/70 dark:text-rose-400/70 mt-1 block">
            تجاوزت تاريخ الاستحقاق المجدول
          </span>
        </div>

        {/* Upcoming */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/40 shadow-xs">
          <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 mb-2">
            <span className="text-xs font-bold">استحقاق قريب (خلال 3 أيام)</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/70 text-amber-600 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-amber-600 dark:text-amber-400">
            {summary?.upcomingCount || 0}
          </div>
          <span className="text-[11px] font-semibold text-amber-600/70 dark:text-amber-400/70 mt-1 block">
            تحتاج متابعة وتجهيز سندات التحصيل
          </span>
        </div>

        {/* Stagnant Debts */}
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-bold">ديون متأخرة بدون حركة</span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-200">
            {summary?.stagnantCount || 0}
          </div>
          <span className="text-[11px] font-semibold text-slate-400 mt-1 block">
            مر عليها أكثر من {daysFilter} يوماً دون سداد
          </span>
        </div>
      </div>

      {/* Notification Permissions Banner if needed */}
      {permissionState !== 'granted' && (
        <div className="p-4 rounded-3xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Bell className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <span className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200 block">
                تفعيل إشعارات المتصفح والهاتف لمواعيد الديون
              </span>
              <span className="text-[11px] text-amber-700 dark:text-amber-300 block">
                احصل على تنبيهات فورية على شاشة هاتفك عند حلول موعد تحصيل أي دين مستحق.
              </span>
            </div>
          </div>

          <button
            onClick={handleRequestNotificationPermission}
            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs transition min-h-[40px] shrink-0"
          >
            تفعيل إشعارات النظام الآن
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row items-center gap-2.5 flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث باسم العميل أو رقم الهاتف..."
            className="w-full sm:w-64 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[40px]"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 min-h-[40px]"
          >
            <option value="all">كافة الحالات</option>
            <option value="due_now">مستحق الآن فقط</option>
            <option value="upcoming">استحقاق قريب</option>
            <option value="stagnant">راكد بدون حركة</option>
          </select>

          <select
            value={daysFilter}
            onChange={(e) => setDaysFilter(Number(e.target.value))}
            className="w-full sm:w-auto px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 min-h-[40px]"
          >
            <option value={14}>راكد &gt; 14 يوماً</option>
            <option value={30}>راكد &gt; 30 يوماً (الافتراضي)</option>
            <option value={60}>راكد &gt; 60 يوماً</option>
            <option value={90}>راكد &gt; 90 يوماً</option>
          </select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            id="btn-trigger-debt-notifications"
            onClick={handleTriggerInstantAlerts}
            disabled={isAlerting}
            className="px-3.5 py-2 rounded-xl border border-teal-300 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 font-bold text-xs hover:bg-teal-100 transition min-h-[40px] flex items-center gap-1.5"
            title="فحص فوري للمواعيد وإرسال إشعارات النظام"
          >
            <Bell className={`w-4 h-4 ${isAlerting ? 'animate-bounce' : ''}`} />
            <span>{isAlerting ? 'جارٍ الفحص والإرسال...' : 'فحص وإرسال الإشعارات'}</span>
          </button>

          <button
            id="btn-open-schedule-collection"
            onClick={() => openScheduleModal()}
            className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs shadow-md shadow-teal-600/20 transition min-h-[40px] flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>جدولة تنبيه تحصيل</span>
          </button>

          <button
            onClick={() => loadData(daysFilter)}
            disabled={isLoading}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 hover:text-teal-600 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
            title="تحديث البيانات"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Debts Table / List */}
      {isLoading ? (
        <div className="p-12 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <RefreshCw className="w-6 h-6 animate-spin text-teal-600 mx-auto mb-2" />
          <span className="text-xs font-semibold text-slate-500">جارٍ تحليل الديون ومواعيد الاستحقاق...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-teal-600 mx-auto" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-200 block">
            لا توجد ديون مستحقة تطابق معايير الفلترة الحالية
          </span>
          <span className="text-xs text-slate-400 block">
            جميع الحسابات ضمن النطاق الطبيعي أو تمت تسويتها.
          </span>
        </div>
      ) : (
        <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
          <div className="overflow-x-auto scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]">
            <table className="w-full text-start text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <tr>
                  <th className="px-4 py-3 text-start">العميل / الحساب</th>
                  <th className="px-4 py-3 text-start">المبلغ المطلوب</th>
                  <th className="px-4 py-3 text-start">فترة الركود</th>
                  <th className="px-4 py-3 text-start">حالة الاستحقاق</th>
                  <th className="px-4 py-3 text-start">الموعد والتنبيه المجدول</th>
                  <th className="px-4 py-3 text-center">إجراءات المتابعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {filteredItems.map((item) => {
                  const targetAcc = accounts.find((a) => a.id === item.accountId);
                  return (
                    <tr
                      key={item.accountId}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                    >
                      {/* Account Info */}
                      <td className="px-4 py-3.5">
                        <div className="font-extrabold text-slate-900 dark:text-slate-100 text-sm">
                          {item.accountName}
                        </div>
                        {item.phone && (
                          <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                            {item.phone}
                          </span>
                        )}
                      </td>

                      {/* Amount */}
                      <td className="px-4 py-3.5">
                        <span className="font-black text-rose-600 dark:text-rose-400 text-sm">
                          {formatCurrency(item.balance, currency)}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-0.5">مطلوب منه</span>
                      </td>

                      {/* Stagnancy Days */}
                      <td className="px-4 py-3.5 font-semibold text-slate-700 dark:text-slate-300">
                        {item.daysSinceLastTransaction > 0 ? (
                          <span>{item.daysSinceLastTransaction} يوماً</span>
                        ) : (
                          <span className="text-slate-400">حركة حديثة اليوم</span>
                        )}
                        {item.lastTransactionDate && (
                          <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">
                            آخر حركة: {item.lastTransactionDate}
                          </span>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="px-4 py-3.5">
                        {item.status === 'due_now' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>مستحق الآن</span>
                          </span>
                        ) : item.status === 'upcoming' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3.5 h-3.5" />
                            <span>استحقاق قريب</span>
                          </span>
                        ) : item.status === 'stagnant' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>راكد بدون سداد</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500">
                            <span>منتظم</span>
                          </span>
                        )}
                      </td>

                      {/* Next Scheduled Alert */}
                      <td className="px-4 py-3.5">
                        {item.hasScheduledAlert && item.nextScheduledRunAt ? (
                          <div>
                            <span className="font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1">
                              <Bell className="w-3.5 h-3.5" />
                              <span>{new Date(item.nextScheduledRunAt).toLocaleDateString('ar-YE')}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                              الساعة {new Date(item.nextScheduledRunAt).toLocaleTimeString('ar-YE', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs font-semibold">لا يوجد تنبيه مجدول</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {/* Schedule Alert Button */}
                          <button
                            type="button"
                            onClick={() => openScheduleModal(targetAcc || null)}
                            className="px-2.5 py-1.5 rounded-xl border border-teal-200 dark:border-teal-800/80 bg-teal-50/60 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 font-bold text-xs transition flex items-center gap-1 min-h-[36px]"
                            title="جدولة تنبيه تحصيل لهذا العميل"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>جدولة</span>
                          </button>

                          {/* WhatsApp Reminder Button */}
                          <button
                            type="button"
                            onClick={() => handleSendInstantWhatsApp(item)}
                            className="p-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="إرسال تذكير عبر واتساب"
                          >
                            <Smartphone className="w-3.5 h-3.5" />
                          </button>

                          {/* Account statement */}
                          <button
                            type="button"
                            onClick={() => navigate(`/accounts/${item.accountId}`)}
                            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[36px] min-w-[36px] flex items-center justify-center"
                            title="فتح كشف الحساب"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
