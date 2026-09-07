import { db } from '../database/db';
import { AppSettings, SettingsEntry } from '@/shared/types';

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
    await db.settings.put({
      id: key,
      key,
      value,
      updatedAt: new Date().toISOString(),
    });
  }
}

export const settingsRepository = new SettingsRepository();
