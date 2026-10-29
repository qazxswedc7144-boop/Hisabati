import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateStructuredAICommand } from '@/core/services/ai/aiValidation';
import { aiValidationService } from '@/core/services/ai/AIValidationService';
import { db } from '@/core/database/db';
import { Account, StructuredAICommand } from '@/shared/types';

describe('AI Financial Hardening (Round 2-A)', () => {
  beforeEach(async () => {
    // Clear relevant tables if needed or mock repositories
    vi.clearAllMocks();
  });

  describe('Zod Contract Consistency', () => {
    it('should reject amount=10 and amountMinor=100 for SAR (expected 1000)', () => {
      const command = {
        id: 'cmd_1',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_1',
        amount: 10,
        amountMinor: 100, // Wrong: SAR has 2 decimals, should be 1000
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_1',
      };

      const result = validateStructuredAICommand(command);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('تعارض في تمويل العملية');
      }
    });

    it('should accept amount=10 and amountMinor=1000 for SAR', () => {
      const command = {
        id: 'cmd_2',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_1',
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_2',
      };

      const result = validateStructuredAICommand(command);
      expect(result.success).toBe(true);
    });

    it('should reject non-integer amountMinor', () => {
      const command = {
        id: 'cmd_3',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_1',
        amount: 10.5,
        amountMinor: 1050.5, // Not an integer
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_3',
      };

      const result = validateStructuredAICommand(command);
      expect(result.success).toBe(false);
    });
  });

  describe('AIValidationService Hardening', () => {
    const mockAccount: Account = {
      id: 'acc_target',
      name: 'Target Account',
      currency: 'SAR',
      currentBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      transactionCount: 0,
      archived: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it('should re-validate and align values when currency is resolved from account', async () => {
      const command: any = {
        id: 'cmd_4',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_target',
        amount: 50,
        // amountMinor is missing (legacy/Gemini fallback)
        // currency is missing, will be resolved from account (SAR)
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_4',
      };

      const result = await aiValidationService.validate(command, mockAccount);
      
      expect(result.isValid).toBe(true);
      expect(command.currency).toBe('SAR');
      expect(command.amountMinor).toBe(5000); // 50 * 100
      expect(command.status).toBe('READY_FOR_CONFIRMATION');
    });

    it('should reject command if amountMinor provided is inconsistent after currency resolution', async () => {
      const command: any = {
        id: 'cmd_5',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_target',
        amount: 50,
        amountMinor: 50, // Wrong for SAR (should be 5000)
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_5',
      };

      const result = await aiValidationService.validate(command, mockAccount);
      
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('فشل التحقق المالي');
      expect(command.status).toBe('REJECTED');
    });

    it('should preserve original amountMinor if consistent', async () => {
      const command: any = {
        id: 'cmd_6',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_target',
        amount: 25.75,
        amountMinor: 2575,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_6',
      };

      await aiValidationService.validate(command, mockAccount);
      expect(command.amount).toBe(25.75);
      expect(command.amountMinor).toBe(2575);
    });

    it('should reject zero or negative amounts', async () => {
      const command: any = {
        id: 'cmd_7',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: 'acc_target',
        amount: 0,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_7',
      };

      const result = await aiValidationService.validate(command, mockAccount);
      expect(result.isValid).toBe(false);
    });
  });
});
