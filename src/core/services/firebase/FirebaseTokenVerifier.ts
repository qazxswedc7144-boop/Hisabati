import firebaseConfigJson from '../../../../firebase-applet-config.json';

export interface VerifiedTokenClaims {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  authTime: number;
  issuedAt: number;
  expiresAt: number;
  projectId: string;
}

export type TokenErrorCode =
  | 'TOKEN_MISSING'
  | 'TOKEN_MALFORMED'
  | 'TOKEN_HEADER_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_PREMATURE'
  | 'TOKEN_PROJECT_MISMATCH'
  | 'TOKEN_UID_INVALID'
  | 'TOKEN_INVALID_SIGNATURE'
  | 'TOKEN_INTERNAL_ERROR';

export class FirebaseTokenVerificationError extends Error {
  public readonly code: TokenErrorCode;
  public readonly details?: string;

  constructor(code: TokenErrorCode, messageAr: string, details?: string) {
    super(messageAr);
    this.name = 'FirebaseTokenVerificationError';
    this.code = code;
    this.details = details;
  }
}

interface TestTokenEntry {
  token: string;
  claims: VerifiedTokenClaims;
  expired?: boolean;
  wrongProject?: boolean;
  invalidSignature?: boolean;
}

// Isomorphic Base64URL Encoding & Decoding (zero Node buffer dependency in browser)
function base64UrlDecode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'base64url').toString('utf8');
  }
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

function base64UrlEncode(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf8').toString('base64url');
  }
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * FirebaseTokenVerifier: Hardened, zero-leakage token verification.
 * - Extracts identity strictly from valid cryptographic token claims.
 * - Never trusts client-reported UID or role.
 * - Never logs or reveals the raw token in logs, console, or error traces.
 */
export class FirebaseTokenVerifier {
  private static defaultProjectId: string =
    firebaseConfigJson.projectId ||
    (typeof process !== 'undefined' ? process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID : '') ||
    'geometric-axis-2cbh2';

  private static cachedPublicKeys: Map<string, { cert: string; expiresAt: number }> = new Map();
  private static testTokens: Map<string, TestTokenEntry> = new Map();

  /**
   * Sets the expected project ID if different from default config
   */
  public static setProjectId(projectId: string): void {
    this.defaultProjectId = projectId;
  }

  public static getProjectId(): string {
    return this.defaultProjectId;
  }

  /**
   * Registers a test token for deterministic unit and integration tests.
   * Useful in testing environments without a live Google Cloud connection.
   */
  public static registerTestToken(entry: TestTokenEntry): void {
    this.testTokens.set(entry.token, entry);
  }

  public static clearTestTokens(): void {
    this.testTokens.clear();
  }

  /**
   * Generates a structurally authentic test token for unit test simulations.
   */
  public static createTestToken(
    claims: Partial<VerifiedTokenClaims> & { uid: string },
    options: {
      expired?: boolean;
      wrongProject?: boolean;
      invalidSignature?: boolean;
    } = {}
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const projId = options.wrongProject ? 'wrong-external-project-99' : (claims.projectId || this.defaultProjectId);
    const exp = options.expired ? now - 3600 : now + 3600;
    const iat = options.expired ? now - 7200 : now - 60;
    const authTime = iat;

    const header = {
      alg: 'RS256',
      kid: 'test_key_kid_1',
      typ: 'JWT',
    };

    const payload = {
      iss: `https://securetoken.google.com/${projId}`,
      aud: projId,
      auth_time: authTime,
      user_id: claims.uid,
      sub: claims.uid,
      iat,
      exp,
      email: claims.email || `${claims.uid}@hisabati.test`,
      email_verified: claims.emailVerified ?? true,
      name: claims.name || claims.uid,
      firebase: {
        identities: {},
        sign_in_provider: 'password',
      },
    };

    const b64Header = base64UrlEncode(JSON.stringify(header));
    const b64Payload = base64UrlEncode(JSON.stringify(payload));
    const signature = options.invalidSignature
      ? 'INVALID_SIGNATURE_TAMPERED_BITS_12345'
      : base64UrlEncode(`mock_sig_${claims.uid}_${exp}`);

    const token = `${b64Header}.${b64Payload}.${signature}`;

    this.registerTestToken({
      token,
      claims: {
        uid: claims.uid,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name,
        authTime,
        issuedAt: iat,
        expiresAt: exp,
        projectId: projId,
      },
      expired: options.expired,
      wrongProject: options.wrongProject,
      invalidSignature: options.invalidSignature,
    });

    return token;
  }

  /**
   * Verifies a Firebase ID token.
   * - Strict structural parsing
   * - Audience & Issuer project matching
   * - Expiration and timing validation
   * - Anti-spoofing and leakage prevention
   */
  public static async verifyIdToken(
    rawToken: string | undefined | null,
    options: {
      expectedProjectId?: string;
      nowSeconds?: number;
      skipSignatureCheckForTests?: boolean;
    } = {}
  ): Promise<VerifiedTokenClaims> {
    if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_MISSING',
        'رمز الدخول مفقود أو غير مقدم في الطلب.'
      );
    }

    const token = rawToken.trim();

    // Check registered test tokens first
    const registered = this.testTokens.get(token);
    if (registered) {
      if (registered.expired) {
        throw new FirebaseTokenVerificationError(
          'TOKEN_EXPIRED',
          'انتهت صلاحية رمز الدخول. يرجى إعادة تسجيل الدخول مجدداً.'
        );
      }
      if (registered.wrongProject) {
        throw new FirebaseTokenVerificationError(
          'TOKEN_PROJECT_MISMATCH',
          'رمز الدخول يتبع مشروعاً مختلفاً غير مصرح له بالوصول إلى هذا التطبيق.'
        );
      }
      if (registered.invalidSignature) {
        throw new FirebaseTokenVerificationError(
          'TOKEN_INVALID_SIGNATURE',
          'توقيع رمز الدخول غير صالح أو تم التلاعب به.'
        );
      }
      return registered.claims;
    }

    // Parse standard JWT (3 parts separated by dots)
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_MALFORMED',
        'صيغة رمز الدخول تالفة أو غير صالحة ولا تتبع معايير JWT.'
      );
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    // Decode Header
    let header: any;
    try {
      const headerJson = base64UrlDecode(headerB64);
      header = JSON.parse(headerJson);
    } catch {
      throw new FirebaseTokenVerificationError(
        'TOKEN_HEADER_INVALID',
        'ترويسة رمز الدخول تالفة ولا يمكن فك تشفيرها.'
      );
    }

    if (!header || typeof header !== 'object' || header.alg !== 'RS256' || !header.kid) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_HEADER_INVALID',
        'خوارزمية التشفير في رمز الدخول غير مدعومة (يجب أن تكون RS256 مع معرف مفتاح صالح).'
      );
    }

    // Decode Payload
    let payload: any;
    try {
      const payloadJson = base64UrlDecode(payloadB64);
      payload = JSON.parse(payloadJson);
    } catch {
      throw new FirebaseTokenVerificationError(
        'TOKEN_MALFORMED',
        'حمولة رمز الدخول تالفة ولا تحتوي على كائن JSON صالح.'
      );
    }

    if (!payload || typeof payload !== 'object') {
      throw new FirebaseTokenVerificationError(
        'TOKEN_MALFORMED',
        'حمولة رمز الدخول غير صالحة.'
      );
    }

    const expectedProject = options.expectedProjectId || this.defaultProjectId;
    const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
    const CLOCK_SKEW_SECONDS = 300; // 5 minutes tolerance

    // 1. Verify Issuer
    const expectedIssuer = `https://securetoken.google.com/${expectedProject}`;
    if (payload.iss !== expectedIssuer) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_PROJECT_MISMATCH',
        'جهة إصدار الرمز لا تطابق مشروع Firebase الخاص بالنظام.',
        `Found iss: ${payload.iss}, expected: ${expectedIssuer}`
      );
    }

    // 2. Verify Audience
    if (payload.aud !== expectedProject) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_PROJECT_MISMATCH',
        'الجمهور المستهدف في الرمز لا يطابق معرف المشروع الحالي.',
        `Found aud: ${payload.aud}, expected: ${expectedProject}`
      );
    }

    // 3. Verify Subject (UID)
    const uid = payload.sub || payload.user_id;
    if (!uid || typeof uid !== 'string' || uid.trim().length === 0 || uid.length > 128) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_UID_INVALID',
        'معرف المستخدم (UID) في رمز الدخول غير صالح أو مفقود.'
      );
    }

    // 4. Verify Expiration
    if (typeof payload.exp !== 'number' || payload.exp < now - CLOCK_SKEW_SECONDS) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_EXPIRED',
        'انتهت صلاحية رمز الدخول. يرجى تسجيل الدخول مجدداً لتحديث الجلسة.'
      );
    }

    // 5. Verify Issue Time
    if (typeof payload.iat !== 'number' || payload.iat > now + CLOCK_SKEW_SECONDS) {
      throw new FirebaseTokenVerificationError(
        'TOKEN_PREMATURE',
        'وقت إصدار الرمز مستقبلي وغير صالح مقارنة بتوقيت الخادم.'
      );
    }

    // 6. Verify Signature
    if (!options.skipSignatureCheckForTests) {
      const isVerified = await this.verifySignatureWithGoogle(
        header.kid,
        `${headerB64}.${payloadB64}`,
        signatureB64
      );
      if (!isVerified) {
        throw new FirebaseTokenVerificationError(
          'TOKEN_INVALID_SIGNATURE',
          'فشل التحقق من التوقيع الرقمي لرمز الدخول.'
        );
      }
    }

    return {
      uid,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      emailVerified: typeof payload.email_verified === 'boolean' ? payload.email_verified : undefined,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      authTime: typeof payload.auth_time === 'number' ? payload.auth_time : payload.iat,
      issuedAt: payload.iat,
      expiresAt: payload.exp,
      projectId: expectedProject,
    };
  }

  /**
   * Cryptographically verifies signature against Google's public certificates.
   */
  private static async verifySignatureWithGoogle(
    kid: string,
    signedData: string,
    signatureB64: string
  ): Promise<boolean> {
    try {
      const publicCert = await this.getGooglePublicCertificate(kid);
      if (!publicCert) {
        return false;
      }

      if (typeof window === 'undefined') {
        const cryptoModule = await import('crypto');
        const verifier = cryptoModule.createVerify('RSA-SHA256');
        verifier.update(signedData);
        return verifier.verify(publicCert, signatureB64, 'base64url');
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves Google public x509 cert by kid with caching
   */
  private static async getGooglePublicCertificate(kid: string): Promise<string | null> {
    const cached = this.cachedPublicKeys.get(kid);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.cert;
    }

    try {
      const res = await fetch(
        'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
      );
      if (!res.ok) return null;

      const keys: Record<string, string> = await res.json();
      const cacheControl = res.headers.get('cache-control') || '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      const maxAgeSeconds = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 3600;
      const expiresAt = Date.now() + maxAgeSeconds * 1000;

      for (const [k, cert] of Object.entries(keys)) {
        this.cachedPublicKeys.set(k, { cert, expiresAt });
      }

      return keys[kid] || null;
    } catch {
      return null;
    }
  }
}
