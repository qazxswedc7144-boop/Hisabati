import { CurrencyCode, LanguageCode, ThemeMode } from './common.types';
import { TransactionType } from './transaction.types';

export type InvoiceNumberingFormat = 'sequential' | 'yearly_sequential' | 'manual';

export interface AppSettings {
  currency: CurrencyCode;
  language: LanguageCode;
  theme: ThemeMode;
  businessName?: string;
  ownerName?: string;
  phone?: string;
  businessAddress?: string;
  businessLogo?: string;
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
  // Phase F - Part 2: Invoice & Operational Preferences
  invoicePrefix?: string;
  nextInvoiceNumber?: number;
  invoiceNumberingFormat?: InvoiceNumberingFormat;
  defaultInvoiceNotes?: string;
  showBusinessLogoOnInvoice?: boolean;
  showTaxNumberOnInvoice?: boolean;
  showPhoneOnInvoice?: boolean;
  showAddressOnInvoice?: boolean;
  defaultTransactionType?: TransactionType;
  // Phase F - Part 4: Privacy & Reporting
  enableAIDataAnalysis?: boolean;
  enableErrorReporting?: boolean;
}

export interface SettingsEntry {
  id: string; // key name
  key: string;
  value: unknown;
  updatedAt: string;
}
