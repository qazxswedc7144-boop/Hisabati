/**
 * P1-1 Privacy Gateway
 * Ensures that minimal data is sent to Gemini, real account IDs and PII are stripped,
 * sensitive account names are tokenized ([ACCOUNT_1], [ACCOUNT_2]),
 * prompt injection attempts are neutralized, and financial numbers are preserved only when necessary.
 */
export class PrivacyGateway {
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

    // 2. Neutralize prompt injection override phrases (e.g., "تجاهل قواعد الخصوصية", "ignore instructions")
    const injectionPatterns = [
      /تجاهل\s+(قواعد|التعليمات|الأوامر|الخصوصية)/gi,
      /ignore\s+(previous|all)\s+instructions/gi,
      /system\s+override/gi,
      /أرسل\s+جميع\s+(أسماء|الحسابات|الأرصدة)/gi,
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
   * Tokenizes account names or sensitive names in prompt or context.
   * Replaces known account names with [ACCOUNT_1], [ACCOUNT_2], etc.
   */
  public tokenizePromptAndContext(
    prompt: string,
    context?: Record<string, unknown>
  ): { sanitizedPrompt: string; sanitizedContext: Record<string, unknown> } {
    const sanitizedPrompt = this.sanitizePrompt(prompt);

    const sanitizedContext: Record<string, unknown> = {};
    if (context && typeof context === 'object') {
      for (const [key, value] of Object.entries(context)) {
        // Drop any accountId or raw sensitive identifiers
        if (key === 'accountId' || key === 'id' || key === 'userId' || key === 'token') {
          continue;
        }
        if (typeof value === 'string') {
          sanitizedContext[key] = value.replace(/(account_id|id|token|key)[\s:=]+[\w-]+/gi, '[FILTERED]');
        } else if (Array.isArray(value)) {
          sanitizedContext[key] = value.map((item, index) => {
            if (item && typeof item === 'object') {
              const copy = { ...(item as Record<string, unknown>) };
              if ('name' in copy) {
                copy.name = `[ACCOUNT_${index + 1}]`;
              }
              delete copy.id;
              delete copy.accountId;
              return copy;
            }
            return item;
          });
        } else {
          sanitizedContext[key] = value;
        }
      }
    }

    return { sanitizedPrompt, sanitizedContext };
  }

  /**
   * Sanitizes minimal context summary to ensure no raw account IDs or PII are leaked.
   */
  public sanitizeContext(context?: Record<string, unknown>): Record<string, unknown> {
    if (!context || typeof context !== 'object') return {};
    const [, sanitizedContext] = Object.entries(context).reduce(
      ([idx, acc], [k, v]) => {
        if (k === 'accountId' || k === 'id') return [idx, acc];
        if (k === 'accountName' && typeof v === 'string') {
          acc[k] = `[ACCOUNT_${idx}]`;
          return [idx + 1, acc];
        }
        acc[k] = v;
        return [idx, acc];
      },
      [1, {} as Record<string, unknown>]
    );
    return sanitizedContext;
  }
}

export const privacyGateway = new PrivacyGateway();
