import { z } from 'zod';

export const AIIntentEnum = z.enum([
  'GET_TOTAL_RECEIVABLES',
  'GET_TOTAL_PAYABLES',
  'GET_NET_BALANCE',
  'GET_ACCOUNT_BALANCE',
  'GET_ACCOUNT_STATEMENT',
  'GET_TOP_DEBTORS',
  'GET_TOP_CREDITORS',
  'GET_PERIOD_SUMMARY',
  'GET_RECENT_TRANSACTIONS',
  'SEARCH_ACCOUNT',
  'CREATE_TRANSACTION_REQUEST',
  'EDIT_TRANSACTION_REQUEST',
  'DELETE_TRANSACTION_REQUEST',
  'AUDIT_INVOICE',
  'UNKNOWN'
]);

export const AIModeEnum = z.enum(['ask', 'analyze', 'command']);

export const AIResponseSchema = z.object({
  text: z.string().default(''),
  intent: AIIntentEnum.default('UNKNOWN'),
  confidence: z.number().min(0).max(1).default(0.9),
  entities: z.record(z.string(), z.unknown()).default({}),
  mode: AIModeEnum.default('ask'),
  provider: z.string().default('gemini-server'),
  model: z.string().optional(),
});

export type ValidatedAIResponse = z.infer<typeof AIResponseSchema>;

export function validateAIResponse(input: unknown): ValidatedAIResponse {
  const result = AIResponseSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  // Safe fallback for invalid structure
  return {
    text: typeof (input as any)?.text === 'string' ? (input as any).text : 'حدث خطأ في معالجة استجابة المساعد.',
    intent: 'UNKNOWN',
    confidence: 0.1,
    entities: {},
    mode: 'ask',
    provider: 'gemini-server-fallback',
  };
}

export const StructuredAICommandSchema = z.object({
  id: z.string().min(1, { message: 'معرف الأمر مفقود' }),
  intent: z.enum(['CREATE_TRANSACTION_REQUEST', 'EDIT_TRANSACTION_REQUEST', 'DELETE_TRANSACTION_REQUEST'], { message: 'intent غير صالح للأمر المالي' }),
  accountId: z.string().min(1, { message: 'accountId مفقود أو غير صالح' }),
  accountName: z.string().optional(),
  targetAccount: z.unknown().optional(),
  amount: z.number().min(0, { message: 'amount يجب ألا يكون سالباً' }),
  amountMinor: z.number().int({ message: 'amountMinor يجب أن يكون عدداً صحيحاً' }).nonnegative({ message: 'amountMinor يجب ألا يكون سالباً' }),
  currency: z.enum(['YER', 'SAR', 'USD', 'AED'], { message: 'عملة غير مدعومة أو غير صالحة' }),
  type: z.enum(['debit', 'credit'], { message: 'نوع المعركة غير صالح' }),
  date: z.string().min(1, { message: 'التاريخ مفقود' }),
  note: z.string().optional(),
  confidence: z.number().min(0).max(1),
  status: z.enum(['PENDING_VALIDATION', 'READY_FOR_CONFIRMATION', 'CONFIRMED', 'EXECUTED', 'REJECTED', 'CANCELLED']),
  validationErrors: z.array(z.string()).optional(),
  disambiguationOptions: z.array(z.unknown()).optional(),
  operationId: z.string().min(1, { message: 'operationId مفقود أو غير صالح' }),
  executedTransactionId: z.string().optional(),
});

export type ValidatedStructuredAICommand = z.infer<typeof StructuredAICommandSchema>;

export function validateStructuredAICommand(input: unknown) {
  return StructuredAICommandSchema.safeParse(input);
}
