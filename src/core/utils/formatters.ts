import { CurrencyCode, CurrencyConfig, BalanceStatus, Money } from '@/shared/types';
import { minorToDecimal } from '../money/converter';

export const CURRENCIES: Record<CurrencyCode, CurrencyConfig> = {
  YER: {
    code: 'YER',
    nameAr: 'ريال يمني',
    nameEn: 'Yemeni Rial',
    symbolAr: 'ر.ي',
    symbolEn: 'YER',
    decimals: 0,
  },
  SAR: {
    code: 'SAR',
    nameAr: 'ريال سعودي',
    nameEn: 'Saudi Riyal',
    symbolAr: 'ر.س',
    symbolEn: 'SAR',
    decimals: 2,
  },
  USD: {
    code: 'USD',
    nameAr: 'دولار أمريكي',
    nameEn: 'US Dollar',
    symbolAr: '$',
    symbolEn: '$',
    decimals: 2,
  },
  AED: {
    code: 'AED',
    nameAr: 'درهم إماراتي',
    nameEn: 'UAE Dirham',
    symbolAr: 'د.إ',
    symbolEn: 'AED',
    decimals: 2,
  },
  EGP: {
    code: 'EGP',
    nameAr: 'جنيه مصري',
    nameEn: 'Egyptian Pound',
    symbolAr: 'ج.م',
    symbolEn: 'EGP',
    decimals: 2,
  },
  KWD: {
    code: 'KWD',
    nameAr: 'دينار كويتي',
    nameEn: 'Kuwaiti Dinar',
    symbolAr: 'د.ك',
    symbolEn: 'KWD',
    decimals: 3,
  },
  QAR: {
    code: 'QAR',
    nameAr: 'ريال قطري',
    nameEn: 'Qatari Riyal',
    symbolAr: 'ر.ق',
    symbolEn: 'QAR',
    decimals: 2,
  },
  OMR: {
    code: 'OMR',
    nameAr: 'ريال عماني',
    nameEn: 'Omani Rial',
    symbolAr: 'ر.ع',
    symbolEn: 'OMR',
    decimals: 3,
  },
};
 
export const SUPPORTED_CURRENCIES: CurrencyConfig[] = Object.values(CURRENCIES);

/**
 * Ensures any Eastern Arabic-Indic numerals (٠-٩) or arabic decimals are converted to Western Arabic numerals (0-9).
 */
export function toWesternNumerals(input: string): string {
  if (!input) return '';
  const easternToArabicMap: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '٫': '.', '٬': ',',
  };
  return input.replace(/[٠-٩٫٬]/g, (char) => easternToArabicMap[char] || char);
}

export function formatCurrency(
  amount: number | Money,
  currencyCode?: CurrencyCode | string,
  options?: {
    showSymbol?: boolean;
    showSign?: boolean;
    absolute?: boolean;
  }
): string {
  let numericVal: number;
  let activeCurrency: CurrencyCode | string;

  if (typeof amount === 'object' && amount !== null && 'amountMinor' in amount) {
    activeCurrency = currencyCode || amount.currency;
    numericVal = minorToDecimal(amount.amountMinor, amount.currency);
  } else {
    numericVal = typeof amount === 'number' ? amount : 0;
    activeCurrency = currencyCode || 'YER';
  }

  // Safety guard against NaN and Infinity
  if (isNaN(numericVal) || !isFinite(numericVal)) {
    numericVal = 0;
  }

  // Normalize negative zero (-0) to 0
  if (Object.is(numericVal, -0) || numericVal === 0) {
    numericVal = 0;
  }

  const config = (typeof activeCurrency === 'string' && (CURRENCIES as any)[activeCurrency]) || CURRENCIES.YER;
  let val = options?.absolute ? Math.abs(numericVal) : numericVal;
  if (Object.is(val, -0) || val === 0) {
    val = 0;
  }
  
  const formattedNumber = toWesternNumerals(
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: config.decimals,
      maximumFractionDigits: config.decimals,
    }).format(val)
  );

  if (options?.showSymbol === false) {
    return formattedNumber;
  }

  // If a raw symbol like 'ر.س' or '$' was passed as currencyCode, use it directly
  let symbol = config.symbolAr;
  if (typeof activeCurrency === 'string') {
    if ((CURRENCIES as any)[activeCurrency]) {
      symbol = (CURRENCIES as any)[activeCurrency].symbolAr;
    } else if (activeCurrency.trim().length > 0) {
      symbol = activeCurrency.trim();
    }
  }

  return `${formattedNumber} ${symbol}`;
}

export function formatNumber(value: number, decimals = 0): string {
  let safeVal = value;
  if (isNaN(safeVal) || !isFinite(safeVal) || Object.is(safeVal, -0) || safeVal === 0) {
    safeVal = 0;
  }
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(safeVal);
  return toWesternNumerals(formatted);
}

export function formatDate(
  dateInput: string | Date,
  style: 'full' | 'short' | 'relative' = 'short'
): string {
  if (!dateInput) return '-';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  
  if (isNaN(d.getTime())) return String(dateInput);

  if (style === 'relative') {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'اليوم';
    if (diffDays === 1) return 'أمس';
    if (diffDays === 2) return 'منذ يومين';
    if (diffDays > 2 && diffDays <= 10) return `منذ ${diffDays} أيام`;
    if (diffDays < 0 && diffDays === -1) return 'غداً';
  }

  if (style === 'full') {
    const formatted = new Intl.DateTimeFormat('ar-u-nu-latn', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
    return toWesternNumerals(formatted);
  }

  const formatted = new Intl.DateTimeFormat('ar-u-nu-latn', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
  return toWesternNumerals(formatted);
}

export function getBalanceStatus(balance: number): BalanceStatus {
  if (balance > 0) return 'owed_to_me';
  if (balance < 0) return 'owed_by_me';
  return 'settled';
}

export function getBalanceStatusDetails(balance: number) {
  const status = getBalanceStatus(balance);
  
  switch (status) {
    case 'owed_to_me':
      return {
        status,
        label: 'لك عنده',
        shortLabel: 'لك',
        colorClass: 'text-emerald-600 dark:text-emerald-400',
        bgClass: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60',
        badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300',
      };
    case 'owed_by_me':
      return {
        status,
        label: 'له عندك',
        shortLabel: 'عليك',
        colorClass: 'text-rose-600 dark:text-rose-400',
        bgClass: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800/60',
        badgeBg: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300',
      };
    case 'settled':
    default:
      return {
        status: 'settled' as BalanceStatus,
        label: 'متعادل',
        shortLabel: 'متعادل',
        colorClass: 'text-slate-500 dark:text-slate-400',
        bgClass: 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800',
        badgeBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
  }
}

/**
 * Formats an invoice or receipt number deterministically based on operational numbering settings.
 * Pure function: Does NOT mutate financial records or database states.
 */
export function formatInvoiceNumber(
  prefix: string = 'INV-',
  sequenceNumber: number = 1,
  format: 'sequential' | 'yearly_sequential' | 'manual' = 'sequential',
  date: Date | string = new Date()
): string {
  if (format === 'manual') {
    return '';
  }
  const safeSeq = Math.max(1, Math.floor(Number(sequenceNumber) || 1));
  const padded = String(safeSeq).padStart(4, '0');
  const cleanPrefix = (prefix || '').trim();

  if (format === 'yearly_sequential') {
    const d = typeof date === 'string' ? new Date(date) : date;
    const year = isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
    return `${cleanPrefix}${year}-${padded}`;
  }

  // Standard sequential
  return `${cleanPrefix}${padded}`;
}
