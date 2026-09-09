import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Settings,
  Shield,
  Users,
  Bell,
  Cloud,
  Lock,
  FileText,
  Activity,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Layers,
  FileCheck,
  Bot,
  ScanLine,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';
import { formatNumber } from '@/core/utils/formatters';
import { useI18n } from '@/shared/hooks/useI18n';
import { runFinancialEngineTests, EngineTestSuiteResult } from '@/core/tests/transactionEngine.test';
import { ReportsTestSuite, TestResult as ReportTestResult } from '@/core/tests/reports.test';
import { CloudSyncTestSuite, TestResult as CloudSyncTestResult } from '@/core/tests/cloudSync.test';
import { MessagingTestSuite, MessagingTestSuiteResult } from '@/core/tests/messaging.test';
import { AITestSuite, AITestSuiteResult } from '@/core/tests/ai.test';
import { OCRTestSuite, OCRTestSuiteSummary } from '@/core/tests/ocr.test';
import { SettingsTestSuite, SettingsTestSuiteResult } from '@/core/tests/settings.test';
import { MessagingSettingsSection } from '@/features/messaging/components/MessagingSettingsSection';
import {
  BusinessProfileSection,
  AppearanceSection,
  LanguageSection,
  CurrencySection,
  InvoicePreferencesSection,
  DataControlCenter,
} from '../components';

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { settings, updateSettings } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  // Diagnostics Panel Toggle
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Diagnostic Test Suites States
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [testSuiteResult, setTestSuiteResult] = useState<EngineTestSuiteResult | null>(null);

  const [isRunningReportTests, setIsRunningReportTests] = useState(false);
  const [reportTestSuiteResult, setReportTestSuiteResult] = useState<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: ReportTestResult[];
  } | null>(null);

  const [isRunningCloudSyncTests, setIsRunningCloudSyncTests] = useState(false);
  const [cloudSyncTestSuiteResult, setCloudSyncTestSuiteResult] = useState<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: CloudSyncTestResult[];
  } | null>(null);

  const [isRunningMessagingTests, setIsRunningMessagingTests] = useState(false);
  const [messagingTestSuiteResult, setMessagingTestSuiteResult] = useState<MessagingTestSuiteResult | null>(null);

  const [isRunningAITests, setIsRunningAITests] = useState(false);
  const [aiTestSuiteResult, setAiTestSuiteResult] = useState<AITestSuiteResult | null>(null);

  const [isRunningOCRTests, setIsRunningOCRTests] = useState(false);
  const [ocrTestSuiteResult, setOcrTestSuiteResult] = useState<OCRTestSuiteSummary | null>(null);

  const [isRunningSettingsTests, setIsRunningSettingsTests] = useState(false);
  const [settingsTestSuiteResult, setSettingsTestSuiteResult] = useState<SettingsTestSuiteResult | null>(null);

  // FAQ Accordion State
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  // Handlers
  // Test Suite Triggers
  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const result = await runFinancialEngineTests();
      setTestSuiteResult(result);
      showToast(
        `اكتملت الاختبارات: ${result.passed} نجح من أصل ${result.total}`,
        result.failed === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل حزمة الاختبارات', 'error');
    } finally {
      setIsRunningTests(false);
    }
  };

  const handleRunReportTests = async () => {
    setIsRunningReportTests(true);
    try {
      const result = await ReportsTestSuite.runAllTests();
      setReportTestSuiteResult(result);
      showToast(
        `اكتملت اختبارات التقارير: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل اختبارات التقارير', 'error');
    } finally {
      setIsRunningReportTests(false);
    }
  };

  const handleRunCloudSyncTests = async () => {
    setIsRunningCloudSyncTests(true);
    try {
      const result = await CloudSyncTestSuite.runAllTests();
      setCloudSyncTestSuiteResult(result);
      showToast(
        `اكتملت اختبارات المزامنة: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل اختبارات المزامنة والسحابة', 'error');
    } finally {
      setIsRunningCloudSyncTests(false);
    }
  };

  const handleRunMessagingTests = async () => {
    setIsRunningMessagingTests(true);
    try {
      const result = await MessagingTestSuite.runAllTests();
      setMessagingTestSuiteResult(result);
      showToast(
        `اكتملت اختبارات الرسائل: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل اختبارات الرسائل والتنبيهات', 'error');
    } finally {
      setIsRunningMessagingTests(false);
    }
  };

  const handleRunAITests = async () => {
    setIsRunningAITests(true);
    try {
      const result = await AITestSuite.runAllTests();
      setAiTestSuiteResult(result);
      showToast(
        `اكتملت اختبارات المساعد الذكي: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل حزمة اختبارات الذكاء الاصطناعي', 'error');
    } finally {
      setIsRunningAITests(false);
    }
  };

  const handleRunOCRTests = async () => {
    setIsRunningOCRTests(true);
    try {
      const result = await OCRTestSuite.runAll();
      setOcrTestSuiteResult(result);
      showToast(
        `اكتملت اختبارات OCR: ${result.passed} نجح من أصل ${result.total}`,
        result.failed === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل اختبارات OCR', 'error');
    } finally {
      setIsRunningOCRTests(false);
    }
  };

  const handleRunSettingsTests = async () => {
    setIsRunningSettingsTests(true);
    try {
      const result = await SettingsTestSuite.runAll();
      setSettingsTestSuiteResult(result);
      showToast(
        `اكتملت اختبارات الإعدادات والفواتير: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل اختبارات الإعدادات والفواتير', 'error');
    } finally {
      setIsRunningSettingsTests(false);
    }
  };

  return (
    <div id="settings-page" className="space-y-6 max-w-4xl animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Settings className="w-6 h-6 text-teal-600" />
          {t('settings.title')}
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          مركز التحكم الشامل بالإعدادات، العملة، الأمان، المزامنة، الفريق، وإدارة البيانات
        </p>
      </div>

      {/* 1. إعدادات المنشأة والنشاط التجاري (Business Profile & Branding) */}
      <BusinessProfileSection />

      {/* 2. المظهر ونمط العرض (Appearance & Theme) */}
      <AppearanceSection />

      {/* 3. لغة التطبيق وتوجيه الواجهة (Language & Direction) */}
      <LanguageSection />

      {/* 4. العملة الرئيسية للنظام (Base System Currency) */}
      <CurrencySection />

      {/* 5. التفضيلات التشغيلية ونمط الفواتير (Operational & Invoice Preferences) */}
      <InvoicePreferencesSection />

      {/* 6. الأمان وقفل التطبيق (Security & Privacy) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-600" />
            <span>الأمان وحماية السجلات</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            بياناتك مشفرة ومخزنة محلياً في جهازك بدون أي مشاركة خارجية
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
            <span className="font-bold text-slate-900 dark:text-slate-100 block">
              🔒 تخزين محلي معزول 100%
            </span>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              جميع العمليات والأرصدة محفوظة داخل IndexedDB المحلي على جهازك ولا تمر عبر خوادم مركزية غير مصرح بها.
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
            <span className="font-bold text-slate-900 dark:text-slate-100 block">
              🛡️ تشفير SHA-256 للنسخ
            </span>
            <p className="text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed">
              تحتوي كل نسخة احتياطية على توقيع رقمي مشفر يمنع التلاعب بالسجلات المالية قبل الاستعادة.
            </p>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/80 dark:border-teal-900/60 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-600 shrink-0" />
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-100 block">
                قفل التطبيق برمز PIN أو البصمة
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                ميزة اختيارية لحماية الخصوصية عند فتح التطبيق
              </span>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-bold">
            ميزة المرحلة 11
          </span>
        </div>
      </section>

      {/* 5. إدارة الفريق والصلاحيات (Users & Roles) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-teal-600" />
              <span>إدارة الفريق والصلاحيات (Team & Roles)</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              التحكم في أدوار المستخدمين وسجلات التدقيق المحاسبي (RBAC)
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/team')}
            className="px-3.5 py-2 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/60 transition flex items-center gap-1.5 min-h-[40px]"
          >
            <span>فتح شاشة الفريق</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
          <div>
            <span className="font-bold text-slate-900 dark:text-slate-100 block">
              دورك الحالي: المدير العام (Admin)
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              صلاحيات كاملة لإدارة الحسابات، التعديل المالي، وإجراء المزامنة والنسخ
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-bold text-[10px]">
            نشط
          </span>
        </div>
      </section>

      {/* 6. التنبيهات والأتمتة والرسائل (Notifications & Automation) */}
      <MessagingSettingsSection />

      {/* 7. مركز التحكم بالبيانات والنسخ الاحتياطي والمزامنة (Data Control Center) */}
      <DataControlCenter />

      {/* 8. التكامل والخصوصية (Integrations & Privacy) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-teal-600" />
            <span>التكامل والخصوصية (Integrations & Privacy)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            السياسات والضوابط الصارمة لخصوصية السجلات المالية
          </p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-xs space-y-2 text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100">
            <ShieldAlert className="w-4 h-4 text-teal-600" />
            <span>ميثاق النزاهة والخصوصية المحاسبية:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
            <li>التطبيق لا يحتوي على أي أكواد تتبع أو إعلانات تجارية أو تحليلات سرية.</li>
            <li>لا يتم إرسال أي معاملات أو مبالغ لنماذج الذكاء الاصطناعي دون طلب وموافقة صريحة.</li>
            <li>تظل بيانات Google Drive في مساحتك الشخصية المعزولة ولا يمكن للمطور أو خوادم وسيطة قراءتها.</li>
          </ul>
        </div>
      </section>

      {/* 9. المساعدة والدعم ومعلومات الإصدار (Help & Support) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-teal-600" />
              <span>المساعدة والدعم ومعلومات الإصدار</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              إرشادات الاستخدام والأسئلة الأكثر شيوعاً
            </p>
          </div>
          <span className="text-xs font-bold font-mono px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            v1.0.0
          </span>
        </div>

        {/* FAQ list */}
        <div className="space-y-2">
          {[
            {
              q: 'كيف تعمل المزامنة في حال انقطاع الإنترنت؟',
              a: 'يعمل التطبيق بشكل كامل وبأعلى كفاءة في وضع عدم الاتصال (Offline-First). تسجل جميع المعاملات في طابور المزامنة المحلي وتنتقل تلقائياً إلى السحابة فور عودة الاتصال دون أي تدخل منك.',
            },
            {
              q: 'كيف يتعامل النظام مع تعارض التعديل من جهازين مختلفين؟',
              a: 'عند تعديل نفس الحساب أو المعاملة على جهازين دون اتصال، يرصد محرك المزامنة التعارض تلقائياً ويقوم بعزله في مركز التحكم ليمنحك خيار اعتماد النسخة المحلية أو نسخة السحابة بأمان محاسبي تام.',
            },
            {
              q: 'هل يمكنني استعادة بياناتي إذا قمت بتغيير هاتفي؟',
              a: 'نعم، بكل سهولة. يمكنك ربط حساب Google Drive في الهاتف الجديد واستعادة أحدث نسخة احتياطية بضغطة زر واحدة، أو تصدير ملف JSON مشفر من الهاتف القديم واستيراده مباشرة.',
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                className="w-full p-3.5 flex items-center justify-between text-start text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition min-h-[44px]"
              >
                <span>{item.q}</span>
                <span className="text-slate-400">
                  {expandedFaq === idx ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              </button>
              {expandedFaq === idx && (
                <div className="p-3.5 pt-0 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 10. أدوات التشخيص والصيانة البرمجية المتقدمة (Diagnostic & Dev Tools) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setShowDiagnostics(!showDiagnostics)}
          className="w-full p-5 sm:p-6 flex items-center justify-between text-start hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center">
              <Activity className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>أدوات التشخيص والصيانة البرمجية</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                  6 حزم اختبارات
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                فحص أداء محركات النظام، المزامنة، التقارير، والذكاء الاصطناعي مباشرة
              </p>
            </div>
          </div>
          <div className="text-slate-400">
            {showDiagnostics ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {showDiagnostics && (
          <div className="p-5 sm:p-6 pt-0 border-t border-slate-100 dark:border-slate-800/60 space-y-4 animate-in fade-in duration-150">
            <p className="text-xs text-slate-500 dark:text-slate-400 pt-3">
              تشغيل حزم الاختبارات البرمجية للتأكد من جاهزية المحاسبة الآلية، السحابة، كشف الحسابات وقراءة الفواتير:
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Layers className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
                <span>{isRunningTests ? 'جارٍ الفحص...' : 'المحرك المالي (12 اختبار)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunReportTests}
                disabled={isRunningReportTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <FileCheck className={`w-3.5 h-3.5 ${isRunningReportTests ? 'animate-spin' : ''}`} />
                <span>{isRunningReportTests ? 'جارٍ الفحص...' : 'التقارير وExcel/PDF (7 اختبارات)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunCloudSyncTests}
                disabled={isRunningCloudSyncTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Cloud className={`w-3.5 h-3.5 ${isRunningCloudSyncTests ? 'animate-spin' : ''}`} />
                <span>{isRunningCloudSyncTests ? 'جارٍ الفحص...' : 'المزامنة والسحابة (7 اختبارات)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunMessagingTests}
                disabled={isRunningMessagingTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Layers className={`w-3.5 h-3.5 ${isRunningMessagingTests ? 'animate-spin' : ''}`} />
                <span>{isRunningMessagingTests ? 'جارٍ الفحص...' : 'الرسائل والتنبيهات (20 اختبار)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunAITests}
                disabled={isRunningAITests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Bot className={`w-3.5 h-3.5 ${isRunningAITests ? 'animate-spin' : ''}`} />
                <span>{isRunningAITests ? 'جارٍ الفحص...' : 'المساعد الذكي (24 اختبار)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunOCRTests}
                disabled={isRunningOCRTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <ScanLine className={`w-3.5 h-3.5 ${isRunningOCRTests ? 'animate-spin' : ''}`} />
                <span>{isRunningOCRTests ? 'جارٍ الفحص...' : 'قراءة الفواتير وOCR (18 اختبار)'}</span>
              </button>
            </div>

            {/* Test Results Cards */}
            {testSuiteResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    نتائج المحرك المالي: {formatNumber(testSuiteResult.passed)} / {formatNumber(testSuiteResult.total)} نجاح تام
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">{testSuiteResult.durationMs}ms</span>
                </div>
              </div>
            )}

            {reportTestSuiteResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    نتائج التقارير وExcel/PDF: {formatNumber(reportTestSuiteResult.passedCount)} / {formatNumber(reportTestSuiteResult.totalCount)} نجاح تام
                  </span>
                </div>
              </div>
            )}

            {cloudSyncTestSuiteResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    نتائج المزامنة والسحابة: {formatNumber(cloudSyncTestSuiteResult.passedCount)} / {formatNumber(cloudSyncTestSuiteResult.totalCount)} نجاح تام
                  </span>
                </div>
              </div>
            )}

            {messagingTestSuiteResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    نتائج الرسائل والتنبيهات: {formatNumber(messagingTestSuiteResult.passedCount)} / {formatNumber(messagingTestSuiteResult.totalCount)} نجاح تام
                  </span>
                </div>
              </div>
            )}

            {aiTestSuiteResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-teal-600" />
                    نتائج المساعد الذكي: {formatNumber(aiTestSuiteResult.passedCount)} / {formatNumber(aiTestSuiteResult.totalCount)} نجاح تام
                  </span>
                </div>
              </div>
            )}

            {ocrTestSuiteResult && (
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-slate-900 dark:text-slate-100">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-sky-600" />
                    نتائج قراءة الفواتير وOCR: {formatNumber(ocrTestSuiteResult.passed)} / {formatNumber(ocrTestSuiteResult.total)} نجاح تام
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">{ocrTestSuiteResult.durationMs}ms</span>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
