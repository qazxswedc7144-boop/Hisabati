/**
 * API Authentication & Client Session Verification Header Helper.
 * Generates and caches in-memory client session tokens for authenticating
 * requests to server-side `/api/*` proxy endpoints.
 */

let cachedSessionToken: string | null = null;
let tokenExpiry = 0;

/**
 * Gets or creates a valid in-memory client session token.
 * Refreshed automatically before expiration (1 hour validity).
 */
export function getClientSessionToken(): string {
  const now = Date.now();
  if (cachedSessionToken && now < tokenExpiry) {
    return cachedSessionToken;
  }

  // Generate a random high-entropy token
  const randomBytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 24; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }

  const token = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  cachedSessionToken = token;
  tokenExpiry = now + 60 * 60 * 1000; // 1 hour
  return token;
}

/**
 * Returns the default headers required for calling Hisabati server APIs.
 */
export function getApiHeaders(additionalHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-hisabati-client': 'hisabati-web',
    'x-hisabati-session': getClientSessionToken(),
    ...(additionalHeaders || {}),
  };

  return headers;
}
