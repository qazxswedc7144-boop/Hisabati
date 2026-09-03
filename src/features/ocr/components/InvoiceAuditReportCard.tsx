import React, { useState } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  Calculator,
  ChevronDown,
  ChevronUp,
  Sparkles,
  WifiOff,
  Scale,
} from 'lucide-react';
import { InvoiceAuditReport, AuditRiskLevel, InvoiceAuditFinding } from '@/shared/types';
import { formatCurrency } from '@/core/utils/formatters';

interface InvoiceAuditReportCardProps {
  report: InvoiceAuditReport | null;
  isLoading?: boolean;
  onReaudit?: () => void;
}

export const InvoiceAuditReportCard: React.FC<InvoiceAuditReportCardProps> = ({
  report,
  isLoading = false,
  onReaudit,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'findings' | 'math'>('summary');

  if (isLoading) {
    return (
      <div
        id="invoice-audit-loading-card"
        className="w-full bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 my-3 text-center"
      >
        <div className="flex items-center justify-center gap-2 text-teal-600 dark:text-teal-400">
          <Sparkles className="w-5 h-5 animate-pulse" />
          <span className="text-sm font-semibold">جارٍ التدقيق الحسابي والذكي للفاتورة...</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          يتم فحص توازن الإجماليات، الضرائب، الكميات، وتطابق الحسابات وتكرار المستند
        </p>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  const getRiskBadge = (risk: AuditRiskLevel) => {
    switch (risk) {
      case 'LOW':
        return {
          label: 'مخاطر منخفضة - سليم',
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
          pillColor: 'bg-emerald-500',
        };
      case 'MEDIUM':
        return {
          label: 'مخاطر متوسطة - تنبيهات',
          bg: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800',
          icon: <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />,
          pillColor: 'bg-amber-500',
        };
      case 'HIGH':
        return {
          label: 'مخاطر عالية - تضارب حسابي',
          bg: 'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800',
          icon: <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />,
          pillColor: 'bg-orange-500',
        };
      case 'CRITICAL':
        return {
          label: 'خطر حرج - مكرر أو تضارب جسيم',
          bg: 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800',
          icon: <AlertOctagon className="w-4 h-4 text-rose-600 dark:text-rose-400" />,
          pillColor: 'bg-rose-500',
        };
    }
  };

  const getSeverityBadge = (sev: InvoiceAuditFinding['severity']) => {
    switch (sev) {
      case 'critical':
        return <span className="px-2 py-0.5 text-xs rounded bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-300 font-medium">حرج</span>;
      case 'error':
        return <span className="px-2 py-0.5 text-xs rounded bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300 font-medium">خطأ</span>;
      case 'warning':
        return <span className="px-2 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-medium">تنبيه</span>;
      default:
        return <span className="px-2 py-0.5 text-xs rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium">ملاحظة</span>;
    }
  };

  const riskBadge = getRiskBadge(report.overallRisk);
  const math = report.mathVerification;

  return (
    <div
      id="invoice-audit-report-card"
      className={`w-full border rounded-xl my-3 overflow-hidden transition-all duration-200 ${
        report.overallRisk === 'CRITICAL'
          ? 'border-rose-300 dark:border-rose-900/70 bg-rose-50/30 dark:bg-rose-950/10'
          : report.overallRisk === 'HIGH'
          ? 'border-orange-300 dark:border-orange-900/70 bg-orange-50/30 dark:bg-orange-950/10'
          : report.overallRisk === 'MEDIUM'
          ? 'border-amber-300 dark:border-amber-900/70 bg-amber-50/30 dark:bg-amber-950/10'
          : 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10'
      }`}
    >
      {/* Header bar */}
      <div className="p-3 sm:p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-100">
                التدقيق المحاسبي والذكي للفاتورة
              </h4>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-semibold rounded-full border ${riskBadge.bg}`}>
                {riskBadge.icon}
                {riskBadge.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
              <span>درجة المخاطر: {report.riskScore}%</span>
              <span>•</span>
              {report.isOfflineFallback ? (
                <span className="flex items-center gap-1 text-slate-500">
                  <WifiOff className="w-3 h-3" />
                  تدقيق محلي آمن (Offline)
                </span>
              ) : (
                <span className="flex items-center gap-1 text-teal-600 dark:text-teal-400 font-medium">
                  <Sparkles className="w-3 h-3" />
                  مدعوم بالذكاء الاصطناعي
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onReaudit && (
            <button
              id="reaudit-btn"
              type="button"
              onClick={onReaudit}
              className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
            >
              إعادة الفحص
            </button>
          )}
          <button
            id="toggle-audit-expand-btn"
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            aria-label="تبديل عرض التفاصيل"
          >
            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-3 sm:p-4 space-y-3">
          {/* Tabs header */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('summary')}
              className={`flex-1 py-1.5 px-2 rounded-md transition-colors ${
                activeTab === 'summary'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              التقرير والتوصية
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('findings')}
              className={`flex-1 py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'findings'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <span>الملاحظات</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  report.findings.length > 0
                    ? 'bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300'
                    : 'bg-slate-200 dark:bg-slate-600 text-slate-600'
                }`}
              >
                {report.findings.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('math')}
              className={`flex-1 py-1.5 px-2 rounded-md transition-colors flex items-center justify-center gap-1 ${
                activeTab === 'math'
                  ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>المطابقة الحسابية</span>
            </button>
          </div>

          {/* TAB 1: Summary & Recommendation */}
          {activeTab === 'summary' && (
            <div className="space-y-2.5">
              <div className="bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block mb-1">
                  الخلاصة التحليلية:
                </span>
                <p className="text-xs sm:text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  {report.summaryAr}
                </p>
              </div>

              <div
                className={`p-3 rounded-lg border flex items-start gap-2 ${
                  report.overallRisk === 'CRITICAL' || report.overallRisk === 'HIGH'
                    ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200'
                    : report.overallRisk === 'MEDIUM'
                    ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                }`}
              >
                <Scale className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="text-xs font-bold block mb-0.5">التوصية المحاسبية:</span>
                  <p className="text-xs sm:text-sm leading-relaxed">{report.recommendationAr}</p>
                </div>
              </div>

              {/* Account comparison notice if present */}
              {report.accountComparison && report.accountComparison.nameMatchStatus === 'mismatch' && (
                <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded-lg text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    اسم الجهة بالفاتورة ({report.accountComparison.partyName}) لا يتطابق مع اسم الحساب المحدد (
                    {report.accountComparison.targetAccountName}). يرجى التحقق من توجيه القيد للحساب الصحيح.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Findings List */}
          {activeTab === 'findings' && (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {report.findings.length === 0 ? (
                <div className="text-center py-6 text-slate-500 dark:text-slate-400">
                  <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-1" />
                  <p className="text-xs font-medium">لم يتم العثور على أي تناقضات أو أخطاء حسابية.</p>
                </div>
              ) : (
                report.findings.map((f) => (
                  <div
                    key={f.id}
                    className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                        {f.titleAr}
                      </span>
                      {getSeverityBadge(f.severity)}
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 text-xs leading-relaxed">{f.messageAr}</p>
                    {(f.expected !== undefined || f.actual !== undefined) && (
                      <div className="mt-1.5 flex flex-wrap gap-2 text-[11px] text-slate-500 bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded">
                        {f.actual !== undefined && (
                          <span>
                            القيمة المسجلة: <b className="text-slate-700 dark:text-slate-200">{String(f.actual)}</b>
                          </span>
                        )}
                        {f.expected !== undefined && (
                          <span>
                            المتوقع حسابياً:{' '}
                            <b className="text-emerald-700 dark:text-emerald-400">{String(f.expected)}</b>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Math Verification */}
          {activeTab === 'math' && (
            <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-xs space-y-2">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">مجموع بنود الأصناف (Line Items):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                  {formatCurrency(math.lineItemsSum)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">المجموع الفرعي المسجل (Subtotal):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                  {formatCurrency(math.statedSubtotal)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">الضريبة المسجلة (Tax):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                  {formatCurrency(math.statedTax)}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">الإجمالي النهائي المسجل (Stated Total):</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-100">
                  {formatCurrency(math.statedTotal)}
                </span>
              </div>
              <div className="flex justify-between py-1.5 pt-2 font-semibold">
                <span className="text-slate-700 dark:text-slate-200">حالة المطابقة الحسابية:</span>
                <span
                  className={`inline-flex items-center gap-1 font-bold ${
                    math.isBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {math.isBalanced ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      متطابق محاسبياً
                    </>
                  ) : (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      فارق حسابي: {formatCurrency(math.discrepancy)}
                    </>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
