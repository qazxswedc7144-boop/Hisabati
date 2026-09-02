import {
  AICardData,
  AICardType,
  AIResponse,
  StructuredAICommand,
} from '@/shared/types/ai.types';
import { ParsedIntentResult } from './AIIntentService';
import { fromMinorUnits } from '@/core/utils/financial';
import { formatCurrency } from '@/core/utils/formatters';
import {
  Account,
  AccountStatementReport,
  FinancialSummaryReport,
  PayablesReport,
  ReceivablesReport,
} from '@/shared/types';

export class AIResponseService {
  /**
   * Formats response for GET_TOTAL_RECEIVABLES
   */
  public formatReceivablesResponse(report: ReceivablesReport): AIResponse {
    const formatted = formatCurrency(report.totalAmount, 'YER');
    const text = report.accountsCount > 0
      ? `إجمالي المبالغ المستحقة لك عند العملاء هو ${formatted} موزعة على ${report.accountsCount} حساب.`
      : `لا توجد ديون مستحقة لك حالياً عند أي عميل.`;

    const card: AICardData = {
      cardType: 'receivables_card',
      title: 'إجمالي المبالغ المستحقة لك',
      amount: report.totalAmount,
      formattedAmount: formatted,
      currency: 'YER',
      accountsCount: report.accountsCount,
      accountsList: report.items.slice(0, 5).map((i) => i.account),
      sourceExplanation: `المصدر: ${report.accountsCount} حساب مسجل | آخر تحديث: الآن`,
    };

    return {
      text,
      intent: 'GET_TOTAL_RECEIVABLES',
      confidence: 0.98,
      mode: 'ask',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats response for GET_TOTAL_PAYABLES
   */
  public formatPayablesResponse(report: PayablesReport): AIResponse {
    const formatted = formatCurrency(report.totalAmount, 'YER');
    const text = report.accountsCount > 0
      ? `إجمالي الديون والمبالغ المستحقة عليك للآخرين هو ${formatted} موزعة على ${report.accountsCount} حساب.`
      : `لا توجد أي ديون مستحقة عليك حالياً. جميع التزاماتك مسددة!`;

    const card: AICardData = {
      cardType: 'payables_card',
      title: 'إجمالي المبالغ المستحقة عليك',
      amount: report.totalAmount,
      formattedAmount: formatted,
      currency: 'YER',
      accountsCount: report.accountsCount,
      accountsList: report.items.slice(0, 5).map((i) => i.account),
      sourceExplanation: `المصدر: ${report.accountsCount} حساب مسجل | آخر تحديث: الآن`,
    };

    return {
      text,
      intent: 'GET_TOTAL_PAYABLES',
      confidence: 0.98,
      mode: 'ask',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats response for GET_NET_BALANCE
   */
  public formatNetBalanceResponse(summary: {
    totalDebit: number;
    totalCredit: number;
    netBalance: number;
    totalTransactions: number;
  }): AIResponse {
    const formattedNet = formatCurrency(Math.abs(summary.netBalance), 'YER');
    let text = '';
    if (summary.netBalance > 0) {
      text = `صافي وضعك المالي إيجابي بمبلغ ${formattedNet} لصالحك (لك عند الناس أكثر مما عليك).`;
    } else if (summary.netBalance < 0) {
      text = `صافي وضعك المالي سلبي بمبلغ ${formattedNet} عليك للآخرين (عليك التزامات أكثر من مستحقاتك).`;
    } else {
      text = `وضعك المالي متوازن تماماً، صافي الرصيد هو صفر.`;
    }

    const card: AICardData = {
      cardType: 'net_balance_card',
      title: 'صافي الوضع المالي',
      amount: summary.netBalance,
      formattedAmount: formattedNet,
      currency: 'YER',
      sourceExplanation: `إجمالي الحركات: ${summary.totalTransactions} حركة مالية`,
    };

    return {
      text,
      intent: 'GET_NET_BALANCE',
      confidence: 0.95,
      mode: 'ask',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats response for GET_ACCOUNT_BALANCE
   */
  public formatAccountBalanceResponse(account: Account): AIResponse {
    const formatted = formatCurrency(Math.abs(account.currentBalance), 'YER');
    let text = '';

    if (account.currentBalance > 0) {
      text = `رصيد حساب "${account.name}" هو ${formatted} لك عنده (مدين لك).`;
    } else if (account.currentBalance < 0) {
      text = `رصيد حساب "${account.name}" هو ${formatted} له عندك (أنت مدين له).`;
    } else {
      text = `حساب "${account.name}" متوازن وخالص بالكامل (الرصيد 0).`;
    }

    const card: AICardData = {
      cardType: 'account_balance_card',
      title: `رصيد حساب: ${account.name}`,
      amount: account.currentBalance,
      formattedAmount: formatted,
      currency: 'YER',
      account,
      sourceExplanation: `عدد العمليات: ${account.transactionCount} | آخر حركة: ${account.updatedAt.split('T')[0]}`,
    };

    return {
      text,
      intent: 'GET_ACCOUNT_BALANCE',
      confidence: 0.95,
      mode: 'ask',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats response for GET_ACCOUNT_STATEMENT
   */
  public formatAccountStatementResponse(statement: AccountStatementReport): AIResponse {
    const formattedCurrent = formatCurrency(Math.abs(statement.closingBalance), 'YER');
    const text = `كشف حساب "${statement.account.name}": الرصيد الحالي هو ${formattedCurrent} بإجمالي ${statement.transactions.length} عملية مسجلة.`;

    const card: AICardData = {
      cardType: 'account_statement_card',
      title: `كشف حساب: ${statement.account.name}`,
      amount: statement.closingBalance,
      formattedAmount: formattedCurrent,
      currency: 'YER',
      account: statement.account,
      statementItems: statement.transactions.slice(-5).map((it) => ({
        date: it.date,
        description: it.note || (it.type === 'debit' ? 'عليه (مدين)' : 'له (دائن)'),
        debit: it.debitAmount,
        credit: it.creditAmount,
        runningBalance: it.runningBalance,
      })),
      sourceExplanation: `من الفترة: ${statement.dateRange.startDate || 'البداية'} إلى ${statement.dateRange.endDate || 'اليوم'}`,
    };

    return {
      text,
      intent: 'GET_ACCOUNT_STATEMENT',
      confidence: 0.94,
      mode: 'analyze',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats response for GET_TOP_DEBTORS
   */
  public formatTopDebtorsResponse(debtors: Array<{ account: Account; balance: number }>): AIResponse {
    if (debtors.length === 0) {
      return {
        text: 'لا يوجد عملاء عليهم ديون حالياً.',
        intent: 'GET_TOP_DEBTORS',
        confidence: 0.95,
        mode: 'analyze',
        provider: 'local_engine',
      };
    }

    const topOne = debtors[0];
    const formattedTop = formatCurrency(topOne.balance, 'YER');
    const text = `أكثر شخص عليه دين هو "${topOne.account.name}" بمبلغ ${formattedTop}. إليك قائمة أعلى المدينين:`;

    const card: AICardData = {
      cardType: 'top_debtors_card',
      title: 'أعلى المدينين (أكثر ديون لك)',
      accountsList: debtors.map((d) => d.account),
      sourceExplanation: `إجمالي المشمولين في القائمة: ${debtors.length} عملاء`,
    };

    return {
      text,
      intent: 'GET_TOP_DEBTORS',
      confidence: 0.95,
      mode: 'analyze',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats response for GET_PERIOD_SUMMARY
   */
  public formatFinancialSummaryResponse(summary: FinancialSummaryReport): AIResponse {
    const formattedDebit = formatCurrency(summary.totalDebit, 'YER');
    const formattedCredit = formatCurrency(summary.totalCredit, 'YER');
    const text = `ملخص الفترة الحالية: إجمالي ما قيدته على العملاء ${formattedDebit}، وإجمالي ما استلمته أو سجلته لهم ${formattedCredit} عبر ${summary.totalTransactions} عملية.`;

    const card: AICardData = {
      cardType: 'financial_summary_card',
      title: 'ملخص الحركة المالية لهذا الشهر',
      amount: summary.netBalance,
      formattedAmount: formatCurrency(summary.netBalance, 'YER'),
      sourceExplanation: `العمليات: ${summary.totalTransactions} | الحسابات النشطة: ${summary.activeAccountsCount}`,
    };

    return {
      text,
      intent: 'GET_PERIOD_SUMMARY',
      confidence: 0.92,
      mode: 'analyze',
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats confirmation card for CREATE_TRANSACTION_REQUEST
   */
  public formatCommandConfirmationResponse(command: StructuredAICommand): AIResponse {
    const formattedAmount = formatCurrency(command.amount, command.currency);
    const typeLabel = command.type === 'debit' ? 'عليه (مدين لك)' : 'له (دائن عليك/دفعة)';

    let text = `هل تريد تسجيل عملية بمبلغ ${formattedAmount} (${typeLabel}) على حساب "${command.targetAccount?.name || command.accountName}"؟`;

    if (command.status === 'READY_FOR_CONFIRMATION') {
      text += '\nيرجى مراجعة تفاصيل العملية أدناه والضغط على "تأكيد التنفيذ" للإتمام.';
    }

    const card: AICardData = {
      cardType: 'command_confirmation_card',
      title: 'تأكيد العملية المالية',
      amount: command.amount,
      formattedAmount,
      currency: command.currency,
      account: command.targetAccount,
      command,
      sourceExplanation: 'تتطلب العمليات المالية موافقتك الصريحة قبل التقييد في الدفتر',
    };

    return {
      text,
      intent: 'CREATE_TRANSACTION_REQUEST',
      confidence: command.confidence,
      mode: 'command',
      command,
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats disambiguation card when multiple accounts match
   */
  public formatDisambiguationResponse(command: StructuredAICommand): AIResponse {
    const text = `يوجد أكثر من حساب مطابق لاسم "${command.accountName}". يرجى اختيار الحساب الصحيح من الخيارات أدناه لتأكيد العملية:`;

    const card: AICardData = {
      cardType: 'account_disambiguation_card',
      title: 'تحديد الحساب المطلوب',
      accountsList: command.disambiguationOptions,
      command,
      sourceExplanation: 'لم يتم تسجيل أي عملية لحين اختيار الحساب المناسب منعاً للالتباس',
    };

    return {
      text,
      intent: 'CREATE_TRANSACTION_REQUEST',
      confidence: 0.8,
      mode: 'command',
      command,
      card,
      provider: 'local_engine',
    };
  }

  /**
   * Formats error / not found response
   */
  public formatErrorResponse(message: string, intent: ParsedIntentResult['intent'] = 'UNKNOWN'): AIResponse {
    return {
      text: message,
      intent,
      confidence: 0.9,
      mode: 'ask',
      card: {
        cardType: 'error_card',
        title: 'تنبيه',
        sourceExplanation: message,
      },
      provider: 'local_engine',
    };
  }
}

export const aiResponseService = new AIResponseService();
