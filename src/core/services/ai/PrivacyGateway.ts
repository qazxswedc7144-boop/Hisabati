
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

  private static readonly MAX_PROMPT_LENGTH = 2000;
  private static readonly MAX_STRING_LENGTH = 2000;
  private static readonly MAX_ARRAY_ITEMS = 100;
  private static readonly MAX_OBJECT_KEYS = 100;
  private static readonly MAX_DEPTH = 10;

  /**
   * Sanitizes a user-provided prompt and neutralizes common
   * Arabic and English prompt-injection attempts.
   *
   * Note: pattern filtering is defense-in-depth, not a substitute
   * for treating user content and context as untrusted data.
   */
  public sanitizePrompt(prompt: string): string {
    if (typeof prompt !== 'string' || !prompt) {
      return '';
    }

    let sanitized = prompt.trim();

    // Neutralize XML-like delimiters that imitate trusted instructions.
    sanitized = sanitized
      .replace(
        /<\/?(SYSTEM_INSTRUCTION|MINIMAL_CONTEXT|USER_INPUT)\b[^>]*>/gi,
        '[BLOCKED_INSTRUCTION_TAG]'
      )
      .replace(/<\/?script\b[^>]*>/gi, '[BLOCKED_TAG]');

    // Neutralize common prompt-injection phrases.
    const injectionPatterns: RegExp[] = [
      // Arabic
      /تجاهل\s+(?:(?:كافة|كل|جميع)\s+)?(?:قواعد|التعليمات|الأوامر|الخصوصية)/giu,
      /تجاهل\s+(?:(?:كافة|كل|جميع)\s+)?(?:التعليمات|الأوامر)\s+(?:السابقة|كلها)/giu,
      /أرسل\s+(?:لي\s+)?جميع\s+(?:أسماء|الحسابات|الأرصدة)/giu,
      /(?:أعطني|اكشف|اعرض)\s+(?:جميع\s+)?(?:بيانات\s+الاعتماد|كلمات\s+المرور|الأسرار)/giu,

      // English
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

    return sanitized.slice(0, PrivacyGateway.MAX_PROMPT_LENGTH);
  }

  /**
   * Normalizes a key for sensitive-field matching.
   * Examples: api_key -> apikey, refresh-token -> refreshtoken.
   */
  private normalizeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /**
   * Returns true for keys that may contain credentials or identifiers.
   */
  private isForbiddenKey(key: string): boolean {
    const normalizedKey = this.normalizeKey(key);

    const containsSensitiveTerm =
      /(?:password|secret|credential|token|apikey|authorization)/i.test(
        normalizedKey
      );

    return (
      PrivacyGateway.FORBIDDEN_KEYS.has(normalizedKey) ||
      containsSensitiveTerm
    );
  }

  /**
   * Masks email addresses and common phone-number formats.
   * Includes common Yemeni mobile formats such as 7XXXXXXXX,
   * 9677XXXXXXXX and +9677XXXXXXXX.
   */
  private maskSensitiveText(value: string): string {
    return value
      .replace(
        /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
        '[FILTERED_EMAIL]'
      )
      // International and local Yemeni mobile numbers.
      .replace(
        /(?<!\d)(?:\+?967[-.\s]?)?7\d{8}(?!\d)/g,
        '[FILTERED_PHONE]'
      )
      // General 3-3-4 phone format.
      .replace(
        /(?<!\d)(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g,
        '[FILTERED_PHONE]'
      );
  }

  /**
   * Recursively sanitizes supported JSON-like values.
   * Drops forbidden keys, sanitizes text values, limits recursion,
   * and retains only approved scalar fields or inspected nested objects.
   */
  private sanitizeValue(
    value: unknown,
    accountIndexRef: { counter: number },
    depth = 0
  ): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (depth > PrivacyGateway.MAX_DEPTH) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (typeof value === 'string') {
      return this.maskSensitiveText(
        this.sanitizePrompt(
          value.slice(0, PrivacyGateway.MAX_STRING_LENGTH)
        )
      );
    }

    if (
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return value;
    }

    if (Array.isArray(value)) {
      return value
        .slice(0, PrivacyGateway.MAX_ARRAY_ITEMS)
        .map((item) =>
          this.sanitizeValue(item, accountIndexRef, depth + 1)
        );
    }

    if (typeof value !== 'object') {
      // Do not pass functions, symbols, bigint, or other unsupported
      // values to an AI context.
      return undefined;
    }

    const sanitizedObject: Record<string, unknown> = {};
    const record = value as Record<string, unknown>;
    const entries = Object.entries(record).slice(
      0,
      PrivacyGateway.MAX_OBJECT_KEYS
    );

    for (const [rawKey, rawValue] of entries) {
      if (this.isForbiddenKey(rawKey)) {
        continue;
      }

      const normalizedKey = this.normalizeKey(rawKey);

      // Replace account names with stable placeholders within this
      // sanitization operation, without sending the original names.
      if (
        normalizedKey === 'accountname' ||
        normalizedKey === 'name'
      ) {
        sanitizedObject[rawKey] =
          `[ACCOUNT_${accountIndexRef.counter++}]`;
        continue;
      }

      const isNestedObject =
        rawValue !== null && typeof rawValue === 'object';

      const isAllowedFinancialField =
        PrivacyGateway.ALLOWED_FINANCIAL_KEYS.has(normalizedKey);

      if (isNestedObject) {
        const sanitizedNested = this.sanitizeValue(
          rawValue,
          accountIndexRef,
          depth + 1
        );

        if (sanitizedNested !== undefined) {
          sanitizedObject[rawKey] = sanitizedNested;
        }

        continue;
      }

      // Only approved scalar fields are retained.
      if (isAllowedFinancialField) {
        const sanitizedScalar = this.sanitizeValue(
          rawValue,
          accountIndexRef,
          depth + 1
        );

        if (sanitizedScalar !== undefined) {
          sanitizedObject[rawKey] = sanitizedScalar;
        }
      }
    }

    return sanitizedObject;
  }

  /**
   * Sanitizes both prompt and context before AI processing.
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

    const sanitized = this.sanitizeValue(
      context,
      accountIndexRef
    );

    const sanitizedContext =
      sanitized !== null &&
      typeof sanitized === 'object' &&
      !Array.isArray(sanitized)
        ? (sanitized as Record<string, unknown>)
        : {};

    return {
      sanitizedPrompt,
      sanitizedContext,
    };
  }

  /**
   * Returns a sanitized context summary without forbidden identifiers.
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
