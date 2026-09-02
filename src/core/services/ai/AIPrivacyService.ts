/**
 * AIPrivacyService
 * Ensures privacy compliance, sensitive data masking, and minimal context delivery.
 */
export class AIPrivacyService {
  /**
   * Masks phone numbers (e.g., 771234567 -> 77***4567 or ****4567)
   */
  public maskPhoneNumber(phone?: string): string {
    if (!phone) return '';
    const clean = phone.replace(/[^\d+]/g, '');
    if (clean.length <= 4) return '****';
    const start = clean.slice(0, 2);
    const end = clean.slice(-3);
    return `${start}****${end}`;
  }

  /**
   * Masks sensitive information from a user prompt before audit logging
   */
  public sanitizePromptForAudit(prompt: string): string {
    if (!prompt) return '';
    // Mask any 8-15 digit phone or account numbers
    return prompt.replace(/(\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, '****');
  }

  /**
   * Returns minimal necessary context for AI queries without leaking full database
   */
  public buildMinimalContextSummary(params: {
    totalReceivables?: number;
    totalPayables?: number;
    netBalance?: number;
    accountsCount?: number;
    accountName?: string;
    accountBalance?: number;
    currency?: string;
  }): Record<string, unknown> {
    const context: Record<string, unknown> = {};
    if (params.totalReceivables !== undefined) context.totalReceivables = params.totalReceivables;
    if (params.totalPayables !== undefined) context.totalPayables = params.totalPayables;
    if (params.netBalance !== undefined) context.netBalance = params.netBalance;
    if (params.accountsCount !== undefined) context.accountsCount = params.accountsCount;
    if (params.accountName) context.accountName = params.accountName;
    if (params.accountBalance !== undefined) context.accountBalance = params.accountBalance;
    if (params.currency) context.currency = params.currency;
    return context;
  }
}

export const aiPrivacyService = new AIPrivacyService();
