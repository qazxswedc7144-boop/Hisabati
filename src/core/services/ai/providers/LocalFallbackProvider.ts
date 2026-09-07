import { AIProvider, AIRequest, AIResponse } from '@/shared/types/ai.types';
import { aiIntentService } from '../AIIntentService';
import { aiTools } from '../AITools';
import { aiResponseService } from '../AIResponseService';
import { aiCommandParser } from '../AICommandParser';
import { aiValidationService } from '../AIValidationService';
import { accountResolver } from '../AccountResolver';

export class LocalFallbackProvider implements AIProvider {
  public readonly id = 'local_fallback';
  public readonly name = 'المعالج المالي المحلي (Offline)';

  public async isAvailable(): Promise<boolean> {
    // Local fallback is always available regardless of internet connection
    return true;
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const parsed = aiIntentService.parse(request.prompt);

    switch (parsed.intent) {
      case 'GET_TOTAL_RECEIVABLES': {
        const report = await aiTools.getTotalReceivables();
        return aiResponseService.formatReceivablesResponse(report);
      }

      case 'GET_TOTAL_PAYABLES': {
        const report = await aiTools.getTotalPayables();
        return aiResponseService.formatPayablesResponse(report);
      }

      case 'GET_NET_BALANCE': {
        const summary = await aiTools.getNetBalance();
        return aiResponseService.formatNetBalanceResponse(summary);
      }

      case 'GET_TOP_DEBTORS': {
        const debtors = await aiTools.getTopDebtors(5);
        return aiResponseService.formatTopDebtorsResponse(debtors);
      }

      case 'GET_TOP_CREDITORS': {
        const creditors = await aiTools.getTopCreditors(5);
        return {
          text: creditors.length > 0
            ? `أعلى الدائنين لك هو "${creditors[0].account.name}" بمبلغ ${creditors[0].balance}.`
            : 'لا توجد التزامات دائنة عليك حالياً.',
          intent: 'GET_TOP_CREDITORS',
          confidence: 0.95,
          mode: 'analyze',
          card: {
            cardType: 'top_creditors_card',
            title: 'أعلى الدائنين (أكثر من يطالبك)',
            accountsList: creditors.map((c) => c.account),
          },
          provider: this.id,
        };
      }

      case 'GET_PERIOD_SUMMARY': {
        const summary = await aiTools.getFinancialSummary('this_month');
        return aiResponseService.formatFinancialSummaryResponse(summary);
      }

      case 'GET_ACCOUNT_BALANCE': {
        if (!parsed.entities.accountNameCandidate) {
          return aiResponseService.formatErrorResponse(
            'يرجى تحديد اسم الحساب لمعرفة رصيده (مثال: كم لي عند أحمد؟)',
            'GET_ACCOUNT_BALANCE'
          );
        }

        const resolved = await accountResolver.resolve(parsed.entities.accountNameCandidate);
        if (resolved.status === 'EXACT_MATCH' && resolved.account) {
          return aiResponseService.formatAccountBalanceResponse(resolved.account);
        } else if (resolved.status === 'MULTIPLE_MATCHES' && resolved.accounts) {
          return {
            text: `يوجد أكثر من حساب مطابق للاسم "${parsed.entities.accountNameCandidate}". يرجى اختيار الحساب:`,
            intent: 'GET_ACCOUNT_BALANCE',
            confidence: 0.85,
            mode: 'ask',
            card: {
              cardType: 'account_disambiguation_card',
              title: 'اختيار الحساب المطلوب',
              accountsList: resolved.accounts,
            },
            provider: this.id,
          };
        } else {
          return aiResponseService.formatErrorResponse(
            `لم يتم العثور على حساب باسم "${parsed.entities.accountNameCandidate}" في دفتر الحسابات.`,
            'GET_ACCOUNT_BALANCE'
          );
        }
      }

      case 'GET_ACCOUNT_STATEMENT': {
        if (!parsed.entities.accountNameCandidate) {
          return aiResponseService.formatErrorResponse(
            'يرجى تحديد اسم الحساب المطلوب استخراج كشف حسابه.',
            'GET_ACCOUNT_STATEMENT'
          );
        }

        const resolved = await accountResolver.resolve(parsed.entities.accountNameCandidate);
        if (resolved.status === 'EXACT_MATCH' && resolved.account) {
          const statement = await aiTools.getAccountStatement(resolved.account.id);
          return aiResponseService.formatAccountStatementResponse(statement);
        } else if (resolved.status === 'MULTIPLE_MATCHES' && resolved.accounts) {
          return {
            text: `يوجد أكثر من حساب مطابق للاسم "${parsed.entities.accountNameCandidate}". يرجى اختيار الحساب لعرض كشفه:`,
            intent: 'GET_ACCOUNT_STATEMENT',
            confidence: 0.85,
            mode: 'analyze',
            card: {
              cardType: 'account_disambiguation_card',
              title: 'اختيار الحساب المطلوب',
              accountsList: resolved.accounts,
            },
            provider: this.id,
          };
        } else {
          return aiResponseService.formatErrorResponse(
            `لم يتم العثور على حساب باسم "${parsed.entities.accountNameCandidate}".`,
            'GET_ACCOUNT_STATEMENT'
          );
        }
      }

      case 'CREATE_TRANSACTION_REQUEST': {
        const command = await aiCommandParser.parseCommand(parsed);

        // If disambiguation is required
        if (command.disambiguationOptions && command.disambiguationOptions.length > 0) {
          return aiResponseService.formatDisambiguationResponse(command);
        }

        // Validate command against financial business rules
        await aiValidationService.validate(command);

        if (command.status === 'REJECTED') {
          const errMsg = (command.validationErrors && command.validationErrors[0]) || 'تعذر التحقق من بيانات العملية المالية.';
          return aiResponseService.formatErrorResponse(errMsg, 'CREATE_TRANSACTION_REQUEST');
        }

        // Valid command -> Return confirmation card (Strict User Confirmation Gate)
        return aiResponseService.formatCommandConfirmationResponse(command);
      }

      case 'SEARCH_ACCOUNT': {
        if (!parsed.entities.accountNameCandidate) {
          return aiResponseService.formatErrorResponse('يرجى كتابة اسم أو رقم هاتف للبحث.');
        }
        const matches = await aiTools.searchAccounts(parsed.entities.accountNameCandidate);
        if (matches.length === 0) {
          return {
            text: `لم أجد أي حساب مطابق لـ "${parsed.entities.accountNameCandidate}".`,
            intent: 'SEARCH_ACCOUNT',
            confidence: 0.9,
            mode: 'ask',
            provider: this.id,
          };
        }
        return {
          text: `تم العثور على ${matches.length} حساب مطابق لـ "${parsed.entities.accountNameCandidate}":`,
          intent: 'SEARCH_ACCOUNT',
          confidence: 0.95,
          mode: 'ask',
          card: {
            cardType: 'account_disambiguation_card',
            title: 'نتائج البحث عن الحسابات',
            accountsList: matches,
          },
          provider: this.id,
        };
      }

      case 'GET_RECENT_TRANSACTIONS': {
        const net = await aiTools.getNetBalance();
        return {
          text: `إجمالي العمليات المسجلة حتى الآن هو ${net.totalTransactions} حركة مالية. يمكنك تصفح سجل المعاملات الكامل من قسم المعاملات.`,
          intent: 'GET_RECENT_TRANSACTIONS',
          confidence: 0.9,
          mode: 'ask',
          provider: this.id,
        };
      }

      default:
        return {
          text: 'أهلاً بك في حساباتي! أنا مساعدك المالي الذكي. يمكنك سؤالي مثل: "كم لي؟"، "كم علي؟"، "رصيد أحمد"، "أعلى المدينين"، أو طلب تسجيل عملية مثل "سجل على خالد 5000".',
          intent: 'UNKNOWN',
          confidence: 0.5,
          mode: 'ask',
          provider: this.id,
        };
    }
  }
}

export const localFallbackProvider = new LocalFallbackProvider();
