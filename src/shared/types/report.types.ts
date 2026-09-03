import { DateRange } from './common.types';
import { Account } from './account.types';
import { Transaction, TransactionType } from './transaction.types';

export type DatePreset =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export interface DateRangeFilter {
  preset: DatePreset;
  startDate?: string;
  endDate?: string;
}

export interface AccountStatementItem {
  id: string;
  date: string;
  note?: string;
  receiptNumber?: string;
  type: TransactionType;
  debitAmount: number;     // لك (أعطيته) -> 0 if credit
  creditAmount: number;    // عليك (أخذت منه) -> 0 if debit
  amount: number;
  runningBalance: number;  // الرصيد بعد هذه الحركة
  receiptId?: string;
  documentRef?: string;
  documentMetadata?: Transaction['documentMetadata'];
}

export interface AccountStatementReport {
  account: Account;
  dateRange: DateRange;
  preset: DatePreset;
  generatedAt: string;
  openingBalance: number;       // الرصيد الافتتاحي قبل بداية الفترة
  totalPeriodDebit: number;     // إجمالي لك خلال الفترة
  totalPeriodCredit: number;    // إجمالي عليك خلال الفترة
  periodNetMovement: number;    // صافي حركة الفترة (لك - عليك)
  closingBalance: number;       // الرصيد الختامي (الافتتاحي + صافي الحركة)
  transactionCount: number;     // عدد حركات الفترة
  transactions: AccountStatementItem[];
}

export interface DailyFinancialMetric {
  date: string;
  debit: number;
  credit: number;
  net: number;
  transactionCount: number;
}

export interface FinancialSummaryReport {
  dateRange: DateRange;
  preset: DatePreset;
  generatedAt: string;
  totalDebit: number;
  totalCredit: number;
  netBalance: number;
  totalTransactions: number;
  totalAccounts: number;
  activeAccountsCount: number;
  owedToMeTotal: number;
  owedToMeCount: number;
  owedByMeTotal: number;
  owedByMeCount: number;
  settledAccountsCount: number;
  dailyBreakdown: DailyFinancialMetric[];
}

export interface ReceivablesReportItem {
  account: Account;
  balance: number;
  transactionCount: number;
  lastTransactionDate?: string;
  sharePercentage: number;
}

export interface ReceivablesReport {
  generatedAt: string;
  totalAmount: number;
  accountsCount: number;
  items: ReceivablesReportItem[];
}

export interface PayablesReportItem {
  account: Account;
  balance: number; // Stored as positive magnitude (e.g. 500 means you owe 500)
  transactionCount: number;
  lastTransactionDate?: string;
  sharePercentage: number;
}

export interface PayablesReport {
  generatedAt: string;
  totalAmount: number;
  accountsCount: number;
  items: PayablesReportItem[];
}

export interface TopAccountsReport {
  topDebtors: ReceivablesReportItem[];
  topCreditors: PayablesReportItem[];
}
