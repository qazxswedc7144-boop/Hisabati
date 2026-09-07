import { CurrencyCode, MinorUnit, RoundingMode } from '@/shared/types';
import { getCurrencyDecimals, getCurrencyFactor } from './currency';

/**
 * Validates that a value is a valid, non-null, finite integer within JavaScript's safe integer bounds.
 */
export function isValidMinorUnit(val: unknown): val is MinorUnit {
  return (
    typeof val === 'number' &&
    !Number.isNaN(val) &&
    Number.isFinite(val) &&
    Number.isInteger(val) &&
    Number.isSafeInteger(val)
  );
}

/**
 * Asserts that a value is a valid MinorUnit, throwing a descriptive error if not.
 */
export function assertValidMinorUnit(val: unknown, fieldName: string = 'amountMinor'): asserts val is MinorUnit {
  if (typeof val !== 'number') {
    throw new TypeError(`[Financial Safety] ${fieldName} must be a number, received ${typeof val}`);
  }
  if (Number.isNaN(val)) {
    throw new RangeError(`[Financial Safety] ${fieldName} cannot be NaN`);
  }
  if (!Number.isFinite(val)) {
    throw new RangeError(`[Financial Safety] ${fieldName} cannot be Infinity`);
  }
  if (!Number.isInteger(val)) {
    throw new RangeError(`[Financial Safety] ${fieldName} must be an integer, received float ${val}`);
  }
  if (!Number.isSafeInteger(val)) {
    throw new RangeError(`[Financial Safety] ${fieldName} exceeds Number.MAX_SAFE_INTEGER bounds: ${val}`);
  }
}

/**
 * Normalizes input numbers/strings to clean decimal strings without scientific notation for standard magnitudes.
 */
function normalizeDecimalInput(input: number | string): string {
  if (typeof input === 'number') {
    if (Number.isNaN(input)) {
      throw new RangeError('[Financial Safety] Decimal amount cannot be NaN');
    }
    if (!Number.isFinite(input)) {
      throw new RangeError('[Financial Safety] Decimal amount cannot be Infinity or -Infinity');
    }
    // Handle small/large floats formatted in scientific notation by JavaScript
    const str = input.toString();
    if (str.includes('e') || str.includes('E')) {
      return input.toFixed(12).replace(/\.?0+$/, '');
    }
    return str;
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      throw new TypeError('[Financial Safety] Decimal amount string cannot be empty');
    }
    return trimmed;
  }

  throw new TypeError(`[Financial Safety] Expected number or numeric string, received ${typeof input}`);
}

/**
 * Converts a decimal monetary amount (number or string) into canonical integer minor units.
 * Eliminates IEEE-754 floating-point inaccuracies through exact string parsing and configurable rounding.
 */
export function decimalToMinor(
  amount: number | string,
  currency?: CurrencyCode | string,
  rounding: RoundingMode = 'HALF_UP'
): MinorUnit {
  const normalized = normalizeDecimalInput(amount);
  const digits = getCurrencyDecimals(currency);

  const isNegative = normalized.startsWith('-');
  const cleaned = normalized.replace(/^[+-]/, '');

  // Validate numeric syntax (e.g. "123", "123.45")
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new RangeError(`[Financial Safety] Invalid decimal amount format: "${normalized}"`);
  }

  const [intPartStr, decPartStr = ''] = cleaned.split('.');
  const intPart = BigInt(intPartStr);

  let shouldIncrement = false;

  if (digits === 0) {
    // Zero decimal currency (e.g. YER)
    if (decPartStr.length > 0) {
      const firstDec = parseInt(decPartStr[0], 10);
      const restHasNonZero = decPartStr.slice(1).split('').some((c) => c !== '0');
      
      switch (rounding) {
        case 'HALF_UP':
          shouldIncrement = firstDec >= 5;
          break;
        case 'HALF_EVEN':
          shouldIncrement = firstDec > 5 || (firstDec === 5 && (restHasNonZero || intPart % 2n !== 0n));
          break;
        case 'CEIL':
          shouldIncrement = isNegative ? false : firstDec > 0 || restHasNonZero;
          break;
        case 'FLOOR':
          shouldIncrement = isNegative ? (firstDec > 0 || restHasNonZero) : false;
          break;
        case 'TRUNCATE':
        default:
          shouldIncrement = false;
          break;
      }
    }

    const finalMagnitude = intPart + (shouldIncrement ? 1n : 0n);
    if (finalMagnitude > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(`[Financial Safety] Minor unit magnitude exceeds MAX_SAFE_INTEGER`);
    }

    const num = Number(finalMagnitude);
    return isNegative ? -num : num;
  }

  // Currency with fractional minor units (digits > 0, e.g. 2 for SAR, 3 for KWD)
  let keptDecStr = decPartStr.slice(0, digits).padEnd(digits, '0');
  
  if (decPartStr.length > digits) {
    const nextDec = parseInt(decPartStr[digits], 10);
    const restHasNonZero = decPartStr.slice(digits + 1).split('').some((c) => c !== '0');
    const lastKept = parseInt(keptDecStr[keptDecStr.length - 1], 10);

    switch (rounding) {
      case 'HALF_UP':
        shouldIncrement = nextDec >= 5;
        break;
      case 'HALF_EVEN':
        shouldIncrement = nextDec > 5 || (nextDec === 5 && (restHasNonZero || lastKept % 2 !== 0));
        break;
      case 'CEIL':
        shouldIncrement = isNegative ? false : nextDec > 0 || restHasNonZero;
        break;
      case 'FLOOR':
        shouldIncrement = isNegative ? (nextDec > 0 || restHasNonZero) : false;
        break;
      case 'TRUNCATE':
      default:
        shouldIncrement = false;
        break;
    }
  }

  const factorBig = BigInt(getCurrencyFactor(currency));
  let finalMinorMagnitude = intPart * factorBig + BigInt(keptDecStr);
  if (shouldIncrement) {
    finalMinorMagnitude += 1n;
  }

  if (finalMinorMagnitude > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`[Financial Safety] Minor unit magnitude exceeds MAX_SAFE_INTEGER`);
  }

  const result = Number(finalMinorMagnitude);
  return isNegative ? -result : result;
}

/**
 * Formats an integer minor unit to an exact decimal string without floating point conversions.
 */
export function minorToDecimalString(
  amountMinor: MinorUnit,
  currency?: CurrencyCode | string
): string {
  assertValidMinorUnit(amountMinor, 'amountMinor');
  const digits = getCurrencyDecimals(currency);

  if (digits === 0) {
    return amountMinor.toString();
  }

  const isNegative = amountMinor < 0;
  const abs = Math.abs(amountMinor);
  const factor = getCurrencyFactor(currency);

  const intPart = Math.floor(abs / factor);
  const fractionPart = (abs % factor).toString().padStart(digits, '0');

  return `${isNegative ? '-' : ''}${intPart}.${fractionPart}`;
}

/**
 * Converts an integer minor unit back to standard floating decimal representation.
 */
export function minorToDecimal(
  amountMinor: MinorUnit,
  currency?: CurrencyCode | string
): number {
  return Number(minorToDecimalString(amountMinor, currency));
}
