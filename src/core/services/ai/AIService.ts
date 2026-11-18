import {
  AIChatMessage,
  AIProvider,
  AIRequest,
  AIResponse,
  StructuredAICommand,
} from '@/shared/types/ai.types';
import { localFallbackProvider } from './providers/LocalFallbackProvider';
import { geminiProvider } from './providers/GeminiProvider';
import { aiTools } from './AITools';
import { aiAuditRepository } from '@/core/repositories/aiAudit.repository';
import { aiPrivacyService } from './AIPrivacyService';
import { aiValidationService } from './AIValidationService';
import { validateStructuredAICommand } from './aiValidation';
import { Transaction, Permission } from '@/shared/types';

import { aiCommandRepository } from '@/core/repositories/aiCommand.repository';

export class AIService {
  private activeProvider: AIProvider = localFallbackProvider;
  private inFlightRequests = new Map<string, Promise<AIResponse>>();
  private lastRequestTimestamp = 0;
  private minIntervalMs = 200;

  constructor() {
    this.selectBestProvider();
  }

  /**
   * Evaluates environment and selects the best available provider
   */
  public async selectBestProvider(): Promise<void> {
    try {
      const isGeminiReady = await geminiProvider.isAvailable();
      if (isGeminiReady) {
        this.activeProvider = geminiProvider;
      } else {
        this.activeProvider = localFallbackProvider;
      }
    } catch {
      this.activeProvider = localFallbackProvider;
    }
  }

  public getActiveProviderName(): string {
    return this.activeProvider.name;
  }

  /**
   * Main query entry point for user prompts.
   * Throttled, deduplicated, offline-aware, and audited.
   */
  public async ask(prompt: string): Promise<AIResponse> {
    const rawPrompt = prompt.trim();
    if (!rawPrompt) {
      throw new Error('الرجاء كتابة سؤال أو طلب مالي.');
    }

    // 1. Throttling
    const now = Date.now();
    if (now - this.lastRequestTimestamp < this.minIntervalMs) {
      await new Promise((r) => setTimeout(r, this.minIntervalMs - (now - this.lastRequestTimestamp)));
    }
    this.lastRequestTimestamp = Date.now();

    // 2. Deduplication of identical concurrent in-flight requests
    const cacheKey = rawPrompt.toLowerCase();
    if (this.inFlightRequests.has(cacheKey)) {
      return await this.inFlightRequests.get(cacheKey)!;
    }

    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);

    const promise = (async () => {
      let response: AIResponse;
      try {
        const request: AIRequest = { prompt: rawPrompt };
        
        // If offline, use localFallbackProvider directly
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          response = await localFallbackProvider.generate(request);
          response.isOfflineFallback = true;
        } else {
          // Timeout race
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('انتهت مهلة الاتصال بالمزود')), 6000)
          );
          response = await Promise.race([this.activeProvider.generate(request), timeoutPromise]);
        }
      } catch {
        // Fallback to local deterministic provider
        response = await localFallbackProvider.generate({ prompt: rawPrompt });
        response.isOfflineFallback = true;
      }

      // If a command is generated, validate it and persist its durable record.
      if (response.command) {
        // Pre-validate to move from PENDING_VALIDATION to READY_FOR_CONFIRMATION or REJECTED
        await aiValidationService.validate(response.command);
        // Persist to Dexie for recovery
        await aiCommandRepository.add(response.command);
      }

      // Record in AI audit log
      await aiAuditRepository.addLog({
        id: 'audit_' + requestId,
        requestId,
        promptPreview: aiPrivacyService.sanitizePromptForAudit(rawPrompt),
        intent: response.intent,
        timestamp: new Date().toISOString(),
        status: 'success',
        provider: response.provider || this.activeProvider.id,
        confidence: response.confidence,
        action: response.command ? `Prepared command ${response.command.intent}` : `Answered intent ${response.intent}`,
        confirmed: false,
      });

      return response;
    })();

    this.inFlightRequests.set(cacheKey, promise);

    try {
      return await promise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  /**
   * Confirms and strictly executes a previously prepared and validated command.
   * This is the ONLY legitimate execution gate.
   */
  public async confirmAndExecuteCommand(commandId: string): Promise<Transaction> {
    // Claim first, then validate the exact persisted payload that this tab owns.
    const claimedRecord = await aiCommandRepository.claimCommand(commandId);
    const command = claimedRecord.command;

    try {
      // Strict RBAC Guard: assert ai:query AND specific mutation permission.
      const { rbacGuard } = await import('../rbac/RBACGuard.service');
      await rbacGuard.assertPermission('ai:query', {
        targetType: 'ai',
        targetId: commandId,
        details: `استخدام المساعد لتنفيذ: ${command.intent}`,
      });

      const intentPermissionMap: Record<string, Permission> = {
        'CREATE_TRANSACTION_REQUEST': 'transactions:create',
        'EDIT_TRANSACTION_REQUEST': 'transactions:update',
        'DELETE_TRANSACTION_REQUEST': 'transactions:delete',
      };

      const requiredFinancialPermission = intentPermissionMap[command.intent];
      if (requiredFinancialPermission) {
        await rbacGuard.assertPermission(requiredFinancialPermission, {
          targetType: 'transaction',
          targetId: command.accountId,
          details: `تنفيذ أمر مالي مولد بالذكاء الاصطناعي: ${command.intent}`,
        });
      }

      if (command.status !== 'READY_FOR_CONFIRMATION' && command.status !== 'CONFIRMED') {
        throw new Error(`لا يمكن تنفيذ أمر مالي في حالته الحالية: ${command.status}. يجب أن يكون الأمر جاهزاً للتأكيد.`);
      }

      const schemaResult = validateStructuredAICommand(command);
      if (!schemaResult.success) {
        throw new Error('بيانات الأمر المالي غير صالحة وفق المعايير التقنية');
      }

      const valResult = await aiValidationService.validate(command);
      if (!valResult.isValid) {
        throw new Error(valResult.errors[0] || 'تعذر التحقق من صحة العملية قبل التنفيذ النهائي');
      }

      if (!command.accountId || !command.operationId || typeof command.amountMinor !== 'number' || command.amountMinor < 0) {
        throw new Error('بيانات الأمر المالي ناقصة أو غير صالحة بعد التحقق النهائي');
      }

      command.status = 'CONFIRMED';
      await aiCommandRepository.update(command);

      // Execute strictly via AITools -> FinancialTransactionEngine.
      const transaction = await aiTools.executeConfirmedCommand(command);
      await aiCommandRepository.markDone(command);

      return transaction;
    } catch (err) {
      // Persist a terminal lifecycle state; a failed command is not silently re-claimed.
      try {
        if (command.status === 'EXECUTED') {
          await aiCommandRepository.markDone(command);
        } else {
          if (command.status === 'CONFIRMED') {
            command.status = 'READY_FOR_CONFIRMATION';
          }
          await aiCommandRepository.markFailed(command);
        }
      } catch (persistenceError) {
        console.error('[AIService] Failed to persist command terminal state:', persistenceError);
      }
      throw err;
    }
  }

  /**
   * Cancels a command only while it is still PENDING, then removes its durable record.
   */
  public async cancelCommand(commandId: string): Promise<void> {
    const record = await aiCommandRepository.getRecordById(commandId);
    if (!record || record.status !== 'PENDING') {
      if (record?.status === 'RUNNING') {
        throw new Error('لا يمكن إلغاء أمر قيد التنفيذ');
      }
      return;
    }

    const expiresAt = Date.parse(record.expiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return;

    const command = record.command;
    command.status = 'CANCELLED';
    await aiCommandRepository.update(command);
    await aiAuditRepository.addLog({
      id: 'audit_cancel_' + Date.now(),
      requestId: command.id,
      intent: command.intent,
      timestamp: new Date().toISOString(),
      status: 'canceled',
      provider: 'user_action',
      confidence: 1.0,
      action: 'User cancelled command execution',
      confirmed: false,
    });
    await aiCommandRepository.delete(commandId);
  }

  public async getPendingCommand(commandId: string): Promise<StructuredAICommand | undefined> {
    return await aiCommandRepository.getById(commandId);
  }
}

export const aiService = new AIService();
