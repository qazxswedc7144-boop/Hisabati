import { create } from 'zustand';
import { AppSettings, CurrencyCode, LanguageCode, ThemeMode } from '@/shared/types';
import { settingsRepository } from '@/core/repositories/settings.repository';
import { setLanguage } from '@/core/i18n';

interface SettingsState {
  settings: AppSettings;
  isLoading: boolean;
  
  loadSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  setTheme: (theme: ThemeMode) => Promise<void>;
  setLanguage: (lang: LanguageCode) => Promise<void>;
  setCurrency: (currency: CurrencyCode) => Promise<void>;
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: 'YER',
  language: 'ar',
  theme: 'light',
  businessName: 'متجري / حساباتي',
  ownerName: 'المدير',
  phone: '',
  businessAddress: '',
  businessLogo: '',
  enablePinLock: false,
  enableBiometrics: false,
  enableNotifications: true,
  cloudSyncEnabled: false,
  autoBackupEnabled: false,
  // Phase F - Part 2: Invoice & Operational Preferences
  invoicePrefix: 'INV-',
  nextInvoiceNumber: 1,
  invoiceNumberingFormat: 'sequential',
  defaultInvoiceNotes: 'شكراً لتعاملكم معنا',
  showBusinessLogoOnInvoice: true,
  showTaxNumberOnInvoice: true,
  showPhoneOnInvoice: true,
  showAddressOnInvoice: true,
  defaultTransactionType: 'debit',
};

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: true,

  loadSettings: async () => {
    try {
      const settings = await settingsRepository.getSettings();
      set({ settings, isLoading: false });
      
      // Apply theme & language to DOM
      applyThemeToDOM(settings.theme);
      setLanguage(settings.language);
    } catch (e) {
      console.error('Failed to load settings:', e);
      set({ isLoading: false });
    }
  },

  updateSettings: async (partial: Partial<AppSettings>) => {
    // Instant optimistic update & DOM application
    set((state) => ({
      settings: { ...state.settings, ...partial }
    }));

    if (partial.theme) {
      applyThemeToDOM(partial.theme);
    }
    if (partial.language) {
      setLanguage(partial.language);
    }

    try {
      const updated = await settingsRepository.updateSettings(partial);
      set({ settings: updated });
    } catch (e) {
      console.error('Failed to update settings:', e);
    }
  },

  setTheme: async (theme: ThemeMode) => {
    await get().updateSettings({ theme });
  },

  setLanguage: async (lang: LanguageCode) => {
    await get().updateSettings({ language: lang });
  },

  setCurrency: async (currency: CurrencyCode) => {
    await get().updateSettings({ currency });
  },
}));

let systemThemeMediaQueryListener: ((e: MediaQueryListEvent) => void) | null = null;

function applyThemeToDOM(theme: ThemeMode) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (!window.matchMedia) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    return;
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  if (systemThemeMediaQueryListener) {
    mediaQuery.removeEventListener('change', systemThemeMediaQueryListener);
    systemThemeMediaQueryListener = null;
  }

  const updateClasses = () => {
    const isDark =
      theme === 'dark' ||
      (theme === 'system' && mediaQuery.matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  updateClasses();

  if (theme === 'system') {
    systemThemeMediaQueryListener = () => {
      updateClasses();
    };
    mediaQuery.addEventListener('change', systemThemeMediaQueryListener);
  }
}
