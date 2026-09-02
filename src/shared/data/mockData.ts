import { Account, Transaction } from '@/shared/types';
import { db } from '@/core/database/db';

export const INITIAL_MOCK_ACCOUNTS: Account[] = [
  {
    id: 'acc_1',
    name: 'محمد أحمد العباسي',
    phone: '771234567',
    note: 'محل بيع قطع غيار ومستلزمات',
    category: 'customer',
    createdAt: '2026-08-15T09:30:00.000Z',
    updatedAt: '2026-09-01T14:20:00.000Z',
    archived: false,
    currentBalance: 85000,
    totalDebit: 120000,
    totalCredit: 35000,
    transactionCount: 3,
    lastTransactionDate: '2026-09-01',
  },
  {
    id: 'acc_2',
    name: 'علي عبدالله باجعفر',
    phone: '733456789',
    note: 'مورد بضائع رئيسي - السوق المركزي',
    category: 'supplier',
    createdAt: '2026-08-10T11:00:00.000Z',
    updatedAt: '2026-08-30T16:45:00.000Z',
    archived: false,
    currentBalance: -45000,
    totalDebit: 15000,
    totalCredit: 60000,
    transactionCount: 2,
    lastTransactionDate: '2026-08-30',
  },
  {
    id: 'acc_3',
    name: 'خالد محمد الشميري',
    phone: '777890123',
    note: 'معاملات شخصية وسلف',
    category: 'personal',
    createdAt: '2026-08-18T14:15:00.000Z',
    updatedAt: '2026-08-28T18:10:00.000Z',
    archived: false,
    currentBalance: 24000,
    totalDebit: 30000,
    totalCredit: 6000,
    transactionCount: 2,
    lastTransactionDate: '2026-08-28',
  },
  {
    id: 'acc_4',
    name: 'عبدالله صالح القحطاني',
    phone: '711987654',
    note: 'تسديد فواتير وصيانة دورية',
    category: 'customer',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-25T12:00:00.000Z',
    archived: false,
    currentBalance: 0,
    totalDebit: 50000,
    totalCredit: 50000,
    transactionCount: 2,
    lastTransactionDate: '2026-08-25',
  },
  {
    id: 'acc_5',
    name: 'سالم أحمد بازرعة',
    phone: '775551122',
    note: 'طلبيات مواد غذائية',
    category: 'customer',
    createdAt: '2026-08-20T10:00:00.000Z',
    updatedAt: '2026-08-29T15:30:00.000Z',
    archived: false,
    currentBalance: 12500,
    totalDebit: 12500,
    totalCredit: 0,
    transactionCount: 1,
    lastTransactionDate: '2026-08-29',
  },
];

export const INITIAL_MOCK_TRANSACTIONS: Transaction[] = [
  {
    id: 'trx_1',
    accountId: 'acc_1',
    type: 'debit',
    amount: 50000,
    date: '2026-08-15',
    note: 'قيمة بضاعة طلبية أولى',
    createdAt: '2026-08-15T09:30:00.000Z',
    updatedAt: '2026-08-15T09:30:00.000Z',
    accountName: 'محمد أحمد العباسي',
  },
  {
    id: 'trx_2',
    accountId: 'acc_1',
    type: 'credit',
    amount: 35000,
    date: '2026-08-22',
    note: 'تسليم دفعة نقدية',
    receiptNumber: 'REC-1042',
    createdAt: '2026-08-22T17:15:00.000Z',
    updatedAt: '2026-08-22T17:15:00.000Z',
    accountName: 'محمد أحمد العباسي',
  },
  {
    id: 'trx_3',
    accountId: 'acc_1',
    type: 'debit',
    amount: 70000,
    date: '2026-09-01',
    note: 'طلبية إضافية مستعجلة',
    createdAt: '2026-09-01T14:20:00.000Z',
    updatedAt: '2026-09-01T14:20:00.000Z',
    accountName: 'محمد أحمد العباسي',
  },
  {
    id: 'trx_4',
    accountId: 'acc_2',
    type: 'credit',
    amount: 60000,
    date: '2026-08-10',
    note: 'توريد كراتين زيت وفلاتر',
    receiptNumber: 'INV-889',
    createdAt: '2026-08-10T11:00:00.000Z',
    updatedAt: '2026-08-10T11:00:00.000Z',
    accountName: 'علي عبدالله باجعفر',
  },
  {
    id: 'trx_5',
    accountId: 'acc_2',
    type: 'debit',
    amount: 15000,
    date: '2026-08-30',
    note: 'دفعة سداد له',
    createdAt: '2026-08-30T16:45:00.000Z',
    updatedAt: '2026-08-30T16:45:00.000Z',
    accountName: 'علي عبدالله باجعفر',
  },
  {
    id: 'trx_6',
    accountId: 'acc_3',
    type: 'debit',
    amount: 30000,
    date: '2026-08-18',
    note: 'سلفة مساعدة شخصية',
    createdAt: '2026-08-18T14:15:00.000Z',
    updatedAt: '2026-08-18T14:15:00.000Z',
    accountName: 'خالد محمد الشميري',
  },
  {
    id: 'trx_7',
    accountId: 'acc_3',
    type: 'credit',
    amount: 6000,
    date: '2026-08-28',
    note: 'إعادة جزء من المبلغ',
    createdAt: '2026-08-28T18:10:00.000Z',
    updatedAt: '2026-08-28T18:10:00.000Z',
    accountName: 'خالد محمد الشميري',
  },
  {
    id: 'trx_8',
    accountId: 'acc_4',
    type: 'debit',
    amount: 50000,
    date: '2026-08-01',
    note: 'أعمال صيانة وتجهيز',
    createdAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    accountName: 'عبدالله صالح القحطاني',
  },
  {
    id: 'trx_9',
    accountId: 'acc_4',
    type: 'credit',
    amount: 50000,
    date: '2026-08-25',
    note: 'تسديد كامل الحساب نقداً (تم التصفية)',
    createdAt: '2026-08-25T12:00:00.000Z',
    updatedAt: '2026-08-25T12:00:00.000Z',
    accountName: 'عبدالله صالح القحطاني',
  },
  {
    id: 'trx_10',
    accountId: 'acc_5',
    type: 'debit',
    amount: 12500,
    date: '2026-08-29',
    note: 'مشتريات حليب ومواد تموينية',
    createdAt: '2026-08-29T15:30:00.000Z',
    updatedAt: '2026-08-29T15:30:00.000Z',
    accountName: 'سالم أحمد بازرعة',
  },
];

export async function seedMockDataIfEmpty(): Promise<boolean> {
  const accountCount = await db.accounts.count();
  if (accountCount === 0) {
    await db.accounts.bulkAdd(INITIAL_MOCK_ACCOUNTS);
    await db.transactions.bulkAdd(INITIAL_MOCK_TRANSACTIONS);
    return true;
  }
  return false;
}

export async function seedInitialMockData(force = false): Promise<boolean> {
  if (force) {
    await resetToMockData();
    return true;
  }
  return await seedMockDataIfEmpty();
}

export async function resetToMockData(): Promise<void> {
  await db.transactions.clear();
  await db.accounts.clear();
  await db.accounts.bulkAdd(INITIAL_MOCK_ACCOUNTS);
  await db.transactions.bulkAdd(INITIAL_MOCK_TRANSACTIONS);
}

export async function clearAllData(): Promise<void> {
  await db.transactions.clear();
  await db.accounts.clear();
}
