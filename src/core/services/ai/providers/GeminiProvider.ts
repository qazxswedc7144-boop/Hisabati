import { AIProvider, AIRequest, AIResponse } from '@/shared/types/ai.types';
import { localFallbackProvider } from './LocalFallbackProvider';

export class GeminiProvider implements AIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini (Server-side AI)';

  public async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined' || !navigator.onLine) {
      return false;
    }
    try {
      // Check if backend API endpoint responds
      const res = await fetch('/api/health', { method: 'GET', signal: AbortSignal.timeout(1500) });
      return res.ok;
    } catch {
      return false;
    }
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    // If offline, directly delegate to local fallback provider
    if (!navigator.onLine) {
      return await localFallbackProvider.generate(request);
    }

    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: request.prompt,
          mode: request.mode,
          context: request.minimalContext,
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
    } catch {
      // Network failure, timeout, or no backend server running -> Fallback safely to local engine
    }

    // Seamless offline/local fallback
    const fallbackResponse = await localFallbackProvider.generate(request);
    fallbackResponse.isOfflineFallback = true;
    return fallbackResponse;
  }
}

export const geminiProvider = new GeminiProvider();
