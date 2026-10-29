import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateStructuredAICommand } from '@/core/services/ai/aiValidation';
import { aiValidationService } from '@/core/services/ai/AIValidationService';
import { db } from '@/core/database/db';
import { Account } from '@/shared/types';
import { tenantService } from '@/core/services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';

vi.mock('@/core/services/rbac/RBACGuard.service', () => ({
  rbacGuard: {
    assertPermission: vi.fn().mockResolvedValue(true),
    getActiveActor: vi.fn().mockReturnValue({ id: 'test-user', name: 'Test User', role: 'admin' }),
  },
}));

describe('AI Financial Hardening (Round 2-A)', () => {
  beforeEach(async () => {
    await tenantService.initialize();
    useTenantStore.getState().setContext({
      activeOrganization: { id: 'local-test', name: 'Test Org' } as any
    });

    await db.accounts.clear();
    await db.transactions.clear();
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

  describe('AI-to-Financial-Core End-to-End Integrity (Round 2-B)', () => {
    const testAccId = 'acc_e2e';
    const mockAccount: Account = {
      id: testAccId,
      name: 'E2E Account',
      currency: 'SAR',
      currentBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      transactionCount: 0,
      archived: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    beforeEach(async () => {
      await db.accounts.put(mockAccount);
    });

    it('should pass verified amountMinor to the engine correctly (SAR 10 -> 1000)', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      const createSpy = vi.spyOn(transactionEngine, 'createTransaction');

      const command: any = {
        id: 'cmd_e2e_1',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_e2e_1',
      };

      // Register in AIService memory
      (aiService as any).pendingCommands.set(command.id, command);

      await aiService.confirmAndExecuteCommand(command.id);

      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        operationId: 'op_e2e_1'
      }));
    });

    it('should reject execution if AI values become inconsistent with engine interpretation (e.g. currency change)', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      
      const command: any = {
        id: 'cmd_e2e_2',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 10,
        amountMinor: 1000, // Correct for SAR
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_e2e_2',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      // Simulate a malicious/buggy change in memory after validation but before confirm (if possible)
      // Or just verify that if we change currency to YER (0 decimals), it fails because 10 != 1000
      command.currency = 'YER';
      command.status = 'READY_FOR_CONFIRMATION'; // Bypass internal state machine for test

      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/لا يمكن تنفيذ أمر مالي غير صالح/);
    });

    it('should prevent duplicate execution using operationId', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const opId = 'op_unique_123';
      
      const command: any = {
        id: 'cmd_e2e_3',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 50,
        amountMinor: 5000,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 1.0,
        status: 'PENDING_VALIDATION',
        operationId: opId,
      };

      (aiService as any).pendingCommands.set(command.id, command);

      // Execute first time
      const tx1 = await aiService.confirmAndExecuteCommand(command.id);
      
      // Attempt second time (should be blocked by EXECUTED status in AIService)
      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/تم تنفيذه مسبقاً/);

      // If we manually reset status to CONFIRMED and try again, transactionEngine should catch it
      command.status = 'CONFIRMED';
      const tx2 = await aiService.confirmAndExecuteCommand(command.id);
      
      expect(tx1.id).toBe(tx2.id); // Same transaction returned by engine
      
      const count = await db.transactions.where('operationId').equals(opId).count();
      expect(count).toBe(1);
    });

    it('should not mark command as EXECUTED if engine fails', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      vi.spyOn(transactionEngine, 'createTransaction').mockRejectedValueOnce(new Error('DB Error'));

      const command: any = {
        id: 'cmd_e2e_4',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 100,
        amountMinor: 10000,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_e2e_4',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      await expect(aiService.confirmAndExecuteCommand(command.id)).rejects.toThrow('DB Error');
      
      const updatedCmd = aiService.getPendingCommand(command.id);
      expect(updatedCmd?.status).not.toBe('EXECUTED');
      expect(updatedCmd?.executedTransactionId).toBeUndefined();
    });

    it('should maintain compatibility with commands missing amountMinor (Gemini fallback)', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      const createSpy = vi.spyOn(transactionEngine, 'createTransaction');

      const command: any = {
        id: 'cmd_e2e_5',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 15.5,
        // amountMinor missing
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION',
        operationId: 'op_e2e_5',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      await aiService.confirmAndExecuteCommand(command.id);

      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        amount: 15.5,
        amountMinor: 1550, // Correctly derived by validation service
        currency: 'SAR'
      }));
    });
  });
});
