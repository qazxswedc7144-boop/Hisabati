import React, { useState, useMemo } from 'react';
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
  Building2,
  Palette,
  Globe,
  Coins,
  Receipt,
  Database,
  Search,
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

interface CategoryConfig {
  id: string;
  title: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  keywords: string[];
  components: React.ReactNode[];
}

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { settings, updateSettings } = useSettingsStore();
  const showToast = useUIStore((state) => state.showToast);

  // Search query state
  const [searchQuery, setSearchQuery] = useState('');

  // Open categories accordion state (default open general or all closed for compact view)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    general: true,
    operations: false,
    security: false,
    messaging: false,
    data: false,
    support: false,
    diagnostics: false,
  });

  const toggleCategory = (catId: string) => {
    setOpenCategories((prev) => ({
      ...prev,
      [catId]: !prev[catId],
    }));
  };

  // Diagnostics Panel Toggle inside support or diagnostics category
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

  // Test Suite Handlers
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

  // Categories definition
  const categories: CategoryConfig[] = [
    {
      id: 'general',
      title: 'إعدادات المنشأة والهوية',
      description: 'الملف التجاري، الشعار، العملة الأساسية، لغة التطبيق، ونمط العرض',
      icon: Building2,
      keywords: ['منشأة', 'شركة', 'عملة', 'لغة', 'مظهر', 'شعار', 'اسم', 'currency', 'language', 'appearance'],
      components: [
        <BusinessProfileSection key="bp" />,
        <CurrencySection key="cur" />,
        <LanguageSection key="lang" />,
        <AppearanceSection key="app" />,
      ],
    },
    {
      id: 'operations',
      title: 'الفواتير والتفضيلات التشغيلية',
      description: 'تخصيص الفواتير، الضرائب، وشروط الطباعة',
      icon: Receipt,
      keywords: ['فواتير', 'ضريبة', 'طباعة', 'تفضيلات', 'invoice', 'tax'],
      components: [<InvoicePreferencesSection key="inv" />],
    },
    {
      id: 'security',
      title: 'الأمان الصلاحيات وفريق العمل',
      description: 'إدارة المستخدمين، الأدوار، الصلاحيات، وكلمات المرور',
      icon: Shield,
      keywords: ['أمان', 'صلاحيات', 'فريق', 'مستخدمين', 'كلمة مرور', 'security', 'team', 'roles'],
      components: [<SecurityIntegritySection key="sec" />, <TeamAccessSection key="team" />],
    },
    {
      id: 'messaging',
      title: 'التنبيهات والأتمتة والرسائل',
      description: 'إدارة قنوات الإشعارات، رسائل WhatsApp، والتذكيرات الآلية',
      icon: Bell,
      keywords: ['تنبيهات', 'رسائل', 'واتساب', 'أتمتة', 'whatsapp', 'notifications', 'messaging'],
      components: [<MessagingSettingsSection key="msg" />],
    },
    {
      id: 'data',
      title: 'البيانات والنسخ الاحتياطي والمزامنة',
      description: 'النسخ الاحتياطي السحابي والمحلي، استعادة البيانات، والخصوصية',
      icon: Database,
      keywords: ['بيانات', 'نسخ احتياطي', 'مزامنة', 'سحابي', 'تصدير', 'backup', 'sync', 'data'],
      components: [<DataControlCenter key="data" />, <PrivacyIntegrationsSection key="priv" />],
    },
    {
      id: 'support',
      title: 'الدعم والمساعدة',
      description: 'الأسئلة الشائعة، قنوات التواصل، ومعلومات الإصدار',
      icon: HelpCircle,
      keywords: ['دعم', 'مساعدة', 'إصدار', 'faq', 'help', 'support'],
      components: [<HelpSupportSection key="help" />],
    },
  ];

  // Filter categories based on search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter(
      (cat) =>
        cat.title.toLowerCase().includes(q) ||
        cat.description.toLowerCase().includes(q) ||
        cat.keywords.some((kw) => kw.toLowerCase().includes(q))
    );
  }, [searchQuery]);

  return (
    <div id="settings-page" className="space-y-6 max-w-4xl animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Settings className="w-6 h-6 text-teal-600" />
            {t('settings.title')}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            مركز التحكم الشامل بالإعدادات، العملة، الأمان، المزامنة، الفريق، وإدارة البيانات
          </p>
        </div>

        {/* Quick Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث سريع في الإعدادات..."
            className="w-full pl-4 pr-10 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition shadow-2xs"
          />
        </div>
      </div>

      {/* Categories Accordion Cards */}
      <div className="space-y-4">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-12 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">لا توجد إعدادات مطابقة لبحثك</p>
          </div>
        ) : (
          filteredCategories.map((cat) => {
            const Icon = cat.icon;
            const isOpen = openCategories[cat.id] || searchQuery.trim().length > 0;

            return (
              <div
                key={cat.id}
                className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs transition hover:border-slate-300 dark:hover:border-slate-700"
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(cat.id)}
                  className="w-full p-5 sm:p-6 flex items-center justify-between text-start hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition min-h-[44px]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="w-10 h-10 rounded-2xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                        {cat.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                        {cat.description}
                      </p>
                    </div>
                  </div>
                  <div className="text-slate-400 p-2">
                    {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="p-5 sm:p-6 pt-0 border-t border-slate-100 dark:border-slate-800/60 space-y-6 animate-in fade-in duration-150">
                    <div className="pt-4 space-y-6">{cat.components}</div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Diagnostics & Dev Tools Section (Collapsible Card) */}
      <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => toggleCategory('diagnostics')}
          className="w-full p-5 sm:p-6 flex items-center justify-between text-start hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition min-h-[44px]"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <div className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>أدوات التشخيص والصيانة البرمجية</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-mono">
                  6 حزم اختبارات
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                فحص أداء محركات النظام، المزامنة، التقارير، والذكاء الاصطناعي مباشرة
              </p>
            </div>
          </div>
          <div className="text-slate-400 p-2">
            {openCategories['diagnostics'] ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </button>

        {openCategories['diagnostics'] && (
          <div className="p-5 sm:p-6 pt-0 border-t border-slate-100 dark:border-slate-800/60 space-y-4 animate-in fade-in duration-150">
            <p className="text-xs text-slate-500 dark:text-slate-400 pt-3">
              تشغيل حزم الاختبارات البرمجية للتأكد من جاهزية المحاسبة الآلية، السحابة، كشف الحسابات وقراءة الفواتير:
            </p>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
              >
                <Layers className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
                <span>{isRunningTests ? 'جارٍ الفحص...' : 'المحرك المالي (12 اختبار)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunReportTests}
                disabled={isRunningReportTests}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
              >
                <FileCheck className={`w-3.5 h-3.5 ${isRunningReportTests ? 'animate-spin' : ''}`} />
                <span>{isRunningReportTests ? 'جارٍ الفحص...' : 'التقارير وExcel/PDF (7 اختبارات)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunCloudSyncTests}
                disabled={isRunningCloudSyncTests}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
              >
                <Cloud className={`w-3.5 h-3.5 ${isRunningCloudSyncTests ? 'animate-spin' : ''}`} />
                <span>{isRunningCloudSyncTests ? 'جارٍ الفحص...' : 'المزامنة والسحابة (7 اختبارات)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunMessagingTests}
                disabled={isRunningMessagingTests}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
              >
                <Layers className={`w-3.5 h-3.5 ${isRunningMessagingTests ? 'animate-spin' : ''}`} />
                <span>{isRunningMessagingTests ? 'جارٍ الفحص...' : 'الرسائل والتنبيهات (20 اختبار)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunAITests}
                disabled={isRunningAITests}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
              >
                <Bot className={`w-3.5 h-3.5 ${isRunningAITests ? 'animate-spin' : ''}`} />
                <span>{isRunningAITests ? 'جارٍ الفحص...' : 'المساعد الذكي (24 اختبار)'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunOCRTests}
                disabled={isRunningOCRTests}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[44px] disabled:opacity-50"
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
      </div>
    </div>
  );
};
