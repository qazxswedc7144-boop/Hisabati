import React, { useState, useEffect } from 'react';
import {
  X,
  Send,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Calendar,
  Repeat,
  Sparkles,
  Smartphone,
  ExternalLink,
} from 'lucide-react';
import { useMessagingStore, useAccountStore, useUIStore } from '@/shared/stores';
import {
  MessageChannel,
  MessageType,
  RepeatRule,
  MessageTemplate,
} from '@/shared/types';
import { templateRenderer } from '@/core/services/messaging';

export const SendMessageModal: React.FC = () => {
  const {
    isSendMessageModalOpen,
    closeSendMessageModal,
    activeRecipientAccount,
    activeTemplate,
    templates,
    sendMessage,
    scheduleMessage,
    fetchTemplates,
  } = useMessagingStore();

  const { accounts } = useAccountStore();
  const { showToast } = useUIStore();

  // Form states
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [recipientPhone, setRecipientPhone] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [channel, setChannel] = useState<MessageChannel>('whatsapp');
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [scheduleDateTime, setScheduleDateTime] = useState<string>('');
  const [repeatRule, setRepeatRule] = useState<RepeatRule>('once');

  // Dynamic template variables
  const [variables, setVariables] = useState<Record<string, string | number>>({});
  const [customBody, setCustomBody] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  useEffect(() => {
    if (activeRecipientAccount) {
      setSelectedAccountId(activeRecipientAccount.id);
      setRecipientName(activeRecipientAccount.name);
      setRecipientPhone(activeRecipientAccount.phone || '');

      const amountVal = Math.abs(activeRecipientAccount.currentBalance);
      const balanceStr = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(amountVal);

      setVariables({
        customerName: activeRecipientAccount.name,
        amount: balanceStr,
        balance: balanceStr,
        accountName: activeRecipientAccount.name,
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        date: new Date().toISOString().split('T')[0],
        receiptNumber: `REC-${Date.now().toString().slice(-4)}`,
        totalDebit: new Intl.NumberFormat('ar-YE').format(activeRecipientAccount.totalDebit),
        totalCredit: new Intl.NumberFormat('ar-YE').format(activeRecipientAccount.totalCredit),
        businessName: 'حساباتي',
      });
    } else {
      setSelectedAccountId('');
      setRecipientName('');
      setRecipientPhone('');
      setVariables({
        customerName: '',
        amount: '',
        dueDate: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
        date: new Date().toISOString().split('T')[0],
        businessName: 'حساباتي',
      });
    }

    if (activeTemplate) {
      setSelectedTemplateId(activeTemplate.id);
    } else if (templates.length > 0 && !selectedTemplateId) {
      setSelectedTemplateId(templates[0].id);
    }

    // Default scheduled time: tomorrow at 09:00
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setScheduleDateTime(tomorrow.toISOString().slice(0, 16));
  }, [activeRecipientAccount, activeTemplate, templates]);

  if (!isSendMessageModalOpen) return null;

  const handleAccountChange = (accId: string) => {
    setSelectedAccountId(accId);
    const acc = accounts.find((a) => a.id === accId);
    if (acc) {
      setRecipientName(acc.name);
      setRecipientPhone(acc.phone || '');
      const amountVal = Math.abs(acc.currentBalance);
      const balanceStr = new Intl.NumberFormat('ar-YE', { maximumFractionDigits: 2 }).format(amountVal);

      setVariables((prev) => ({
        ...prev,
        customerName: acc.name,
        amount: balanceStr,
        balance: balanceStr,
        accountName: acc.name,
        totalDebit: new Intl.NumberFormat('ar-YE').format(acc.totalDebit),
        totalCredit: new Intl.NumberFormat('ar-YE').format(acc.totalCredit),
      }));
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  // Compute live rendered preview
  let previewText = customBody;
  if (selectedTemplateId && selectedTemplate) {
    const res = templateRenderer.render(selectedTemplate.body, variables);
    previewText = res.renderedText;
  }

  const handleVariableChange = (key: string, val: string) => {
    setVariables((prev) => ({ ...prev, [key]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!recipientPhone && channel !== 'in_app') {
      showToast('يرجى تحديد رقم هاتف المستلم للمتابعة', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isScheduled) {
        if (!scheduleDateTime) {
          showToast('يرجى تحديد موعد وتاريخ الجدولة', 'error');
          setIsSubmitting(false);
          return;
        }

        await scheduleMessage({
          templateId: selectedTemplateId || undefined,
          channel,
          recipient: recipientPhone || recipientName,
          recipientName,
          subject: selectedTemplate?.nameAr || 'رسالة مجدولة',
          bodyTemplate: selectedTemplate ? selectedTemplate.body : customBody,
          variables,
          scheduledAt: new Date(scheduleDateTime).toISOString(),
          repeatRule,
          relatedEntityType: selectedAccountId ? 'account' : undefined,
          relatedEntityId: selectedAccountId || undefined,
        });

        showToast('تمت جدولة الرسالة بنجاح في النظام', 'success');
      } else {
        const result = await sendMessage({
          channel,
          type: selectedTemplate?.type || 'custom',
          recipient: recipientPhone || recipientName,
          recipientName,
          subject: selectedTemplate?.nameAr || 'إشعار تذكير',
          body: previewText,
          templateId: selectedTemplateId || undefined,
          variables,
          relatedEntityType: selectedAccountId ? 'account' : undefined,
          relatedEntityId: selectedAccountId || undefined,
        });

        if (channel === 'whatsapp' && result.whatsAppUrl) {
          window.open(result.whatsAppUrl, '_blank', 'noopener,noreferrer');
          showToast('تم فتح واتساب وجاهزية الرسالة مع توثيقها في السجل', 'success');
        } else if (channel === 'sms') {
          showToast('تم تسجيل الرسالة في السجل (بوابة SMS غير مهيأة بعد)', 'info');
        } else {
          showToast('تم إرسال الإشعار الداخلي بنجاح', 'success');
        }
      }

      closeSendMessageModal();
    } catch (err: unknown) {
      const errText = err instanceof Error ? err.message : 'فشل إرسال أو جدولة الرسالة';
      showToast(errText, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[92vh]"
        role="dialog"
        aria-label="إرسال تذكير أو رسالة"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 flex items-center justify-center border border-teal-200/60 dark:border-teal-800/60 shrink-0">
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
                إرسال تذكير أو رسالة
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                واتساب، SMS، الإشعارات وجدولة التنبيهات
              </p>
            </div>
          </div>

          <button
            onClick={closeSendMessageModal}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs sm:text-sm">
          {/* Recipient Account Select */}
          <div className="space-y-1.5">
            <label className="font-bold text-slate-700 dark:text-slate-300 block">
              الحساب / العميل المستلم
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => handleAccountChange(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden transition min-h-[42px]"
            >
              <option value="">-- اختر حساباً من الدفتر أو أدخل يدوياً --</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} {acc.phone ? `(${acc.phone})` : ''} — {acc.currentBalance >= 0 ? `له ${acc.currentBalance}` : `عليه ${Math.abs(acc.currentBalance)}`}
                </option>
              ))}
            </select>
          </div>

          {/* Recipient Manual Phone & Name if needed */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">
                اسم المستلم
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => {
                  setRecipientName(e.target.value);
                  handleVariableChange('customerName', e.target.value);
                }}
                placeholder="مثال: أحمد علي"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[40px]"
              />
            </div>

            <div className="space-y-1">
              <label className="font-bold text-slate-700 dark:text-slate-300 block">
                رقم الهاتف (واتساب / SMS)
              </label>
              <input
                type="tel"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="مثال: 777123456 أو 967..."
                dir="ltr"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-mono focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[40px] text-end"
              />
            </div>
          </div>

          {/* Channel Selector */}
          <div className="space-y-1.5 pt-1">
            <label className="font-bold text-slate-700 dark:text-slate-300 block">
              قناة الإرسال
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setChannel('whatsapp')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition min-h-[42px] ${
                  channel === 'whatsapp'
                    ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>واتساب</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('sms')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition min-h-[42px] ${
                  channel === 'sms'
                    ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-blue-600" />
                <span>رسائل SMS</span>
              </button>

              <button
                type="button"
                onClick={() => setChannel('in_app')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 border transition min-h-[42px] ${
                  channel === 'in_app'
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 text-teal-600" />
                <span>إشعار داخلي</span>
              </button>
            </div>
          </div>

          {/* Template Selection */}
          <div className="space-y-1.5 pt-1">
            <label className="font-bold text-slate-700 dark:text-slate-300 block">
              قالب الرسالة المعتمد
            </label>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 font-semibold focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden min-h-[42px]"
            >
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.nameAr}
                </option>
              ))}
              <option value="">-- نص مخصص بالكامل --</option>
            </select>
          </div>

          {/* Template Variables Inputs */}
          {selectedTemplate && selectedTemplate.variables.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 space-y-2.5">
              <span className="text-[11px] font-extrabold text-slate-600 dark:text-slate-400 block">
                متغيرات القالب الديناميكية:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {selectedTemplate.variables.includes('amount') && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">المبلغ</label>
                    <input
                      type="text"
                      value={variables['amount'] || ''}
                      onChange={(e) => handleVariableChange('amount', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                    />
                  </div>
                )}
                {selectedTemplate.variables.includes('dueDate') && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">تاريخ الاستحقاق</label>
                    <input
                      type="date"
                      value={variables['dueDate'] || ''}
                      onChange={(e) => handleVariableChange('dueDate', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                    />
                  </div>
                )}
                {selectedTemplate.variables.includes('receiptNumber') && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">رقم السند</label>
                    <input
                      type="text"
                      value={variables['receiptNumber'] || ''}
                      onChange={(e) => handleVariableChange('receiptNumber', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                    />
                  </div>
                )}
                {selectedTemplate.variables.includes('balance') && (
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">الرصيد المتبقي</label>
                    <input
                      type="text"
                      value={variables['balance'] || ''}
                      onChange={(e) => handleVariableChange('balance', e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Real-Time Live Message Preview */}
          <div className="space-y-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-teal-600" />
                <span>معاينة نص الرسالة الفعلي (Live Preview):</span>
              </span>
              <span className="text-[10px] text-slate-400">عربي RTL معتمد</span>
            </span>

            {selectedTemplateId ? (
              <div className="p-3.5 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-800/60 text-slate-800 dark:text-slate-200 text-xs leading-relaxed whitespace-pre-line font-medium min-h-[80px]">
                {previewText || 'جاري توليد نص الرسالة...'}
              </div>
            ) : (
              <textarea
                value={customBody}
                onChange={(e) => setCustomBody(e.target.value)}
                placeholder="اكتب نص الرسالة هنا..."
                rows={4}
                className="w-full p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-xs leading-relaxed font-medium focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 outline-hidden"
              />
            )}
          </div>

          {/* Scheduling Toggle & Options */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-600" />
                <span>جدولة الرسالة لوقت لاحق (Scheduler)</span>
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => setIsScheduled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
              </label>
            </div>

            {isScheduled && (
              <div className="p-3.5 rounded-2xl bg-teal-50/40 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60 space-y-3 animate-in fade-in">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      تاريخ ووقت الإرسال
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduleDateTime}
                      onChange={(e) => setScheduleDateTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      قاعدة التكرار (Repeat Rule)
                    </label>
                    <select
                      value={repeatRule}
                      onChange={(e) => setRepeatRule(e.target.value as RepeatRule)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
                    >
                      <option value="once">مرة واحدة فقط</option>
                      <option value="daily">يومياً</option>
                      <option value="weekly">أسبوعياً</option>
                      <option value="monthly">شهرياً</option>
                    </select>
                  </div>
                </div>
                <p className="text-[11px] text-teal-800 dark:text-teal-300 leading-normal">
                  * يتم حفظ الرسالة المجدولة محلياً وتفعيلها آلياً عند تشغيل التطبيق في الموعد المحدد.
                </p>
              </div>
            )}
          </div>

          {/* Modal Action Buttons */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={closeSendMessageModal}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition min-h-[44px]"
            >
              إلغاء
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold shadow-md shadow-teal-600/20 transition flex items-center gap-2 min-h-[44px] disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>جارٍ المعالجة...</span>
              ) : isScheduled ? (
                <>
                  <Clock className="w-4 h-4" />
                  <span>تأكيد جدولة الرسالة</span>
                </>
              ) : channel === 'whatsapp' ? (
                <>
                  <ExternalLink className="w-4 h-4" />
                  <span>فتح واتساب وتوثيق الرسالة</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>إرسال وتوثيق</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
