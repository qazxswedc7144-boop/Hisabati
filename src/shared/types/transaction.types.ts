import { CurrencyCode } from './common.types';

export type TransactionType = 'debit' | 'credit'; // 'debit' = لي (أعطيته / مستحق لي) | 'credit' = علي (استلمت منه / مستحق له)

export type TransactionStatus = 'draft' | 'posted' | 'reversed';

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
  
  // Phase 2 Immutable Ledger Status
  status?: TransactionStatus;
  postedAt?: string;
  postedBy?: string;
  reversedAt?: string;
  reversedBy?: string;
  reversalOfTransactionId?: string;
  correctedByTransactionId?: string;

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
  amount?: number;
  amountMinor?: number; // Phase Financial Core: Canonical integer minor units (Primary source)
  currency?: CurrencyCode;
  date: string;
  note?: string;
  receiptNumber?: string;
  operationId?: string; // Unique idempotency key
  status?: TransactionStatus;
  receiptId?: string;
  documentRef?: string;
  documentMetadata?: Transaction['documentMetadata'];
}

export interface JournalEntryLeg {
  accountId: string;
  type: TransactionType; // 'debit' | 'credit'
  amount?: number;
  amountMinor?: number;
  note?: string;
  receiptNumber?: string;
}

export interface CreateDoubleEntryDTO {
  operationId?: string;
  date?: string;
  currency?: CurrencyCode;
  note?: string;
  receiptNumber?: string;
  entries: JournalEntryLeg[];
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
  status?: TransactionStatus;
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

export interface DebtRecord {
  id: string;
  accountId: string;
  amountMinor: number;      // إجمالي الدين
  paidMinor: number;         // المسدد
  remainingMinor: number;    // المتبقي (مشتق للفهرسة)
  dueDate: string;           // YYYY-MM-DD
  status: 'open' | 'partial' | 'settled' | 'overdue';
  createdAt: string;
  updatedAt: string;
}

