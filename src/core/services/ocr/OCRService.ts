import {
  ImagePreprocessOptions,
  OCRProvider,
  OCRResult,
} from '@/shared/types/ocr.types';
import { localHeuristicOCRProvider } from './providers/LocalHeuristicOCRProvider';
import { serverVisionOCRProvider } from './providers/ServerVisionOCRProvider';
import { OCRFieldParser } from './OCRFieldParser';

/**
 * OCRService
 * Orchestrates OCR providers with resilient offline fallback.
 * Strictly guarantees:
 * 1. AI/OCR is NOT a financial source of truth.
 * 2. NO automatic database writes.
 * 3. Graceful offline execution.
 */
export class OCRService {
  private providers: Map<string, OCRProvider> = new Map();

  constructor() {
    this.registerProvider(localHeuristicOCRProvider);
    this.registerProvider(serverVisionOCRProvider);
  }

  public registerProvider(provider: OCRProvider): void {
    this.providers.set(provider.name, provider);
  }

  public getProvider(name: string): OCRProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Process a document image or text stream into structured financial fields.
   */
  public async processDocument(
    input: string | File | Blob,
    options?: {
      forceLocal?: boolean;
      preprocess?: ImagePreprocessOptions;
      preferredProvider?: string;
    }
  ): Promise<OCRResult> {
    // 1. Direct text stream parsing
    if (typeof input === 'string' && !input.startsWith('data:image/') && !input.startsWith('blob:')) {
      // If it looks like plain text lines, parse deterministically
      if (input.includes('\n') || input.includes('فاتورة') || input.includes('ريال') || input.includes('Total')) {
        return OCRFieldParser.parse(input, 'local_text_parser');
      }
    }

    // 2. Local enforcement check
    if (options?.forceLocal) {
      return localHeuristicOCRProvider.processImage(input, options.preprocess);
    }

    // 3. Try Server Vision (if online & server is healthy)
    const serverProvider = this.providers.get('server_vision_gemini');
    if (serverProvider) {
      try {
        const isServerAvailable = await serverProvider.isAvailable();
        if (isServerAvailable) {
          const result = await serverProvider.processImage(input, options?.preprocess);
          // Enforce safety invariant
          result.isUserConfirmed = false;
          return result;
        }
      } catch (serverErr) {
        console.warn('Server Vision OCR failed, falling back to local heuristic parser:', serverErr);
      }
    }

    // 4. Safe Offline Fallback
    const fallbackResult = await localHeuristicOCRProvider.processImage(input, options?.preprocess);
    fallbackResult.isUserConfirmed = false;
    if (!fallbackResult.warnings.includes('تمت المعالجة عبر المحرك المحلي في وضع عدم الاتصال')) {
      fallbackResult.warnings.push('تمت المعالجة عبر المحرك المحلي في وضع عدم الاتصال');
    }

    return fallbackResult;
  }

  /**
   * Process an image (base64 string, File, or Blob)
   */
  public async processImage(
    input: string | File | Blob,
    options?: ImagePreprocessOptions
  ): Promise<OCRResult> {
    return this.processDocument(input, { preprocess: options });
  }

  /**
   * Process raw text input deterministically
   */
  public async processText(text: string): Promise<OCRResult> {
    return OCRFieldParser.parse(text, 'local_text_parser');
  }
}

export const ocrService = new OCRService();
