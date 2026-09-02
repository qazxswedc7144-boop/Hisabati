import { CurrencyCode, LanguageCode, ThemeMode } from './common.types';

export interface AppSettings {
  currency: CurrencyCode;
  language: LanguageCode;
  theme: ThemeMode;
  businessName?: string;
  ownerName?: string;
  phone?: string;
  enablePinLock: boolean;
  enableBiometrics: boolean;
  enableNotifications: boolean;
  lastBackupDate?: string;
  lastSyncDate?: string;
  cloudSyncEnabled: boolean;
  autoBackupEnabled: boolean;
  driveBackupFolderId?: string;
  // Phase 5: Messaging & Notifications Settings
  enableWebPushNotifications?: boolean;
  enableSoundAlerts?: boolean;
  enableWhatsAppDirect?: boolean;
  enableScheduler?: boolean;
  autoRemindDueDebts?: boolean;
}

export interface SettingsEntry {
  id: string; // key name
  key: string;
  value: unknown;
  updatedAt: string;
}
