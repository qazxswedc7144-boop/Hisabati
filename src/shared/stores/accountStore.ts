import { create } from 'zustand';
import { Account, AccountFilterType, AccountSortField, CreateAccountDTO, UpdateAccountDTO, TrashItem } from '@/shared/types';
import { accountRepository } from '@/core/repositories/account.repository';
import { seedMockDataIfEmpty } from '@/shared/data/mockData';

interface AccountState {
  accounts: Account[];
  selectedAccount: Account | null;
  isLoading: boolean;
  searchQuery: string;
  filterType: AccountFilterType;
  sortField: AccountSortField;
  
  trashItems: TrashItem[];
  fetchAccounts: (includeArchived?: boolean) => Promise<void>;
  fetchAccountById: (id: string) => Promise<Account | undefined>;
  addAccount: (dto: CreateAccountDTO) => Promise<Account>;
  updateAccount: (id: string, dto: UpdateAccountDTO) => Promise<Account | undefined>;
  archiveAccount: (id: string) => Promise<boolean>;
  unarchiveAccount: (id: string) => Promise<boolean>;
  deleteAccount: (id: string, force?: boolean, moveToTrash?: boolean) => Promise<boolean>;
  fetchTrashItems: () => Promise<void>;
  restoreFromTrash: (trashId: string) => Promise<boolean>;
  deletePermanentlyFromTrash: (trashId: string) => Promise<void>;
  recalculateAll: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  setFilterType: (filter: AccountFilterType) => void;
  setSortField: (sort: AccountSortField) => void;
  getFilteredAccounts: () => Account[];
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  selectedAccount: null,
  isLoading: false,
  searchQuery: '',
  filterType: 'all',
  sortField: 'recent',
  trashItems: [],

  fetchAccounts: async (includeArchived = false) => {
    set({ isLoading: true });
    try {
      await seedMockDataIfEmpty();
      const accounts = await accountRepository.getAll(includeArchived || get().filterType === 'archived');
      set({ accounts, isLoading: false });
    } catch (e) {
      console.error('Failed to fetch accounts:', e);
      set({ isLoading: false });
    }
  },

  fetchAccountById: async (id: string) => {
    try {
      const account = await accountRepository.getById(id);
      set({ selectedAccount: account || null });
      return account;
    } catch (e) {
      console.error('Failed to fetch account by id:', e);
      return undefined;
    }
  },

  addAccount: async (dto: CreateAccountDTO) => {
    const newAccount = await accountRepository.create(dto);
    set((state) => ({ accounts: [newAccount, ...state.accounts] }));
    return newAccount;
  },

  updateAccount: async (id: string, dto: UpdateAccountDTO) => {
    const updated = await accountRepository.update(id, dto);
    if (updated) {
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === id ? updated : a)),
        selectedAccount: state.selectedAccount?.id === id ? updated : state.selectedAccount,
      }));
    }
    return updated;
  },

  archiveAccount: async (id: string) => {
    const updated = await accountRepository.archive(id);
    if (updated) {
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === id ? updated : a)),
        selectedAccount: state.selectedAccount?.id === id ? updated : state.selectedAccount,
      }));
      return true;
    }
    return false;
  },

  unarchiveAccount: async (id: string) => {
    const updated = await accountRepository.unarchive(id);
    if (updated) {
      set((state) => ({
        accounts: state.accounts.map((a) => (a.id === id ? updated : a)),
        selectedAccount: state.selectedAccount?.id === id ? updated : state.selectedAccount,
      }));
      return true;
    }
    return false;
  },

  deleteAccount: async (id: string, force = false, moveToTrash = false) => {
    const success = await accountRepository.delete(id, force, moveToTrash);
    if (success) {
      set((state) => ({
        accounts: state.accounts.filter((a) => a.id !== id),
        selectedAccount: state.selectedAccount?.id === id ? null : state.selectedAccount,
      }));
      if (moveToTrash) {
        get().fetchTrashItems();
      }
    }
    return success;
  },

  fetchTrashItems: async () => {
    try {
      const items = await accountRepository.getTrashItems();
      set({ trashItems: items });
    } catch (e) {
      console.error('Failed to fetch trash items:', e);
    }
  },

  restoreFromTrash: async (trashId: string) => {
    try {
      const success = await accountRepository.restoreFromTrash(trashId);
      if (success) {
        await get().fetchAccounts();
        await get().fetchTrashItems();
      }
      return success;
    } catch (e) {
      console.error('Failed to restore from trash:', e);
      return false;
    }
  },

  deletePermanentlyFromTrash: async (trashId: string) => {
    try {
      await accountRepository.deletePermanentlyFromTrash(trashId);
      set((state) => ({
        trashItems: state.trashItems.filter((item) => item.id !== trashId),
      }));
    } catch (e) {
      console.error('Failed to delete permanently from trash:', e);
    }
  },

  recalculateAll: async () => {
    set({ isLoading: true });
    try {
      await accountRepository.recalculateAll();
      const accounts = await accountRepository.getAll(get().filterType === 'archived');
      set({ accounts, isLoading: false });
    } catch (e) {
      console.error('Failed to recalculate balances:', e);
      set({ isLoading: false });
    }
  },

  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setFilterType: (filter: AccountFilterType) => {
    set({ filterType: filter });
    get().fetchAccounts(filter === 'archived');
  },
  setSortField: (sort: AccountSortField) => set({ sortField: sort }),

  getFilteredAccounts: () => {
    const { accounts, searchQuery, filterType, sortField } = get();
    let result = [...accounts];

    // 1. Archive filtering
    if (filterType === 'archived') {
      result = result.filter((a) => a.archived);
    } else {
      result = result.filter((a) => !a.archived);

      // 2. Status filtering
      if (filterType === 'owed_to_me') {
        result = result.filter((a) => (a.currentBalanceMinor !== undefined ? a.currentBalanceMinor > 0 : a.currentBalance > 0));
      } else if (filterType === 'owed_by_me') {
        result = result.filter((a) => (a.currentBalanceMinor !== undefined ? a.currentBalanceMinor < 0 : a.currentBalance < 0));
      } else if (filterType === 'settled') {
        result = result.filter((a) => (a.currentBalanceMinor !== undefined ? a.currentBalanceMinor === 0 : a.currentBalance === 0));
      }
    }

    // 3. Search filtering
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.phone && a.phone.includes(q)) ||
          (a.note && a.note.toLowerCase().includes(q))
      );
    }

    // 4. Sorting
    result.sort((a, b) => {
      if (sortField === 'name') {
        return a.name.localeCompare(b.name, 'ar');
      }
      if (sortField === 'balance') {
        const balA = a.currentBalanceMinor !== undefined ? Math.abs(a.currentBalanceMinor) : Math.round(Math.abs(a.currentBalance) * 100);
        const balB = b.currentBalanceMinor !== undefined ? Math.abs(b.currentBalanceMinor) : Math.round(Math.abs(b.currentBalance) * 100);
        return balB - balA;
      }
      if (sortField === 'createdAt') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      // 'recent' by default
      const dateA = a.lastTransactionDate || a.createdAt;
      const dateB = b.lastTransactionDate || b.createdAt;
      return new Date(dateB).getTime() - new Date(dateA).getTime();
    });

    return result;
  },
}));
