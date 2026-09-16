import { StructuredAICommand, Currency } from '@/shared/types/ai.types';
import { ParsedIntentResult } from './AIIntentService';
import { accountResolver } from './AccountResolver';
import { Account, CurrencyCode } from '@/shared/types';
import { toDualRepresentation } from '@/core/money/compat';

export class AICommandParser {
  /**
   * Constructs a strongly-typed StructuredAICommand from parsed intent and entities.
   */
  public async parseCommand(
    parsed: ParsedIntentResult,
    accountsList?: Account[]
  ): Promise<StructuredAICommand> {
    const id = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const operationId = `op_ai_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const date = parsed.entities.dateCandidate || new Date().toISOString().split('T')[0];
    const currencyCandidate = parsed.entities.currencyCandidate;
    // Do NOT fallback to 'YER' here. Let the engine resolve it from account or system.
    // However, for dual-representation calculation during parsing, we need a reference.
    // If no candidate, we use 'YER' as a temporary conversion baseline, 
    // but we mark the command currency as undefined to trigger engine resolution.
    const tempCurrency: CurrencyCode = (currencyCandidate as CurrencyCode) || 'YER';
    const rawAmount = parsed.entities.amount || 0;
    const type = parsed.entities.transactionTypeCandidate || 'debit';
    const { amount: safeDecimal, amountMinor: safeMinor } = toDualRepresentation(rawAmount, tempCurrency);
    
    const command: StructuredAICommand = {
      id,
      intent: (parsed.intent as StructuredAICommand['intent']) || 'CREATE_TRANSACTION_REQUEST',
      amount: safeDecimal,
      amountMinor: safeMinor,
      currency: currencyCandidate as Currency, 
      type: type as any,
      date,
      note: parsed.entities.noteCandidate || 'عملية مسجلة عبر المساعد الذكي',
      confidence: parsed.confidence,
      status: 'PENDING_VALIDATION',
      operationId,
    };

    // Resolve target account
    if (parsed.entities.accountNameCandidate) {
      command.accountName = parsed.entities.accountNameCandidate;
      const resolved = await accountResolver.resolve(parsed.entities.accountNameCandidate, accountsList);

      if (resolved.status === 'EXACT_MATCH' && resolved.account) {
        command.accountId = resolved.account.id;
        command.targetAccount = resolved.account;
      } else if (resolved.status === 'MULTIPLE_MATCHES' && resolved.accounts) {
        command.disambiguationOptions = resolved.accounts;
        command.validationErrors = [
          `يوجد أكثر من حساب مطابق للاسم "${parsed.entities.accountNameCandidate}". يرجى تحديد الحساب المطلوب.`,
        ];
      } else {
        command.validationErrors = [
          `لم يتم العثور على حساب باسم "${parsed.entities.accountNameCandidate}" في دفتر الحسابات.`,
        ];
      }
    } else {
      command.validationErrors = ['لم يتم تحديد اسم الحساب في الطلب.'];
    }

    return command;
  }
}

export const aiCommandParser = new AICommandParser();
