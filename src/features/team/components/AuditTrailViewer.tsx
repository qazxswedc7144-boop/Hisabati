import React, { useState } from 'react';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  UserCheck,
  Lock,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  Hash,
  Fingerprint,
} from 'lucide-react';
import { useRBACStore } from '@/shared/stores';
import { AuditTrailEntry, AuditRiskLevel, AuditAction } from '@/shared/types';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';

export const AuditTrailViewer: React.FC = () => {
  const auditEntries = useRBACStore((state) => state.auditEntries);
  const fetchAuditTrail = useRBACStore((state) => state.fetchAuditTrail);
  const verifyAuditIntegrity = useRBACStore((state) => state.verifyAuditIntegrity);
  const verificationResult = useRBACStore((state) => state.verificationResult);
  const isVerifying = useRBACStore((state) => state.isVerifying);

  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedEntryId, setExpandedEntryId] = useState<string | null>(null);

  const filteredEntries = auditEntries.filter((entry) => {
    // Action filter
    if (filterAction === 'financial' && !entry.action.startsWith('TRANSACTION_')) return false;
    if (filterAction === 'receipt' && !entry.action.startsWith('RECEIPT_')) return false;
    if (filterAction === 'team' && !entry.action.startsWith('TEAM_')) return false;
    if (filterAction === 'security' && entry.action !== 'SECURITY_UNAUTHORIZED_ATTEMPT') return false;

    // Risk filter
    if (filterRisk !== 'all' && entry.riskLevel !== filterRisk) return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchText = (entry.detailsAr || '').toLowerCase();
      const matchActor = (entry.actor.name || '').toLowerCase();
      const matchId = (entry.targetId || '').toLowerCase();
      if (!matchText.includes(q) && !matchActor.includes(q) && !matchId.includes(q)) {
        return false;
      }
    }

    return true;
  });

  const getRiskBadge = (risk: AuditRiskLevel) => {
    switch (risk) {
      case 'CRITICAL':
        return 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800';
      case 'HIGH':
        return 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800';
      case 'MEDIUM':
        return 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border-blue-300 dark:border-blue-800';
      case 'LOW':
        return 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800';
    }
  };

  const getActionIcon = (action: AuditAction) => {
    if (action === 'SECURITY_UNAUTHORIZED_ATTEMPT') {
      return <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
    }
    if (action.startsWith('TRANSACTION_')) {
      return <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
    }
    if (action.startsWith('RECEIPT_')) {
      return <Fingerprint className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    }
    if (action.startsWith('TEAM_')) {
      return <UserCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />;
    }
    return <Lock className="w-4 h-4 text-slate-500" />;
  };

  return (
    <div className="space-y-4">
      {/* Cryptographic Ledger Integrity Verification Card */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                سلسلة التدقيق التشفيرية (Tamper-Resistant SHA-256 Audit Trail)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 font-extrabold">
                  غير قابل للتلاعب
                </span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                كل عملية مسجلة مرتبطة ببصمة تجزئة تشفيرية متسلسلة مع السجل السابق؛ أي تعديل يدوي يتم كشفه فوراً.
              </p>
            </div>
          </div>

          <button
            id="btn-verify-audit-chain"
            onClick={() => verifyAuditIntegrity()}
            disabled={isVerifying}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-sm active:scale-[0.98] transition disabled:opacity-50 min-h-[40px] shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
            <span>{isVerifying ? 'جاري التحقق من السلسلة...' : 'فحص سلامة السجل التشفيري'}</span>
          </button>
        </div>

        {/* Verification Status Feedback */}
        {verificationResult && (
          <div
            className={`p-3 rounded-xl border text-xs flex items-center gap-3 ${
              verificationResult.isValid
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 font-semibold'
                : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 font-bold'
            }`}
          >
            {verificationResult.isValid ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <div className="flex-1">
              <p>{verificationResult.messageAr}</p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                وقت التحقق: {new Date(verificationResult.verifiedAt).toLocaleTimeString('ar-YE')} | إجمالي السجلات المفحوصة: {verificationResult.totalEntries}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            id="input-audit-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث في تفاصيل التدقيق أو اسم المنفذ أو المعرف..."
            className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>

        {/* Action filter */}
        <div className="flex items-center gap-2">
          <select
            id="select-audit-action-filter"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">جميع العمليات</option>
            <option value="financial">العمليات المالية فقط</option>
            <option value="receipt">الفواتير وOCR</option>
            <option value="team">الفريق والصلاحيات</option>
            <option value="security">محاولات غير مصرح بها (أمان)</option>
          </select>

          {/* Risk filter */}
          <select
            id="select-audit-risk-filter"
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
          >
            <option value="all">كافة مستويات الخطر</option>
            <option value="CRITICAL">حرج (CRITICAL)</option>
            <option value="HIGH">عالي (HIGH)</option>
            <option value="MEDIUM">متوسط (MEDIUM)</option>
            <option value="LOW">منخفض (LOW)</option>
          </select>

          <button
            onClick={() => fetchAuditTrail()}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition"
            title="تحديث السجلات"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Audit Entries List */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-xs">
            لا توجد سجلات تدقيق تطابق الفلاتر المحددة حالياً.
          </div>
        ) : (
          filteredEntries.map((entry) => {
            const isExpanded = expandedEntryId === entry.id;
            return (
              <div
                key={entry.id}
                id={`audit-entry-${entry.id}`}
                className={`p-4 transition hover:bg-slate-50/60 dark:hover:bg-slate-800/30 ${
                  entry.action === 'SECURITY_UNAUTHORIZED_ATTEMPT'
                    ? 'bg-rose-50/40 dark:bg-rose-950/20'
                    : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 shrink-0 mt-0.5">
                      {getActionIcon(entry.action)}
                    </div>

                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                          {entry.detailsAr}
                        </span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${getRiskBadge(entry.riskLevel)}`}>
                          {entry.riskLevel}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          #{entry.sequenceNumber}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          المنفذ: {entry.actor.name} ({rbacGuard.getRoleLabel(entry.actor.role)})
                        </span>
                        <span>
                          التاريخ: {new Date(entry.timestamp).toLocaleString('ar-YE')}
                        </span>
                        <span className="font-mono text-[10px]">
                          الهدف: {entry.targetType}:{entry.targetId.substring(0, 16)}...
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => setExpandedEntryId(isExpanded ? null : entry.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                    title="عرض التجزئة والبيانات التفصيلية"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {/* Expanded Details: Hashes, Before/After State */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 space-y-2 text-xs animate-in fade-in duration-100">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-[10px]">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 overflow-x-auto">
                        <span className="text-slate-400 block mb-0.5 font-sans font-bold">بصمة التجزئة الحالية (SHA-256):</span>
                        <span className="text-teal-700 dark:text-teal-300 select-all">{entry.hash}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 overflow-x-auto">
                        <span className="text-slate-400 block mb-0.5 font-sans font-bold">بصمة السجل السابق (Linked Hash):</span>
                        <span className="text-slate-600 dark:text-slate-400 select-all">{entry.previousEntryHash}</span>
                      </div>
                    </div>

                    {(entry.beforeState || entry.afterState) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                        {entry.beforeState && (
                          <div className="p-2.5 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40">
                            <span className="text-amber-800 dark:text-amber-300 font-bold block mb-1 text-[11px]">الحالة السابقة (Before):</span>
                            <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(entry.beforeState, null, 2)}
                            </pre>
                          </div>
                        )}
                        {entry.afterState && (
                          <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40">
                            <span className="text-emerald-800 dark:text-emerald-300 font-bold block mb-1 text-[11px]">الحالة الناتجة (After):</span>
                            <pre className="text-[10px] font-mono text-slate-600 dark:text-slate-400 overflow-x-auto whitespace-pre-wrap">
                              {JSON.stringify(entry.afterState, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
