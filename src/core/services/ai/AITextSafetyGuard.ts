import { StructuredAICommand } from '@/shared/types/ai.types';

export interface AITextSafetyResult {
  allowed: boolean;
  reasons: string[];
}

/**
 * Narrow pre-persistence guard for AI-generated CREATE requests.
 * It rejects high-confidence instruction-override and authorization-bypass text.
 * It does not replace schema, RBAC, or financial validation.
 */
export class AITextSafetyGuard {
  private readonly blockedPatterns: Array<{ label: string; pattern: RegExp }> = [
    { label: 'instruction_override', pattern: /\b(ignore|disregard|override|forget)\s+(all\s+)?(previous|prior|system|developer)\s+(instructions?|rules?|prompts?)\b/i },
    { label: 'system_prompt_disclosure', pattern: /\b(reveal|print|show|expose)\s+(the\s+)?(system|developer)\s+prompt\b/i },
    { label: 'confirmation_bypass', pattern: /\b(bypass|skip|disable|without)\s+(user\s+)?(confirmation|approval|authorization)\b/i },
    { label: 'unauthorized_execution', pattern: /\b(execute|post|create|transfer)\b.{0,50}\b(without|before)\s+(the\s+)?user\s+(consent|approval|confirmation)\b/i },
    { label: 'data_exfiltration', pattern: /\b(export|dump|exfiltrate|send)\b.{0,50}\b(all|entire)\s+(database|customer|account|financial)\s+data\b/i },
    { label: 'arabic_instruction_override', pattern: /تجاهل\s+(كل\s+)?التعليمات\s+(السابقة|النظامية|الموجهة)/i },
    { label: 'arabic_system_prompt_disclosure', pattern: /(اكشف|اعرض|اطبع)\s+(تعليمات|موجهات)\s+(النظام|المطور)/i },
    { label: 'arabic_confirmation_bypass', pattern: /(تجاوز|تخطى|عطل|بدون)\s+(تأكيد|موافقة|تفويض)\s+(المستخدم)?/i },
    { label: 'arabic_unauthorized_execution', pattern: /(نفذ|سجل|رحل)\s+.{0,50}(بدون|قبل)\s+موافقة\s+المستخدم/i },
    { label: 'arabic_data_exfiltration', pattern: /(استخرج|صدّر|أرسل)\s+.{0,40}(كل|جميع)\s+(بيانات|سجلات)\s+(العملاء|الحسابات|القاعدة)/i },
  ];

  public inspect(prompt: string, command: StructuredAICommand): AITextSafetyResult {
    if (command.intent !== 'CREATE_TRANSACTION_REQUEST') {
      return { allowed: true, reasons: [] };
    }

    const content = [prompt, command.note || '', command.accountName || ''].join('\n');
    const reasons = this.blockedPatterns
      .filter(({ pattern }) => pattern.test(content))
      .map(({ label }) => label);

    return { allowed: reasons.length === 0, reasons };
  }
}

export const aiTextSafetyGuard = new AITextSafetyGuard();
