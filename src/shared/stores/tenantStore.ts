import { create } from 'zustand';
import { Organization, OrganizationMembership, AuthMembershipStatus, TenantContext } from '../types/tenant.types';

interface TenantState extends TenantContext {
  isLoading: boolean;
  error: string | null;

  // Actions
  setContext: (context: Partial<TenantContext>) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: TenantContext = {
  activeOrganization: null,
  availableOrganizations: [],
  currentMembership: null,
  authMembershipStatus: 'membership_unknown',
  isLocalMode: true,
  isOffline: false,
};

export const useTenantStore = create<TenantState>((set) => ({
  ...initialState,
  isLoading: false,
  error: null,

  setContext: (context) => set((state) => ({ ...state, ...context })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  reset: () => set({ ...initialState, isLoading: false, error: null }),
}));

/**
 * Resets all tenant-scoped Zustand stores.
 * Called after successful tenant switch to prevent stale state flash.
 */
export const resetTenantScopedStores = async (): Promise<void> => {
  try {
    const { useAccountStore } = await import('./accountStore');
    useAccountStore.setState({
      accounts: [],
      selectedAccount: null,
      trashItems: [],
      isLoading: false,
      searchQuery: '',
      filterType: 'all',
    });
  } catch (e) { /* ignore */ }

  try {
    const { useTransactionStore } = await import('./transactionStore');
    useTransactionStore.setState({
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
    });
  } catch (e) { /* ignore */ }

  try {
    const { useBIStore } = await import('./biStore');
    useBIStore.setState({
      healthSummary: null,
      cashFlow: null,
      risks: [],
      insights: [],
      forecast: null,
      isLoading: false,
      lastRefreshedAt: null,
      error: null,
    });
  } catch (e) { /* ignore */ }
};
