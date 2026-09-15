import { create } from 'zustand';
import { Transaction, TransactionSummary, CreateTransactionDTO, UpdateTransactionDTO } from '@/shared/types';
import { transactionRepository } from '@/core/repositories/transaction.repository';
import { useAccountStore } from './accountStore';
import { useSettingsStore } from './settingsStore';
import { formatInvoiceNumber } from '@/core/utils/formatters';

interface TransactionState {
  transactions: Transaction[];
  recentTransactions: Transaction[];
  accountTransactions: Transaction[];
  hasMoreAccountTransactions: boolean;
  accountOffset: number;
  summary: TransactionSummary;
  isLoading: boolean;

  fetchRecentTransactions: (limit?: number) => Promise<void>;
  fetchAccountTransactions: (accountId: string, reset?: boolean) => Promise<void>;
  loadMoreAccountTransactions: (accountId: string) => Promise<void>;
  fetchSummary: () => Promise<TransactionSummary>;
  addTransaction: (dto: CreateTransactionDTO) => Promise<Transaction>;
  updateTransaction: (id: string, dto: UpdateTransactionDTO) => Promise<Transaction | undefined>;
  deleteTransaction: (id: string, accountId?: string) => Promise<boolean>;
}

export const useTransactionStore = create<TransactionState>((set, get) => ({
  transactions: [],
  recentTransactions: [],
  accountTransactions: [],
  hasMoreAccountTransactions: true,
  accountOffset: 0,
  summary: {
    totalDebit: 0,
    totalCredit: 0,
    netBalance: 0,
    totalTransactions: 0,
  },
  isLoading: false,

  fetchRecentTransactions: async (limit = 10) => {
    set({ isLoading: true });
    try {
      const recent = await transactionRepository.getRecent(limit);
      const summary = await transactionRepository.getSummary();
      set({ recentTransactions: recent, summary, isLoading: false });
    } catch (e) {
      console.error('Failed to fetch recent transactions:', e);
      set({ isLoading: false });
    }
  },

  fetchAccountTransactions: async (accountId: string, reset = true) => {
    set({ isLoading: true });
    try {
      const limit = 20;
      const offset = reset ? 0 : get().accountOffset;
      const list = await transactionRepository.getByAccountIdPaginated(accountId, offset, limit);
      
      set((state) => ({ 
        accountTransactions: reset ? list : [...state.accountTransactions, ...list],
        accountOffset: offset + list.length,
        hasMoreAccountTransactions: list.length === limit,
        isLoading: false 
      }));
    } catch (e) {
      console.error('Failed to fetch account transactions:', e);
      set({ isLoading: false });
    }
  },

  loadMoreAccountTransactions: async (accountId: string) => {
    if (get().isLoading || !get().hasMoreAccountTransactions) return;
    await get().fetchAccountTransactions(accountId, false);
  },

  fetchSummary: async () => {
    try {
      const summary = await transactionRepository.getSummary();
      set({ summary });
      return summary;
    } catch (e) {
      console.error('Failed to fetch summary:', e);
      return get().summary;
    }
  },

  addTransaction: async (dto: CreateTransactionDTO) => {
    const newTrx = await transactionRepository.create(dto);
    
    // Refresh account list and summary
    useAccountStore.getState().fetchAccounts();
    if (useAccountStore.getState().selectedAccount?.id === dto.accountId) {
      useAccountStore.getState().fetchAccountById(dto.accountId);
    }
    
    await get().fetchRecentTransactions();
    if (dto.accountId) {
      await get().fetchAccountTransactions(dto.accountId);
    }
    return newTrx;
  },

  updateTransaction: async (id: string, dto: UpdateTransactionDTO) => {
    const updated = await transactionRepository.update(id, dto);
    
    useAccountStore.getState().fetchAccounts();
    await get().fetchRecentTransactions();
    if (dto.accountId) {
      await get().fetchAccountTransactions(dto.accountId);
    }
    return updated;
  },

  deleteTransaction: async (id: string, accountId?: string) => {
    const success = await transactionRepository.delete(id);
    if (success) {
      useAccountStore.getState().fetchAccounts();
      await get().fetchRecentTransactions();
      if (accountId) {
        await get().fetchAccountTransactions(accountId);
      }
    }
    return success;
  },
}));
