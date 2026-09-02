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
  enablePinLock: false,
  enableBiometrics: false,
  enableNotifications: true,
  cloudSyncEnabled: false,
  autoBackupEnabled: false,
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
    try {
      const updated = await settingsRepository.updateSettings(partial);
      set({ settings: updated });

      if (partial.theme) {
        applyThemeToDOM(partial.theme);
      }
      if (partial.language) {
        setLanguage(partial.language);
      }
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

function applyThemeToDOM(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  const isDark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}
