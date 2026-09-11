import { CurrencyCode } from './common.types';

export type TransactionType = 'debit' | 'credit'; // 'debit' = لي (أعطيته / مستحق لي) | 'credit' = علي (استلمت منه / مستحق له)

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  amountMinor?: number; // Phase B: Canonical integer minor units (Safe Integer)
  currency?: CurrencyCode;
  date: string; // YYYY-MM-DD or ISO
  note?: string;
  receiptNumber?: string;
  operationId?: string; // Idempotency key to guarantee duplicate prevention & sync safety
  createdAt: string;
  updatedAt: string;
  
  // Optional populated fields for UI convenience
  accountName?: string;
  runningBalance?: number; // Derived running balance for statement view
  runningBalanceMinor?: number; // Phase B: Derived running balance in minor units

  // Phase 7 OCR & Document linkage
  receiptId?: string; // Reference to StructuredReceiptDraft or receipt ID
  documentRef?: string; // Image URL, Base64 data URL, or document storage ID
  documentMetadata?: {
    vendorName?: string;
    customerName?: string;
    invoiceNumber?: string;
    itemCount?: number;
    subtotal?: number;
    tax?: number;
    lineItems?: Array<{
      id?: string;
      name: string;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
    }>;
    ocrConfidence?: number;
    imageUrl?: string;
    documentType?: string;
    currency?: string;
  };
}

export interface CreateTransactionDTO {
  accountId: string;
  type: TransactionType;
  amount: number;
  amountMinor?: number; // Optional Phase B pre-calculated integer minor units
  currency?: CurrencyCode;
  date: string;
  note?: string;
  receiptNumber?: string;
  operationId?: string; // Unique idempotency key
  receiptId?: string;
  documentRef?: string;
  documentMetadata?: Transaction['documentMetadata'];
}

export interface UpdateTransactionDTO {
  accountId?: string;
  type?: TransactionType;
  amount?: number;
  amountMinor?: number;
  currency?: CurrencyCode;
  date?: string;
  note?: string;
  receiptNumber?: string;
}

export interface TransactionSummary {
  totalDebit: number;    // إجمالي لك
  totalDebitMinor?: number;
  totalCredit: number;   // إجمالي عليك
  totalCreditMinor?: number;
  netBalance: number;    // صافي الرصيد (لك - عليك)
  netBalanceMinor?: number;
  totalTransactions: number;
}

