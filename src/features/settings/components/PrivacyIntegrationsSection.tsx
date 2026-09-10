import React from 'react';
import { 
  ShieldCheck, 
  Lock, 
  EyeOff, 
  Share2, 
  ServerOff,
  Cloud,
  ShieldAlert
} from 'lucide-react';
import { useSettingsStore } from '@/shared/stores';

export const PrivacyIntegrationsSection: React.FC = () => {
  const { settings, updateSettings } = useSettingsStore();

  return (
    <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>الخصوصية والتكامل (Privacy & Integrations)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            إدارة ضوابط خصوصية البيانات والاتصال بالخدمات الخارجية
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Integrity Pact Card */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <ShieldAlert className="w-4 h-4 text-teal-600" />
            <span>ميثاق النزاهة والخصوصية المحاسبية:</span>
          </div>
          <ul className="space-y-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1 shrink-0" />
              <span>التطبيق لا يحتوي على أي أكواد تتبع (Trackers) أو إعلانات أو تحليلات سلوكية خارجية.</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1 shrink-0" />
              <span>لا يتم إرسال أي مبالغ مالية أو تفاصيل معاملات لنماذج الذكاء الاصطناعي إلا بطلب صريح منك.</span>
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1 shrink-0" />
              <span>تظل بيانات Google Drive في مساحتك الشخصية المعزولة ولا يمكن للمطور أو خوادم وسيطة قراءتها.</span>
            </li>
          </ul>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {/* AI Assistance Data Privacy */}
          <div className="py-3.5 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-xs sm:text-sm">
                <Lock className="w-4 h-4 text-teal-600" />
                <span>تحليل البيانات عبر الذكاء الاصطناعي</span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                السماح للمساعد الذكي بمعالجة أرقام الحسابات لتقديم تحليلات مالية متقدمة
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.enableAIDataAnalysis !== false}
                onChange={(e) => updateSettings({ enableAIDataAnalysis: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
            </label>
          </div>

          {/* Anonymous Telemetry (Disabled by default) */}
          <div className="py-3.5 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-xs sm:text-sm">
                <ServerOff className="w-4 h-4 text-slate-400" />
                <span>مشاركة تقارير الأخطاء البرمجية (اختياري)</span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                إرسال تقارير الأعطال التقنية فقط بدون أي بيانات مالية لتحسين استقرار التطبيق
              </p>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={settings.enableErrorReporting === true}
                onChange={(e) => updateSettings({ enableErrorReporting: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-slate-200 peer-focus:outline-hidden rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-slate-600 peer-checked:bg-teal-600"></div>
            </label>
          </div>

          {/* Third Party Backup Connectors (Google Drive) */}
          <div className="py-3.5 flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 text-xs sm:text-sm">
                <Cloud className="w-4 h-4 text-teal-600" />
                <span>ربط التخزين السحابي (Google Drive)</span>
              </span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                تمكين التكامل التقني مع مساحة التخزين الخاصة بك للنسخ الاحتياطي
              </p>
            </div>
            
            <div className="px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-400 text-[10px] font-bold">
              نشط برمجياً
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
