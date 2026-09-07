import {
  CurrencyCode,
  ExtractedField,
  OCRDocumentType,
  OCRLineItem,
  OCRResult,
  OCRSource,
} from '@/shared/types';
import { ArabicNumberParser } from '@/core/services/ai/ArabicNumberParser';
import { toMinorUnits } from '@/core/utils/financial';

/**
 * OCRFieldParser
 * Independent deterministic extraction engine for bilingual Arabic/English financial documents.
 * Adheres strictly to:
 * - Deterministic parsing of numbers, dates, currencies, and line items.
 * - Arabic Eastern (٠-٩) and Western (0-9) numerals support.
 * - Integer minor units conversion.
 * - Zero direct database writes.
 */
export class OCRFieldParser {
  /**
   * Parse extracted raw text into structured OCR result.
   */
  public static parse(rawText: string, providerName: string = 'local_heuristic'): OCRResult {
    const startTime = performance.now();
    const cleanText = rawText || '';
    const lines = cleanText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const warnings: string[] = [];

    // 1. Extract Document Type
    const documentType = this.extractDocumentType(cleanText);

    // 2. Extract Vendor Name
    const vendorName = this.extractVendorName(lines);

    // 3. Extract Customer Name
    const customerName = this.extractCustomerName(lines);

    // 4. Extract Invoice Number
    const invoiceNumber = this.extractInvoiceNumber(cleanText, lines);

    // 5. Extract Date
    const date = this.extractDate(cleanText);

    // 6. Extract Currency
    const currency = this.extractCurrency(cleanText);

    // 7. Extract Amounts (Total, Subtotal, Tax)
    const { totalAmount, subtotal, tax } = this.extractAmounts(cleanText, lines);

    // 8. Extract Line Items
    const lineItems = this.extractLineItems(lines);

    // Validation & Sanity Warnings
    if (!totalAmount.value || totalAmount.value <= 0) {
      warnings.push('لم يتم العثور على إجمالي مالي محدد أو مؤكد في المستند');
    }
    if (!invoiceNumber.value) {
      warnings.push('لم يتم استخراج رقم الفاتورة / السند بوضوح');
    }
    if (!date.value) {
      warnings.push('لم يتم استخراج تاريخ صالح للمستند، تم اقتراح تاريخ اليوم');
    }

    // 9. Calculate Overall Confidence (weighted)
    const overallConfidence = this.calculateOverallConfidence({
      total: totalAmount.confidence,
      vendor: vendorName.confidence,
      invoiceNo: invoiceNumber.confidence,
      date: date.confidence,
      docType: documentType.confidence,
    });

    const processingTimeMs = Math.round(performance.now() - startTime);

    return {
      id: `ocr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      documentType,
      vendorName,
      customerName,
      invoiceNumber,
      date,
      currency,
      subtotal: subtotal.value ? subtotal : undefined,
      subtotalMinor: subtotal.value ? { ...subtotal, value: toMinorUnits(subtotal.value) } : undefined,
      tax: tax.value ? tax : undefined,
      taxMinor: tax.value ? { ...tax, value: toMinorUnits(tax.value) } : undefined,
      totalAmount,
      totalAmountMinor: {
        ...totalAmount,
        value: totalAmount.value ? toMinorUnits(totalAmount.value) : 0,
      },
      lineItems,
      rawText: cleanText,
      overallConfidence,
      processingTimeMs,
      provider: providerName,
      isUserConfirmed: false, // Mandatory: AI/OCR is never a financial source of truth without explicit user confirmation
      warnings,
    };
  }

  /**
   * 1. Extract Document Type
   */
  private static extractDocumentType(text: string): ExtractedField<OCRDocumentType> {
    const lower = text.toLowerCase();
    if (/سند\s*قبض|سند\s*استلام|إيصال\s*قبض|وصل\s*قبض|receipt|voucher/i.test(lower)) {
      return { value: 'receipt', confidence: 0.95, source: 'heuristic' };
    }
    if (/فاتورة\s*ضريبية|فاتورة\s*مبيعات|فاتورة\s*مشتريات|فاتورة|tax\s*invoice|sales\s*invoice|invoice/i.test(lower)) {
      return { value: 'invoice', confidence: 0.95, source: 'heuristic' };
    }
    if (/كشف\s*حساب|statement\s*of\s*account|account\s*statement/i.test(lower)) {
      return { value: 'statement', confidence: 0.9, source: 'heuristic' };
    }
    if (/فاتورة\s*كهرباء|فاتورة\s*مياه|فاتورة\s*هاتف|bill/i.test(lower)) {
      return { value: 'bill', confidence: 0.85, source: 'heuristic' };
    }
    return { value: 'unknown', confidence: 0.4, source: 'heuristic' };
  }

  /**
   * 2. Extract Vendor / Merchant Name
   */
  private static extractVendorName(lines: string[]): ExtractedField<string> {
    const vendorKeywords = [
      'مؤسسة', 'شركة', 'سوبرماركت', 'مركز', 'محلات', 'محل', 'بقالة', 'صيدلية',
      'معرض', 'مطعم', 'مخبز', 'ورشة', 'متجر', 'مكتب', 'وكالة',
      'company', 'co.', 'est.', 'store', 'supermarket', 'trading', 'pharmacy', 'restaurant'
    ];

    // Priority 1: Match line containing vendor keywords in top 8 lines
    for (let i = 0; i < Math.min(lines.length, 8); i++) {
      const line = lines[i];
      const match = vendorKeywords.some((kw) => line.toLowerCase().includes(kw));
      if (match && !this.isHeaderOrGenericWord(line)) {
        return {
          value: this.cleanEntityName(line),
          confidence: 0.9,
          rawText: line,
          source: 'heuristic',
        };
      }
    }

    // Priority 2: Fallback to the first non-generic top line
    for (let i = 0; i < Math.min(lines.length, 4); i++) {
      const line = lines[i];
      if (!this.isHeaderOrGenericWord(line) && line.length > 3 && !/\d{4}/.test(line)) {
        return {
          value: this.cleanEntityName(line),
          confidence: 0.65,
          rawText: line,
          source: 'heuristic',
        };
      }
    }

    return { value: null, confidence: 0, source: 'heuristic' };
  }

  /**
   * 3. Extract Customer Name
   */
  private static extractCustomerName(lines: string[]): ExtractedField<string> {
    const customerPatterns = [
      /(?:العميل|السيد|السيد\s*\/|المشتري|المحترم|المطلوب\s*من|حساب|الزبون|إلى)\s*[:：\-]?\s*(.+)/i,
      /(?:customer|bill\s*to|client|buyer|to)\s*[:：\-]?\s*(.+)/i,
    ];

    for (const line of lines) {
      for (const pattern of customerPatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const candidate = this.cleanEntityName(match[1]);
          if (candidate.length > 2) {
            return {
              value: candidate,
              confidence: 0.9,
              rawText: line,
              source: 'heuristic',
            };
          }
        }
      }
    }

    return { value: null, confidence: 0, source: 'heuristic' };
  }

  /**
   * 4. Extract Invoice Number
   */
  private static extractInvoiceNumber(text: string, lines: string[]): ExtractedField<string> {
    const invoicePatterns = [
      /(?:فاتورة\s*رقم|رقم\s*الفاتورة|سند\s*رقم|رقم\s*السند|إيصال\s*رقم|رقم\s*الإيصال|رقم\s*المرجع)\s*[:：\-#]?\s*([A-Za-z0-9\u0660-\u0669\-_/]{2,20})/i,
      /(?:invoice\s*no|invoice\s*#|inv\s*#|bill\s*no|receipt\s*#|ref\s*#)\s*[:：\-#]?\s*([A-Za-z0-9\-_/]{2,20})/i,
    ];

    for (const line of lines) {
      for (const pattern of invoicePatterns) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const rawNum = match[1].trim();
          const normalized = ArabicNumberParser.normalizeDigits(rawNum);
          return {
            value: normalized,
            confidence: 0.95,
            rawText: line,
            source: 'heuristic',
          };
        }
      }
    }

    // Secondary search across the full text
    const fullMatch = text.match(/(?:فاتورة|invoice|inv)[\s\S]{0,15}?[#№]?\s*([A-Za-z0-9\u0660-\u0669\-_]{3,15})/i);
    if (fullMatch && fullMatch[1]) {
      const normalized = ArabicNumberParser.normalizeDigits(fullMatch[1]);
      return {
        value: normalized,
        confidence: 0.7,
        rawText: fullMatch[0],
        source: 'heuristic',
      };
    }

    return { value: null, confidence: 0, source: 'heuristic' };
  }

  /**
   * 5. Extract Date
   */
  private static extractDate(text: string): ExtractedField<string> {
    const normalized = ArabicNumberParser.normalizeDigits(text);

    // Standard date patterns: YYYY-MM-DD or YYYY/MM/DD or DD-MM-YYYY or DD/MM/YYYY
    const datePatterns = [
      // YYYY/MM/DD or YYYY-MM-DD
      /\b(20\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
      // DD/MM/YYYY or DD-MM-YYYY
      /\b(0?[1-9]|[12]\d|3[01])[-/](0?[1-9]|1[0-2])[-/](20\d{2})\b/,
      // Hijri / Short years: e.g. 1446/02/01
      /\b(14\d{2})[-/](0?[1-9]|1[0-2])[-/](0?[1-9]|[12]\d|3[01])\b/,
    ];

    for (const pattern of datePatterns) {
      const match = normalized.match(pattern);
      if (match) {
        let year: string, month: string, day: string;
        if (match[1].length === 4) {
          // Format YYYY/MM/DD
          year = match[1];
          month = match[2].padStart(2, '0');
          day = match[3].padStart(2, '0');
        } else {
          // Format DD/MM/YYYY
          day = match[1].padStart(2, '0');
          month = match[2].padStart(2, '0');
          year = match[3];
        }

        const isoDate = `${year}-${month}-${day}`;
        return {
          value: isoDate,
          confidence: 0.9,
          rawText: match[0],
          source: 'heuristic',
        };
      }
    }

    // Default fallback: today's date with low confidence
    const today = new Date().toISOString().split('T')[0];
    return {
      value: today,
      confidence: 0.35,
      rawText: 'تاريخ تلقائي',
      source: 'fallback',
    };
  }

  /**
   * 6. Extract Currency
   */
  private static extractCurrency(text: string): ExtractedField<CurrencyCode> {
    const lower = text.toLowerCase();
    if (/ريال\s*سعودي|ر\.س|sar|saudi/i.test(lower)) {
      return { value: 'SAR', confidence: 0.95, source: 'heuristic' };
    }
    if (/دولار|\$|usd|dollar/i.test(lower)) {
      return { value: 'USD', confidence: 0.95, source: 'heuristic' };
    }
    if (/درهم|د\.إ|aed|dirham/i.test(lower)) {
      return { value: 'AED', confidence: 0.95, source: 'heuristic' };
    }
    if (/ريال\s*يمني|ر\.ي|yer|ريال/i.test(lower)) {
      return { value: 'YER', confidence: 0.9, source: 'heuristic' };
    }

    // Default to YER (primary system currency)
    return { value: 'YER', confidence: 0.7, source: 'heuristic' };
  }

  /**
   * 7. Extract Amounts: Total, Subtotal, Tax
   */
  private static extractAmounts(
    text: string,
    lines: string[]
  ): {
    totalAmount: ExtractedField<number>;
    subtotal: ExtractedField<number>;
    tax: ExtractedField<number>;
  } {
    let totalVal: number | null = null;
    let totalConf = 0;
    let totalRaw = '';

    let subtotalVal: number | null = null;
    let subtotalConf = 0;

    let taxVal: number | null = null;
    let taxConf = 0;

    const totalKeywords = [
      'الإجمالي', 'المجموع الكلي', 'المبلغ الإجمالي', 'صافي الفاتورة', 'المبلغ المطلوب',
      'المجموع النهائي', 'إجمالي الفاتورة', 'الصافي', 'المجموع',
      'grand total', 'total amount', 'net total', 'balance due', 'total'
    ];

    const subtotalKeywords = ['المجموع الجزئي', 'المبلغ قبل الضريبة', 'subtotal', 'sub total'];
    const taxKeywords = ['ضريبة', 'القيمة المضافة', 'vat', 'tax', '15%', '5%'];

    // Scan lines in reverse order (totals are usually at the bottom)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      const normalizedLine = ArabicNumberParser.normalizeDigits(line);

      // Check Total
      if (!totalVal) {
        for (const kw of totalKeywords) {
          if (line.toLowerCase().includes(kw)) {
            const parsed = this.findNumberInLine(normalizedLine);
            if (parsed && parsed > 0) {
              totalVal = parsed;
              totalConf = 0.92;
              totalRaw = line;
              break;
            }
          }
        }
      }

      // Check Subtotal
      if (!subtotalVal) {
        for (const kw of subtotalKeywords) {
          if (line.toLowerCase().includes(kw)) {
            const parsed = this.findNumberInLine(normalizedLine);
            if (parsed && parsed > 0) {
              subtotalVal = parsed;
              subtotalConf = 0.88;
              break;
            }
          }
        }
      }

      // Check Tax
      if (!taxVal) {
        for (const kw of taxKeywords) {
          if (line.toLowerCase().includes(kw)) {
            const parsed = this.findNumberInLine(normalizedLine);
            if (parsed && parsed > 0) {
              taxVal = parsed;
              taxConf = 0.85;
              break;
            }
          }
        }
      }
    }

    // Fallback if total wasn't found by keyword: look for largest plausible currency amount in bottom lines
    if (!totalVal) {
      const numbersInBottom = lines.slice(-6).map((l) => {
        const norm = ArabicNumberParser.normalizeDigits(l);
        return this.findNumberInLine(norm) || 0;
      });
      const maxNum = Math.max(...numbersInBottom, 0);
      if (maxNum > 0) {
        totalVal = maxNum;
        totalConf = 0.6;
        totalRaw = 'تقدير حسابي من أسفل الفاتورة';
      }
    }

    return {
      totalAmount: {
        value: totalVal || 0,
        confidence: totalVal ? totalConf : 0,
        rawText: totalRaw,
        source: 'heuristic',
      },
      subtotal: {
        value: subtotalVal,
        confidence: subtotalVal ? subtotalConf : 0,
        source: 'heuristic',
      },
      tax: {
        value: taxVal,
        confidence: taxVal ? taxConf : 0,
        source: 'heuristic',
      },
    };
  }

  /**
   * 8. Extract Line Items (Tabular / Item rows)
   */
  private static extractLineItems(lines: string[]): OCRLineItem[] {
    const items: OCRLineItem[] = [];

    // Line item pattern: [Item Name text] [Qty: 1-999] [Unit Price] [Total Price]
    // Example: "أرز بسمتي 10كجم   2   4000   8000"
    for (const line of lines) {
      if (this.isSummaryLine(line) || this.isHeaderOrGenericWord(line)) continue;

      const normalized = ArabicNumberParser.normalizeDigits(line);

      // Find all standalone numbers on the line
      const numberMatches = Array.from(normalized.matchAll(/\b(\d+(?:\.\d+)?)\b/g)).map((m) => ({
        value: parseFloat(m[1]),
        index: m.index ?? 0,
        text: m[1],
      }));

      // Need at least 2 numbers (e.g. qty + price, or price + total)
      if (numberMatches.length >= 2) {
        let quantity = 1;
        let unitPrice = 0;
        let totalPrice = 0;
        let numbersStartIndex = line.length;

        if (numberMatches.length >= 3) {
          // Tabular row: take the last 3 numbers as qty, unitPrice, totalPrice
          const last = numberMatches[numberMatches.length - 1];
          const mid = numberMatches[numberMatches.length - 2];
          const first = numberMatches[numberMatches.length - 3];

          // Check if first * mid ~ last
          if (Math.abs(first.value * mid.value - last.value) < 1) {
            quantity = first.value;
            unitPrice = mid.value;
            totalPrice = last.value;
            numbersStartIndex = first.index;
          } else {
            // Pick based on typical order
            quantity = first.value;
            unitPrice = mid.value;
            totalPrice = last.value;
            numbersStartIndex = first.index;
          }
        } else {
          // Exactly 2 numbers
          const first = numberMatches[0];
          const second = numberMatches[1];
          if (first.value <= 100 && second.value > first.value) {
            quantity = first.value;
            totalPrice = second.value;
            unitPrice = totalPrice / quantity;
          } else {
            unitPrice = first.value;
            totalPrice = second.value;
          }
          numbersStartIndex = first.index;
        }

        const rawNamePart = normalized.substring(0, numbersStartIndex).trim();
        const cleanName = rawNamePart.replace(/^[-*•#\d.]+\s*/, '').trim();

        if (cleanName.length >= 2 && !this.isHeaderOrGenericWord(cleanName)) {
          items.push({
            id: `item_${items.length + 1}_${Math.random().toString(36).substring(2, 5)}`,
            name: { value: cleanName, confidence: 0.88, source: 'heuristic' },
            quantity: { value: quantity, confidence: 0.88, source: 'heuristic' },
            unitPrice: { value: unitPrice, confidence: 0.88, source: 'heuristic' },
            unitPriceMinor: { value: toMinorUnits(unitPrice), confidence: 0.88, source: 'heuristic' },
            totalPrice: { value: totalPrice, confidence: 0.88, source: 'heuristic' },
            totalPriceMinor: { value: toMinorUnits(totalPrice), confidence: 0.88, source: 'heuristic' },
          });
        }
      }
    }

    return items;
  }

  // --- Helper Methods ---

  private static findNumberInLine(line: string): number | null {
    // Look for numbers, optionally with decimal points
    const matches = line.match(/\b\d+(?:\.\d+)?\b/g);
    if (!matches || matches.length === 0) return null;
    // Return the last number on the line (common for totals on the right/left of labels)
    return parseFloat(matches[matches.length - 1]);
  }

  private static cleanEntityName(name: string): string {
    return name
      .replace(/^(?:السيد|العميل|مؤسسة|شركة|محلات|المشتري|حساب|إلى)\s*[:：\-]?/i, '')
      .replace(/[#*:=]/g, '')
      .trim();
  }

  private static isHeaderOrGenericWord(text: string): boolean {
    const generic = [
      'فاتورة ضريبية', 'فاتورة مبيعات', 'سند قبض', 'إيصال استلام', 'سند صرف',
      'كشف حساب', 'tax invoice', 'receipt', 'invoice', 'statement',
      'التاريخ', 'رقم الفاتورة', 'الإجمالي', 'المجموع', 'الكمية', 'السعر', 'الصنف',
      'item', 'qty', 'price', 'total', 'date', 'description'
    ];
    const lower = text.trim().toLowerCase();
    return generic.some((g) => lower === g);
  }

  private static isSummaryLine(line: string): boolean {
    const keywords = [
      'الإجمالي', 'المجموع الكلي', 'صافي الفاتورة', 'المبلغ المطلوب', 'الضريبة',
      'القيمة المضافة', 'grand total', 'total', 'subtotal', 'vat', 'tax'
    ];
    const lower = line.toLowerCase();
    return keywords.some((kw) => lower.includes(kw));
  }

  private static calculateOverallConfidence(weights: {
    total: number;
    vendor: number;
    invoiceNo: number;
    date: number;
    docType: number;
  }): number {
    const score =
      weights.total * 0.35 +
      weights.vendor * 0.2 +
      weights.invoiceNo * 0.2 +
      weights.date * 0.15 +
      weights.docType * 0.1;
    return Math.round(score * 100) / 100;
  }
}
