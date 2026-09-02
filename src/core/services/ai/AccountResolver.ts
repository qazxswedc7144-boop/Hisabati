import { Account } from '@/shared/types';
import { accountRepository } from '@/core/repositories/account.repository';

export type AccountResolutionStatus = 'EXACT_MATCH' | 'MULTIPLE_MATCHES' | 'NO_MATCH';

export interface AccountResolutionResult {
  status: AccountResolutionStatus;
  account?: Account;
  accounts?: Account[];
  query: string;
  confidence: number;
}

export class AccountResolver {
  /**
   * Normalizes Arabic text for tolerant but accurate matching
   */
  public static normalizeArabic(text: string): string {
    if (!text) return '';
    return text
      .trim()
      // Remove diacritics / tashkeel
      .replace(/[\u064B-\u065F\u0670]/g, '')
      // Remove tatweel
      .replace(/\u0640/g, '')
      // Normalize Alef variants
      .replace(/[أإآٱ]/g, 'ا')
      // Normalize Taa Marbuta to Haa
      .replace(/ة/g, 'ه')
      // Normalize Yaa / Alef Maksura
      .replace(/ى/g, 'ي')
      // Normalize Waw with Hamza
      .replace(/ؤ/g, 'و')
      // Normalize Yaa with Hamza
      .replace(/ئ/g, 'ي')
      // Clean duplicate whitespace
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * Resolves an account from an Arabic name or query.
   * Strictly avoids guessing or choosing arbitrary matches.
   */
  public async resolve(query: string, allAccountsList?: Account[]): Promise<AccountResolutionResult> {
    const rawQuery = query.trim();
    if (!rawQuery) {
      return { status: 'NO_MATCH', query: rawQuery, confidence: 0 };
    }

    const normalizedQuery = AccountResolver.normalizeArabic(rawQuery);
    const accounts = allAccountsList || await accountRepository.getAll(true);

    // 1. Direct ID match
    const idMatch = accounts.find((a) => a.id === rawQuery);
    if (idMatch) {
      return { status: 'EXACT_MATCH', account: idMatch, query: rawQuery, confidence: 1.0 };
    }

    // 2. Phone match
    const cleanPhoneQuery = rawQuery.replace(/[^\d+]/g, '');
    if (cleanPhoneQuery.length >= 7) {
      const phoneMatches = accounts.filter((a) => {
        if (!a.phone) return false;
        const pClean = a.phone.replace(/[^\d+]/g, '');
        return pClean.includes(cleanPhoneQuery) || cleanPhoneQuery.includes(pClean);
      });
      if (phoneMatches.length === 1) {
        return { status: 'EXACT_MATCH', account: phoneMatches[0], query: rawQuery, confidence: 0.98 };
      } else if (phoneMatches.length > 1) {
        return { status: 'MULTIPLE_MATCHES', accounts: phoneMatches, query: rawQuery, confidence: 0.9 };
      }
    }

    // 3. Exact normalized name match
    const exactNameMatches = accounts.filter((a) => {
      const normName = AccountResolver.normalizeArabic(a.name);
      return normName === normalizedQuery;
    });

    if (exactNameMatches.length === 1) {
      return { status: 'EXACT_MATCH', account: exactNameMatches[0], query: rawQuery, confidence: 0.99 };
    } else if (exactNameMatches.length > 1) {
      return { status: 'MULTIPLE_MATCHES', accounts: exactNameMatches, query: rawQuery, confidence: 0.95 };
    }

    // 4. Word boundary / Substring match (e.g. "محمد" matching "محمد أحمد", "محمد علي")
    const substringMatches = accounts.filter((a) => {
      const normName = AccountResolver.normalizeArabic(a.name);
      // Check full word match or containment
      const words = normName.split(' ');
      const queryWords = normalizedQuery.split(' ');
      
      const containsAllQueryWords = queryWords.every((qw) => normName.includes(qw));
      const queryContainsAccount = normalizedQuery.includes(normName);
      const anyWordExact = words.some((w) => w === normalizedQuery);

      return containsAllQueryWords || queryContainsAccount || anyWordExact;
    });

    if (substringMatches.length === 1) {
      return { status: 'EXACT_MATCH', account: substringMatches[0], query: rawQuery, confidence: 0.85 };
    } else if (substringMatches.length > 1) {
      return { status: 'MULTIPLE_MATCHES', accounts: substringMatches, query: rawQuery, confidence: 0.80 };
    }

    // 5. No match found
    return {
      status: 'NO_MATCH',
      query: rawQuery,
      confidence: 0,
    };
  }
}

export const accountResolver = new AccountResolver();
