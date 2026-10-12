import { AIProvider, AIRequest, AIResponse } from '@/shared/types/ai.types';
import { localFallbackProvider } from './LocalFallbackProvider';
import { auth } from '@/core/database/firebase';
import { privacyGateway } from '../PrivacyGateway';

export class GeminiProvider implements AIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini (Server-side AI)';

  public async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.onLine) {
      return false;
    }
    try {
      const res = await fetch('/api/health', {
        method: 'GET',
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * P0-1: Retrieves a fresh Firebase ID token from the currently signed-in user.
   * Returns null when no authenticated Firebase user is present (local-only mode).
   * Firebase SDK caches the token internally until near expiry; refreshes automatically.
   */
  private async getFirebaseIdToken(): Promise<string | null> {
    try {
      if (!auth || !auth.currentUser) {
        return null;
      }
      return await auth.currentUser.getIdToken();
    } catch {
      return null;
    }
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    // If offline, delegate directly to local fallback.
    if (!navigator.onLine) {
      return await localFallbackProvider.generate(request);
    }

    // P0-1: Require Firebase ID token before any server call.
    // Local-mode users (no Firebase account) fall back silently.
    const idToken = await this.getFirebaseIdToken();
    if (!idToken) {
      const fallback = await localFallbackProvider.generate(request);
      fallback.isOfflineFallback = true;
      return fallback;
    }

    try {
      const sanitizedPrompt = privacyGateway.sanitizePrompt(request.prompt);
      const sanitizedContext = privacyGateway.sanitizeContext(request.minimalContext);

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          prompt: sanitizedPrompt,
          mode: request.mode,
          context: sanitizedContext,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const json = await res.json();
        return {
          text: json.text,
          intent: json.intent,
          confidence: json.confidence || 0.9,
          mode: json.mode || request.mode || 'ask',
          card: json.card,
          command: json.command,
          provider: this.id,
          model: json.model || 'gemini-2.5-flash',
        };
      }

      // Non-2xx (401/403/429/500) → silent fallback to local provider.
      // No token logging to avoid leakage.
    } catch {
      // Network failure, timeout, or server unreachable → fallback.
    }

    const fallbackResponse = await localFallbackProvider.generate(request);
    fallbackResponse.isOfflineFallback = true;
    return fallbackResponse;
  }
}

export const geminiProvider = new GeminiProvider();
