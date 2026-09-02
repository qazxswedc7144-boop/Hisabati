import {
  ImagePreprocessOptions,
  OCRProvider,
  OCRResult,
} from '@/shared/types/ocr.types';
import { ImagePreprocessor } from '../ImagePreprocessor';
import { toMinorUnits } from '@/core/utils/financial';

/**
 * ServerVisionOCRProvider
 * Server-side AI Vision OCR Provider using Gemini Multimodal via protected Express API.
 * Keeps API secrets strictly on the server-side.
 */
export class ServerVisionOCRProvider implements OCRProvider {
  public readonly name = 'server_vision_gemini';

  public async isAvailable(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!navigator.onLine) return false;
    try {
      const res = await fetch('/api/health');
      return res.ok;
    } catch {
      return false;
    }
  }

  public async processImage(
    imageSource: string | File | Blob,
    options?: ImagePreprocessOptions
  ): Promise<OCRResult> {
    const startTime = performance.now();

    // 1. Mobile-friendly preprocessing: downscale & enhance contrast before uploading
    const preprocessed = await ImagePreprocessor.preprocess(imageSource, options);

    // 2. Transmit to server endpoint
    const response = await fetch('/api/ocr/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: preprocessed.dataUrl,
        mimeType: preprocessed.mimeType,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server OCR request failed with HTTP ${response.status}`);
    }

    const payload = await response.json();
    const data = payload.result || {};

    const totalVal = Number(data.totalAmount?.value) || 0;
    const subtotalVal = data.subtotal?.value ? Number(data.subtotal.value) : undefined;
    const taxVal = data.tax?.value ? Number(data.tax.value) : undefined;

    const lineItems = Array.isArray(data.lineItems)
      ? data.lineItems.map((item: any, idx: number) => {
          const qty = Number(item.quantity?.value) || 1;
          const uPrice = Number(item.unitPrice?.value) || 0;
          const tPrice = Number(item.totalPrice?.value) || qty * uPrice;
          return {
            id: `item_${idx + 1}_${Math.random().toString(36).substring(2, 5)}`,
            name: {
              value: String(item.name?.value || ''),
              confidence: Number(item.name?.confidence) || 0.8,
              source: 'server_vision' as const,
            },
            quantity: {
              value: qty,
              confidence: Number(item.quantity?.confidence) || 0.8,
              source: 'server_vision' as const,
            },
            unitPrice: {
              value: uPrice,
              confidence: Number(item.unitPrice?.confidence) || 0.8,
              source: 'server_vision' as const,
            },
            unitPriceMinor: {
              value: toMinorUnits(uPrice),
              confidence: Number(item.unitPrice?.confidence) || 0.8,
              source: 'server_vision' as const,
            },
            totalPrice: {
              value: tPrice,
              confidence: Number(item.totalPrice?.confidence) || 0.8,
              source: 'server_vision' as const,
            },
            totalPriceMinor: {
              value: toMinorUnits(tPrice),
              confidence: Number(item.totalPrice?.confidence) || 0.8,
              source: 'server_vision' as const,
            },
          };
        })
      : [];

    const processingTimeMs = Math.round(performance.now() - startTime);

    const result: OCRResult = {
      id: `ocr_srv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      documentType: {
        value: data.documentType?.value || 'invoice',
        confidence: Number(data.documentType?.confidence) || 0.85,
        source: 'server_vision',
      },
      vendorName: {
        value: data.vendorName?.value || null,
        confidence: Number(data.vendorName?.confidence) || (data.vendorName?.value ? 0.9 : 0),
        source: 'server_vision',
      },
      customerName: {
        value: data.customerName?.value || null,
        confidence: Number(data.customerName?.confidence) || (data.customerName?.value ? 0.85 : 0),
        source: 'server_vision',
      },
      invoiceNumber: {
        value: data.invoiceNumber?.value || null,
        confidence: Number(data.invoiceNumber?.confidence) || (data.invoiceNumber?.value ? 0.9 : 0),
        source: 'server_vision',
      },
      date: {
        value: data.date?.value || new Date().toISOString().split('T')[0],
        confidence: Number(data.date?.confidence) || 0.85,
        source: 'server_vision',
      },
      currency: {
        value: (data.currency?.value as any) || 'YER',
        confidence: Number(data.currency?.confidence) || 0.9,
        source: 'server_vision',
      },
      subtotal: subtotalVal ? { value: subtotalVal, confidence: 0.85, source: 'server_vision' } : undefined,
      subtotalMinor: subtotalVal ? { value: toMinorUnits(subtotalVal), confidence: 0.85, source: 'server_vision' } : undefined,
      tax: taxVal ? { value: taxVal, confidence: 0.85, source: 'server_vision' } : undefined,
      taxMinor: taxVal ? { value: toMinorUnits(taxVal), confidence: 0.85, source: 'server_vision' } : undefined,
      totalAmount: {
        value: totalVal,
        confidence: Number(data.totalAmount?.confidence) || 0.9,
        source: 'server_vision',
      },
      totalAmountMinor: {
        value: toMinorUnits(totalVal),
        confidence: Number(data.totalAmount?.confidence) || 0.9,
        source: 'server_vision',
      },
      lineItems,
      rawText: data.rawText || '',
      overallConfidence: Number(data.overallConfidence) || 0.85,
      processingTimeMs,
      provider: this.name,
      isUserConfirmed: false, // Mandatory
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
    };

    return result;
  }
}

export const serverVisionOCRProvider = new ServerVisionOCRProvider();
