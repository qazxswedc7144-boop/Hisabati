import {
  OCRResult,
  StructuredReceiptDraft,
  StructuredReceiptDraftItem,
  CurrencyCode,
  OCRDocumentType,
} from '@/shared/types';
import { toMinorUnits } from '@/core/utils/financial';
import { ArabicNumberParser } from '@/core/services/ai/ArabicNumberParser';

export interface ReceiptReviewValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  warnings: string[];
}

export interface EditableReceiptState {
  partyType: 'vendor' | 'customer';
  partyName: string;
  matchedAccountId?: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  currency: CurrencyCode;
  totalAmount: number | string;
  subtotal: number | string;
  tax: number | string;
  lineItems: Array<{
    id: string;
    name: string;
    quantity: number | string;
    unitPrice: number | string;
    totalPrice: number | string;
  }>;
  notes: string;
}

/**
 * ReceiptReviewService
 * Pure domain service managing:
 * - OCR Result mapping to editable state
 * - Confidence threshold evaluation (< 0.70 is low confidence)
 * - Strict deterministic validation (dates, amounts, totals match, party presence)
 * - Converting validated user-confirmed state into StructuredReceiptDraft
 * - Guaranteed Zero Transaction creation (no direct writes to transactions or accounts table)
 */
export class ReceiptReviewService {
  public static readonly LOW_CONFIDENCE_THRESHOLD = 0.70;

  /**
   * Maps an OCRResult into an editable review state.
   */
  public static mapOCRResultToEditableState(ocr: OCRResult): EditableReceiptState {
    const isReceipt = ocr.documentType.value === 'receipt';
    const partyType: 'vendor' | 'customer' = isReceipt ? 'customer' : 'vendor';
    const partyName = isReceipt
      ? (ocr.customerName.value || ocr.vendorName.value || '')
      : (ocr.vendorName.value || ocr.customerName.value || '');

    const lineItems = (ocr.lineItems || []).map((item, idx) => ({
      id: item.id || `item_${idx + 1}`,
      name: item.name.value || '',
      quantity: item.quantity.value ?? 1,
      unitPrice: item.unitPrice.value ?? 0,
      totalPrice: item.totalPrice.value ?? ((item.quantity.value ?? 1) * (item.unitPrice.value ?? 0)),
    }));

    return {
      partyType,
      partyName,
      invoiceNumber: ocr.invoiceNumber.value || '',
      date: ocr.date.value || new Date().toISOString().split('T')[0],
      dueDate: ocr.dueDate?.value || '',
      currency: ocr.currency.value || 'YER',
      totalAmount: ocr.totalAmount.value ?? 0,
      subtotal: ocr.subtotal?.value ?? 0,
      tax: ocr.tax?.value ?? 0,
      lineItems,
      notes: ocr.warnings.length > 0 ? `تنبيهات الفاتورة: ${ocr.warnings.join(' | ')}` : '',
    };
  }

  /**
   * Check which fields from the OCRResult have low confidence (< 0.70) or are missing.
   */
  public static getFieldConfidenceStatus(ocr: OCRResult): Record<string, { confidence: number; isLow: boolean; isMissing: boolean }> {
    const fields: Record<string, { value: any; confidence: number }> = {
      vendorName: { value: ocr.vendorName.value, confidence: ocr.vendorName.confidence },
      customerName: { value: ocr.customerName.value, confidence: ocr.customerName.confidence },
      invoiceNumber: { value: ocr.invoiceNumber.value, confidence: ocr.invoiceNumber.confidence },
      date: { value: ocr.date.value, confidence: ocr.date.confidence },
      currency: { value: ocr.currency.value, confidence: ocr.currency.confidence },
      totalAmount: { value: ocr.totalAmount.value, confidence: ocr.totalAmount.confidence },
    };

    const status: Record<string, { confidence: number; isLow: boolean; isMissing: boolean }> = {};

    for (const [key, field] of Object.entries(fields)) {
      const isMissing = field.value === null || field.value === undefined || field.value === '';
      const isLow = !isMissing && field.confidence < this.LOW_CONFIDENCE_THRESHOLD;
      status[key] = {
        confidence: field.confidence,
        isLow,
        isMissing,
      };
    }

    return status;
  }

  /**
   * Validates the editable state prior to confirmation.
   */
  public static validate(state: EditableReceiptState): ReceiptReviewValidationResult {
    const errors: Record<string, string> = {};
    const warnings: string[] = [];

    // 1. Party validation
    const trimmedParty = (state.partyName || '').trim();
    if (!trimmedParty) {
      errors.partyName = state.partyType === 'vendor' ? 'يرجى إدخال اسم المورد أو المتجر' : 'يرجى إدخال اسم العميل';
    } else if (trimmedParty.length < 2) {
      errors.partyName = 'الاسم يجب ألا يقل عن حرفين';
    }

    // 2. Date validation
    if (!state.date || !/^\d{4}-\d{2}-\d{2}$/.test(state.date)) {
      errors.date = 'يرجى إدخال تاريخ صالح (YYYY-MM-DD)';
    }

    // 3. Amount parsing and validation
    const parsedTotal = this.parseNumericInput(state.totalAmount);
    if (isNaN(parsedTotal) || parsedTotal <= 0) {
      errors.totalAmount = 'يرجى إدخال مبلغ إجمالي صالح أكبر من صفر';
    }

    const parsedSubtotal = this.parseNumericInput(state.subtotal);
    const parsedTax = this.parseNumericInput(state.tax);

    // 4. Line items validation (if any exist)
    if (state.lineItems && state.lineItems.length > 0) {
      let sumLineItems = 0;
      state.lineItems.forEach((item, idx) => {
        const itemQty = this.parseNumericInput(item.quantity);
        const itemPrice = this.parseNumericInput(item.unitPrice);
        const itemTotal = this.parseNumericInput(item.totalPrice);

        if (!item.name || item.name.trim().length === 0) {
          errors[`lineItem_${idx}_name`] = `يرجى تحديد اسم الصنف رقم ${idx + 1}`;
        }
        if (itemQty <= 0) {
          errors[`lineItem_${idx}_qty`] = `الكمية غير صالحة للصنف ${idx + 1}`;
        }
        if (itemPrice < 0) {
          errors[`lineItem_${idx}_price`] = `السعر غير صالح للصنف ${idx + 1}`;
        }

        sumLineItems += itemTotal > 0 ? itemTotal : (itemQty * itemPrice);
      });

      // Total consistency check (within 1.0 unit tolerance)
      if (parsedTotal > 0 && Math.abs(sumLineItems - parsedTotal) > 1.0) {
        warnings.push(`تنبيه: مجموع الأصناف (${sumLineItems.toLocaleString()}) لا يتطابق تماماً مع الإجمالي المدخل (${parsedTotal.toLocaleString()})`);
      }
    }

    // Tax + Subtotal consistency check
    if (parsedSubtotal > 0 && parsedTax >= 0 && parsedTotal > 0) {
      const calculatedTotal = parsedSubtotal + parsedTax;
      if (Math.abs(calculatedTotal - parsedTotal) > 1.0) {
        warnings.push(`المجموع الجزئي مع الضريبة (${calculatedTotal.toLocaleString()}) يختلف عن الإجمالي الكلي`);
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Builds the final immutable StructuredReceiptDraft upon explicit user confirmation.
   * NOTE: This does NOT create any Transaction entity or alter balances!
   */
  public static createStructuredDraft(
    state: EditableReceiptState,
    ocrResult?: OCRResult
  ): StructuredReceiptDraft {
    const validation = this.validate(state);
    if (!validation.isValid) {
      throw new Error(`لا يمكن تأكيد الفاتورة لوجود أخطاء في البيانات: ${Object.values(validation.errors).join('، ')}`);
    }

    const totalAmount = this.parseNumericInput(state.totalAmount);
    const subtotal = this.parseNumericInput(state.subtotal);
    const tax = this.parseNumericInput(state.tax);

    const draftItems: StructuredReceiptDraftItem[] = state.lineItems.map((item, idx) => {
      const qty = this.parseNumericInput(item.quantity) || 1;
      const unitPrice = this.parseNumericInput(item.unitPrice) || 0;
      const calculatedTotal = item.totalPrice ? this.parseNumericInput(item.totalPrice) : (qty * unitPrice);

      return {
        id: item.id || `draft_item_${idx + 1}`,
        name: item.name.trim(),
        quantity: qty,
        unitPrice: unitPrice,
        unitPriceMinor: toMinorUnits(unitPrice),
        totalPrice: calculatedTotal,
        totalPriceMinor: toMinorUnits(calculatedTotal),
      };
    });

    const draft: StructuredReceiptDraft = {
      id: `draft_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      ocrResultId: ocrResult?.id,
      documentType: (ocrResult?.documentType?.value as OCRDocumentType) || 'invoice',
      partyType: state.partyType,
      partyName: state.partyName.trim(),
      matchedAccountId: state.matchedAccountId,
      invoiceNumber: (state.invoiceNumber || '').trim(),
      date: state.date,
      dueDate: state.dueDate ? state.dueDate : undefined,
      currency: state.currency,
      subtotal,
      subtotalMinor: toMinorUnits(subtotal),
      tax,
      taxMinor: toMinorUnits(tax),
      totalAmount,
      totalAmountMinor: toMinorUnits(totalAmount),
      lineItems: draftItems,
      notes: state.notes.trim() || undefined,
      imageUrl: ocrResult?.imageUrl,
      rawText: ocrResult?.rawText,
      isConfirmedByUser: true,
      confirmedAt: new Date().toISOString(),
      source: ocrResult ? 'ocr_reviewed' : 'manual_input',
      validationErrors: validation.warnings.length > 0 ? validation.warnings : undefined,
    };

    return draft;
  }

  /**
   * Helper to parse numbers supporting Eastern Arabic digits (٠-٩) and strings.
   */
  public static parseNumericInput(val: number | string | undefined | null): number {
    if (val === undefined || val === null || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    
    // Normalize eastern digits to western
    const normalized = ArabicNumberParser.normalizeDigits(String(val)).replace(/,/g, '').trim();
    const parsed = parseFloat(normalized);
    return isNaN(parsed) ? 0 : parsed;
  }
}
