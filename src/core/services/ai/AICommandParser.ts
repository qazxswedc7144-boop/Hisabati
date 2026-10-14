import { StructuredAICommand, Currency } from '@/shared/types/ai.types';
import { ParsedIntentResult } from './AIIntentService';
import { accountResolver } from './AccountResolver';
import { Account, CurrencyCode } from '@/shared/types';
import { toDualRepresentation } from '@/core/money/compat';
import { settingsRepository } from '@/core/repositories/settings.repository';

export class AICommandParser {
  /**
   * Constructs a strongly-typed StructuredAICommand from parsed intent and entities.
   * Eliminates the danger of assuming 'YER' as a fallback baseline.
   * Currency is strictly resolved from: candidate -> target account -> system settings.
   * If unresolved, the command is rejected without arbitrary guessing.
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
    const type = parsed.entities.transactionTypeCandidate || 'debit';
    const supportedCurrencies: CurrencyCode[] = ['YER', 'SAR', 'USD'];
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

    const command: StructuredAICommand = {
      id,
      intent: (parsed.intent as StructuredAICommand['intent']) || 'CREATE_TRANSACTION_REQUEST',
      amount: safeDecimal,
      amountMinor: safeMinor,
      currency: resolvedCurrency as Currency,
      type: type as any,
      date,
      note: parsed.entities.noteCandidate || 'عملية مسجلة عبر المساعد الذكي',
      confidence: parsed.confidence,
      status: validationErrors.length === 0 ? 'PENDING_VALIDATION' : 'REJECTED',
      operationId,
      accountId: matchedAccount?.id,
      accountName: parsed.entities.accountNameCandidate,
      targetAccount: matchedAccount,
      disambiguationOptions,
      validationErrors: validationErrors.length > 0 ? validationErrors : undefined,
    };

    return command;
  }
}

export const aiCommandParser = new AICommandParser();
