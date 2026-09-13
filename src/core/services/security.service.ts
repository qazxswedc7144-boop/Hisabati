/**
 * Security Service Architecture - SEC-01 Compliant PIN Hashing & Biometrics
 * Uses PBKDF2-HMAC-SHA256 with 100,000 iterations and random salt.
 */
export class SecurityService {
  isBiometricsAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential;
  }

  private async deriveKey(pin: string, salt: Uint8Array): Promise<string> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(pin),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );

    const hashArray = Array.from(new Uint8Array(derivedBits));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private bufferToHex(buffer: Uint8Array): string {
    return Array.from(buffer)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private hexToBuffer(hex: string): Uint8Array {
    const matches = hex.match(/.{1,2}/g);
    return new Uint8Array(matches ? matches.map((byte) => parseInt(byte, 16)) : []);
  }

  async setPin(newPin: string): Promise<string> {
    if (!newPin || newPin.length < 4) {
      throw new Error('رمز المرور يجب ألا يقل عن 4 أرقام');
    }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this.deriveKey(newPin, salt);
    return `${this.bufferToHex(salt)}:${hash}`;
  }

  async verifyPin(inputPin: string, storedHash: string): Promise<boolean> {
    if (!inputPin || !storedHash) return false;

    // Handle legacy plain text or simple hash migration
    if (!storedHash.includes(':')) {
      return inputPin === storedHash;
    }

    try {
      const [saltHex, expectedHash] = storedHash.split(':');
      if (!saltHex || !expectedHash) return false;

      const salt = this.hexToBuffer(saltHex);
      const computedHash = await this.deriveKey(inputPin, salt);

      // Constant time comparison to prevent timing attacks
      if (computedHash.length !== expectedHash.length) return false;
      let mismatch = 0;
      for (let i = 0; i < computedHash.length; i++) {
        mismatch |= computedHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
      }
      return mismatch === 0;
    } catch (err) {
      console.error('[SecurityService] PIN verification error:', err);
      return false;
    }
  }
}

export const securityService = new SecurityService();

