import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  FileSpreadsheet,
  ArrowUpRight,
  Phone,
  CheckCircle2,
  X,
  RotateCcw,
  AlertCircle,
  FileText,
  Filter,
  MoreVertical,
  Activity,
  Share2,
  Table as TableIcon,
  Loader2,
  Scale,
  Users,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { useSettingsStore, useUIStore } from '@/shared/stores';
import { reportService, excelGenerator } from '@/core/services';
import { ReceivablesReport } from '@/shared/types';
import { formatCurrency, formatDate } from '@/core/utils/formatters';

export const ReceivablesReportView: React.FC = () => {
  const navigate = useNavigate();
  const currency = useSettingsStore((state) => state.settings.currency);
  const { showToast: uiShowToast } = useUIStore();

  const [search, setSearch] = useState('');
  const [minBalance, setMinBalance] = useState<number>(0);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'balance' | 'name'>('balance');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [report, setReport] = useState<ReceivablesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const loadReport = useCallback(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    reportService
      .getReceivablesReport({
        search,
        minBalance,
        includeArchived,
      })
      .then((data) => {
        if (isMounted) {
          setReport(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load receivables report:', err);
        if (isMounted) {
          setError('تعذر تحميل تقرير المستحقات. يرجى إعادة المحاولة.');
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [search, minBalance, includeArchived]);

  useEffect(() => {
    const cleanup = loadReport();
    return cleanup;
  }, [loadReport]);

  const handleResetFilters = () => {
    setSearch('');
    setMinBalance(0);
    setIncludeArchived(false);
    setSortBy('balance');
    setSortOrder('desc');
  };

  const sortedItems = useMemo(() => {
    if (!report) return [];
    return [...report.items].sort((a, b) => {
      if (sortBy === 'balance') {
        return sortOrder === 'desc' ? b.balance - a.balance : a.balance - b.balance;
      } else {
        return sortOrder === 'desc' 
          ? b.account.name.localeCompare(a.account.name, 'ar') 
          : a.account.name.localeCompare(b.account.name, 'ar');
      }
    });
  }, [report, sortBy, sortOrder]);

  const hasActiveFilters = Boolean(search.trim() || minBalance > 0 || includeArchived);

  const handleExportExcel = async () => {
    if (!report || exporting) return;
    try {
      setExporting(true);
      const blob = await excelGenerator.generateReceivablesExcel(report, currency);
      const filename = `تقرير_المستحقات_لك_${new Date().toISOString().split('T')[0]}.xlsx`;
      excelGenerator.downloadBlob(blob, filename);
      uiShowToast('تم تصدير تقرير المستحقات بصيغة Excel', 'success');
    } catch (err) {
      console.error('Export failed:', err);
      uiShowToast('حدث خطأ أثناء تصدير الملف', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Unified Header: Title, Search, Export & More Menu */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs sticky top-0 z-10">
        {/* Right: Title */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200/60 dark:border-teal-800/60 text-teal-600 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">المستحقات لك</h3>
        </div>

        {/* Middle: Search Bar */}
        <div className="flex-1 max-w-[120px] sm:max-w-xs relative">
          <div className="absolute inset-y-0 start-0 ps-2.5 flex items-center pointer-events-none">
            <Search className="w-3 h-3 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="بحث..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 rounded-xl py-1.5 ps-8 pe-3 text-[10px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/50 outline-none transition-all"
          />
        </div>

        {/* Left: Export Merged & More Menu */}
        <div className="flex items-center gap-1">
          {/* Merged Export Icon (PDF + Excel) */}
          <button
            type="button"
            onClick={() => setIsExportModalOpen(true)}
            className="relative w-10 h-10 flex items-center justify-center rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition group"
            title="تصدير (PDF / Excel)"
          >
            <div className="relative flex items-center justify-center">
              <FileText className="w-5 h-5 text-rose-600 transition-transform group-hover:-translate-x-1" />
              <div className="absolute -bottom-1 -end-1 p-0.5 rounded-md bg-white dark:bg-slate-800 shadow-xs border border-slate-100 dark:border-slate-700">
                <TableIcon className="w-3 h-3 text-emerald-600 transition-transform group-hover:translate-x-1" />
              </div>
            </div>
          </button>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-0.5" />

          {/* More Menu Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className={`w-10 h-10 flex items-center justify-center rounded-2xl transition shadow-sm ${
                isMenuOpen 
                  ? 'bg-teal-600 text-white' 
                  : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute top-full mt-2 end-0 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800 mb-1">
                    ترتيب العرض
                  </div>
                  {[
                    { id: 'sort-balance-desc', label: 'الأعلى رصيداً أولاً', icon: TrendingUp, active: sortBy === 'balance' && sortOrder === 'desc' },
                    { id: 'sort-balance-asc', label: 'الأقل رصيداً أولاً', icon: TrendingDown, active: sortBy === 'balance' && sortOrder === 'asc' },
                    { id: 'sort-name-asc', label: 'ترتيب أبجدي (أ-ي)', icon: Users, active: sortBy === 'name' && sortOrder === 'asc' },
                    { id: 'divider-1', isDivider: true },
                    { id: 'reset', label: 'إعادة ضبط العرض', icon: RotateCcw },
                  ].map((item) => (
                    item.isDivider ? (
                      <div key={item.id} className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                    ) : (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (item.id === 'sort-balance-desc') { setSortBy('balance'); setSortOrder('desc'); }
                          else if (item.id === 'sort-balance-asc') { setSortBy('balance'); setSortOrder('asc'); }
                          else if (item.id === 'sort-name-asc') { setSortBy('name'); setSortOrder('asc'); }
                          else if (item.id === 'reset') handleResetFilters();
                          
                          setIsMenuOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold transition text-right ${
                          item.active 
                            ? 'text-teal-600 bg-teal-50/50 dark:bg-teal-900/20' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {item.icon && <item.icon className={`w-4 h-4 ${item.active ? 'text-teal-600' : 'text-slate-400'}`} />}
                          <span>{item.label}</span>
                        </div>
                        {item.active && <CheckCircle2 className="w-4 h-4 text-teal-600" />}
                      </button>
                    )
                  ))}
                  <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />
                  <button
                    onClick={() => {
                      uiShowToast('جاري مشاركة التطبيق...', 'info');
                      setIsMenuOpen(false);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition text-right"
                  >
                    <Share2 className="w-4 h-4 text-teal-600" />
                    <span>شارك التطبيق</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Export & Filter Modal */}
      {isExportModalOpen && (
        <div className="fixed inset-0 z-100 flex items-end sm:items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div 
            className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-[32px] sm:rounded-[32px] p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-6 animate-in slide-in-from-bottom-8 duration-300"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Filter className="w-5 h-5 text-teal-600" />
                خيارات التصفية والتصدير
              </h3>
              <button 
                onClick={() => setIsExportModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Options */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">الحد الأدنى للرصيد</label>
                <input
                  type="number"
                  value={minBalance === 0 ? '' : minBalance}
                  onChange={(e) => setMinBalance(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl py-3 px-4 text-sm font-bold text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                />
              </div>

              <label className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 cursor-pointer group">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-xs border border-slate-100 dark:border-slate-700">
                    <Activity className="w-5 h-5 text-teal-600" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">تضمين الحسابات المؤرشفة</span>
                    <span className="text-[10px] text-slate-500 font-medium">إظهار الحسابات التي تم أرشفتها سابقاً</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={includeArchived}
                  onChange={(e) => setIncludeArchived(e.target.checked)}
                  className="w-5 h-5 rounded-lg text-teal-600 focus:ring-teal-500 border-slate-300 dark:border-slate-700 transition"
                />
              </label>
            </div>

            {/* Export Buttons */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <span className="text-[11px] font-bold text-slate-400 block uppercase tracking-wider">عمليات التصدير والمشاركة</span>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => uiShowToast('قريباً: تصدير PDF', 'info')}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 text-rose-600 hover:bg-rose-100 transition"
                >
                  <FileText className="w-6 h-6" />
                  <span className="text-[10px] font-black">PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-3xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 text-emerald-600 hover:bg-emerald-100 transition"
                >
                  <TableIcon className="w-6 h-6" />
                  <span className="text-[10px] font-black">EXCEL</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading ? (
        <div className="py-16 text-center text-xs font-bold text-slate-400 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800">
          جاري إعداد وتحليل تقرير المستحقات...
        </div>
      ) : error ? (
        /* Error State */
        <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-rose-200 dark:border-rose-900/50 space-y-3">
          <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-rose-700 dark:text-rose-300">{error}</p>
          <button
            type="button"
            onClick={loadReport}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold transition hover:opacity-90 inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            إعادة المحاولة
          </button>
        </div>
      ) : !report ? (
        <div className="p-8 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800">
          لا توجد بيانات متاحة
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary Banner & Excel Export */}
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  إجمالي الديون المستحقة لك على الآخرين ({report.accountsCount} حساب)
                </span>
                {hasActiveFilters && report.overallAccountsCount !== undefined && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300">
                    من أصل {report.overallAccountsCount} حساب
                  </span>
                )}
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-700 dark:text-emerald-300 tabular-nums font-mono">
                +{formatCurrency(report.totalAmount, currency)}
              </div>
              {hasActiveFilters && report.overallTotalAmount !== undefined && report.overallTotalAmount !== report.totalAmount && (
                <div className="text-[11px] font-semibold text-emerald-600/90 dark:text-emerald-400/90 mt-1">
                  إجمالي كل المستحقات: +{formatCurrency(report.overallTotalAmount, currency)}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleExportExcel}
              disabled={exporting || report.items.length === 0}
              className="px-4 py-2.5 min-h-[44px] rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-xs font-bold transition flex items-center justify-center gap-2 self-stretch sm:self-auto shadow-xs select-none"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{exporting ? 'جاري التصدير...' : 'تصدير التقرير (Excel .xlsx)'}</span>
            </button>
          </div>

          {/* Empty State when items array is empty */}
          {report.items.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200/80 dark:border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                {hasActiveFilters ? <Filter className="w-6 h-6" /> : <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {hasActiveFilters
                    ? 'لم يتم العثور على حسابات مدينة مطابقة للمعايير'
                    : 'لا توجد ديون مستحقة لك حالياً'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {hasActiveFilters
                    ? 'جرّب تعديل عبارة البحث أو تقليل الحد الأدنى للرصيد.'
                    : 'جميع الحسابات متوازنة أو لا توجد أرصدة مدينة مسجلة في النظام.'}
                </p>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition"
                >
                  مسح الفلاتر
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Mobile Card List (sm:hidden) */}
              <div className="sm:hidden space-y-2.5">
                {sortedItems.map((item, idx) => (
                  <div
                    key={item.account.id}
                    className="p-3.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5"
                  >
                    {/* Header Row */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {item.account.name}
                        </span>
                        {item.account.archived && (
                          <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded shrink-0">
                            مؤرشف
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate(`/reports?tab=statement&accountId=${item.account.id}`)}
                        className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-teal-600 transition shrink-0"
                        title="عرض كشف الحساب"
                        aria-label={`عرض كشف حساب ${item.account.name}`}
                      >
                        <FileText className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Financial Magnitude & Share */}
                    <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                        +{formatCurrency(item.balance, currency)}
                      </div>
                      <span className="text-[11px] font-bold font-mono text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-2 py-0.5 rounded-full">
                        الحصة: {item.sharePercentage}%
                      </span>
                    </div>

                    {/* Share Mini Progress Bar */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(2, item.sharePercentage))}%` }}
                      />
                    </div>

                    {/* Metadata Footer */}
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                      <span className="font-medium">
                        {item.transactionCount} حركة مسجلة
                      </span>
                      {item.account.phone ? (
                        <span className="font-mono flex items-center gap-1 text-slate-600 dark:text-slate-400" dir="ltr">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {item.account.phone}
                        </span>
                      ) : (
                        <span className="text-slate-400">بدون هاتف</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View (hidden sm:block) */}
              <div className="hidden sm:block rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-right">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800 text-slate-500 font-bold">
                        <th className="py-3.5 px-3 text-center w-12">#</th>
                        <th className="py-3.5 px-4">اسم الحساب</th>
                        <th className="py-3.5 px-4">رقم الهاتف</th>
                        <th className="py-3.5 px-4 text-emerald-600 dark:text-emerald-400">المبلغ المستحق لك</th>
                        <th className="py-3.5 px-4 text-center">نسبة الحصة %</th>
                        <th className="py-3.5 px-4 text-center">العمليات</th>
                        <th className="py-3.5 px-4 text-center">كشف الحساب</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {sortedItems.map((item, idx) => (
                        <tr key={item.account.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-3 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-4">
                            <button
                              type="button"
                              onClick={() => navigate(`/accounts/${item.account.id}`)}
                              className="font-bold text-slate-900 dark:text-slate-100 hover:text-teal-600 dark:hover:text-teal-400 transition text-right"
                            >
                              {item.account.name}
                            </button>
                            {item.account.archived && (
                              <span className="ms-2 text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                مؤرشف
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-500" dir="ltr">
                            {item.account.phone || '—'}
                          </td>
                          <td className="py-3 px-4 font-extrabold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                            +{formatCurrency(item.balance, currency)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex flex-col items-center gap-1 w-20">
                              <span className="font-bold font-mono text-slate-700 dark:text-slate-300">
                                {item.sharePercentage}%
                              </span>
                              <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                <div
                                  className="bg-emerald-500 h-full rounded-full"
                                  style={{ width: `${Math.min(100, Math.max(2, item.sharePercentage))}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center font-bold font-mono text-slate-500">
                            {item.transactionCount}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => navigate(`/reports?tab=statement&accountId=${item.account.id}`)}
                              className="p-2 min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-teal-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                              title="عرض كشف الحساب"
                              aria-label={`كشف حساب ${item.account.name}`}
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
