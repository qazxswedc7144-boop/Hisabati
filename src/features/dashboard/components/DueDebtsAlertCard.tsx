import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Clock,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Send,
  PlusCircle,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronLeft,
  Phone,
  CalendarDays,
} from 'lucide-react';
import {
  useMessagingStore,
  useUIStore,
  useAccountStore,
  useSettingsStore,
} from '@/shared/stores';
import { DueDebtAlert, DueDebtUrgency } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';
import { fromMinor } from '@/core/utils/money.utils';

type FilterTab = 'all' | 'due_today' | 'due_week' | 'overdue';

export const DueDebtsAlertCard: React.FC = () => {
  const navigate = useNavigate();
  const accounts = useAccountStore((state) => state.accounts);
  const currency = useSettingsStore((state) => state.settings.currency);

  const {
    dueDebtsOverview,
    isLoadingDueDebts,
    fetchDueDebtsAlerts,
    syncDueDebtNotifications,
    openScheduleModal,
    openSendMessageModal,
  } = useMessagingStore();

  const openQuickAddTransaction = useUIStore((state) => state.openQuickAddTransaction);

  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Initial load and daily in-app notification synchronization
  useEffect(() => {
    fetchDueDebtsAlerts(7);
    syncDueDebtNotifications(3);
  }, [fetchDueDebtsAlerts, syncDueDebtNotifications]);

  const handleRefresh = async () => {
    await fetchDueDebtsAlerts(7);
    await syncDueDebtNotifications(3);
  };

  const rawAlerts = dueDebtsOverview?.alerts ?? [];

  // Filter alerts according to chosen tab
  const filteredAlerts = useMemo(() => {
    switch (filterTab) {
      case 'due_today':
        return rawAlerts.filter((a) => a.urgency === 'due_today');
      case 'due_week':
        return rawAlerts.filter((a) => a.daysRemaining >= 0 && a.daysRemaining <= 7);
      case 'overdue':
        return rawAlerts.filter((a) => a.urgency === 'overdue');
      case 'all':
      default:
        return rawAlerts;
    }
  }, [rawAlerts, filterTab]);

  const totalCount = rawAlerts.length;
  const todayCount = rawAlerts.filter((a) => a.urgency === 'due_today').length;
  const weekCount = rawAlerts.filter((a) => a.daysRemaining >= 0 && a.daysRemaining <= 7).length;
  const overdueCount = rawAlerts.filter((a) => a.urgency === 'overdue').length;

  const totalReceivableAmount = fromMinor(dueDebtsOverview?.totalReceivableMinor ?? 0, currency);

  const getUrgencyBadgeStyle = (urgency: DueDebtUrgency) => {
    switch (urgency) {
      case 'due_today':
        return 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800';
      case 'overdue':
        return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      case 'due_tomorrow':
      case 'due_soon':
      default:
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    }
  };

  const getUrgencyIcon = (urgency: DueDebtUrgency) => {
    switch (urgency) {
      case 'due_today':
        return <Clock className="w-3.5 h-3.5 shrink-0 text-red-600 dark:text-red-400" />;
      case 'overdue':
        return <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600 dark:text-rose-400" />;
      case 'due_tomorrow':
        return <Calendar className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
      case 'due_soon':
      default:
        return <CalendarDays className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />;
    }
  };

  const handleOpenAccount = (accountId: string) => {
    navigate(`/accounts/${accountId}`);
  };

  const handleSendReminder = (e: React.MouseEvent, alert: DueDebtAlert) => {
    e.stopPropagation();
    const targetAccount = accounts.find((a) => a.id === alert.accountId) || null;
    const exactBalance = fromMinor(alert.balanceMinor ?? 0, currency);
    const formattedAmount = formatCurrency(exactBalance, currency);
    const balanceDesc = alert.balanceType === 'owed_to_me' ? 'مستحق لكم (ذمم على الحساب)' : 'مستحق عليكم';
    
    const customMessage = `مرحباً ${alert.accountName}،\nنود تذكيركم بأن إجمالي الرصيد المستحق هو ${formattedAmount} (${balanceDesc}).\nتاريخ الاستحقاق: ${alert.dueDate}${alert.note ? `\nملاحظة: ${alert.note}` : ''}\nشاكرين ومقدرين حسن تعاونكم الدائم معنا.\nتطبيق حساباتي.`;

    if (targetAccount) {
      openSendMessageModal(targetAccount);
    } else {
      // Fallback direct WhatsApp wa.me link
      const cleanPhone = alert.phone ? alert.phone.replace(/[^\d+]/g, '') : '';
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(customMessage)}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleScheduleDeadline = (e: React.MouseEvent, alert: DueDebtAlert) => {
    e.stopPropagation();
    const targetAccount = accounts.find((a) => a.id === alert.accountId) || null;
    openScheduleModal(targetAccount);
  };

  const handleAddPayment = (e: React.MouseEvent, alert: DueDebtAlert) => {
    e.stopPropagation();
    openQuickAddTransaction(alert.accountId);
  };

  return (
    <div
      id="dashboard-due-debts-card"
      className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xs space-y-4 transition-all"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200/60 dark:border-amber-800/60 shrink-0">
            <Bell className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-slate-100 truncate">
                تنبيهات الديون ومواعيد الاستحقاق
              </h3>
              {totalCount > 0 ? (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 dark:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-200/80 dark:border-amber-800/80">
                  {totalCount} تنبيهات
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-800/80">
                  كافة الحسابات منتظمة
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              متابعة مواعيد التحصيل والديون المستحقة بالسداد قريباً
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoadingDueDebts}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-slate-200/60 dark:border-slate-800"
            title="تحديث قائمة التنبيهات"
            aria-label="تحديث قائمة التنبيهات"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoadingDueDebts ? 'animate-spin text-teal-600' : ''}`}
            />
          </button>

          <button
            type="button"
            onClick={() => openScheduleModal(null)}
            className="hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition min-h-[40px]"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>جدولة موعد دين</span>
          </button>

          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-w-[40px] min-h-[40px] flex items-center justify-center border border-slate-200/60 dark:border-slate-800"
            title={isCollapsed ? 'توسيع القسم' : 'طي القسم'}
            aria-label={isCollapsed ? 'توسيع القسم' : 'طي القسم'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {totalCount > 0 ? (
            <div className="space-y-3.5">
              {/* Summary Strip */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    إجمالي الديون المستحقة قريباً:
                  </span>
                  <span className="text-sm font-black text-amber-700 dark:text-amber-400 tabular-nums">
                    {formatCurrency(totalReceivableAmount, currency)}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  {todayCount > 0 && (
                    <span className="text-red-600 dark:text-red-400">
                      {todayCount} مستحق اليوم
                    </span>
                  )}
                  {todayCount > 0 && weekCount > 0 && <span>•</span>}
                  {weekCount > 0 && (
                    <span className="text-amber-600 dark:text-amber-400">
                      {weekCount} خلال أسبوع
                    </span>
                  )}
                  {(todayCount > 0 || weekCount > 0) && overdueCount > 0 && <span>•</span>}
                  {overdueCount > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      {overdueCount} متأخر
                    </span>
                  )}
                </div>
              </div>

              {/* Horizontal Scroll Chips for Filters to prevent vertical scroll fatigue on mobile */}
              <div className="relative">
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none text-xs font-bold snap-x" style={{ WebkitOverflowScrolling: 'touch' }}>
                  <button
                    type="button"
                    onClick={() => setFilterTab('all')}
                    className={`px-3.5 py-2.5 rounded-xl transition min-h-[44px] shrink-0 snap-start flex items-center gap-1.5 ${
                      filterTab === 'all'
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span>الكل</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-black/20 text-[10px]">{totalCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterTab('due_today')}
                    className={`px-3.5 py-2.5 rounded-xl transition min-h-[44px] shrink-0 snap-start flex items-center gap-1.5 ${
                      filterTab === 'due_today'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900'
                    }`}
                  >
                    <span>مستحق اليوم</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-black/20 text-[10px]">{todayCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterTab('due_week')}
                    className={`px-3.5 py-2.5 rounded-xl transition min-h-[44px] shrink-0 snap-start flex items-center gap-1.5 ${
                      filterTab === 'due_week'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900'
                    }`}
                  >
                    <span>خلال 7 أيام</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-black/20 text-[10px]">{weekCount}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFilterTab('overdue')}
                    className={`px-3.5 py-2.5 rounded-xl transition min-h-[44px] shrink-0 snap-start flex items-center gap-1.5 ${
                      filterTab === 'overdue'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                    }`}
                  >
                    <span>متأخرات</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-white/20 dark:bg-black/20 text-[10px]">{overdueCount}</span>
                  </button>
                </div>
              </div>

              {/* Alerts List */}
              <div className="space-y-2">
                {filteredAlerts.length === 0 ? (
                  <div className="py-6 text-center text-xs font-bold text-slate-400 dark:text-slate-500">
                    لا توجد تنبيهات مطابقة لهذا الفلتر حالياً.
                  </div>
                ) : (
                  filteredAlerts.map((alert) => {
                    const isOwedToMe = alert.balanceType === 'owed_to_me';
                    return (
                      <div
                        key={alert.id}
                        onClick={() => handleOpenAccount(alert.accountId)}
                        className="group p-3 sm:p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-100/80 dark:bg-slate-800/40 dark:hover:bg-slate-800/70 border border-slate-200/70 dark:border-slate-800 transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        {/* Right: Account Name & Date Status */}
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-900 dark:text-slate-100 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition truncate">
                              {alert.accountName}
                            </span>

                            {alert.phone && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                                <Phone className="w-3 h-3" />
                                <span dir="ltr">{alert.phone}</span>
                              </span>
                            )}

                            {/* Status Badge */}
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${getUrgencyBadgeStyle(
                                alert.urgency
                              )}`}
                            >
                              {getUrgencyIcon(alert.urgency)}
                              <span>{alert.urgencyLabel}</span>
                              <span className="text-slate-400 dark:text-slate-500">
                                ({formatDate(alert.dueDate)})
                              </span>
                            </span>
                          </div>

                          {alert.note && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md">
                              {alert.note}
                            </p>
                          )}
                        </div>

                        {/* Left: Balance & Quick Actions */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/50 dark:border-slate-700/50">
                          <div className="text-start sm:text-end">
                            <span
                              className={`text-sm sm:text-base font-black tabular-nums ${
                                isOwedToMe
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {isOwedToMe ? '+' : '-'} {formatCurrency(alert.balance, currency)}
                            </span>
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                              {isOwedToMe ? 'مستحق لك' : 'مستحق عليك'}
                            </p>
                          </div>

                          {/* Quick Interactive Actions (Touch targets >= 44px on mobile) */}
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => handleSendReminder(e, alert)}
                              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-teal-600 dark:hover:text-teal-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition min-w-[44px] min-h-[44px] flex items-center justify-center border border-slate-200/60 dark:border-slate-700"
                              title="إرسال رسالة تذكير أو مطالبة"
                              aria-label="إرسال تذكير"
                            >
                              <Send className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleScheduleDeadline(e, alert)}
                              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition min-w-[44px] min-h-[44px] flex items-center justify-center border border-slate-200/60 dark:border-slate-700"
                              title="تعديل أو جدولة موعد جديد"
                              aria-label="تعديل موعد الاستحقاق"
                            >
                              <Calendar className="w-4 h-4" />
                            </button>

                            <button
                              type="button"
                              onClick={(e) => handleAddPayment(e, alert)}
                              className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition min-w-[44px] min-h-[44px] flex items-center justify-center border border-slate-200/60 dark:border-slate-700"
                              title="تسجيل دفعة سداد"
                              aria-label="تسجيل دفعة"
                            >
                              <PlusCircle className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            /* Empty State: No Upcoming or Overdue Debts */
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-800/60">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-teal-900 dark:text-teal-200">
                    لا توجد ديون مستحقة السداد قريباً
                  </h4>
                  <p className="text-[11px] text-teal-700 dark:text-teal-400">
                    كافة الحسابات والالتزامات منتظمة، ولا توجد مواعيد سداد مجدولة خلال الـ 7 أيام القادمة.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openScheduleModal(null)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-300 border border-teal-200/80 dark:border-teal-700 hover:bg-teal-100/50 dark:hover:bg-slate-700 transition min-h-[44px] shrink-0"
              >
                <PlusCircle className="w-4 h-4" />
                <span>+ تحديد موعد استحقاق لدين</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
