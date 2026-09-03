import { CurrencyCode } from './common.types';

export type OCRDocumentType = 'invoice' | 'receipt' | 'bill' | 'statement' | 'unknown';

export type OCRSource = 'heuristic' | 'server_vision' | 'fallback';

export interface ExtractedField<T> {
  value: T | null;
  confidence: number; // 0.0 to 1.0
  rawText?: string;
  source: OCRSource;
}

export interface OCRLineItem {
  id: string;
  name: ExtractedField<string>;
  quantity: ExtractedField<number>;
  unitPrice: ExtractedField<number>;
  unitPriceMinor: ExtractedField<number>;
  totalPrice: ExtractedField<number>;
  totalPriceMinor: ExtractedField<number>;
}

export interface OCRResult {
  id: string;
  documentType: ExtractedField<OCRDocumentType>;
  vendorName: ExtractedField<string>;
  customerName: ExtractedField<string>;
  invoiceNumber: ExtractedField<string>;
  date: ExtractedField<string>; // YYYY-MM-DD
  dueDate?: ExtractedField<string>;
  currency: ExtractedField<CurrencyCode>;
  subtotal?: ExtractedField<number>;
  subtotalMinor?: ExtractedField<number>;
  tax?: ExtractedField<number>;
  taxMinor?: ExtractedField<number>;
  totalAmount: ExtractedField<number>;
  totalAmountMinor: ExtractedField<number>;
  lineItems: OCRLineItem[];
  rawText: string;
  overallConfidence: number; // 0.0 to 1.0
  processingTimeMs: number;
  provider: string;
  isUserConfirmed: boolean; // Always false upon OCR completion - requires user review
  warnings: string[];
  imageUrl?: string;
}

export interface StructuredReceiptDraftItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  unitPriceMinor: number;
  totalPrice: number;
  totalPriceMinor: number;
}

export interface StructuredReceiptDraft {
  id: string;
  ocrResultId?: string;
  documentType: OCRDocumentType;
  partyType: 'vendor' | 'customer';
  partyName: string;
  matchedAccountId?: string;
  invoiceNumber: string;
  date: string; // YYYY-MM-DD
  dueDate?: string;
  currency: CurrencyCode;
  subtotal: number;
  subtotalMinor: number;
  tax: number;
  taxMinor: number;
  totalAmount: number;
  totalAmountMinor: number;
  lineItems: StructuredReceiptDraftItem[];
  notes?: string;
  imageUrl?: string;
  rawText?: string;
  isConfirmedByUser: boolean;
  confirmedAt: string; // ISO String
  source: 'ocr_reviewed' | 'manual_input';
  validationErrors?: string[];
  createdAt?: string;
  updatedAt?: string;
  // Phase 7-C Conversion Fields
  status?: 'draft' | 'converted' | 'cancelled';
  convertedToTransactionId?: string;
  convertedAt?: string;
  operationId?: string;
}

export interface DuplicateInvoiceCheckResult {
  isDuplicate: boolean;
  severity: 'warning' | 'info';
  matchingTransactions: Array<{
    id: string;
    receiptNumber?: string;
    amount: number;
    date: string;
    accountId: string;
    accountName?: string;
    note?: string;
  }>;
  matchingDrafts?: Array<{
    id: string;
    invoiceNumber: string;
    totalAmount: number;
    date: string;
    partyName: string;
  }>;
  messageAr?: string;
  reasons: string[];
}

export interface ConvertDraftToTransactionRequest {
  draft: StructuredReceiptDraft;
  accountId: string;
  type: 'debit' | 'credit';
  overrideAmount?: number;
  overrideDate?: string;
  overrideNote?: string;
  overrideReceiptNumber?: string;
  explicitUserConfirmed: boolean;
  allowDuplicate?: boolean;
}

export interface ConvertDraftToTransactionResult {
  success: boolean;
  transactionId?: string;
  operationId?: string;
  duplicateWarning?: DuplicateInvoiceCheckResult;
  integrityValid: boolean;
  error?: string;
}

export interface ReviewFieldStatus {
  isConfirmed: boolean;
  isEdited: boolean;
  originalValue: any;
  confidence: number;
  isLowConfidence: boolean;
}

export interface ImagePreprocessOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  grayscale?: boolean;
  enhanceContrast?: boolean;
}

export interface PreprocessedImageResult {
  dataUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export interface OCRProvider {
  name: string;
  isAvailable(): Promise<boolean>;
  processImage(imageSource: string | File | Blob, options?: ImagePreprocessOptions): Promise<OCRResult>;
  processText?(rawText: string): Promise<OCRResult>;
}

// ==========================================
// Phase 7-D AI Invoice Audit & Anomaly Types
// ==========================================

export type AuditRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type AuditFindingSeverity = 'info' | 'warning' | 'error' | 'critical';

export type InvoiceAuditFindingCategory =
  | 'totals'
  | 'tax'
  | 'line_items'
  | 'quantities'
  | 'prices'
  | 'currency'
  | 'date'
  | 'invoice_number'
  | 'duplicate'
  | 'account_mismatch';

export interface InvoiceAuditFinding {
  id: string;
  category: InvoiceAuditFindingCategory;
  severity: AuditFindingSeverity;
  titleAr: string;
  messageAr: string;
  field?: string;
  expected?: string | number;
  actual?: string | number;
}

export interface InvoiceAuditReport {
  id: string;
  draftId: string;
  timestamp: string;
  overallRisk: AuditRiskLevel;
  riskScore: number; // 0 to 100
  confidence: number; // 0.0 to 1.0
  summaryAr: string;
  recommendationAr: string;
  findings: InvoiceAuditFinding[];
  mathVerification: {
    lineItemsSum: number;
    statedSubtotal: number;
    statedTax: number;
    statedTotal: number;
    calculatedTotal: number;
    discrepancy: number;
    isBalanced: boolean;
    itemsMathValid: boolean;
  };
  duplicateAssessment?: DuplicateInvoiceCheckResult;
  accountComparison?: {
    targetAccountId?: string;
    targetAccountName?: string;
    partyName?: string;
    nameMatchStatus: 'matched' | 'partial' | 'mismatch' | 'unknown';
    similarityScore: number;
    messageAr?: string;
  };
  provider: 'local_deterministic' | 'gemini_ai' | 'hybrid';
  isOfflineFallback: boolean;
}

