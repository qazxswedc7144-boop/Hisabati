import { db } from '../database/db';
import { AppSettings, SettingsEntry } from '@/shared/types';

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

export class SettingsRepository {
  async getSettings(): Promise<AppSettings> {
    const entries = await db.settings.toArray();
    const result: Record<string, unknown> = { ...DEFAULT_SETTINGS };

    for (const entry of entries) {
      result[entry.key] = entry.value;
    }

    return result as unknown as AppSettings;
  }

  async updateSettings(partial: Partial<AppSettings>): Promise<AppSettings> {
    const now = new Date().toISOString();
    
    for (const [key, value] of Object.entries(partial)) {
      // Clean up any legacy duplicates with non-standard id
      const legacy = await db.settings.where('key').equals(key).filter((e) => e.id !== key).toArray();
      for (const item of legacy) {
        await db.settings.delete(item.id);
      }

      const entry: SettingsEntry = {
        id: key,
        key,
        value,
        updatedAt: now,
      };
      await db.settings.put(entry);
    }

    return await this.getSettings();
  }

  async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
    const entry = await db.settings.get(key);
    if (!entry) return defaultValue;
    return entry.value as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.updateSettings({ [key]: value } as unknown as Partial<AppSettings>);
  }
}

export const settingsRepository = new SettingsRepository();
