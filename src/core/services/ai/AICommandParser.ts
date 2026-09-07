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
    const currency: Currency = parsed.entities.currencyCandidate || 'YER';
    const rawAmount = parsed.entities.amount || 0;
    const { amount: safeDecimal, amountMinor: safeMinor } = toDualRepresentation(rawAmount, currency as CurrencyCode);
    const amount = safeDecimal;
    const amountMinor = safeMinor;
    const type = parsed.entities.transactionTypeCandidate || 'debit';

    const command: StructuredAICommand = {
      id,
      intent: (parsed.intent as StructuredAICommand['intent']) || 'CREATE_TRANSACTION_REQUEST',
      amount,
      amountMinor,
      currency,
      type,
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
