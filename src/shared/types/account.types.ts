import { CurrencyCode } from './common.types';

export type BalanceStatus = 'owed_to_me' | 'owed_by_me' | 'settled'; // لك | عليك | متعادل

export interface Account {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  category?: 'customer' | 'supplier' | 'personal' | 'other';
  currency?: CurrencyCode;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  
  // Computed / summary fields (cached for performance)
  currentBalance: number; // positive = لك (owed_to_me), negative = عليك (owed_by_me), 0 = settled
  currentBalanceMinor?: number; // Phase B: Canonical integer minor units
  totalDebit: number;     // إجمالي المبالغ المسجلة لك
  totalDebitMinor?: number; // Phase B: Canonical integer minor units
  totalCredit: number;    // إجمالي المبالغ المسجلة عليك
  totalCreditMinor?: number; // Phase B: Canonical integer minor units
  transactionCount: number;
  lastTransactionDate?: string;
}

export interface CreateAccountDTO {
  name: string;
  phone?: string;
  note?: string;
  category?: 'customer' | 'supplier' | 'personal' | 'other';
  currency?: CurrencyCode;
  initialBalance?: number;
  initialBalanceMinor?: number;
  initialBalanceType?: 'owed_to_me' | 'owed_by_me';
}

export interface UpdateAccountDTO {
  name?: string;
  phone?: string;
  note?: string;
  category?: 'customer' | 'supplier' | 'personal' | 'other';
  currency?: CurrencyCode;
  archived?: boolean;
}

export type AccountFilterType = 'all' | 'owed_to_me' | 'owed_by_me' | 'settled' | 'archived';
export type AccountSortField = 'name' | 'balance' | 'recent' | 'createdAt';
