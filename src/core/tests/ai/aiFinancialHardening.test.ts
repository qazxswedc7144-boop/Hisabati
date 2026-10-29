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

  describe('AI-to-Financial-Core End-to-End Integrity (Round 2-B-HOTFIX)', () => {
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
        status: 'READY_FOR_CONFIRMATION', // MUST be ready
        operationId: 'op_e2e_1',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      await aiService.confirmAndExecuteCommand(command.id);

      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        operationId: 'op_e2e_1'
      }));
    });

    it('should reject execution if command is PENDING_VALIDATION', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const command: any = {
        id: 'cmd_e2e_pending',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION', // NOT READY
        operationId: 'op_e2e_pending',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/يجب أن يكون الأمر جاهزاً للتأكيد/);
    });

    it('should reject execution if command is REJECTED or CANCELLED', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      
      const rejectedCmd: any = {
        id: 'cmd_e2e_rejected',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        status: 'REJECTED',
        operationId: 'op_rej',
      };

      (aiService as any).pendingCommands.set(rejectedCmd.id, rejectedCmd);
      await expect(aiService.confirmAndExecuteCommand(rejectedCmd.id)).rejects.toThrow(/جاهزاً للتأكيد/);

      rejectedCmd.status = 'CANCELLED';
      await expect(aiService.confirmAndExecuteCommand(rejectedCmd.id)).rejects.toThrow(/جاهزاً للتأكيد/);
    });

    it('should reject execution if AI values become inconsistent with engine interpretation', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      
      const command: any = {
        id: 'cmd_e2e_2',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 10,
        amountMinor: 1000,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'READY_FOR_CONFIRMATION',
        operationId: 'op_e2e_2',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      // Change currency to mismatch
      command.currency = 'YER';

      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/بيانات الأمر المالي غير صالحة وفق المعايير التقنية/);
    });

    it('should prevent duplicate execution using operationId and status', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const opId = 'op_unique_hotfix';
      
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
        status: 'READY_FOR_CONFIRMATION',
        operationId: opId,
      };

      (aiService as any).pendingCommands.set(command.id, command);

      // 1. Execute first time
      const tx1 = await aiService.confirmAndExecuteCommand(command.id);
      expect(command.status).toBe('EXECUTED');
      
      // 2. Attempt second time (blocked by status)
      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/جاهزاً للتأكيد/);

      // 3. If we force it to READY_FOR_CONFIRMATION again, the engine should catch the operationId
      command.status = 'READY_FOR_CONFIRMATION';
      const tx2 = await aiService.confirmAndExecuteCommand(command.id);
      
      expect(tx1.id).toBe(tx2.id); 
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
        status: 'READY_FOR_CONFIRMATION',
        operationId: 'op_e2e_4',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      await expect(aiService.confirmAndExecuteCommand(command.id)).rejects.toThrow('DB Error');
      
      const updatedCmd = aiService.getPendingCommand(command.id);
      expect(updatedCmd?.status).not.toBe('EXECUTED');
      expect(updatedCmd?.status).toBe('CONFIRMED');
    });

    it('should successfully execute after validation moves it to READY_FOR_CONFIRMATION', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      const createSpy = vi.spyOn(transactionEngine, 'createTransaction');

      const command: any = {
        id: 'cmd_e2e_5',
        intent: 'CREATE_TRANSACTION_REQUEST',
        accountId: testAccId,
        amount: 15.5,
        currency: 'SAR',
        type: 'debit',
        date: '2023-01-01',
        confidence: 0.9,
        status: 'PENDING_VALIDATION', // Start as pending
        operationId: 'op_e2e_5',
      };

      (aiService as any).pendingCommands.set(command.id, command);

      // Validate it first (User sees the card)
      await aiValidationService.validate(command);
      expect(command.status).toBe('READY_FOR_CONFIRMATION');

      // Now execute (User clicks confirm)
      await aiService.confirmAndExecuteCommand(command.id);

      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        amount: 15.5,
        amountMinor: 1550,
        currency: 'SAR'
      }));
      expect(command.status).toBe('EXECUTED');
    });
  });
});
