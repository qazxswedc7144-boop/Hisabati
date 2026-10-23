import { StructuredAICommand, Currency } from '@/shared/types/ai.types';
import { ParsedIntentResult } from './AIIntentService';
import { accountResolver } from './AccountResolver';
import { Account, CurrencyCode, TransactionType } from '@/shared/types';
import { toDualRepresentation } from '@/core/money/compat';
import { settingsRepository } from '@/core/repositories/settings.repository';
import { validateStructuredAICommand } from './aiValidation';

export class AICommandParser {
  /**
   * Constructs a strongly-typed StructuredAICommand from parsed intent and entities.
   * Validates against StructuredAICommandSchema to ensure runtime integrity.
   */
  public async parseCommand(
    parsed: ParsedIntentResult,
    accountsList?: Account[]
  ): Promise<StructuredAICommand> {
    const id = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const operationId = `op_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const date = parsed.entities.dateCandidate || new Date().toISOString().split('T')[0];
    const currencyCandidate = parsed.entities.currencyCandidate;
    const rawAmount = parsed.entities.amount || 0;
    const type: TransactionType = parsed.entities.transactionTypeCandidate === 'credit' ? 'credit' : 'debit';
    const supportedCurrencies: CurrencyCode[] = ['YER', 'SAR', 'USD', 'AED'];
    const validationErrors: string[] = [];

    // 1. Resolve target account first so account currency can be determined
    let matchedAccount: Account | undefined = undefined;
    let disambiguationOptions: Account[] | undefined = undefined;

    if (parsed.entities.accountNameCandidate) {
      const resolved = await accountResolver.resolve(parsed.entities.accountNameCandidate, accountsList);

      if (resolved.status === 'EXACT_MATCH' && resolved.account) {
        matchedAccount = resolved.account;
      } else if (resolved.status === 'MULTIPLE_MATCHES' && resolved.accounts) {
        disambiguationOptions = resolved.accounts;
        validationErrors.push(
          `يوجد أكثر من حساب مطابق للاسم "${parsed.entities.accountNameCandidate}". يرجى تحديد الحساب المطلوب.`
        );
      } else {
        validationErrors.push(
          `لم يتم العثور على حساب باسم "${parsed.entities.accountNameCandidate}" في دفتر الحسابات.`
        );
      }
    } else {
      validationErrors.push('لم يتم تحديد اسم الحساب في الطلب.');
    }

    // 2. Resolve currency locally: Candidate -> Target Account -> System Settings
    let resolvedCurrency: CurrencyCode | undefined = undefined;

    if (currencyCandidate && supportedCurrencies.includes(currencyCandidate as CurrencyCode)) {
      resolvedCurrency = currencyCandidate as CurrencyCode;
    } else if (matchedAccount?.currency && supportedCurrencies.includes(matchedAccount.currency)) {
      resolvedCurrency = matchedAccount.currency;
    } else {
      try {
        const sysCurrency = await settingsRepository.get<CurrencyCode>('currency');
        if (sysCurrency && supportedCurrencies.includes(sysCurrency)) {
          resolvedCurrency = sysCurrency;
        }
      } catch {
        // Safe handling if settings repo is unavailable in minimal contexts
      }
    }

    // 3. Compute Dual Representation only when currency is properly resolved
    let safeDecimal = rawAmount;
    let safeMinor = 0;

    if (resolvedCurrency) {
      const dual = toDualRepresentation(rawAmount, resolvedCurrency);
      safeDecimal = dual.amount;
      safeMinor = dual.amountMinor;
    } else {
      validationErrors.push('تعذر حسم عملة العملية المالية من الحساب أو إعدادات النظام. يرجى تحديد العملة.');
    }

    const validIntent: StructuredAICommand['intent'] = 
      ['CREATE_TRANSACTION_REQUEST', 'EDIT_TRANSACTION_REQUEST', 'DELETE_TRANSACTION_REQUEST'].includes(parsed.intent)
        ? (parsed.intent as StructuredAICommand['intent'])
        : 'CREATE_TRANSACTION_REQUEST';

    const command: StructuredAICommand = {
      id,
      intent: validIntent,
      amount: safeDecimal,
      amountMinor: safeMinor,
      currency: (resolvedCurrency || 'YER') as Currency,
      type,
      date,
      note: parsed.entities.noteCandidate || 'عملية مسجلة عبر المساعد الذكي',
      confidence: parsed.confidence,
      status: validationErrors.length === 0 ? 'PENDING_VALIDATION' : 'REJECTED',
      operationId,
      accountId: matchedAccount?.id || '',
      accountName: parsed.entities.accountNameCandidate,
      targetAccount: matchedAccount,
      disambiguationOptions,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };

    // 4. Strict Zod Schema validation
    const validationResult = validateStructuredAICommand(command);
    if (!validationResult.success) {
      command.status = 'REJECTED';
      const zodErrors = validationResult.error.issues ? validationResult.error.issues.map(e => e.message) : ['خطأ في التحقق'];
      command.validationErrors = [...(command.validationErrors || []), ...zodErrors];
    }

    return command;
  }
}

export const aiCommandParser = new AICommandParser();
