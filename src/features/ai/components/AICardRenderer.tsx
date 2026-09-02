import React, { useState } from 'react';
import {
  AICardData,
  StructuredAICommand,
} from '@/shared/types/ai.types';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  XCircle,
  Users,
  Wallet,
  FileText,
  AlertCircle,
  Clock,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { aiService } from '@/core/services/ai';
import { useUIStore } from '@/shared/stores';

interface AICardRendererProps {
  card: AICardData;
  onNavigateToAccount?: (accountId: string) => void;
  onSelectAccount?: (accountName: string) => void;
  onCommandExecuted?: (command: StructuredAICommand) => void;
}

export const AICardRenderer: React.FC<AICardRendererProps> = ({
  card,
  onNavigateToAccount,
  onSelectAccount,
  onCommandExecuted,
}) => {
  const showToast = useUIStore((state) => state.showToast);
  const [isExecuting, setIsExecuting] = useState(false);
  const [localCommandStatus, setLocalCommandStatus] = useState<StructuredAICommand['status'] | undefined>(
    card.command?.status
  );

  const handleConfirmCommand = async () => {
    if (!card.command) return;
    setIsExecuting(true);
    try {
      await aiService.confirmAndExecuteCommand(card.command.id);
      setLocalCommandStatus('EXECUTED');
      showToast('تم تأكيد وتسجيل العملية المالية بنجاح في دفتر الحسابات', 'success');
      if (onCommandExecuted) {
        onCommandExecuted({ ...card.command, status: 'EXECUTED' });
      }
    } catch (err: any) {
      showToast(err?.message || 'فشل تنفيذ العملية', 'error');
    } finally {
      setIsExecuting(false);
    }
  };

  const handleCancelCommand = async () => {
    if (!card.command) return;
    try {
      await aiService.cancelCommand(card.command.id);
      setLocalCommandStatus('CANCELLED');
      showToast('تم إلغاء الأمر المالي دون أي تعديل في السجلات', 'info');
      if (onCommandExecuted) {
        onCommandExecuted({ ...card.command, status: 'CANCELLED' });
      }
    } catch (err: any) {
      showToast('حدث خطأ أثناء الإلغاء', 'error');
    }
  };

  switch (card.cardType) {
    case 'receivables_card':
      return (
        <div className="mt-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
              {card.title}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
              {card.accountsCount} عملاء مدينين
            </span>
          </div>

          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-200 font-mono tracking-tight">
            {card.formattedAmount}
          </div>

          {card.accountsList && card.accountsList.length > 0 && (
            <div className="pt-2 border-t border-emerald-200/60 dark:border-emerald-900/40 space-y-1.5">
              <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">أبرز الحسابات:</span>
              <div className="flex flex-wrap gap-1.5">
                {card.accountsList.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => onNavigateToAccount && onNavigateToAccount(acc.id)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-50 transition"
                  >
                    <span>{acc.name}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {card.sourceExplanation && (
            <div className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80 flex items-center gap-1 pt-1">
              <Clock className="w-3 h-3" />
              <span>{card.sourceExplanation}</span>
            </div>
          )}
        </div>
      );

    case 'payables_card':
      return (
        <div className="mt-3 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 dark:text-rose-300 flex items-center gap-1.5">
              <ArrowUpRight className="w-4 h-4 text-rose-600" />
              {card.title}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300">
              {card.accountsCount} دائنين
            </span>
          </div>

          <div className="text-2xl font-black text-rose-900 dark:text-rose-200 font-mono tracking-tight">
            {card.formattedAmount}
          </div>

          {card.accountsList && card.accountsList.length > 0 && (
            <div className="pt-2 border-t border-rose-200/60 dark:border-rose-900/40 space-y-1.5">
              <span className="text-[11px] text-rose-700 dark:text-rose-400 font-medium">أبرز الدائنين:</span>
              <div className="flex flex-wrap gap-1.5">
                {card.accountsList.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => onNavigateToAccount && onNavigateToAccount(acc.id)}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border border-rose-200 dark:border-rose-800 hover:bg-rose-50 transition"
                  >
                    <span>{acc.name}</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {card.sourceExplanation && (
            <div className="text-[10px] text-rose-700/80 dark:text-rose-400/80 flex items-center gap-1 pt-1">
              <Clock className="w-3 h-3" />
              <span>{card.sourceExplanation}</span>
            </div>
          )}
        </div>
      );

    case 'account_balance_card':
      return (
        <div className="mt-3 rounded-2xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-teal-900 dark:text-teal-200 flex items-center gap-1.5">
              <Wallet className="w-4 h-4 text-teal-600" />
              {card.title}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-teal-900 dark:text-teal-100 font-mono">
              {card.formattedAmount}
            </span>
            <span className="text-xs font-medium text-teal-700 dark:text-teal-300">
              {(card.amount ?? 0) > 0 ? '(له / دائن لك)' : (card.amount ?? 0) < 0 ? '(عليك / أنت مدين)' : '(متوازن)'}
            </span>
          </div>

          {card.account && (
            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => onNavigateToAccount && onNavigateToAccount(card.account!.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition min-h-[38px]"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>عرض كشف الحساب</span>
              </button>
            </div>
          )}

          {card.sourceExplanation && (
            <div className="text-[10px] text-teal-700/80 dark:text-teal-400/80 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>{card.sourceExplanation}</span>
            </div>
          )}
        </div>
      );

    case 'account_statement_card':
      return (
        <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-teal-600" />
              {card.title}
            </span>
            <span className="text-xs font-mono font-bold text-teal-700 dark:text-teal-300">
              الرصيد: {card.formattedAmount}
            </span>
          </div>

          {card.statementItems && card.statementItems.length > 0 ? (
            <div className="space-y-1.5 text-xs">
              {card.statementItems.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60"
                >
                  <div className="space-y-0.5">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{item.description}</div>
                    <div className="text-[10px] text-slate-400">{item.date}</div>
                  </div>
                  <div className="text-left font-mono font-bold">
                    {item.debit > 0 && <span className="text-emerald-600">+{item.debit}</span>}
                    {item.credit > 0 && <span className="text-rose-600">-{item.credit}</span>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">لا توجد حركات مسجلة مؤخراً.</p>
          )}

          {card.account && (
            <div className="pt-1">
              <button
                onClick={() => onNavigateToAccount && onNavigateToAccount(card.account!.id)}
                className="w-full text-center text-xs font-bold text-teal-600 dark:text-teal-400 py-1.5 hover:underline"
              >
                فتح صفحة الحساب الكاملة ←
              </button>
            </div>
          )}
        </div>
      );

    case 'top_debtors_card':
      return (
        <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Users className="w-4 h-4 text-emerald-600" />
              {card.title}
            </span>
          </div>

          {card.accountsList && card.accountsList.length > 0 ? (
            <div className="space-y-2">
              {card.accountsList.map((acc, index) => (
                <div
                  key={acc.id}
                  onClick={() => onNavigateToAccount && onNavigateToAccount(acc.id)}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-800/40 hover:bg-slate-100 transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{acc.name}</span>
                  </div>
                  <span className="text-xs font-mono font-black text-emerald-600 dark:text-emerald-400">
                    {acc.currentBalance} ريال
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">لا يوجد مدينين حالياً.</p>
          )}
        </div>
      );

    case 'command_confirmation_card':
      const isPending = localCommandStatus === 'READY_FOR_CONFIRMATION' || localCommandStatus === 'PENDING_VALIDATION';
      const isExecuted = localCommandStatus === 'EXECUTED';
      const isCancelled = localCommandStatus === 'CANCELLED';

      return (
        <div className="mt-3 rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/80 dark:bg-amber-950/40 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" />
              {card.title}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                isExecuted
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : isCancelled
                  ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                  : 'bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200'
              }`}
            >
              {isExecuted ? 'تم التنفيذ' : isCancelled ? 'ملغاة' : 'بانتظار موافقتك'}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">الحساب المستهدف:</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {card.account?.name || card.command?.accountName}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">المبلغ:</span>
              <span className="font-mono font-black text-slate-900 dark:text-slate-100">
                {card.formattedAmount}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">نوع القيد:</span>
              <span
                className={`font-bold ${
                  card.command?.type === 'debit' ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {card.command?.type === 'debit' ? 'عليه (مدين لك)' : 'له (دائن عليك/دفعة)'}
              </span>
            </div>
            {card.command?.note && (
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">البيان:</span>
                <span className="text-slate-700 dark:text-slate-300">{card.command.note}</span>
              </div>
            )}
          </div>

          {isPending && (
            <div className="pt-1 flex items-center gap-2">
              <button
                onClick={handleConfirmCommand}
                disabled={isExecuting}
                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition min-h-[44px]"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isExecuting ? 'جاري التنفيذ...' : 'تأكيد التنفيذ في الدفتر'}</span>
              </button>
              <button
                onClick={handleCancelCommand}
                disabled={isExecuting}
                className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition min-h-[44px]"
              >
                <XCircle className="w-4 h-4" />
                <span>إلغاء</span>
              </button>
            </div>
          )}

          {isExecuted && (
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>تم تقييد العملية وحساب الأرصدة الجديدة بنجاح!</span>
            </div>
          )}

          {isCancelled && (
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 dark:bg-slate-800 p-2.5 rounded-xl">
              <XCircle className="w-4 h-4 shrink-0" />
              <span>تم إلغاء الأمر، ولم يتم إجراء أي تغيير في حساباتك.</span>
            </div>
          )}
        </div>
      );

    case 'account_disambiguation_card':
      return (
        <div className="mt-3 rounded-2xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-indigo-600" />
              {card.title}
            </span>
          </div>

          <p className="text-xs text-indigo-800 dark:text-indigo-300">
            انقر على الحساب المناسب للمتابعة:
          </p>

          <div className="space-y-1.5">
            {card.accountsList?.map((acc) => (
              <button
                key={acc.id}
                onClick={() => onSelectAccount && onSelectAccount(acc.name)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 hover:bg-indigo-50 dark:hover:bg-slate-800 transition text-right min-h-[44px]"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-slate-100">{acc.name}</div>
                  {acc.phone && <div className="text-[10px] text-slate-400 font-mono">{acc.phone}</div>}
                </div>
                <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300">
                  {acc.currentBalance} ريال
                </span>
              </button>
            ))}
          </div>
        </div>
      );

    case 'error_card':
      return (
        <div className="mt-2 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{card.sourceExplanation || 'حدث خطأ أثناء معالجة الطلب.'}</span>
        </div>
      );

    default:
      return null;
  }
};
