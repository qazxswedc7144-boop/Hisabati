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

  // In-memory active structured commands registry (mirrored in Dexie)
  private pendingCommands = new Map<string, StructuredAICommand>();

  constructor() {
    this.selectBestProvider();
    this.loadPendingFromStorage();
  }

  /**
   * Loads pending commands from Dexie to memory for recovery after restart.
   */
  private async loadPendingFromStorage(): Promise<void> {
    try {
      const stored = await aiCommandRepository.getAllPending();
      for (const cmd of stored) {
        this.pendingCommands.set(cmd.id, cmd);
      }
    } catch (err) {
      console.error('[AIService] Failed to load pending commands from storage:', err);
    }
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

      // If command generated, register into pending commands registry and validate immediately
      if (response.command) {
        this.pendingCommands.set(response.command.id, response.command);
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
    const command = this.pendingCommands.get(commandId);
    if (!command) {
      throw new Error('الأمر المالي غير موجود أو انتهت صلاحيته');
    }

    // 0. Strict RBAC Guard: assert ai:query AND specific mutation permission
    const { rbacGuard } = await import('../rbac/RBACGuard.service');
    
    // Always check ai:query first
    await rbacGuard.assertPermission('ai:query', {
      targetType: 'ai',
      targetId: commandId,
      details: `استخدام المساعد لتنفيذ: ${command.intent}`,
    });

    // Map intent to specific financial permission
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

    // Strict State Guard: Execution is only allowed for commands in READY_FOR_CONFIRMATION or CONFIRMED (retry) state
    if (command.status !== 'READY_FOR_CONFIRMATION' && command.status !== 'CONFIRMED') {
      throw new Error(`لا يمكن تنفيذ أمر مالي في حالته الحالية: ${command.status}. يجب أن يكون الأمر جاهزاً للتأكيد.`);
    }

    // Strict Zod Runtime Schema validation
    const schemaResult = validateStructuredAICommand(command);
    if (!schemaResult.success) {
      throw new Error('بيانات الأمر المالي غير صالحة وفق المعايير التقنية');
    }

    // Final integrity check before execution (business rules)
    const valResult = await aiValidationService.validate(command);
    if (!valResult.isValid) {
      throw new Error(valResult.errors[0] || 'تعذر التحقق من صحة العملية قبل التنفيذ النهائي');
    }

    if (!command.accountId || !command.operationId || typeof command.amountMinor !== 'number' || command.amountMinor < 0) {
      throw new Error('بيانات الأمر المالي ناقصة أو غير صالحة بعد التحقق النهائي');
    }

    try {
      // Transition status to CONFIRMED
      command.status = 'CONFIRMED';
      await aiCommandRepository.update(command);

      // Execute strictly via AITools -> FinancialTransactionEngine
      const transaction = await aiTools.executeConfirmedCommand(command);

      // Update in-memory registry and storage with final state
      this.pendingCommands.set(commandId, command);
      await aiCommandRepository.update(command);

      return transaction;
    } catch (err) {
      // Rollback status if it's not EXECUTED (meaning engine likely failed or rejected)
      // We cast to any to bypass TS narrowing from line 167
      if ((command.status as any) !== 'EXECUTED') {
        command.status = 'READY_FOR_CONFIRMATION';
        await aiCommandRepository.update(command);
      }
      throw err;
    }
  }

  /**
   * Cancels a pending structured command, leaving the database completely untouched.
   */
  public async cancelCommand(commandId: string): Promise<void> {
    const command = this.pendingCommands.get(commandId);
    if (command) {
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
      this.pendingCommands.delete(commandId);
      await aiCommandRepository.delete(commandId);
    }
  }

  public getPendingCommand(commandId: string): StructuredAICommand | undefined {
    return this.pendingCommands.get(commandId);
  }
}

export const aiService = new AIService();
