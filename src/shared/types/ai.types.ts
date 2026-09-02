import { Account, CurrencyCode, TransactionType } from '@/shared/types';

export type Currency = CurrencyCode;

export type AIMode = 'ask' | 'analyze' | 'command';

export type AIIntent =
  | 'GET_TOTAL_RECEIVABLES'
  | 'GET_TOTAL_PAYABLES'
  | 'GET_NET_BALANCE'
  | 'GET_ACCOUNT_BALANCE'
  | 'GET_ACCOUNT_STATEMENT'
  | 'GET_TOP_DEBTORS'
  | 'GET_TOP_CREDITORS'
  | 'GET_PERIOD_SUMMARY'
  | 'GET_RECENT_TRANSACTIONS'
  | 'SEARCH_ACCOUNT'
  | 'CREATE_TRANSACTION_REQUEST'
  | 'EDIT_TRANSACTION_REQUEST'
  | 'DELETE_TRANSACTION_REQUEST'
  | 'UNKNOWN';

export type AICommandStatus =
  | 'PENDING_VALIDATION'
  | 'READY_FOR_CONFIRMATION'
  | 'CONFIRMED'
  | 'EXECUTED'
  | 'REJECTED'
  | 'CANCELLED';

export interface StructuredAICommand {
  id: string;
  intent: 'CREATE_TRANSACTION_REQUEST' | 'EDIT_TRANSACTION_REQUEST' | 'DELETE_TRANSACTION_REQUEST';
  accountId?: string;
  accountName?: string;
  targetAccount?: Account;
  amount: number;
  amountMinor: number;
  currency: Currency;
  type: TransactionType; // 'debit' (عليه / مدين) | 'credit' (له / دائن)
  date: string;
  note?: string;
  confidence: number;
  status: AICommandStatus;
  validationErrors?: string[];
  disambiguationOptions?: Account[];
  operationId: string;
  executedTransactionId?: string;
}

export type AICardType =
  | 'receivables_card'
  | 'payables_card'
  | 'net_balance_card'
  | 'account_balance_card'
  | 'account_statement_card'
  | 'top_debtors_card'
  | 'top_creditors_card'
  | 'financial_summary_card'
  | 'command_confirmation_card'
  | 'account_disambiguation_card'
  | 'error_card';

export interface AICardData {
  cardType: AICardType;
  title: string;
  amount?: number;
  formattedAmount?: string;
  currency?: Currency;
  accountsCount?: number;
  account?: Account;
  accountsList?: Account[];
  statementItems?: Array<{
    date: string;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
  }>;
  command?: StructuredAICommand;
  sourceExplanation?: string;
  lastUpdated?: string;
}

export interface AIChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  text: string;
  mode?: AIMode;
  intent?: AIIntent;
  confidence?: number;
  card?: AICardData;
  timestamp: string;
  isOffline?: boolean;
  provider?: string;
}

export interface AIRequest {
  prompt: string;
  mode?: AIMode;
  userId?: string;
  minimalContext?: Record<string, unknown>;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; text: string }>;
}

export interface AIResponse {
  text: string;
  intent: AIIntent;
  confidence: number;
  mode: AIMode;
  card?: AICardData;
  command?: StructuredAICommand;
  data?: Record<string, unknown>;
  provider: string;
  model?: string;
  isOfflineFallback?: boolean;
}

export interface AIProvider {
  id: string;
  name: string;
  isAvailable(): Promise<boolean>;
  generate(request: AIRequest): Promise<AIResponse>;
}

export interface AIAuditLogEntry {
  id: string;
  requestId: string;
  promptPreview?: string;
  intent: AIIntent;
  timestamp: string;
  status: 'success' | 'failed' | 'rejected' | 'canceled';
  provider: string;
  model?: string;
  confidence: number;
  action?: string;
  confirmed?: boolean;
  relatedEntityId?: string;
}
