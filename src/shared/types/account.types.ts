export type BalanceStatus = 'owed_to_me' | 'owed_by_me' | 'settled'; // لك | عليك | متعادل

export interface Account {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  category?: 'customer' | 'supplier' | 'personal' | 'other';
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  
  // Computed / summary fields (cached for performance)
  currentBalance: number; // positive = لك (owed_to_me), negative = عليك (owed_by_me), 0 = settled
  totalDebit: number;     // إجمالي المبالغ المسجلة لك
  totalCredit: number;    // إجمالي المبالغ المسجلة عليك
  transactionCount: number;
  lastTransactionDate?: string;
}

export interface CreateAccountDTO {
  name: string;
  phone?: string;
  note?: string;
  category?: 'customer' | 'supplier' | 'personal' | 'other';
  initialBalance?: number;
  initialBalanceType?: 'owed_to_me' | 'owed_by_me';
}

export interface UpdateAccountDTO {
  name?: string;
  phone?: string;
  note?: string;
  category?: 'customer' | 'supplier' | 'personal' | 'other';
  archived?: boolean;
}

export type AccountFilterType = 'all' | 'owed_to_me' | 'owed_by_me' | 'settled' | 'archived';
export type AccountSortField = 'name' | 'balance' | 'recent' | 'createdAt';
