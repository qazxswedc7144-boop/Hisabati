import { DatePreset, DateRange } from '@/shared/types';

/**
 * Returns formatted 'YYYY-MM-DD' from a Date object in local time.
 */
export function formatISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Resolves a date preset into an absolute start and end ISO date string ('YYYY-MM-DD').
 */
export function resolveDateRange(preset: DatePreset, customRange?: Partial<DateRange>): DateRange {
  const now = new Date();
  const todayStr = formatISODate(now);

  if (preset === 'today') {
    return { startDate: todayStr, endDate: todayStr };
  }

  if (preset === 'yesterday') {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = formatISODate(yesterday);
    return { startDate: yStr, endDate: yStr };
  }

  if (preset === 'this_week') {
    // In Arabic business calendar, week starts on Saturday (day index 6) or Sunday (0)
    const day = now.getDay(); // 0 is Sunday, 6 is Saturday
    const diffToSaturday = (day + 1) % 7; // days since Saturday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - diffToSaturday);
    return { startDate: formatISODate(startOfWeek), endDate: todayStr };
  }

  if (preset === 'this_month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: formatISODate(startOfMonth), endDate: formatISODate(endOfMonth) };
  }

  if (preset === 'last_month') {
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: formatISODate(startOfLastMonth), endDate: formatISODate(endOfLastMonth) };
  }

  if (preset === 'this_year') {
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const endOfYear = new Date(now.getFullYear(), 11, 31);
    return { startDate: formatISODate(startOfYear), endDate: formatISODate(endOfYear) };
  }

  if (preset === 'custom' && customRange?.startDate && customRange?.endDate) {
    return {
      startDate: customRange.startDate,
      endDate: customRange.endDate,
    };
  }

  // Default 'all'
  return {
    startDate: '1970-01-01',
    endDate: '2099-12-31',
  };
}

export const DATE_PRESETS: Array<{ id: DatePreset; labelAr: string; labelEn: string }> = [
  { id: 'all', labelAr: 'الكل (كافة الفترات)', labelEn: 'All Time' },
  { id: 'today', labelAr: 'اليوم', labelEn: 'Today' },
  { id: 'yesterday', labelAr: 'أمس', labelEn: 'Yesterday' },
  { id: 'this_week', labelAr: 'هذا الأسبوع', labelEn: 'This Week' },
  { id: 'this_month', labelAr: 'هذا الشهر', labelEn: 'This Month' },
  { id: 'last_month', labelAr: 'الشهر السابق', labelEn: 'Last Month' },
  { id: 'this_year', labelAr: 'هذه السنة', labelEn: 'This Year' },
  { id: 'custom', labelAr: 'فترة مخصصة', labelEn: 'Custom Range' },
];
