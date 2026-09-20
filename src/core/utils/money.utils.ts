/**
 * CHANGELOG:
 * - Fix 0.3: Created robust money utils supporting dynamic currency decimals (JPY: 0, KWD: 3, SAR/USD/YER/etc.).
 */
import { getCurrencyDecimals } from '../money/currency';

export function getMinorDigits(currency: string = 'SAR'): number {
  return getCurrencyDecimals(currency as any);
}

export function toMinor(major: number, currency: string = 'SAR'): number {
  const decimals = getMinorDigits(currency);
  const factor = Math.pow(10, decimals);
  return Math.round(major * factor);
}

export function fromMinor(minor: number, currency: string = 'SAR'): number {
  const decimals = getMinorDigits(currency);
  const factor = Math.pow(10, decimals);
  return minor / factor;
}
