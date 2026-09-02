import React, { useState } from 'react';
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
  Trash2,
  Check,
  AlertCircle,
  Activity,
  CheckCircle2,
  XCircle,
  Layers,
  FileCheck,
  Bot,
  Sparkles,
  ScanLine,
} from 'lucide-react';
import { useSettingsStore, useAccountStore, useTransactionStore, useUIStore } from '@/shared/stores';
import { CurrencyCode, ThemeMode, LanguageCode } from '@/shared/types';
import { SUPPORTED_CURRENCIES } from '@/core/utils/formatters';
import { seedInitialMockData } from '@/shared/data/mockData';
import { db } from '@/core/database/db';
import { useI18n } from '@/shared/hooks/useI18n';
import { integrityService, IntegrityReport } from '@/core/services/integrity.service';
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

  const [isResetting, setIsResetting] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isCheckingIntegrity, setIsCheckingIntegrity] = useState(false);
  const [integrityReport, setIntegrityReport] = useState<IntegrityReport | null>(null);

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

  const [showClearConfirm, setShowClearConfirm] = useState(false);

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
        showToast('تم فحص السجلات: جميع الحسابات والمعاملات سليمة 100%', 'success');
      } else {
        showToast(`تم اكتشاف ${report.inconsistencies.length} ملاحظة في السجلات`, 'info');
      }
    } catch (e: any) {
      showToast('فشل فحص التكامل', 'error');
    } finally {
      setIsCheckingIntegrity(false);
    }
  };

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
      showToast(
        `اكتملت اختبارات التقارير والتصدير: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل حزمة اختبارات التقارير', 'error');
    } finally {
      setIsRunningReportTests(false);
    }
  };

  const handleRunCloudSyncTests = async () => {
    setIsRunningCloudSyncTests(true);
    try {
      const result = await CloudSyncTestSuite.runAllTests();
      setCloudSyncTestSuiteResult(result);
      await fetchAccounts();
      await fetchRecentTransactions();
      showToast(
        `اكتملت اختبارات المزامنة والسحابة: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل حزمة اختبارات المزامنة السحابية', 'error');
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
        `اكتملت اختبارات الرسائل والتنبيهات: ${result.passedCount} نجح من أصل ${result.totalCount}`,
        result.failedCount === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل حزمة اختبارات الرسائل والتنبيهات', 'error');
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
        `اكتملت اختبارات المساعد المالي الذكي: ${result.passedCount} نجح من أصل ${result.totalCount}`,
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
        `اكتملت اختبارات قراءة الفواتير وOCR: ${result.passed} نجح من أصل ${result.total}`,
        result.failed === 0 ? 'success' : 'info'
      );
    } catch (e: any) {
      showToast('فشل تشغيل حزمة اختبارات OCR', 'error');
    } finally {
      setIsRunningOCRTests(false);
    }
  };

  const handleReSeedData = async () => {
    setIsResetting(true);
    try {
      await seedInitialMockData(true);
      await fetchAccounts();
      await fetchRecentTransactions();
      showToast('تم إعادة توليد البيانات التجريبية بنجاح', 'success');
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

  const handleExportJSON = async () => {
    try {
      const accounts = await db.accounts.toArray();
      const transactions = await db.transactions.toArray();
      const exportData = {
        app: 'Hisabati',
        version: '2.0.0',
        exportedAt: new Date().toISOString(),
        accounts,
        transactions,
      };

      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `hisabati_backup_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showToast('تم تصدير نسخة احتياطية محلية (JSON) بنجاح', 'success');
    } catch (e) {
      showToast('فشل تصدير البيانات', 'error');
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
          إعدادات النظام والمظهر، أدوات السلامة المالية وإدارة قاعدة البيانات المحلية
        </p>
      </div>

      {/* 1. Appearance (المظهر) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Palette className="w-4 h-4 text-teal-600" />
          {t('settings.theme')}
        </h3>

        <div className="grid grid-cols-3 gap-2.5">
          {[
            { id: 'light', label: 'فاتح' },
            { id: 'dark', label: 'داكن' },
            { id: 'system', label: 'تلقائي (النظام)' },
          ].map((item) => (
            <button
              key={item.id}
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
      </section>

      {/* 2. Currency & Language (العملة واللغة) */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Coins className="w-4 h-4 text-teal-600" />
          {t('settings.currency')}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {SUPPORTED_CURRENCIES.map((curr) => (
            <button
              key={curr.code}
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

        {/* Language selector */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-2 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-teal-600" />
            {t('settings.language')}
          </label>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { id: 'ar', label: 'العربية (Arabic)' },
              { id: 'en', label: 'English (الإنجليزية)' },
            ].map((lang) => (
              <button
                key={lang.id}
                onClick={() => handleLanguageChange(lang.id as LanguageCode)}
                className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 min-h-[44px] ${
                  settings.language === lang.id
                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {settings.language === lang.id && <Check className="w-3.5 h-3.5" />}
                <span>{lang.label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Financial Engine & Integrity (محرك المعاملات وسلامة الأرصدة) */}
      <section className="rounded-3xl border border-teal-200/80 dark:border-teal-900/60 bg-teal-50/20 dark:bg-teal-950/10 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            محرك المعاملات المالية وسلامة الأرصدة
          </h3>
          <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900 text-teal-800 dark:text-teal-200">
            Phase 2 Engine
          </span>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          المعاملات المالية هي المصدر الأساسي والوحيد للحقيقة. يتم استنتاج وحساب أرصدة الحسابات بدقة متناهية ودون تراكم للأخطاء الحسابية.
        </p>

        <div className="flex flex-wrap gap-2.5 pt-1">
          {/* Integrity Check Button */}
          <button
            onClick={handleCheckIntegrity}
            disabled={isCheckingIntegrity}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[42px] disabled:opacity-50"
          >
            <FileCheck className={`w-4 h-4 ${isCheckingIntegrity ? 'animate-pulse' : ''}`} />
            <span>{isCheckingIntegrity ? 'جارٍ الفحص...' : 'فحص تكامل وسلامة السجلات (Integrity Check)'}</span>
          </button>

          {/* Full Recalculation Button */}
          <button
            onClick={handleRecalculateAll}
            disabled={isRecalculating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-white dark:bg-slate-800 text-teal-800 dark:text-teal-200 text-xs font-bold hover:bg-teal-50 dark:hover:bg-slate-700 transition min-h-[42px] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>{isRecalculating ? 'جارٍ إعادة الاحتساب...' : 'إعادة احتساب كافة الأرصدة (Recalculate All)'}</span>
          </button>

          {/* Run Automated Test Suite */}
          <button
            onClick={handleRunTests}
            disabled={isRunningTests}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition min-h-[42px] disabled:opacity-50"
          >
            <Layers className={`w-4 h-4 ${isRunningTests ? 'animate-spin' : ''}`} />
            <span>{isRunningTests ? 'جارٍ تشغيل الاختبارات...' : 'اختبارات المحرك المالي (12 سيناريو)'}</span>
          </button>

          {/* Run Reports & Export Tests (Phase 3) */}
          <button
            onClick={handleRunReportTests}
            disabled={isRunningReportTests}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold hover:bg-emerald-50 dark:hover:bg-slate-700 transition min-h-[42px] disabled:opacity-50"
          >
            <FileCheck className={`w-4 h-4 ${isRunningReportTests ? 'animate-spin' : ''}`} />
            <span>{isRunningReportTests ? 'جارٍ تشغيل الاختبارات...' : 'اختبارات كشف الحساب وExcel وPDF (7 اختبارات)'}</span>
          </button>

          {/* Run Cloud Sync & Backup Tests (Phase 4) */}
          <button
            onClick={handleRunCloudSyncTests}
            disabled={isRunningCloudSyncTests}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/50 transition min-h-[42px] disabled:opacity-50"
          >
            <Layers className={`w-4 h-4 ${isRunningCloudSyncTests ? 'animate-spin' : ''}`} />
            <span>{isRunningCloudSyncTests ? 'جارٍ تشغيل الاختبارات...' : 'اختبارات السحابة والمزامنة (Phase 4 - 7 سيناريوهات)'}</span>
          </button>

          {/* Run Messaging & Automation Tests (Phase 5) */}
          <button
            onClick={handleRunMessagingTests}
            disabled={isRunningMessagingTests}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200 text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition min-h-[42px] disabled:opacity-50"
          >
            <Layers className={`w-4 h-4 ${isRunningMessagingTests ? 'animate-spin' : ''}`} />
            <span>{isRunningMessagingTests ? 'جارٍ تشغيل الاختبارات...' : 'اختبارات الرسائل والتنبيهات (Phase 5 - 20 سيناريو)'}</span>
          </button>

          {/* Run AI Accountant Tests (Phase 6) */}
          <button
            onClick={handleRunAITests}
            disabled={isRunningAITests}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50/80 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200 text-xs font-bold hover:bg-teal-100 dark:hover:bg-teal-900/50 transition min-h-[42px] disabled:opacity-50"
          >
            <Sparkles className={`w-4 h-4 ${isRunningAITests ? 'animate-spin' : ''}`} />
            <span>{isRunningAITests ? 'جارٍ تشغيل الاختبارات...' : 'اختبارات المساعد الذكي والأمان (Phase 6 - 24 سيناريو)'}</span>
          </button>

          {/* Run OCR Foundation Tests (Phase 7-A) */}
          <button
            onClick={handleRunOCRTests}
            disabled={isRunningOCRTests}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-300 dark:border-sky-700 bg-sky-50/80 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200 text-xs font-bold hover:bg-sky-100 dark:hover:bg-sky-900/50 transition min-h-[42px] disabled:opacity-50"
          >
            <ScanLine className={`w-4 h-4 ${isRunningOCRTests ? 'animate-spin' : ''}`} />
            <span>{isRunningOCRTests ? 'جارٍ تشغيل الاختبارات...' : 'اختبارات قراءة الفواتير وOCR (Phase 7-A - 18 سيناريو)'}</span>
          </button>
        </div>

        {/* Live Integrity Report Card */}
        {integrityReport && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                {integrityReport.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>حالة السلامة المالية: {integrityReport.valid ? 'سليمة ومطابقة 100%' : 'توجد ملاحظات'}</span>
              </span>
              <span className="text-[11px] text-slate-400">
                الحسابات: {integrityReport.accountsChecked} | العمليات: {integrityReport.transactionsChecked}
              </span>
            </div>

            {integrityReport.inconsistencies.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                {integrityReport.inconsistencies.map((inc, idx) => (
                  <div key={idx} className="text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
                    <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{inc.details}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Test Suite Results Card */}
        {testSuiteResult && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>نتائج اختبارات المحرك المالي: {testSuiteResult.passed}/{testSuiteResult.total} سيناريو ناجح</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {testSuiteResult.durationMs}ms
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {testSuiteResult.results.map((r) => (
                <div key={r.id} className="pt-1.5 pb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.title}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{r.actual}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reports Test Suite Results Card (Phase 3) */}
        {reportTestSuiteResult && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800/60 space-y-3 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>نتائج اختبارات التقارير والتصدير (Phase 3): {reportTestSuiteResult.passedCount}/{reportTestSuiteResult.totalCount} نجاح تام</span>
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {reportTestSuiteResult.results.map((r) => (
                <div key={r.id} className="pt-1.5 pb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.nameAr}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cloud Sync Test Suite Results Card (Phase 4) */}
        {cloudSyncTestSuiteResult && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800/60 space-y-3 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>نتائج اختبارات السحابة والمزامنة (Phase 4): {cloudSyncTestSuiteResult.passedCount}/{cloudSyncTestSuiteResult.totalCount} نجاح تام</span>
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {cloudSyncTestSuiteResult.results.map((r) => (
                <div key={r.id} className="pt-1.5 pb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.nameAr}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Messaging & Automation Test Suite Results Card (Phase 5) */}
        {messagingTestSuiteResult && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800/60 space-y-3 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                <span>نتائج اختبارات الرسائل والتنبيهات (Phase 5): {messagingTestSuiteResult.passedCount}/{messagingTestSuiteResult.totalCount} نجاح تام</span>
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {messagingTestSuiteResult.results.map((r) => (
                <div key={r.id} className="pt-1.5 pb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.nameAr}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Accountant Test Suite Results Card (Phase 6) */}
        {aiTestSuiteResult && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-teal-200 dark:border-teal-800/60 space-y-3 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                <span>نتائج اختبارات المساعد الذكي والأمان (Phase 6): {aiTestSuiteResult.passedCount}/{aiTestSuiteResult.totalCount} نجاح تام</span>
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {aiTestSuiteResult.results.map((r) => (
                <div key={r.id} className="pt-1.5 pb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.nameAr}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* OCR Foundation Test Suite Results Card (Phase 7-A) */}
        {ocrTestSuiteResult && (
          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800/60 space-y-3 mt-3 animate-in fade-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-sky-600" />
                <span>نتائج اختبارات قراءة الفواتير وOCR (Phase 7-A): {ocrTestSuiteResult.passed}/{ocrTestSuiteResult.total} نجاح تام</span>
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {ocrTestSuiteResult.durationMs}ms
              </span>
            </div>

            <div className="space-y-1.5 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {ocrTestSuiteResult.results.map((r) => (
                <div key={r.id} className="pt-1.5 pb-1 flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {r.passed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{r.title}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400 shrink-0">{r.durationMs}ms</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 4. Messaging & Automation Settings (Phase 5) */}
      <MessagingSettingsSection />

      {/* 5. Google Drive Cloud Sync & Cloud Backups (Phase 4) */}
      <CloudBackupSection />

      {/* 5. Local Backup Section */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Cloud className="w-4 h-4 text-teal-600" />
            {t('settings.backup')}
          </h3>
          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
            تصدير محلي
          </span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          يمكنك تنزيل نسخة احتياطية كاملة من قاعدة بياناتك محلياً بصيغة JSON لضمان حفظ بياناتك واستعادتها في أي وقت.
        </p>

        <div className="pt-1 flex flex-wrap gap-2.5">
          <button
            onClick={handleExportJSON}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition min-h-[42px]"
          >
            <Download className="w-4 h-4 text-teal-600" />
            <span>تصدير نسخة احتياطية محلية (JSON)</span>
          </button>
        </div>
      </section>

      {/* 5. Database Tools */}
      <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-4">
        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Database className="w-4 h-4 text-teal-600" />
          إدارة قاعدة البيانات المحلية (IndexedDB)
        </h3>

        <div className="flex flex-wrap gap-2.5">
          <button
            onClick={handleReSeedData}
            disabled={isResetting}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-teal-200 dark:border-teal-800/60 bg-teal-50/70 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-bold hover:bg-teal-100 transition min-h-[42px]"
          >
            <RefreshCw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
            <span>إعادة تحميل البيانات التجريبية الافتراضية</span>
          </button>

          <button
            onClick={() => setShowClearConfirm(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs font-bold hover:bg-rose-100 transition min-h-[42px]"
          >
            <Trash2 className="w-4 h-4" />
            <span>مسح جميع البيانات والبدء من الصفر</span>
          </button>
        </div>
      </section>

      {/* Clear Database Dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
              تأكيد مسح البيانات
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              هل أنت متأكد من مسح جميع الحسابات والعمليات؟ هذا الإجراء لا يمكن التراجع عنه.
            </p>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
              >
                إلغاء
              </button>
              <button
                onClick={handleClearDatabase}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
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
