import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateStructuredAICommand } from '@/core/services/ai/aiValidation';
import { aiValidationService } from '@/core/services/ai/AIValidationService';
import { db } from '@/core/database/db';
import { aiCommandRepository } from '@/core/repositories/aiCommand.repository';
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
    await db.aiCommands.clear();
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

  describe('AI-to-Financial-Core End-to-End Integrity (Round 2-C)', () => {
    const testAccId = 'acc_e2e_final';
    const mockAccount: Account = {
      id: testAccId,
      name: 'Final E2E Account',
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

    const createBaseCommand = (id: string, opId: string): any => ({
      id,
      intent: 'CREATE_TRANSACTION_REQUEST',
      accountId: testAccId,
      amount: 100,
      amountMinor: 10000,
      currency: 'SAR',
      type: 'debit',
      date: '2023-10-29',
      confidence: 0.9,
      status: 'READY_FOR_CONFIRMATION',
      operationId: opId,
    });

    it('SCENARIO 1: should reject user with ai:query but without transactions:create', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { rbacGuard } = await import('@/core/services/rbac/RBACGuard.service');
      
      vi.spyOn(rbacGuard, 'assertPermission').mockImplementation(async (perm) => {
        if (perm === 'ai:query') return; 
        if (perm === 'transactions:create') {
          throw new Error('Permission Denied: transactions:create');
        }
      });

      const command = createBaseCommand('cmd_rbac_fail', 'op_rbac_1');
      await aiCommandRepository.add(command);

      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow('Permission Denied: transactions:create');
      
      expect(command.status).toBe('READY_FOR_CONFIRMATION'); 
    });

    it('SCENARIO 2: should succeed when user has all required permissions', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { rbacGuard } = await import('@/core/services/rbac/RBACGuard.service');
      vi.spyOn(rbacGuard, 'assertPermission').mockResolvedValue(undefined);

      const command = createBaseCommand('cmd_success', 'op_success_1');
      await aiCommandRepository.add(command);

      const tx = await aiService.confirmAndExecuteCommand(command.id);
      expect(tx).toBeDefined();
      expect(command.status).toBe('EXECUTED');
    });

    it('SCENARIO 3: should rollback to READY_FOR_CONFIRMATION if engine fails', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      vi.spyOn(transactionEngine, 'createTransaction').mockRejectedValueOnce(new Error('Engine Crash'));

      const command = createBaseCommand('cmd_retry', 'op_retry_1');
      await aiCommandRepository.add(command);

      await expect(aiService.confirmAndExecuteCommand(command.id)).rejects.toThrow('Engine Crash');
      
      expect(command.status).toBe('READY_FOR_CONFIRMATION'); 
      expect(command.executedTransactionId).toBeUndefined();
    });

    it('SCENARIO 4: should mark as EXECUTED even if audit log fails AFTER transaction creation', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { aiAuditRepository } = await import('@/core/repositories/aiAudit.repository');
      
      vi.spyOn(aiAuditRepository, 'addLog').mockRejectedValueOnce(new Error('Audit DB Full'));

      const command = createBaseCommand('cmd_audit_fail', 'op_audit_fail_1');
      await aiCommandRepository.add(command);

      // It should SUCCEED now because we isolated the audit failure in Round 2-D
      const tx = await aiService.confirmAndExecuteCommand(command.id);
      
      expect(tx).toBeDefined();
      expect(command.status).toBe('EXECUTED');
      expect(command.executedTransactionId).toBe(tx.id);
    });

    it('SCENARIO 5: should prevent duplicate records on retry (Idempotency)', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const opId = 'op_idem_final';
      
      const command = createBaseCommand('cmd_idem', opId);
      await aiCommandRepository.add(command);

      const tx1 = await aiService.confirmAndExecuteCommand(command.id);

      command.status = 'READY_FOR_CONFIRMATION';
      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/EXECUTED|الحالة الحالية/);

      const storedRecord = await aiCommandRepository.getRecordById(command.id);
      expect(storedRecord?.status).toBe('DONE');
      const dbCount = await db.transactions.where('operationId').equals(opId).count();
      expect(dbCount).toBe(1);
      expect(tx1).toBeDefined();
    });

    it('SCENARIO 6: should not change status to EXECUTED before successful engine call', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      
      const command = createBaseCommand('cmd_status_check', 'op_status_check');
      let statusDuringEngineCall: string = '';
      vi.spyOn(transactionEngine, 'createTransaction').mockImplementationOnce(async () => {
        statusDuringEngineCall = command.status; 
        throw new Error('Simulated Failure');
      });

      await aiCommandRepository.add(command);

      try { await aiService.confirmAndExecuteCommand(command.id); } catch {}
      
      expect(statusDuringEngineCall).toBe('CONFIRMED'); 
      expect(command.status).toBe('READY_FOR_CONFIRMATION'); 
    });

    it('SCENARIO 7: should NOT have executedTransactionId if engine fails', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      vi.spyOn(transactionEngine, 'createTransaction').mockRejectedValueOnce(new Error('DB Fail'));

      const command = createBaseCommand('cmd_no_id_on_fail', 'op_no_id_fail');
      await aiCommandRepository.add(command);

      try { await aiService.confirmAndExecuteCommand(command.id); } catch {}
      
      expect(command.executedTransactionId).toBeUndefined();
    });

    it('SCENARIO 8: should reject execution of an already EXECUTED command', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const command = createBaseCommand('cmd_already_exec', 'op_already');
      command.status = 'EXECUTED';
      await aiCommandRepository.add(command);

      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/لا يمكن تنفيذ أمر مالي في حالته الحالية: EXECUTED/);
    });

    it('SCENARIO 9: should reject execution of a PENDING_VALIDATION command', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const command = createBaseCommand('cmd_still_pending', 'op_pending');
      command.status = 'PENDING_VALIDATION';
      await aiCommandRepository.add(command);

      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/يجب أن يكون الأمر جاهزاً للتأكيد/);
    });

    it('SCENARIO 10: should maintain amountMinor and currency integrity throughout the flow', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      const createSpy = vi.spyOn(transactionEngine, 'createTransaction');

      const command = createBaseCommand('cmd_integrity', 'op_integ_1');
      command.amount = 123.45;
      command.amountMinor = 12345;
      await aiCommandRepository.add(command);

      await aiService.confirmAndExecuteCommand(command.id);

      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        amount: 123.45,
        amountMinor: 12345,
        currency: 'SAR',
      }));
      expect(command.amountMinor).toBe(12345);
      expect(command.currency).toBe('SAR');
    });

    it('SCENARIO 11: should prevent execution if user cancels the command', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const command = createBaseCommand('cmd_cancel_test', 'op_cancel');
      await aiCommandRepository.add(command);

      await aiService.cancelCommand(command.id);
      expect(command.status).toBe('CANCELLED');

      // cancellation removes it from registry
      await expect(aiService.confirmAndExecuteCommand(command.id))
        .rejects.toThrow(/الأمر المالي غير موجود أو انتهت صلاحيته/);
    });

    it('SCENARIO 13: HAPPY PATH - should successfully execute from PENDING_VALIDATION after validation', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { aiValidationService } = await import('@/core/services/ai/AIValidationService');
      const { transactionEngine } = await import('@/core/services/transactionEngine.service');
      const createSpy = vi.spyOn(transactionEngine, 'createTransaction');

      const command = createBaseCommand('cmd_happy_path', 'op_happy_path');
      command.status = 'PENDING_VALIDATION'; // Start at the beginning
      await aiCommandRepository.add(command);

      // 1. App validates command (User sees the card)
      await aiValidationService.validate(command);
      expect(command.status).toBe('READY_FOR_CONFIRMATION');
      await aiCommandRepository.update(command);

      // 2. User confirms (User clicks button)
      await aiService.confirmAndExecuteCommand(command.id);

      expect(createSpy).toHaveBeenCalled();
      expect(command.status).toBe('EXECUTED');
    });

    it('SCENARIO 12: should verify audit log recording upon successful execution', async () => {
      const { aiService } = await import('@/core/services/ai/AIService');
      const { aiAuditRepository } = await import('@/core/repositories/aiAudit.repository');
      const addLogSpy = vi.spyOn(aiAuditRepository, 'addLog');

      const command = createBaseCommand('cmd_audit_verify', 'op_audit_verify_1');
      await aiCommandRepository.add(command);

      await aiService.confirmAndExecuteCommand(command.id);

      expect(addLogSpy).toHaveBeenCalledWith(expect.objectContaining({
        requestId: command.id,
        intent: 'CREATE_TRANSACTION_REQUEST',
        status: 'success',
        confirmed: true,
      }));
    });

    describe('ROUND 2-D: Execution Semantics & Recovery', () => {
      it('should reject EDIT and DELETE intents as unsupported via AI for now', async () => {
        const { aiService } = await import('@/core/services/ai/AIService');
        const editCmd = createBaseCommand('cmd_edit', 'op_edit');
        editCmd.intent = 'EDIT_TRANSACTION_REQUEST';
        await aiCommandRepository.add(editCmd);

        await expect(aiService.confirmAndExecuteCommand(editCmd.id))
          .rejects.toThrow(/غير مدعومة حالياً عبر المساعد/);

        const delCmd = createBaseCommand('cmd_del', 'op_del');
        delCmd.intent = 'DELETE_TRANSACTION_REQUEST';
        await aiCommandRepository.add(delCmd);

        await expect(aiService.confirmAndExecuteCommand(delCmd.id))
          .rejects.toThrow(/غير مدعومة حالياً عبر المساعد/);
      });

      it('should recover pending commands from Dexie after simulated restart', async () => {
        const { aiService } = await import('@/core/services/ai/AIService');
        const { aiCommandRepository } = await import('@/core/repositories/aiCommand.repository');

        const cmd = createBaseCommand('cmd_recover', 'op_recover');
        await aiCommandRepository.add(cmd);

        // A fresh service instance must read the durable record without an in-memory cache.
        const { AIService } = await import('@/core/services/ai/AIService');
        const restartedService = new AIService();
        const recovered = await restartedService.getPendingCommand(cmd.id);
        expect(recovered).toBeDefined();
        expect(recovered?.operationId).toBe('op_recover');
        expect(recovered?.status).toBe('READY_FOR_CONFIRMATION');
      });

      it('should succeed even if secondary AI Audit Log fails', async () => {
        const { aiService } = await import('@/core/services/ai/AIService');
        const { aiAuditRepository } = await import('@/core/repositories/aiAudit.repository');
        
        // Mock audit failure (this is the AI audit log, not the financial one)
        vi.spyOn(aiAuditRepository, 'addLog').mockRejectedValueOnce(new Error('Audit Failure'));

        const cmd = createBaseCommand('cmd_audit_fail_isolated', 'op_audit_fail_isolated');
        await aiCommandRepository.add(cmd);

        const tx = await aiService.confirmAndExecuteCommand(cmd.id);
        expect(tx).toBeDefined();
        expect(cmd.status).toBe('EXECUTED');
        // Command should still be marked executed in storage
        const stored = await aiService.getPendingCommand(cmd.id);
        expect(stored?.status).toBe('EXECUTED');
      });

      it('should prevent duplicate transaction if command is retried after successful execution but failed status update', async () => {
        const { aiService } = await import('@/core/services/ai/AIService');
        const { transactionEngine } = await import('@/core/services/transactionEngine.service');
        const opId = 'op_dup_recovery';
        
        const cmd = createBaseCommand('cmd_dup', opId);
        await aiCommandRepository.add(cmd);

        // 1. Execute first time and persist DONE.
        const tx1 = await aiService.confirmAndExecuteCommand(cmd.id);

        // 2. A stale UI attempts to retry after completion.
        cmd.status = 'READY_FOR_CONFIRMATION';
        await expect(aiService.confirmAndExecuteCommand(cmd.id))
          .rejects.toThrow(/EXECUTED|الحالة الحالية/);

        const storedRecord = await aiCommandRepository.getRecordById(cmd.id);
        expect(storedRecord?.status).toBe('DONE');
        const count = await db.transactions.where('operationId').equals(opId).count();
        expect(count).toBe(1);
        expect(tx1).toBeDefined();
      });
    });
  });
});
