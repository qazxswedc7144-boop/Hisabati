import { z } from 'zod';

const fieldSchema = <T extends z.ZodTypeAny>(valSchema: T) =>
  z.object({
    value: valSchema,
    confidence: z.number().min(0, { message: 'Confidence must be >= 0' }).max(1, { message: 'Confidence must be <= 1' }),
  });

export const OcrLineItemSchema = z.object({
  name: fieldSchema(z.string().nullable()),
  quantity: fieldSchema(z.number().nullable()),
  unitPrice: fieldSchema(z.number().nullable()),
  totalPrice: fieldSchema(z.number().nullable()),
});

export const GeminiOcrResponseSchema = z.object({
  documentType: fieldSchema(z.enum(['invoice', 'receipt', 'bill', 'statement', 'unknown'])),
  vendorName: fieldSchema(z.string().nullable()),
  customerName: fieldSchema(z.string().nullable()),
  invoiceNumber: fieldSchema(z.string().nullable()),
  date: fieldSchema(z.string().nullable()),
  currency: fieldSchema(z.enum(['YER', 'SAR', 'USD', 'AED'])),
  subtotal: fieldSchema(z.number().nullable()),
  tax: fieldSchema(z.number().nullable()),
  totalAmount: z.number({ message: 'totalAmount must be a number' }),
  lineItems: z.array(OcrLineItemSchema),
  rawText: z.string({ message: 'rawText must be a string' }),
  overallConfidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});

export type ValidatedGeminiOcrResponse = z.infer<typeof GeminiOcrResponseSchema>;
