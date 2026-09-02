import { CurrencyCode, CurrencyConfig, BalanceStatus } from '@/shared/types';

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

export function formatCurrency(
  amount: number,
  currencyCode: CurrencyCode | string = 'YER',
  options?: {
    showSymbol?: boolean;
    showSign?: boolean;
    absolute?: boolean;
  }
): string {
  const config = (typeof currencyCode === 'string' && (CURRENCIES as any)[currencyCode]) || CURRENCIES.YER;
  const val = options?.absolute ? Math.abs(amount) : amount;
  
  const formattedNumber = new Intl.NumberFormat('ar-YE', {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
  }).format(val);

  if (options?.showSymbol === false) {
    return formattedNumber;
  }

  // If a raw symbol like 'ر.س' or '$' was passed as currencyCode, use it directly
  let symbol = config.symbolAr;
  if (typeof currencyCode === 'string') {
    if ((CURRENCIES as any)[currencyCode]) {
      symbol = (CURRENCIES as any)[currencyCode].symbolAr;
    } else if (currencyCode.trim().length > 0) {
      symbol = currencyCode.trim();
    }
  }

  return `${formattedNumber} ${symbol}`;
}

export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat('ar-YE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
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
    return new Intl.DateTimeFormat('ar-YE', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d);
  }

  return new Intl.DateTimeFormat('ar-YE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
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
