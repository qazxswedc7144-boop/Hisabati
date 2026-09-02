import { AIIntent, AIMode, Currency } from '@/shared/types/ai.types';
import { TransactionType } from '@/shared/types';
import { ArabicNumberParser } from './ArabicNumberParser';
import { AccountResolver } from './AccountResolver';

export interface ExtractedAIEntities {
  accountNameCandidate?: string;
  amount?: number;
  amountMinor?: number;
  currencyCandidate?: Currency;
  transactionTypeCandidate?: TransactionType; // 'debit' (عليه) or 'credit' (له)
  dateCandidate?: string;
  noteCandidate?: string;
}

export interface ParsedIntentResult {
  intent: AIIntent;
  mode: AIMode;
  confidence: number;
  entities: ExtractedAIEntities;
  rawPrompt: string;
}

export class AIIntentService {
  /**
   * Identifies user intent and extracts financial entities from Arabic prompt.
   */
  public parse(prompt: string): ParsedIntentResult {
    const raw = prompt.trim();
    const normalized = AccountResolver.normalizeArabic(raw);

    const entities: ExtractedAIEntities = {};

    // 1. Extract amount if present
    const parsedAmount = ArabicNumberParser.parse(raw);
    if (parsedAmount) {
      entities.amount = parsedAmount.amount;
      entities.amountMinor = parsedAmount.amountMinor;
    }

    // 2. Extract Currency candidate
    if (/ريال\s*سعودي|ر\.?س|سعودي/.test(normalized)) {
      entities.currencyCandidate = 'SAR';
    } else if (/دولار|امريكي|USD|\$/.test(normalized)) {
      entities.currencyCandidate = 'USD';
    } else if (/ريال|يمني|ر\.?ي/.test(normalized)) {
      entities.currencyCandidate = 'YER';
    }

    // 3. Check for CREATE_TRANSACTION_REQUEST
    // Patterns:
    // "سجل على [أحمد] 5000"
    // "سجل لي عند [محمد] 2000"
    // "سجل لـ [خالد] 1500"
    // "قبضت من [سالم] 3000"
    // "استلمت من [علي] 1000"
    // "دفعت لـ [محمود] 500"
    // "أخذ مني [أحمد] 400"
    const isCreateCommand =
      /^(سجل\s+(على|لـ|لي\s+عند)|قبضت\s+من|استلمت\s+من|دفعت\s+لـ?|اخذ\s+مني|اعطيت|اضف\s+عمليه)/.test(normalized) ||
      (entities.amount !== undefined && (normalized.includes('سجل') || normalized.includes('قبضت') || normalized.includes('دفعت')));

    if (isCreateCommand) {
      // Determine transaction type
      if (/سجل\s+على|اخذ\s+مني|مدين|بعت\s+لـ?/.test(normalized)) {
        entities.transactionTypeCandidate = 'debit'; // عليه
      } else if (/سجل\s+لي\s+عند|سجل\s+لـ|قبضت\s+من|استلمت\s+من|دفعت\s+لـ|سدد\s+لي|دائن/.test(normalized)) {
        entities.transactionTypeCandidate = 'credit'; // له
      } else {
        entities.transactionTypeCandidate = 'debit';
      }

      // Extract account name candidate
      const nameMatch = raw.match(/(?:على|عند|من|لـ|ل)\s+([^\d٠-٩,\s]+(?:\s+[^\d٠-٩,\s]+)?)/);
      if (nameMatch && nameMatch[1]) {
        const potentialName = nameMatch[1].replace(/^(حساب|العميل|الاخ|الأخ)\s+/, '').trim();
        if (potentialName && potentialName !== 'الناس' && potentialName !== 'العملاء') {
          entities.accountNameCandidate = potentialName;
        }
      }

      return {
        intent: 'CREATE_TRANSACTION_REQUEST',
        mode: 'command',
        confidence: entities.amount && entities.accountNameCandidate ? 0.95 : 0.8,
        entities,
        rawPrompt: raw,
      };
    }

    // 4. Check for EDIT / DELETE
    if (/عدل\s+(العمليه|المعامله)|تعديل\s+العمليه/.test(normalized)) {
      return { intent: 'EDIT_TRANSACTION_REQUEST', mode: 'command', confidence: 0.85, entities, rawPrompt: raw };
    }
    if (/احذف\s+(العمليه|المعامله)|حذف\s+العمليه/.test(normalized)) {
      return { intent: 'DELETE_TRANSACTION_REQUEST', mode: 'command', confidence: 0.85, entities, rawPrompt: raw };
    }

    // 5. Account Statement
    if (/(كشف\s+حساب|تقرير\s+حساب|حركات\s+حساب)/.test(normalized)) {
      const match = raw.match(/(?:كشف\s+حساب|تقرير\s+حساب|حركات\s+حساب)\s*(?:لـ|ل|العميل)?\s*([^\d٠-٩?؟]+)/);
      if (match && match[1]) {
        entities.accountNameCandidate = match[1].trim();
      }
      return {
        intent: 'GET_ACCOUNT_STATEMENT',
        mode: 'analyze',
        confidence: 0.92,
        entities,
        rawPrompt: raw,
      };
    }

    // 6. Top Debtors (أعلى المدينين / من أكثر شخص عليه دين؟)
    if (/(اكثر\s+(شخص|عميل|ناس)\s+عليه|اكثر\s+العملاء\s+مديونيه|اعلى\s+المدينين|من\s+عليه\s+اكثر|اكبر\s+المدينين)/.test(normalized)) {
      return {
        intent: 'GET_TOP_DEBTORS',
        mode: 'analyze',
        confidence: 0.95,
        entities,
        rawPrompt: raw,
      };
    }

    // 7. Top Creditors (أعلى الدائنين / من أكثر شخص يطالبني؟)
    if (/(اكثر\s+(شخص|عميل|ناس)\s+يطالبني|اعلى\s+الدائنين|اكبر\s+الدائنين|من\s+له\s+عندي\s+اكثر)/.test(normalized)) {
      return {
        intent: 'GET_TOP_CREDITORS',
        mode: 'analyze',
        confidence: 0.95,
        entities,
        rawPrompt: raw,
      };
    }

    // 8. Total Receivables (كم لي؟ / كم لي عند الناس؟ / كم مستحق لي؟)
    // Careful not to trigger if there's a specific person mentioned like "كم لي عند أحمد"
    const specificAccountMatch = raw.match(/كم\s+(?:لي\s+عند|على)\s+([^\d٠-٩?؟\s]+(?:\s+[^\d٠-٩?؟\s]+)?)/);
    const hasSpecificAccount = specificAccountMatch &&
      !['الناس', 'العملاء', 'الجميع', 'الكل'].includes(specificAccountMatch[1].trim());

    if (hasSpecificAccount) {
      entities.accountNameCandidate = specificAccountMatch[1].trim();
      return {
        intent: 'GET_ACCOUNT_BALANCE',
        mode: 'ask',
        confidence: 0.92,
        entities,
        rawPrompt: raw,
      };
    }

    // Check account balance direct (e.g. "رصيد أحمد", "حساب محمد")
    const balanceDirectMatch = raw.match(/^(?:رصيد|حساب|كم\s+باقي\s+عند)\s+([^\d٠-٩?؟]+)/);
    if (balanceDirectMatch && balanceDirectMatch[1]) {
      const candidate = balanceDirectMatch[1].trim();
      if (!['الناس', 'العملاء', 'الحسابات', 'الديون'].includes(candidate)) {
        entities.accountNameCandidate = candidate;
        return {
          intent: 'GET_ACCOUNT_BALANCE',
          mode: 'ask',
          confidence: 0.90,
          entities,
          rawPrompt: raw,
        };
      }
    }

    // Global Receivables (كم لي؟)
    if (
      /(^|\s)(كم\s+لي(\s+عند\s+(الناس|العملاء))?|كم\s+مستحق\s+لي|كم\s+الناس\s+مديونه\s+لي|المستحق\s+لي|الفلوس\s+اللي\s+لي|كم\s+معي\s+ديون|ديوني\s+عند\s+الناس)(\s|[?؟]|$)/.test(normalized) ||
      normalized === 'كم لي' || normalized === 'كم لي؟' || normalized === 'كم لي عند الناس' || normalized === 'كم لي عند العملاء'
    ) {
      return {
        intent: 'GET_TOTAL_RECEIVABLES',
        mode: 'ask',
        confidence: 0.98,
        entities,
        rawPrompt: raw,
      };
    }

    // Global Payables (كم علي؟ / كم ديوني؟)
    if (
      /(^|\s)(كم\s+علي(\s+للناس|\s+للعملاء)?|كم\s+ديوني|كم\s+انا\s+مديون|كم\s+المستحق\s+علي|كم\s+لازم\s+ادفع|الديون\s+اللي\s+علي|المبالغ\s+المطلوبه\s+مني)(\s|[?؟]|$)/.test(normalized) ||
      normalized === 'كم علي' || normalized === 'كم علي؟' || normalized === 'كم ديوني' || normalized === 'كم ديوني؟'
    ) {
      return {
        intent: 'GET_TOTAL_PAYABLES',
        mode: 'ask',
        confidence: 0.98,
        entities,
        rawPrompt: raw,
      };
    }

    // Net Balance (صافي وضعي المالي / صافي الحسابات)
    if (/(صافي\s+وضعي\s+المالي|صافي\s+الحسابات|الرصيد\s+الصافي|الوضع\s+المالي)/.test(normalized)) {
      return {
        intent: 'GET_NET_BALANCE',
        mode: 'ask',
        confidence: 0.95,
        entities,
        rawPrompt: raw,
      };
    }

    // Period Summary (كم صرفت هذا الشهر؟ / ملخص الشهر)
    if (/(ملخص\s+الشهر|تقرير\s+هذا\s+الشهر|كم\s+صرفت\s+هذا\s+الشهر|احصائيات\s+هذا\s+الشهر|ملخص\s+العمليات)/.test(normalized)) {
      return {
        intent: 'GET_PERIOD_SUMMARY',
        mode: 'analyze',
        confidence: 0.92,
        entities,
        rawPrompt: raw,
      };
    }

    // Recent Transactions (آخر العمليات)
    if (/(اخر\s+العمليات|احدث\s+المعاملات|العمليات\s+الاخيره|اخر\s+الحركات)/.test(normalized)) {
      return {
        intent: 'GET_RECENT_TRANSACTIONS',
        mode: 'ask',
        confidence: 0.90,
        entities,
        rawPrompt: raw,
      };
    }

    // Search Account
    if (/(ابحث\s+عن\s+حساب|بحث\s+عن)/.test(normalized)) {
      const match = raw.match(/(?:ابحث\s+عن\s+حساب|بحث\s+عن)\s*(.*)/);
      if (match && match[1]) {
        entities.accountNameCandidate = match[1].trim();
      }
      return {
        intent: 'SEARCH_ACCOUNT',
        mode: 'ask',
        confidence: 0.88,
        entities,
        rawPrompt: raw,
      };
    }

    // Unknown intent fallback
    return {
      intent: 'UNKNOWN',
      mode: 'ask',
      confidence: 0.2,
      entities,
      rawPrompt: raw,
    };
  }
}

export const aiIntentService = new AIIntentService();
