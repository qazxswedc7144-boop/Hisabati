/**
 * Security Service Architecture (Foundation for PIN Lock, Biometrics & Encryption in later phases)
 */
export class SecurityService {
  isBiometricsAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential;
  }

  async verifyPin(inputPin: string, storedHash: string): Promise<boolean> {
    // Simple placeholder hash verification
    return inputPin.length >= 4 && inputPin === storedHash;
  }

  async setPin(newPin: string): Promise<string> {
    return newPin;
  }
}

export const securityService = new SecurityService();
