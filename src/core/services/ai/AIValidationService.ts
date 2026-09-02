import { StructuredAICommand } from '@/shared/types/ai.types';
import { accountRepository } from '@/core/repositories/account.repository';
import { Account } from '@/shared/types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export class AIValidationService {
  /**
   * Validates a StructuredAICommand against financial business rules.
   * Prevents writing invalid, negative, NaN, or archived account transactions.
   */
  public async validate(command: StructuredAICommand, testAccountMock?: Account): Promise<ValidationResult> {
    const errors: string[] = [];

    // 1. Check accountId existence
    if (!command.accountId) {
      errors.push('يجب تحديد الحساب المالي المرتبط بالعملية.');
    } else {
      const account = testAccountMock || await accountRepository.getById(command.accountId);
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

    // 4. Validate currency
    if (!['YER', 'SAR', 'USD'].includes(command.currency)) {
      errors.push('العملة المحددة غير مدعومة.');
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
