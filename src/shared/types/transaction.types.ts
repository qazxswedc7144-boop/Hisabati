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
}

export interface CreateTransactionDTO {
  accountId: string;
  type: TransactionType;
  amount: number;
  date: string;
  note?: string;
  receiptNumber?: string;
  operationId?: string; // Unique idempotency key
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

