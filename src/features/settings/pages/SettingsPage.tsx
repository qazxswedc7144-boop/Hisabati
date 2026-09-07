import React, { useState, useRef } from 'react';
import {
  Settings,
  Palette,
  Globe,
  Coins,
  Cloud,
  Shield,
  Database,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Check,
  AlertCircle,
  Activity,
  CheckCircle2,
  XCircle,
  Layers,
  FileCheck,
  ChevronDown,
  ChevronUp,
  FileText,
  Clock,
  Sparkles,
  Bot,
  ScanLine,
} from 'lucide-react';
import { useSettingsStore, useAccountStore, useTransactionStore, useUIStore } from '@/shared/stores';
import { CurrencyCode, ThemeMode, LanguageCode } from '@/shared/types';
import { SUPPORTED_CURRENCIES, formatNumber, formatDate } from '@/core/utils/formatters';
import { seedInitialMockData } from '@/shared/data/mockData';
import { db } from '@/core/database/db';
import { useI18n } from '@/shared/hooks/useI18n';
import { integrityService, IntegrityReport } from '@/core/services/integrity.service';
import { backupService } from '@/core/services/backup.service';
import { runFinancialEngineTests, EngineTestSuiteResult } from '@/core/tests/transactionEngine.test';
import { ReportsTestSuite, TestResult as ReportTestResult } from '@/core/tests/reports.test';
import { CloudSyncTestSuite, TestResult as CloudSyncTestResult } from '@/core/tests/cloudSync.test';
import { MessagingTestSuite, MessagingTestSuiteResult } from '@/core/tests/messaging.test';
import { AITestSuite, AITestSuiteResult } from '@/core/tests/ai.test';
import { OCRTestSuite, OCRTestSuiteSummary } from '@/core/tests/ocr.test';
import { CloudBackupSection } from '../components/CloudBackupSection';
import { MessagingSettingsSection } from '@/features/messaging/components/MessagingSettingsSection';

export const SettingsPage: React.FC = () => {
  const { t, changeLanguage } = useI18n();
  const settings = useSettingsStore((state) => state.settings);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setCurrency = useSettingsStore((state) => state.setCurrency);
  const showToast = useUIStore((state) => state.showToast);

  const fetchAccounts = useAccountStore((state) => state.fetchAccounts);
  const fetchRecentTransactions = useTransactionStore((state) => state.fetchRecentTransactions);
  const recalculateAll = useAccountStore((state) => state.recalculateAll);

  // States
  const [isResetting, setIsResetting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);

  // Local Backup State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [pendingRestorePayload, setPendingRestorePayload] = useState<any | null>(null);

  // Clear Database State
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Advanced Diagnostics Panel Toggle
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Diagnostic Test Suites
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

  // Handlers
  const handleCurrencyChange = async (curr: CurrencyCode) => {
    await setCurrency(curr);
    showToast(`تم تغيير العملة الرئيسية إلى ${curr}`, 'success');
  };

  const handleThemeChange = async (theme: ThemeMode) => {
    await setTheme(theme);
  };

  const handleLanguageChange = async (lang: LanguageCode) => {
    await changeLanguage(lang);
    showToast(lang === 'ar' ? 'تم تحويل اللغة إلى العربية' : 'Language switched to English', 'success');
  };

  const handleRecalculateAll = async () => {
    setIsRecalculating(true);
    try {
      await recalculateAll();
      showToast('تمت إعادة احتساب كافة الأرصدة من واقع المعاملات بنجاح', 'success');
    } catch (e: any) {
      showToast(e?.message || 'فشلت عملية إعادة الاحتساب', 'error');
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleCheckIntegrity = async () => {
    setIsCheckingIntegrity(true);
    try {
      const report = await integrityService.verifyFinancialIntegrity();
      setIntegrityReport(report);
      if (report.valid) {
        showToast('تم فحص السجلات: جميع الحسابات والمعاملات سليمة ومطابقة 100%', 'success');
      } else {
        showToast(`تم اكتشاف ${report.inconsistencies.length} ملاحظة في السجلات`, 'info');
      }
    } catch (e: any) {
      showToast('فشل فحص التكامل', 'error');
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

  // Local JSON Backup Export
  const handleExportJSON = async () => {
    setIsExporting(true);
    try {
      const payload = await backupService.generateBackupPayload();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `hisabati_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('تم تصدير نسخة احتياطية محلية مشفرة (JSON V3) بنجاح', 'success');
    } catch (e: any) {
      showToast(e?.message || 'فشل تصدير البيانات', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  // Local JSON Backup Import & Restore
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object') {
          showToast('ملف النسخة الاحتياطية غير صالح', 'error');
          return;
        }
        setPendingRestorePayload(parsed);
        setShowRestoreModal(true);
      } catch (err: any) {
        showToast('فشل قراءة ملف النسخة الاحتياطية (تنسيق JSON تالف)', 'error');
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async () => {
    if (!pendingRestorePayload) return;
    setIsRestoring(true);
    try {
      await backupService.restoreFromPayload(pendingRestorePayload, 'replace');
      await fetchAccounts();
      await fetchRecentTransactions();
      setShowRestoreModal(false);
      setPendingRestorePayload(null);
      showToast('تمت استعادة النسخة الاحتياطية بنجاح وتدقيق كافة الأرصدة', 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشلت عملية استعادة النسخة الاحتياطية', 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  // Local Database Management
  const handleReSeedData = async () => {
    setIsResetting(true);
    try {
      await seedInitialMockData(true);
      await fetchAccounts();
      await fetchRecentTransactions();
      showToast('تم إعادة تحميل البيانات التجريبية الافتراضية بنجاح', 'success');
    } catch (e) {
      showToast('فشل إعادة التعيين', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  const handleClearDatabase = async () => {
    try {
      await db.transactions.clear();
      await db.accounts.clear();
      await fetchAccounts();
      await fetchRecentTransactions();
      setShowClearConfirm(false);
      showToast('تم مسح جميع البيانات بنجاح', 'info');
    } catch (e) {
      showToast('فشل مسح البيانات', 'error');
    }
  };

  // Test Suite Runners
  const handleRunTests = async () => {
    setIsRunningTests(true);
    try {
      const result = await runFinancialEngineTests();
      setTestSuiteResult(result);
      await fetchAccounts();
      await fetchRecentTransactions();
      showToast(`اكتملت الاختبارات: ${result.passed} نجح من أصل ${result.total}`, result.failed === 0 ? 'success' : 'info');
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
      showToast(`اكتملت اختبارات التقارير: ${result.passedCount} نجح من أصل ${result.totalCount}`, result.failedCount === 0 ? 'success' : 'info');
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
      showToast(`اكتملت اختبارات المزامنة: ${result.passedCount} نجح من أصل ${result.totalCount}`, result.failedCount === 0 ? 'success' : 'info');
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
      showToast(`اكتملت اختبارات الرسائل: ${result.passedCount} نجح من أصل ${result.totalCount}`, result.failedCount === 0 ? 'success' : 'info');
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
      showToast(`اكتملت اختبارات المساعد الذكي: ${result.passedCount} نجح من أصل ${result.totalCount}`, result.failedCount === 0 ? 'success' : 'info');
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
      showToast(`اكتملت اختبارات OCR: ${result.passed} نجح من أصل ${result.total}`, result.failed === 0 ? 'success' : 'info');
    } catch (e: any) {
      showToast('فشل تشغيل اختبارات OCR', 'error');
    } finally {
      setIsRunningOCRTests(false);
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
          إعدادات النظام، العملة، سلامة الحسابات، النسخ الاحتياطي، وإدارة البيانات المحلية
        </p>
      </div>

      {/* SECTION A: المظهر واللغة (Appearance & Language) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Palette className="w-4 h-4 text-teal-600" />
          المظهر واللغة
        </h3>

        {/* Theme Mode */}
        <div>
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-2">
            نمط الواجهة
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { id: 'light', label: 'فاتح' },
              { id: 'dark', label: 'داكن' },
              { id: 'system', label: 'تلقائي (النظام)' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleThemeChange(item.id as ThemeMode)}
                className={`py-3 px-3 rounded-2xl border text-xs sm:text-sm font-bold transition flex items-center justify-center gap-2 min-h-[44px] ${
                  settings.theme === item.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {settings.theme === item.id && <Check className="w-4 h-4 text-teal-600" />}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Language Selector */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-2 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-teal-600" />
            لغة التطبيق
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { id: 'ar', label: 'العربية (Arabic)' },
              { id: 'en', label: 'English (الإنجليزية)' },
            ].map((lang) => (
              <button
                key={lang.id}
                type="button"
                onClick={() => handleLanguageChange(lang.id as LanguageCode)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px] ${
                  settings.language === lang.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                {settings.language === lang.id && <Check className="w-3.5 h-3.5" />}
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION B: الإعدادات المالية (Financial Settings - Currency) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Coins className="w-4 h-4 text-teal-600" />
            العملة الرئيسية للنظام
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            العملة الافتراضية المستخدمة في التقارير وكشوفات الحسابات والتعاملات اليومية
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SUPPORTED_CURRENCIES.map((curr) => (
            <button
              key={curr.code}
              type="button"
              onClick={() => handleCurrencyChange(curr.code)}
              className={`p-3 rounded-2xl border text-xs font-bold transition text-start flex flex-col justify-between min-h-[64px] ${
                settings.currency === curr.code
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 shadow-xs'
                  : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-extrabold">{curr.symbolAr}</span>
                {settings.currency === curr.code && <Check className="w-3.5 h-3.5 text-teal-600" />}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {curr.nameAr}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* SECTION C: سلامة البيانات والحسابات (Data Integrity & Balance Safety) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-600" />
            سلامة السجلات وتكامل الأرصدة
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            المعاملات المالية هي المصدر الأساسي والوحيد للحقيقة. يمكنك تدقيق سجلاتك للتأكد من تطابق مجموع الحركات مع الأرصدة الحالية.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          {/* Integrity Check Button */}
          <button
            type="button"
            onClick={handleCheckIntegrity}
            disabled={isCheckingIntegrity}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[42px] disabled:opacity-50"
          >
            <FileCheck className={`w-4 h-4 ${isCheckingIntegrity ? 'animate-pulse' : ''}`} />
            <span>{isCheckingIntegrity ? 'جارٍ التدقيق...' : 'فحص تكامل وسلامة السجلات (Integrity Check)'}</span>
          </button>

          {/* Full Recalculation Button */}
          <button
            type="button"
            onClick={handleRecalculateAll}
            disabled={isRecalculating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/50 dark:bg-teal-950/20 text-teal-800 dark:text-teal-200 text-xs font-bold hover:bg-teal-100 dark:hover:bg-slate-800 transition min-h-[42px] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? 'جارٍ إعادة الاحتساب...' : 'إعادة احتساب كافة الأرصدة (Recalculate All)'}</span>
          </button>
        </div>

        {/* Integrity Report Card */}
        {integrityReport && (
          <div
            className={`p-4 rounded-2xl border text-xs space-y-2 mt-2 ${
              integrityReport.valid
                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-100'
                : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-100'
            }`}
          >
            <div className="flex items-center gap-2 font-bold text-sm">
              {integrityReport.valid ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600" />
              )}
              <span>
                {integrityReport.valid
                  ? 'جميع الحسابات والمعاملات المالية سليمة ومتطابقة 100%'
                  : `تم العثور على ${integrityReport.inconsistencies.length} ملاحظة تحتاج إلى تدقيق`}
              </span>
            </div>

            <div className="text-[11px] opacity-80">
              تم فحص {formatNumber(integrityReport.totalAccountsChecked)} حساب و {formatNumber(integrityReport.totalTransactionsChecked)} عملية مالية مسجلة.
            </div>

            {integrityReport.inconsistencies.length > 0 && (
              <ul className="list-disc list-inside space-y-1 pt-1 text-[11px]">
                {integrityReport.inconsistencies.map((item, idx) => (
                  <li key={idx}>
                    حساب {item.accountName}: الفرق المسجل ({formatNumber(item.difference)})
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* SECTION D: الإشعارات والتنبيهات والأتمتة (Notifications & Automation) */}
      <MessagingSettingsSection />

      {/* SECTION E: النسخ الاحتياطي والمزامنة (Backup & Cloud Sync) */}
      <CloudBackupSection />

      {/* Local JSON Backup Section */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-teal-600" />
            النسخ الاحتياطي المحلي (JSON V3)
          </h3>
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            تشفير SHA-256
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          يمكنك تصدير نسخة احتياطية كاملة محلياً أو استعادة نسخة سابقة. تخضع جميع النسخ للتحقق الصارم من التشفير ولقطة أمان قبل التطبيق.
        </p>

        <div className="pt-1 flex flex-wrap gap-2.5">
          {/* Export JSON */}
          <button
            type="button"
            onClick={handleExportJSON}
            disabled={isExporting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/60 transition min-h-[42px] disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-teal-600" />
            <span>{isExporting ? 'جارٍ التصدير...' : 'تصدير نسخة احتياطية محلية (JSON V3)'}</span>
          </button>

          {/* Import JSON */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition min-h-[42px]"
          >
            <Upload className="w-4 h-4 text-teal-600" />
            <span>استيراد واستعادة نسخة احتياطية (JSON)</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileSelect}
          />
        </div>
      </section>

      {/* SECTION F: إدارة البيانات المحلية (Local Database Management) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-teal-600" />
            إدارة قاعدة البيانات المحلية (IndexedDB)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            إعادة تعيين البيانات للتجربة أو تفريغ السجلات للبدء من الصفر
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={handleReSeedData}
            disabled={isResetting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[42px] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>إعادة تحميل البيانات التجريبية الافتراضية</span>
          </button>

          <button
            type="button"
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition min-h-[42px]"
          >
            <Trash2 className="w-4 h-4" />
            <span>مسح جميع البيانات والبدء من الصفر</span>
          </button>
        </div>
      </section>

      {/* SECTION G: أدوات التشخيص والصيانة البرمجية المتقدمة (Diagnostic & Dev Tools) */}
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
              {/* Financial Engine Tests */}
              <button
                type="button"
                onClick={handleRunTests}
                disabled={isRunningTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Layers className={`w-3.5 h-3.5 ${isRunningTests ? 'animate-spin' : ''}`} />
                <span>{isRunningTests ? 'جارٍ الفحص...' : 'المحرك المالي (12 اختبار)'}</span>
              </button>

              {/* Reports & Statements Tests */}
              <button
                type="button"
                onClick={handleRunReportTests}
                disabled={isRunningReportTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <FileCheck className={`w-3.5 h-3.5 ${isRunningReportTests ? 'animate-spin' : ''}`} />
                <span>{isRunningReportTests ? 'جارٍ الفحص...' : 'التقارير وExcel/PDF (7 اختبارات)'}</span>
              </button>

              {/* Cloud Sync Tests */}
              <button
                type="button"
                onClick={handleRunCloudSyncTests}
                disabled={isRunningCloudSyncTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Cloud className={`w-3.5 h-3.5 ${isRunningCloudSyncTests ? 'animate-spin' : ''}`} />
                <span>{isRunningCloudSyncTests ? 'جارٍ الفحص...' : 'المزامنة والسحابة (7 اختبارات)'}</span>
              </button>

              {/* Messaging Tests */}
              <button
                type="button"
                onClick={handleRunMessagingTests}
                disabled={isRunningMessagingTests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Layers className={`w-3.5 h-3.5 ${isRunningMessagingTests ? 'animate-spin' : ''}`} />
                <span>{isRunningMessagingTests ? 'جارٍ الفحص...' : 'الرسائل والتنبيهات (20 اختبار)'}</span>
              </button>

              {/* AI Tests */}
              <button
                type="button"
                onClick={handleRunAITests}
                disabled={isRunningAITests}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition min-h-[38px] disabled:opacity-50"
              >
                <Bot className={`w-3.5 h-3.5 ${isRunningAITests ? 'animate-spin' : ''}`} />
                <span>{isRunningAITests ? 'جارٍ الفحص...' : 'المساعد الذكي (24 اختبار)'}</span>
              </button>

              {/* OCR Tests */}
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

      {/* Restore Confirmation Modal */}
      {showRestoreModal && pendingRestorePayload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-teal-100 dark:bg-teal-950 text-teal-600 flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                تأكيد استعادة النسخة الاحتياطية
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                سيتم استبدال البيانات المحلية بالنسخة المستوردة مع أخذ لقطة أمان احتياطية تلقائياً.
              </p>
            </div>

            {/* Payload Metadata Card */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">تاريخ النسخة:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  {pendingRestorePayload.metadata?.createdAt
                    ? formatDate(pendingRestorePayload.metadata.createdAt, 'full')
                    : 'غير محدد'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">إصدار المخطط:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                  V{pendingRestorePayload.metadata?.backupSchemaVersion || 1}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عدد الحسابات:</span>
                <span className="font-bold text-emerald-600 font-mono">
                  {formatNumber(pendingRestorePayload.accounts?.length || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">عدد المعاملات:</span>
                <span className="font-bold text-teal-600 font-mono">
                  {formatNumber(pendingRestorePayload.transactions?.length || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حالة التجزئة (SHA-256):</span>
                <span className="font-bold text-teal-600">
                  {pendingRestorePayload.metadata?.integrityHash ? 'تجزئة مشفرة مؤكدة' : 'بدون تجزئة'}
                </span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-[11px] text-teal-800 dark:text-teal-200">
              🛡️ <strong>حماية أمنية:</strong> يقوم النظام بحفظ لقطة أمان مسبقة وتدقيق سلامة الأرصدة تلقائياً قبل تطبيق الاستعادة.
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRestoreModal(false);
                  setPendingRestorePayload(null);
                }}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isRestoring}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition disabled:opacity-50"
              >
                {isRestoring ? 'جارٍ الاستعادة والتحقق...' : 'تأكيد واستعادة البيانات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Database Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                تأكيد مسح البيانات
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                هل أنت متأكد من مسح جميع الحسابات والعمليات؟ هذا الإجراء نهائي ولا يمكن التراجع عنه.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleClearDatabase}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition"
              >
                مسح الكل
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
