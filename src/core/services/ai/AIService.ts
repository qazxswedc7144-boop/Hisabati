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
import { Transaction } from '@/shared/types';

export class AIService {
  private activeProvider: AIProvider = localFallbackProvider;
  private inFlightRequests = new Map<string, Promise<AIResponse>>();
  private lastRequestTimestamp = 0;
  private minIntervalMs = 200;

  // In-memory active structured commands registry
  private pendingCommands = new Map<string, StructuredAICommand>();

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

      // If command generated, register into pending commands registry
      if (response.command) {
        this.pendingCommands.set(response.command.id, response.command);
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

    // Strict re-validation before execution
    const valResult = await aiValidationService.validate(command);
    if (!valResult.isValid) {
      throw new Error(valResult.errors[0] || 'تعذر التحقق من صحة العملية');
    }

    // Transition status to CONFIRMED
    command.status = 'CONFIRMED';

    // Execute strictly via AITools -> FinancialTransactionEngine
    const transaction = await aiTools.executeConfirmedCommand(command);

    // Update in-memory registry
    this.pendingCommands.set(commandId, command);

    return transaction;
  }

  /**
   * Cancels a pending structured command, leaving the database completely untouched.
   */
  public async cancelCommand(commandId: string): Promise<void> {
    const command = this.pendingCommands.get(commandId);
    if (command) {
      command.status = 'CANCELLED';
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
    }
  }

  public getPendingCommand(commandId: string): StructuredAICommand | undefined {
    return this.pendingCommands.get(commandId);
  }
}

export const aiService = new AIService();
