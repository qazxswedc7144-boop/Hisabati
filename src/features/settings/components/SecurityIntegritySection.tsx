import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  Activity, 
  RefreshCw, 
  AlertTriangle, 
  CheckCircle2, 
  Info,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { integrityService, IntegrityReport } from '@/core/services/integrity.service';
import { useUIStore } from '@/shared/stores';

export const SecurityIntegritySection: React.FC = () => {
  const showToast = useUIStore((state) => state.showToast);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [showInconsistencies, setShowInconsistencies] = useState(false);

  // Auto-run scan on load
  useEffect(() => {
    handleRunScan();
  }, []);

  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      const result = await integrityService.verifyFinancialIntegrity();
      setReport(result);
      if (result.valid) {
        showToast('نزاهة البيانات سليمة تماماً', 'success');
      } else {
        showToast(`تم اكتشاف ${result.inconsistencies.length} تعارضات في البيانات`, 'info');
      }
    } catch (error) {
      showToast('فشل إجراء فحص النزاهة', 'error');
    } finally {
      setIsScanning(false);
    }
  };

  const handleRecalculateBalances = async () => {
    if (!window.confirm('هل أنت متأكد من رغبتك في إعادة احتساب كافة الأرصدة؟ هذه العملية ستعتمد على المعاملات المسجلة لإعادة ضبط أرصدة الحسابات الإجمالية.')) {
      return;
    }

    setIsRepairing(true);
    try {
      const result = await integrityService.repairFinancialIntegrity();
      showToast(`تم تحديث أرصدة ${result.repairedCount} حساباً بنجاح`, 'success');
      // Re-run scan to verify
      await handleRunScan();
    } catch (error) {
      showToast('فشل إعادة احتساب الأرصدة', 'error');
    } finally {
      setIsRepairing(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" />
            <span>سلامة ونزاهة البيانات المالية</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            أدوات متقدمة للتحقق من تطابق الأرصدة مع المعاملات وضمان دقة السجلات
          </p>
        </div>
        <button
          onClick={handleRunScan}
          disabled={isScanning}
          className={`p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${isScanning ? 'animate-spin' : ''}`}
          title="تحديث الفحص"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Quick Stats & Status */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={`p-4 rounded-2xl border flex items-center gap-4 transition ${
          report?.valid 
            ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-900/40' 
            : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/80 dark:border-rose-900/40'
        }`}>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            report?.valid ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600' : 'bg-rose-100 dark:bg-rose-900/40 text-rose-600'
          }`}>
            {report?.valid ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">الحالة الحالية</span>
            <span className={`text-sm font-black ${report?.valid ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
              {isScanning ? 'جارٍ الفحص...' : report?.valid ? 'البيانات سليمة ومطابقة' : 'تم اكتشاف تعارضات'}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 flex items-center justify-center">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block uppercase tracking-wider">آخر فحص</span>
            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
              {report?.checkedAt ? new Date(report.checkedAt).toLocaleTimeString('ar-SA') : '--:--'}
            </span>
          </div>
        </div>
      </div>

      {/* Warning if inconsistencies found */}
      {report && !report.valid && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/80 dark:border-rose-900/40 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="text-sm font-bold text-rose-800 dark:text-rose-300 block">تنبيه: تم رصد عدم تطابق في الأرصدة</span>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80 leading-relaxed">
                هناك فوارق بين الأرصدة المسجلة في الحسابات وبين مجموع العمليات الفعلية. ننصح بإجراء "إعادة احتساب الأرصدة" لتصحيح هذه الفوارق بناءً على سجل المعاملات الحقيقي.
              </p>
            </div>
          </div>
          
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowInconsistencies(!showInconsistencies)}
              className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-400 hover:underline"
            >
              <span>{showInconsistencies ? 'إخفاء التفاصيل التقنية' : 'عرض تفاصيل التعارضات'}</span>
              {showInconsistencies ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showInconsistencies && (
              <div className="bg-white/50 dark:bg-slate-900/50 rounded-xl p-3 border border-rose-200/50 dark:border-rose-900/50 max-h-40 overflow-y-auto space-y-2">
                {report.inconsistencies.map((inc, idx) => (
                  <div key={idx} className="text-[10px] font-mono text-rose-600 dark:text-rose-400 border-b border-rose-100 dark:border-rose-900/30 pb-1.5 last:border-0 last:pb-0">
                    <span className="font-bold">[{inc.type}]</span> {inc.details}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recalculate Button */}
      <div className="pt-2">
        <button
          onClick={handleRecalculateBalances}
          disabled={isRepairing || isScanning}
          className="w-full py-3.5 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-700 transition shadow-lg shadow-slate-200 dark:shadow-none disabled:opacity-50 min-h-[48px]"
        >
          {isRepairing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Activity className="w-4 h-4 text-teal-400" />
          )}
          <span>{isRepairing ? 'جارٍ إعادة الاحتساب...' : 'إعادة احتساب الأرصدة من واقع العمليات'}</span>
        </button>
        <p className="text-[10px] text-slate-400 mt-2 text-center flex items-center justify-center gap-1">
          <Info className="w-3 h-3" />
          هذا الإجراء آمن ولا يحذف أي بيانات؛ فقط يقوم بتصحيح الأرصدة الإجمالية.
        </p>
      </div>

      {/* Security Info Card */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">نظام النزاهة المحاسبي النشط</span>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            يقوم النظام دورياً بالتحقق من "الهاش" الخاص بكل معاملة لضمان عدم تعرضها للتلاعب الخارجي أو الفقدان أثناء المزامنة. يتم تخزين جميع البيانات المالية بتنسيق "الوحدات الصغرى" لضمان دقة 100% في الكسور العشرية.
          </p>
        </div>
      </div>
    </section>
  );
};
