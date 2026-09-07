import { toMinorUnits, fromMinorUnits } from '@/core/utils/financial';

/**
 * ArabicNumberParser
 * Robust parsing for English numerals, Eastern Arabic numerals (٠-٩),
 * and spoken/written Arabic number words into exact numeric amounts and minor units.
 */
export class ArabicNumberParser {
  private static readonly EASTERN_TO_WESTERN: Record<string, string> = {
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    '٫': '.', '٬': '', ',': ''
  };

  /**
   * Converts Eastern Arabic numerals and comma separators to standard numeric digits
   */
  public static normalizeDigits(text: string): string {
    return text.replace(/[٠-٩٫٬,]/g, (char) => ArabicNumberParser.EASTERN_TO_WESTERN[char] ?? char);
  }

  /**
   * Extracts and parses a number from an Arabic text query.
   * Returns standard unit amount and minor units (cents / fils / halalas).
   */
  public static parse(text: string): { amount: number; amountMinor: number } | null {
    if (!text || typeof text !== 'string') return null;

    const normalized = ArabicNumberParser.normalizeDigits(text.trim());

    // 1. Check for hybrid numbers like "5 آلاف", "10 ملايين", "250 ألف"
    const hybridMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(ألف|الف|آلاف|الاف|ملايين|مليون|مائة|مئة)/);
    if (hybridMatch) {
      const baseNum = parseFloat(hybridMatch[1]);
      const multiplierWord = hybridMatch[2];
      let multiplier = 1;
      if (multiplierWord.includes('مليون') || multiplierWord.includes('ملايين')) {
        multiplier = 1000000;
      } else if (multiplierWord.includes('ألف') || multiplierWord.includes('الف') || multiplierWord.includes('آلاف') || multiplierWord.includes('الاف')) {
        multiplier = 1000;
      } else if (multiplierWord.includes('مائة') || multiplierWord.includes('مئة')) {
        multiplier = 100;
      }
      const totalAmount = baseNum * multiplier;
      return {
        amount: totalAmount,
        amountMinor: toMinorUnits(totalAmount),
      };
    }

    // 2. Check for purely digits (e.g. 5000, 1250.50)
    const directDigitMatch = normalized.match(/(\d+(?:\.\d+)?)/);
    if (directDigitMatch) {
      const num = parseFloat(directDigitMatch[1]);
      if (!isNaN(num) && num > 0) {
        return {
          amount: num,
          amountMinor: toMinorUnits(num),
        };
      }
    }

    // 3. Check for written Arabic number words
    const parsedWordNumber = ArabicNumberParser.parseWords(text);
    if (parsedWordNumber !== null && parsedWordNumber > 0) {
      return {
        amount: parsedWordNumber,
        amountMinor: toMinorUnits(parsedWordNumber),
      };
    }

    return null;
  }

  /**
   * Parses written Arabic phrases into numbers (e.g., "خمسة آلاف", "ألفين وخمسمائة", "مليون", "مئة ألف")
   */
  public static parseWords(text: string): number | null {
    // Clean string
    const clean = text
      .replace(/[^\u0600-\u06FF\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Word values dictionary
    const unitsMap: Record<string, number> = {
      'واحد': 1, 'واحدة': 1,
      'اثنين': 2, 'اثنان': 2, 'اثنتين': 2, 'اثنتان': 2,
      'ثلاثة': 3, 'ثلاث': 3,
      'اربعة': 4, 'أربعة': 4, 'اربع': 4, 'أربع': 4,
      'خمسة': 5, 'خمس': 5,
      'ستة': 6, 'ست': 6,
      'سبعة': 7, 'سبع': 7,
      'ثمانية': 8, 'ثمان': 8, 'ثماني': 8,
      'تسعة': 9, 'تسع': 9,
      'عشرة': 10, 'عشر': 10,
    };

    const teensMap: Record<string, number> = {
      'احد عشر': 11, 'أحد عشر': 11,
      'اثنا عشر': 12, 'اثني عشر': 12,
      'ثلاثة عشر': 13, 'ثلاث عشر': 13,
      'اربعة عشر': 14, 'أربعة عشر': 14,
      'خمسة عشر': 15, 'خمس عشر': 15,
      'ستة عشر': 16, 'ست عشر': 16,
      'سبعة عشر': 17, 'سبع عشر': 17,
      'ثمانية عشر': 18, 'ثمان عشر': 18,
      'تسعة عشر': 19, 'تسع عشر': 19,
    };

    const tensMap: Record<string, number> = {
      'عشرين': 20, 'عشرون': 20,
      'ثلاثين': 30, 'ثلاثون': 30,
      'اربعين': 40, 'أربعين': 40, 'اربعون': 40, 'أربعون': 40,
      'خمسين': 50, 'خمسون': 50,
      'ستين': 60, 'ستون': 60,
      'سبعين': 70, 'سبعون': 70,
      'ثمانين': 80, 'ثمانون': 80,
      'تسعين': 90, 'تسعون': 90,
    };

    const hundredsMap: Record<string, number> = {
      'مائة': 100, 'مئة': 100, 'مية': 100,
      'مئتان': 200, 'مئتين': 200,
      'ثلاثمائة': 300, 'ثلاثمئة': 300, 'ثلاث مئة': 300, 'ثلاث مائة': 300,
      'اربعمائة': 400, 'أربعمائة': 400, 'اربعمئة': 400, 'أربعمئة': 400,
      'خمسمائة': 500, 'خمسمئة': 500, 'خمس مئة': 500, 'خمس مائة': 500,
      'ستمائة': 600, 'ستمئة': 600,
      'سبعمائة': 700, 'سبعمئة': 700,
      'ثمانمائة': 800, 'ثمانمئة': 800,
      'تسعمائة': 900, 'تسعمئة': 900,
    };

    // Specific common shortcuts
    if (clean.includes('مليونين') || clean.includes('مليونان')) return 2000000;
    if (clean.includes('مليون')) {
      const parts = clean.split(/مليون/);
      const prefix = parts[0].trim();
      let factor = 1;
      if (prefix) {
        const pVal = ArabicNumberParser.parseWords(prefix);
        if (pVal) factor = pVal;
      }
      return factor * 1000000;
    }

    if (clean.includes('ألفين') || clean.includes('الفين')) {
      let remainder = 0;
      const parts = clean.split(/(?:ألفين|الفين)/);
      if (parts[1]) {
        const rVal = ArabicNumberParser.parseWords(parts[1]);
        if (rVal) remainder = rVal;
      }
      return 2000 + remainder;
    }

    if (clean.includes('ألف') || clean.includes('الف') || clean.includes('آلاف') || clean.includes('الاف')) {
      const match = clean.match(/(.*?)(?:ألف|الف|آلاف|الاف)(.*)/);
      if (match) {
        const thousandPart = match[1].trim();
        const remainderPart = match[2].trim();
        let thousandCount = 1;
        if (thousandPart) {
          const tVal = ArabicNumberParser.parseWords(thousandPart);
          if (tVal) thousandCount = tVal;
        }
        let remainder = 0;
        if (remainderPart) {
          const rVal = ArabicNumberParser.parseWords(remainderPart);
          if (rVal) remainder = rVal;
        }
        return (thousandCount * 1000) + remainder;
      }
    }

    // Direct token aggregation for numbers < 1000
    const words = clean.split(/\s+/).filter((w) => w && w !== 'و');
    let sum = 0;
    let found = false;

    // Check teens first
    for (const [teenStr, val] of Object.entries(teensMap)) {
      if (clean.includes(teenStr)) {
        sum += val;
        found = true;
        break;
      }
    }

    for (const word of words) {
      const stripped = word.startsWith('و') && word.length > 2 ? word.slice(1) : word;
      if (hundredsMap[stripped]) {
        sum += hundredsMap[stripped];
        found = true;
      } else if (tensMap[stripped]) {
        sum += tensMap[stripped];
        found = true;
      } else if (unitsMap[stripped] && !found) {
        sum += unitsMap[stripped];
        found = true;
      }
    }

    return found ? sum : null;
  }
}
