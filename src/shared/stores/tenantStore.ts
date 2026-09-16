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
