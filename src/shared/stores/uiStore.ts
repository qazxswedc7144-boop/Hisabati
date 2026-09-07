import { create } from 'zustand';

interface UIState {
  isQuickAddTransactionOpen: boolean;
  preselectedAccountId?: string;
  isAddAccountOpen: boolean;
  isSidebarOpen: boolean;
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'info';
  
  openQuickAddTransaction: (accountId?: string) => void;
  closeQuickAddTransaction: () => void;
  openAddAccount: () => void;
  closeAddAccount: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isQuickAddTransactionOpen: false,
  preselectedAccountId: undefined,
  isAddAccountOpen: false,
  isSidebarOpen: false,
  toastMessage: null,
  toastType: 'success',

  openQuickAddTransaction: (accountId?: string) =>
    set({ isQuickAddTransactionOpen: true, preselectedAccountId: accountId }),
  closeQuickAddTransaction: () =>
    set({ isQuickAddTransactionOpen: false, preselectedAccountId: undefined }),
  openAddAccount: () => set({ isAddAccountOpen: true }),
  closeAddAccount: () => set({ isAddAccountOpen: false }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setSidebarOpen: (open: boolean) => set({ isSidebarOpen: open }),
  showToast: (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    set({ toastMessage: message, toastType: type });
    setTimeout(() => {
      set({ toastMessage: null });
    }, 3500);
  },
  hideToast: () => set({ toastMessage: null }),
}));
