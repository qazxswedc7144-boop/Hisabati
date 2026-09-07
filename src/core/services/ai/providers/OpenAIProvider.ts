import { AIProvider, AIRequest, AIResponse } from '@/shared/types/ai.types';
import { localFallbackProvider } from './LocalFallbackProvider';

export class OpenAIProvider implements AIProvider {
  public readonly id = 'openai';
  public readonly name = 'OpenAI Provider';

  public async isAvailable(): Promise<boolean> {
    return false; // Available via server proxy configuration
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    // Delegated to local fallback provider
    return await localFallbackProvider.generate(request);
  }
}

export const openAIProvider = new OpenAIProvider();
