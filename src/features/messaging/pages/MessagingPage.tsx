import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Clock,
  FileText,
  Send,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Smartphone,
  ShieldCheck,
  Play,
  Pause,
  Trash2,
  Layers,
  Radio,
} from 'lucide-react';
import { useMessagingStore, useUIStore } from '@/shared/stores';
import {
  AppMessage,
  MessageChannel,
  MessageStatus,
  ScheduledMessage,
  MessageTemplate,
} from '@/shared/types';
import { messagingService, defaultWhatsAppProvider } from '@/core/services/messaging';
import { MessagingTestSuite, MessagingTestSuiteResult } from '@/core/tests/messaging.test';

export const MessagingPage: React.FC = () => {
  const {
    messages,
    scheduledMessages,
    templates,
    isLoading,
    fetchMessages,
    fetchScheduledMessages,
    fetchTemplates,
    openSendMessageModal,
    cancelSchedule,
    pauseSchedule,
    resumeSchedule,
    checkDueSchedules,
  } = useMessagingStore();

  const { showToast } = useUIStore();

  const [activeTab, setActiveTab] = useState<'history' | 'scheduled' | 'templates' | 'providers'>('history');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Automated Test Suite State
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testSuiteResult, setTestSuiteResult] = useState<MessagingTestSuiteResult | null>(null);

  useEffect(() => {
    fetchMessages();
    fetchScheduledMessages();
    fetchTemplates();
    checkDueSchedules();
  }, [fetchMessages, fetchScheduledMessages, fetchTemplates, checkDueSchedules]);

  const handleRunMessagingTests = async () => {
    setIsRunningTests(true);
    try {
      const result = await MessagingTestSuite.runAllTests();
      setTestSuiteResult(result);
      await fetchMessages();
      await fetchScheduledMessages();
      await fetchTemplates();
      showToast(
        `اكتملت اختبارات الرسائل والأتمتة: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e) {
      showToast('فشل تشغيل حزمة اختبارات الرسائل والأتمتة', 'error');
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleOpenWhatsAppAgain = (msg: AppMessage) => {
    const url = defaultWhatsAppProvider.generateWhatsAppUrl(msg.recipient, msg.body);
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('تم فتح واتساب بالرسالة المجهزة', 'success');
  };

  // Filtered Messages
  const filteredMessages = messages.filter((m) => {
    if (channelFilter !== 'all' && m.channel !== channelFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchName = m.recipientName?.toLowerCase().includes(query);
      const matchPhone = m.recipient.toLowerCase().includes(query);
      const matchBody = m.body.toLowerCase().includes(query);
      if (!matchName && !matchPhone && !matchBody) return false;
    }
    return true;
  });

  const getStatusBadge = (status: MessageStatus) => {
    switch (status) {
      case 'ready_to_send':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>مجهز للإرسال</span>
          </span>
        );
      case 'sent':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>تم الإرسال</span>
          </span>
        );
      case 'not_configured':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <AlertCircle className="w-3 h-3" />
            <span>بوابة غير مهيأة</span>
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3 h-3" />
            <span>فشل</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <Clock className="w-3 h-3" />
            <span>معلق</span>
          </span>
        );
    }
  };

  const getChannelBadge = (channel: MessageChannel) => {
    switch (channel) {
      case 'whatsapp':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
            <Smartphone className="w-3.5 h-3.5" />
            <span>واتساب</span>
          </span>
        );
      case 'sms':
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>SMS</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-xs font-bold text-teal-600 dark:text-teal-400">
            <FileText className="w-3.5 h-3.5" />
            <span>إشعار داخلي</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* Top Header Card */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60 shrink-0">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              الرسائل والتنبيهات
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold">
                Phase 5
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              إدارة تذكيرات الديون، رسائل واتساب، SMS، القوالب، وجدولة الإشعارات
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => handleRunMessagingTests()}
            disabled={isRunningTests}
            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/50 transition min-h-[42px] disabled:opacity-50"
          >
            <Layers className={`w-4 h-4 ${isRunningTests ? 'animate-spin' : ''}`} />
            <span>{isRunningTests ? 'جارٍ الفحص...' : 'فحص الأتمتة (Phase 5)'}</span>
          </button>

          <button
            onClick={() => openSendMessageModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs shadow-md shadow-teal-600/20 transition min-h-[42px]"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>رسالة / تذكير جديد</span>
          </button>
        </div>
      </div>

      {/* Test Suite Card Report if Run */}
      {testSuiteResult && (
        <div className="rounded-3xl border border-teal-200 dark:border-teal-800/80 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>نتائج اختبارات الرسائل والأتمتة (Phase 5): {testSuiteResult.passedCount}/{testSuiteResult.totalCount} نجاح تام</span>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto text-xs">
            {testSuiteResult.results.map((r) => (
              <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{r.nameAr}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs sm:text-sm font-bold overflow-x-auto no-scrollbar">
        {[
          { id: 'history', label: `سجل الرسائل (${messages.length})`, icon: MessageSquare },
          { id: 'scheduled', label: `الرسائل المجدولة (${scheduledMessages.length})`, icon: Clock },
          { id: 'templates', label: `القوالب المعتمدة (${templates.length})`, icon: FileText },
          { id: 'providers', label: 'بوابات الإرسال (Providers)', icon: Radio },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition whitespace-nowrap min-h-[42px] ${
              activeTab === tab.id
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث بالاسم، الرقم، أو النص..."
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[38px]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto text-xs">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold min-h-[38px]"
              >
                <option value="all">كافة القنوات</option>
                <option value="whatsapp">واتساب (WhatsApp)</option>
                <option value="sms">رسائل SMS</option>
                <option value="in_app">إشعار داخلي</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-semibold min-h-[38px]"
              >
                <option value="all">كافة الحالات</option>
                <option value="ready_to_send">مجهز للإرسال</option>
                <option value="sent">تم الإرسال</option>
                <option value="not_configured">غير مهيأ</option>
                <option value="failed">فشل</option>
              </select>

              <button
                onClick={() => fetchMessages()}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-teal-600 transition min-h-[38px] min-w-[38px] flex items-center justify-center"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages List */}
          {filteredMessages.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-bold text-slate-700 dark:text-slate-300">لا توجد رسائل مطابقة للفلتر</p>
              <p className="text-xs mt-1">اضغط على زر "رسالة / تذكير جديد" لإرسال تذكير أو إشعار.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMessages.map((msg) => (
                <div
                  key={msg.id}
                  className="p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        {msg.recipientName || 'مستلم غير مسمى'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        ({messagingService.maskPhoneNumber(msg.recipient)})
                      </span>
                      {getChannelBadge(msg.channel)}
                    </div>

                    <div className="flex items-center gap-2">
                      {getStatusBadge(msg.status)}
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(msg.createdAt).toLocaleDateString('ar-YE', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 text-xs leading-relaxed whitespace-pre-line font-medium border border-slate-100 dark:border-slate-800">
                    {msg.body}
                  </div>

                  {msg.errorMessage && (
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{msg.errorMessage}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-mono text-slate-400">
                      ID: {msg.operationId}
                    </span>

                    {msg.channel === 'whatsapp' && (
                      <button
                        onClick={() => handleOpenWhatsAppAgain(msg)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs hover:bg-emerald-100 transition min-h-[36px]"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>فتح في واتساب</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SCHEDULED MESSAGES */}
      {activeTab === 'scheduled' && (
        <div className="space-y-4">
          {scheduledMessages.length === 0 ? (
            <div className="p-12 text-center rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-bold text-slate-700 dark:text-slate-300">لا توجد رسائل مجدولة حالياً</p>
              <p className="text-xs mt-1">يمكنك جدولة تذكير آلي عند إنشاء رسالة جديدة وتحديد موعد الإرسال.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {scheduledMessages.map((sched) => (
                <div
                  key={sched.id}
                  className="p-4 sm:p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                        {sched.recipientName || sched.recipient}
                      </span>
                      {getChannelBadge(sched.channel)}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                        التكرار: {sched.repeatRule === 'once' ? 'مرة واحدة' : sched.repeatRule === 'daily' ? 'يومياً' : sched.repeatRule === 'weekly' ? 'أسبوعياً' : 'شهرياً'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                        sched.status === 'active'
                          ? 'bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                          : sched.status === 'paused'
                          ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {sched.status === 'active' ? 'نشطة' : sched.status === 'paused' ? 'متوقفة مؤقتاً' : 'مكتملة'}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">
                      موعد التشغيل القادم: {sched.nextRunAt ? new Date(sched.nextRunAt).toLocaleString('ar-YE') : 'مكتملة'}
                    </p>
                    <p className="text-slate-500 line-clamp-2">{sched.bodyTemplate}</p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {sched.status === 'active' && (
                      <button
                        onClick={() => pauseSchedule(sched.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-amber-300 text-amber-700 dark:text-amber-300 text-xs font-bold hover:bg-amber-50 dark:hover:bg-amber-950/40 transition min-h-[36px]"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        <span>إيقاف مؤقت</span>
                      </button>
                    )}

                    {sched.status === 'paused' && (
                      <button
                        onClick={() => resumeSchedule(sched.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-teal-300 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-50 dark:hover:bg-teal-950/40 transition min-h-[36px]"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>استئناف</span>
                      </button>
                    )}

                    <button
                      onClick={() => cancelSchedule(sched.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-bold transition min-h-[36px]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>إلغاء الجدولة</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: TEMPLATES */}
      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="p-5 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">
                  {tpl.nameAr}
                </h3>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-bold border border-teal-200/60 dark:border-teal-800/60">
                  {tpl.type}
                </span>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed border border-slate-100 dark:border-slate-800">
                {tpl.body}
              </div>

              <div className="space-y-1">
                <span className="text-[11px] font-bold text-slate-400 block">المتغيرات المدعومة:</span>
                <div className="flex flex-wrap gap-1.5">
                  {tpl.variables.map((v) => (
                    <span
                      key={v}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold"
                    >
                      {`{${v}}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 4: PROVIDERS ARCHITECTURE STATUS */}
      {activeTab === 'providers' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* WhatsApp Client Card */}
            <div className="p-5 rounded-3xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/30 dark:bg-emerald-950/20 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">واتساب المباشر</h3>
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">نشط وجاهز</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                يجهز نصوص الرسائل مع المتغيرات الحسابية ويفتح تطبيق واتساب الرسمي لدى المستخدم للإرسال الفوري المباشر.
              </p>
            </div>

            {/* SMS Gateway Architecture Card */}
            <div className="p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">بوابة SMS العالمية</h3>
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">غير مهيأة (Not Configured)</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                المعمارية مهيأة للربط المباشر مع مزودي SMS (مثل Twilio أو Unifonic) عبر خادم خلفي آمن في المراحل المتقدمة.
              </p>
            </div>

            {/* In-App & Web Push Card */}
            <div className="p-5 rounded-3xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/30 dark:bg-teal-950/20 shadow-xs space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-100">الإشعارات والتنبيهات</h3>
                  <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400">نشط ومدمج محلياً</span>
                </div>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                تنبيهات فورية داخل التطبيق مع دعم Web Notifications لإشعارك بتحديثات الحسابات والنسخ والمزامنة.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
