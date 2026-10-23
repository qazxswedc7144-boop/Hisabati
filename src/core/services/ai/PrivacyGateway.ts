/**
 * P1-1 & P1-B Privacy Gateway
 * Robust Allowlist/Schema-based recursive sanitization for context and prompt,
 * stripping PII, accountIds, tenantIds, organizationIds, userIds, emails, phones, tokens, keys, and credentials,
 * and neutralizing prompt injection.
 */
export class PrivacyGateway {
  private static readonly FORBIDDEN_KEYS = new Set([
    'accountid',
    'tenantid',
    'organizationid',
    'userid',
    'id',
    'email',
    'phone',
    'token',
    'key',
    'credentials',
    'password',
    'secret',
    'auth',
    'session',
    'access_token',
    'refreshtoken',
  ]);

  private static readonly ALLOWED_FINANCIAL_KEYS = new Set([
    'amount',
    'amountminor',
    'currency',
    'type',
    'date',
    'totaldebit',
    'totalcredit',
    'currentbalance',
    'transactioncount',
    'balance',
    'total',
    'subtotal',
    'tax',
    'net',
    'summary',
    'metrics',
    'totals',
    'count',
    'category',
    'mode',
    'intent',
    'timestamp',
  ]);

  /**
   * Sanitizes and protects user prompt against prompt injection and leaks.
   */
  public sanitizePrompt(prompt: string): string {
    if (!prompt || typeof prompt !== 'string') return '';

    let sanitized = prompt.trim();

    // 1. Neutralize potential XML/delimiter injection attacks
    sanitized = sanitized
      .replace(/<\/?(SYSTEM_INSTRUCTION|MINIMAL_CONTEXT|USER_INPUT)>/gi, match => `[ESCAPED_${match.replace(/[\<\>\/]/g, '')}]`)
      .replace(/<\/?script>/gi, '[BLOCKED_TAG]');

    // 2. Neutralize prompt injection override phrases (Arabic & English)
    const injectionPatterns = [
      /تجاهل\s+(قواعد|التعليمات|الأوامر|الخصوصية)/gi,
      /ignore\s+(previous|all)\s+instructions/gi,
      /system\s+override/gi,
      /أرسل\s+جميع\s+(أسماء|الحسابات|الأرصدة)/gi,
      /reveal\s+(all|database|credentials)/gi,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(pattern, '[BLOCKED_INJECTION_ATTEMPT]');
    }

    // 3. Truncate to max allowed length
    if (sanitized.length > 2000) {
      sanitized = sanitized.slice(0, 2000);
    }

    return sanitized;
  }

  /**
   * Recursively sanitizes objects and arrays using Allowlist/Schema discipline.
   * Strips all forbidden PII keys at any nesting level and retains only safe allowed keys/financial values.
   */
  private sanitizeValue(val: unknown, accountIndexRef: { counter: number }): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) => this.sanitizeValue(item, accountIndexRef));
    }

    if (typeof val === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      const record = val as Record<string, unknown>;

      for (const [rawKey, rawVal] of Object.entries(record)) {
        const lowerKey = rawKey.toLowerCase();

        // 1. Drop forbidden PII or secret keys immediately
        if (PrivacyGateway.FORBIDDEN_KEYS.has(lowerKey)) {
          continue;
        }

        // 2. Handle account names / titles with tokenization
        if (lowerKey === 'accountname' || lowerKey === 'name') {
          sanitizedObj[rawKey] = `[ACCOUNT_${accountIndexRef.counter++}]`;
          continue;
        }

        // 3. Allow allowed financial/structural keys or safe nested objects/arrays
        if (
          PrivacyGateway.ALLOWED_FINANCIAL_KEYS.has(lowerKey) ||
          typeof rawVal === 'object' ||
          Array.isArray(rawVal)
        ) {
          sanitizedObj[rawKey] = this.sanitizeValue(rawVal, accountIndexRef);
        }
      }

      return sanitizedObj;
    }

    if (typeof val === 'string') {
      // Remove inline email/phone/token patterns if present inside strings
      return val
        .replace(/[\w.-]+@[\w.-]+\.\w+/g, '[FILTERED_EMAIL]')
        .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[FILTERED_PHONE]');
    }

    return val;
  }

  /**
   * Tokenizes and recursively sanitizes prompt and multi-level nested context.
   */
  public tokenizePromptAndContext(
    prompt: string,
    context?: Record<string, unknown>
  ): { sanitizedPrompt: string; sanitizedContext: Record<string, unknown> } {
    const sanitizedPrompt = this.sanitizePrompt(prompt);
    const accountIndexRef = { counter: 1 };

    let sanitizedContext: Record<string, unknown> = {};
    if (context && typeof context === 'object') {
      const sanitized = this.sanitizeValue(context, accountIndexRef);
      if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
        sanitizedContext = sanitized as Record<string, unknown>;
      }
    }

    return { sanitizedPrompt, sanitizedContext };
  }

  /**
   * Sanitizes minimal context summary to ensure no raw account IDs, tenant IDs, or PII are leaked.
   */
  public sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context || typeof context !== 'object') return {};
    const accountIndexRef = { counter: 1 };
    const sanitized = this.sanitizeValue(context, accountIndexRef);
    if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
      return sanitized as Record<string, unknown>;
    }
    return {};
  }
}

export const privacyGateway = new PrivacyGateway();
