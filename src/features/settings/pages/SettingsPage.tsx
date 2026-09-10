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
  SecurityIntegritySection,
  TeamAccessSection,
  HelpSupportSection,
  PrivacyIntegrationsSection,
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

      {/* 6. الأمان وسلامة البيانات (Security & Financial Integrity) */}
      <SecurityIntegritySection />

      {/* 7. إدارة الفريق والوصول (Users & Roles) */}
      <TeamAccessSection />

      {/* 6. التنبيهات والأتمتة والرسائل (Notifications & Automation) */}
      <MessagingSettingsSection />

      {/* 9. مركز التحكم بالبيانات والنسخ الاحتياطي والمزامنة (Data Control Center) */}
      <DataControlCenter />

      {/* 10. التكامل والخصوصية (Integrations & Privacy) */}
      <PrivacyIntegrationsSection />

      {/* 11. المساعدة والدعم ومعلومات الإصدار (Help & Support) */}
      <HelpSupportSection />

      {/* 12. أدوات التشخيص والصيانة البرمجية المتقدمة (Diagnostic & Dev Tools) */}
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
