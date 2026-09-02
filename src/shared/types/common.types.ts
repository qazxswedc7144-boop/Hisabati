export type CurrencyCode = 'YER' | 'SAR' | 'USD' | 'AED' | 'EGP' | 'KWD' | 'QAR' | 'OMR';

export interface CurrencyConfig {
  code: CurrencyCode;
  nameAr: string;
  nameEn: string;
  symbolAr: string;
  symbolEn: string;
  decimals: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export type LanguageCode = 'ar' | 'en';

export type SortOrder = 'asc' | 'desc';

export interface DateRange {
  startDate?: string;
  endDate?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
