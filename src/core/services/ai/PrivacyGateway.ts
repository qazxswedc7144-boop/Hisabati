
/**
 * P1-1 & P1-B Privacy Gateway
 * Recursive sanitization for context and prompt.
 * Removes sensitive identifiers and credentials, tokenizes account names,
 * and neutralizes common Arabic and English prompt-injection attempts.
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
  'apikey',
  'credentials',
  'credential',
  'password',
  'secret',
  'auth',
  'authorization',
  'session',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'firebaseidtoken',
  'clientsecret',
  'privatekey',
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
   * Sanitizes a user prompt and neutralizes common injection attempts.
   */
  public sanitizePrompt(prompt: string): string {
    if (typeof prompt !== 'string' || !prompt) {
      return '';
    }

    let sanitized = prompt.trim();

    // 1. Neutralize XML-like delimiters that may imitate trusted instructions.
    sanitized = sanitized
      .replace(
        /<\/?(SYSTEM_INSTRUCTION|MINIMAL_CONTEXT|USER_INPUT)\b[^>]*>/gi,
        (match) => `[ESCAPED_${match.replace(/[<>/]/g, '')}]`
      )
      .replace(/<\/?script\b[^>]*>/gi, '[BLOCKED_TAG]');

    // 2. Neutralize common prompt-injection phrases in Arabic and English.
    const injectionPatterns: RegExp[] = [
      // Arabic injection attempts
      /تجاهل\s+(?:(?:كافة|كل|جميع)\s+)?(?:قواعد|التعليمات|الأوامر|الخصوصية)/giu,
      /تجاهل\s+(?:(?:كافة|كل|جميع)\s+)?(?:التعليمات|الأوامر)\s+(?:السابقة|كلها)/giu,
      /أرسل\s+(?:لِي\s+)?جميع\s+(?:أسماء|الحسابات|الأرصدة)/giu,
      /(?:أعطني|اكشف|اعرض)\s+(?:جميع\s+)?(?:بيانات\s+الاعتماد|كلمات\s+المرور|الأسرار)/giu,

      // English injection attempts
      // Fix: also match "ignore all instructions" and "ignore instructions".
      /\bignore\s+(?:(?:all|every)\s+)?instructions\b/gi,
      /\bignore\s+(?:(?:all|every)\s+)?(?:previous|prior|system)\s+instructions\b/gi,
      /\b(?:system\s+override|ignore\s+all\s+rules)\b/gi,
      /\breveal\s+(?:all|database|credentials|secrets)\b/gi,
      /\b(?:show|dump|export)\s+(?:all\s+)?(?:user|account|tenant)\s+(?:data|records|credentials)\b/gi,
    ];

    for (const pattern of injectionPatterns) {
      sanitized = sanitized.replace(
        pattern,
        '[BLOCKED_INJECTION_ATTEMPT]'
      );
    }

    // 3. Limit prompt size after sanitization.
    if (sanitized.length > 2000) {
      sanitized = sanitized.slice(0, 2000);
    }

    return sanitized;
  }

  /**
   * Recursively sanitizes objects and arrays.
   * Removes forbidden keys and retains approved financial fields
   * or recursively inspected nested structures.
   */
  private sanitizeValue(
    val: unknown,
    accountIndexRef: { counter: number }
  ): unknown {
    if (val === null || val === undefined) {
      return val;
    }

    if (Array.isArray(val)) {
      return val.map((item) =>
        this.sanitizeValue(item, accountIndexRef)
      );
    }

    if (typeof val === 'object') {
      const sanitizedObj: Record<string, unknown> = {};
      const record = val as Record<string, unknown>;

      for (const [rawKey, rawVal] of Object.entries(record)) {
        const lowerKey = rawKey.toLowerCase();
const normalizedKey = lowerKey.replace(/[^a-z0-9]/g, '');

const containsSensitiveTerm =
  /(?:password|secret|credential|token|apikey|authorization)/i.test(
    normalizedKey
  );

const isForbiddenKey =
  PrivacyGateway.FORBIDDEN_KEYS.has(normalizedKey) ||
  containsSensitiveTerm;

// Remove sensitive identifiers and credentials at every nesting level.
if (isForbiddenKey) {
  continue;
}

        // Replace account names with stable, non-identifying placeholders.
        if (lowerKey === 'accountname' || lowerKey === 'name') {
          sanitizedObj[rawKey] =
            `[ACCOUNT_${accountIndexRef.counter++}]`;
          continue;
        }

        // Retain approved financial fields and recursively inspect nested data.
        if (
          PrivacyGateway.ALLOWED_FINANCIAL_KEYS.has(lowerKey) ||
          (rawVal !== null && typeof rawVal === 'object')
        ) {
          sanitizedObj[rawKey] = this.sanitizeValue(
            rawVal,
            accountIndexRef
          );
        }
      }

      return sanitizedObj;
    }

    if (typeof val === 'string') {
      return val
        .replace(
          /[\w.-]+@[\w.-]+\.\w+/g,
          '[FILTERED_EMAIL]'
        )
        .replace(
          /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
          '[FILTERED_PHONE]'
        );
    }

    return val;
  }

  /**
   * Sanitizes both the prompt and its context before AI processing.
   */
  public tokenizePromptAndContext(
    prompt: string,
    context?: Record<string, unknown>
  ): {
    sanitizedPrompt: string;
    sanitizedContext: Record<string, unknown>;
  } {
    const sanitizedPrompt = this.sanitizePrompt(prompt);
    const accountIndexRef = { counter: 1 };

    let sanitizedContext: Record<string, unknown> = {};

    if (
      context &&
      typeof context === 'object' &&
      !Array.isArray(context)
    ) {
      const sanitized = this.sanitizeValue(
        context,
        accountIndexRef
      );

      if (
        sanitized &&
        typeof sanitized === 'object' &&
        !Array.isArray(sanitized)
      ) {
        sanitizedContext = sanitized as Record<string, unknown>;
      }
    }

    return {
      sanitizedPrompt,
      sanitizedContext,
    };
  }

  /**
   * Returns a sanitized context summary without sensitive identifiers.
   */
  public sanitizeContext(
    context?: Record<string, unknown>
  ): Record<string, unknown> {
    if (
      !context ||
      typeof context !== 'object' ||
      Array.isArray(context)
    ) {
      return {};
    }

    const accountIndexRef = { counter: 1 };
    const sanitized = this.sanitizeValue(
      context,
      accountIndexRef
    );

    if (
      sanitized &&
      typeof sanitized === 'object' &&
      !Array.isArray(sanitized)
    ) {
      return sanitized as Record<string, unknown>;
    }

    return {};
  }
}

export const privacyGateway = new PrivacyGateway();
