import { StructuredAICommand } from '@/shared/types/ai.types';
import { accountRepository } from '@/core/repositories/account.repository';
import { Account, CurrencyCode } from '@/shared/types';
import { toDualRepresentation } from '@/core/money/compat';
import { settingsRepository } from '@/core/repositories/settings.repository';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class AIValidationService {
  /**
   * Validates a StructuredAICommand against financial business rules.
   * Resolves currency locally without assuming 'YER' and rejects if unresolved.
   */
  public async validate(command: StructuredAICommand, testAccountMock?: Account): Promise<ValidationResult> {
    const errors: string[] = [];
    const supportedCurrencies: CurrencyCode[] = ['YER', 'SAR', 'USD'];

    // 1. Check accountId existence
    let account = testAccountMock;
    if (!command.accountId) {
      errors.push('يجب تحديد الحساب المالي المرتبط بالعملية.');
    } else {
      if (!account) {
        account = await accountRepository.getById(command.accountId);
      }
      if (!account) {
        errors.push('الحساب المالي المحدد غير موجود في قاعدة البيانات.');
      } else if (account.archived) {
        errors.push(`الحساب "${account.name}" مؤرشف ولا يمكن تسجيل عمليات جديدة عليه.`);
      } else {
        command.targetAccount = account;
      }
    }

    // 2. Validate amount
    if (typeof command.amount !== 'number' || isNaN(command.amount) || command.amount <= 0) {
      errors.push('المبلغ المالي يجب أن يكون رقماً موجباً أكبر من الصفر.');
    }

    // 3. Validate transaction type
    if (command.type !== 'debit' && command.type !== 'credit') {
      errors.push('نوع العملية غير صالح. يجب أن يكون "له" أو "عليه".');
    }

    // 4. Resolve and validate currency locally without blind assumptions
    let finalCurrency = command.currency as CurrencyCode | undefined;

    if (!finalCurrency || !supportedCurrencies.includes(finalCurrency)) {
      if (account?.currency && supportedCurrencies.includes(account.currency)) {
        finalCurrency = account.currency;
      } else {
        try {
          const sysCurr = await settingsRepository.get<CurrencyCode>('currency');
          if (sysCurr && supportedCurrencies.includes(sysCurr)) {
            finalCurrency = sysCurr;
          }
        } catch {
          // ignore
        }
      }
    }

    if (!finalCurrency || !supportedCurrencies.includes(finalCurrency)) {
      errors.push('العملة المحددة غير مدعومة أو تعذر حسمها من الحساب والنظام.');
    } else {
      command.currency = finalCurrency as any;
      // Re-align dual representation strictly with resolved currency
      const dual = toDualRepresentation(command.amount, finalCurrency);
      command.amount = dual.amount;
      command.amountMinor = dual.amountMinor;
    }

    // 5. Update command status
    if (errors.length === 0) {
      command.status = 'READY_FOR_CONFIRMATION';
      command.validationErrors = undefined;
    } else {
      command.status = 'REJECTED';
      command.validationErrors = errors;
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}

export const aiValidationService = new AIValidationService();
