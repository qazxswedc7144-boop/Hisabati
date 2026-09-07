import { AccountStatementReport } from '@/shared/types';
import { formatCurrency, formatDate } from '../utils/formatters';

export class ShareService {
  /**
   * Generates a clean, professional Arabic text message representing the account statement.
   */
  public generateStatementTextMessage(
    statement: AccountStatementReport,
    currency: string = 'ر.س'
  ): string {
    const isClosingPositive = statement.closingBalance > 0;
    const isClosingNegative = statement.closingBalance < 0;

    let balanceStatus = 'الحساب خالص ومتعادل (0.00)';
    if (isClosingPositive) {
      balanceStatus = `المبلغ المستحق لك: ${formatCurrency(statement.closingBalance, currency)}`;
    } else if (isClosingNegative) {
      balanceStatus = `المبلغ المستحق عليك: ${formatCurrency(Math.abs(statement.closingBalance), currency)}`;
    }

    const lines: string[] = [
      `📋 *كشف حساب مالي — تطبيق حساباتي*`,
      `━━━━━━━━━━━━━━━━━━`,
      `👤 *الحساب:* ${statement.account.name}`,
      `📅 *الفترة:* من ${statement.dateRange.startDate} إلى ${statement.dateRange.endDate}`,
      `━━━━━━━━━━━━━━━━━━`,
      `🔹 *الرصيد الافتتاحي:* ${formatCurrency(statement.openingBalance, currency)}`,
      `➕ *إجمالي لك (مدين):* ${formatCurrency(statement.totalPeriodDebit, currency)}`,
      `➖ *إجمالي عليك (دائن):* ${formatCurrency(statement.totalPeriodCredit, currency)}`,
      `📊 *صافي حركة الفترة:* ${formatCurrency(statement.periodNetMovement, currency)}`,
      `━━━━━━━━━━━━━━━━━━`,
      `💰 *الرصيد الختامي:* ${balanceStatus}`,
      `🔢 *عدد العمليات:* ${statement.transactionCount}`,
      `━━━━━━━━━━━━━━━━━━`,
      `تم استخراج البيان بتاريخ ${formatDate(new Date().toISOString(), 'short')}`,
    ];

    return lines.join('\n');
  }

  /**
   * Shares a text payload using Web Share API or falls back to Clipboard Copy.
   */
  public async shareText(
    title: string,
    text: string
  ): Promise<{ success: boolean; method: 'native' | 'clipboard' }> {
    if (navigator.share && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title,
          text,
        });
        return { success: true, method: 'native' };
      } catch (err: any) {
        // If user cancelled, don't fall back to clipboard
        if (err?.name === 'AbortError') {
          return { success: false, method: 'native' };
        }
      }
    }

    // Fallback to clipboard
    try {
      await navigator.clipboard.writeText(text);
      return { success: true, method: 'clipboard' };
    } catch {
      return { success: false, method: 'clipboard' };
    }
  }

  /**
   * Shares via direct WhatsApp URL with optionally prefilled contact phone.
   */
  public shareToWhatsApp(text: string, phone?: string): void {
    let cleanPhone = (phone || '').replace(/[^\d+]/g, '');
    if (cleanPhone.startsWith('00')) {
      cleanPhone = cleanPhone.replace(/^00/, '');
    } else if (cleanPhone.startsWith('+')) {
      cleanPhone = cleanPhone.replace(/^\+/, '');
    }

    const encoded = encodeURIComponent(text);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Shares a file via Web Share API if supported, or returns false so caller can trigger download.
   */
  public async shareFile(file: File, title: string): Promise<boolean> {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title,
        });
        return true;
      } catch (err: any) {
        if (err?.name === 'AbortError') return true;
        return false;
      }
    }
    return false;
  }
}

export const shareService = new ShareService();
