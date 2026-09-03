export type TransactionType = 'debit' | 'credit'; // 'debit' = لي (أعطيته / مستحق لي) | 'credit' = علي (استلمت منه / مستحق له)

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  amount: number;
  date: string; // YYYY-MM-DD or ISO
  note?: string;
  receiptNumber?: string;
  operationId?: string; // Idempotency key to guarantee duplicate prevention & sync safety
  createdAt: string;
  updatedAt: string;
  
  // Optional populated fields for UI convenience
  accountName?: string;
  runningBalance?: number; // Derived running balance for statement view

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
  date?: string;
  note?: string;
  receiptNumber?: string;
}

export interface TransactionSummary {
  totalDebit: number;    // إجمالي لك
  totalCredit: number;   // إجمالي عليك
  netBalance: number;    // صافي الرصيد (لك - عليك)
  totalTransactions: number;
}

