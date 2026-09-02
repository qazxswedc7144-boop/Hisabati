import assert from 'node:assert';
import { ReceiptReviewService } from '../ReceiptReviewService';
import { OCRResult } from '../../../../shared/types';

console.log('🚀 Running Phase 7-B Receipt Review Tests...');

const mockOCRResult: OCRResult = {
  id: 'ocr-test-1',
  timestamp: 1715690000000,
  provider: 'local_heuristic',
  overallConfidence: 0.88,
  documentType: { value: 'tax_invoice', confidence: 0.9 },
  vendorName: { value: 'مؤسسة الأمل للتجارة العامة', confidence: 0.95 },
  customerName: { value: 'مؤسسة الريان', confidence: 0.85 },
  invoiceNumber: { value: 'INV-2026-904', confidence: 0.92 },
  date: { value: '2026-05-14', confidence: 0.9 },
  currency: { value: 'YER', confidence: 0.95 },
  subtotal: { value: 22000, confidence: 0.85 },
  tax: { value: 0, confidence: 0.9 },
  totalAmount: { value: 22000, confidence: 0.98 },
  lineItems: [
    {
      id: 'item-1',
      name: { value: 'سكر أبيض 10كجم', confidence: 0.9 },
      quantity: { value: 2, confidence: 0.85 },
      unitPrice: { value: 4000, confidence: 0.85 },
      totalPrice: { value: 8000, confidence: 0.9 },
    },
    {
      id: 'item-2',
      name: { value: 'أرز بسمتي 5كجم', confidence: 0.9 },
      quantity: { value: 3, confidence: 0.85 },
      unitPrice: { value: 3000, confidence: 0.85 },
      totalPrice: { value: 9000, confidence: 0.9 },
    },
    {
      id: 'item-3',
      name: { value: 'زيت طبخ 4لتر', confidence: 0.9 },
      quantity: { value: 1, confidence: 0.85 },
      unitPrice: { value: 5000, confidence: 0.85 },
      totalPrice: { value: 5000, confidence: 0.9 },
    },
  ],
  rawText: 'Full raw text test',
  warnings: [],
};

// 1. OCR Result Mapping
console.log('Test 1: OCR result mapping...');
const editable = ReceiptReviewService.mapOCRResultToEditableState(mockOCRResult);
assert.strictEqual(editable.partyName, 'مؤسسة الأمل للتجارة العامة');
assert.strictEqual(editable.partyType, 'vendor');
assert.strictEqual(editable.invoiceNumber, 'INV-2026-904');
assert.strictEqual(editable.date, '2026-05-14');
assert.strictEqual(editable.currency, 'YER');
assert.strictEqual(editable.totalAmount, 22000);
assert.strictEqual(editable.lineItems.length, 3);
assert.strictEqual(editable.lineItems[0].name, 'سكر أبيض 10كجم');
assert.strictEqual(editable.lineItems[0].quantity, 2);
assert.strictEqual(editable.lineItems[0].unitPrice, 4000);
assert.strictEqual(editable.lineItems[0].totalPrice, 8000);
console.log('✅ Passed Test 1: OCR result mapping');

// 2. Missing fields handling
console.log('Test 2: Missing fields...');
const sparseOCR: OCRResult = {
  id: 'ocr-test-sparse',
  timestamp: Date.now(),
  provider: 'local_heuristic',
  overallConfidence: 0.3,
  documentType: { value: 'unknown', confidence: 0.2 },
  currency: { value: 'YER', confidence: 0.5 },
  vendorName: { value: undefined, confidence: 0 },
  customerName: { value: undefined, confidence: 0 },
  invoiceNumber: { value: undefined, confidence: 0 },
  date: { value: undefined, confidence: 0 },
  totalAmount: { value: undefined, confidence: 0 },
  lineItems: [],
  rawText: 'إيصال غير واضح',
  warnings: ['تعذر استخراج اسم المورد'],
};
const sparseEditable = ReceiptReviewService.mapOCRResultToEditableState(sparseOCR);
assert.strictEqual(sparseEditable.partyName, '');
assert.strictEqual(sparseEditable.invoiceNumber, '');
assert.strictEqual(sparseEditable.totalAmount, 0);
assert.strictEqual(sparseEditable.lineItems.length, 0);

const validation = ReceiptReviewService.validate(sparseEditable);
assert.strictEqual(validation.isValid, false);
assert.ok(validation.errors.partyName);
assert.ok(validation.errors.totalAmount);

const status = ReceiptReviewService.getFieldConfidenceStatus(sparseOCR);
assert.strictEqual(status.vendorName.isMissing, true);
assert.strictEqual(status.totalAmount.isMissing, true);
assert.strictEqual(status.invoiceNumber.isMissing, true);
console.log('✅ Passed Test 2: Missing fields');

// 3. Low confidence detection
console.log('Test 3: Low confidence handling...');
const lowConfidenceOCR: OCRResult = {
  ...mockOCRResult,
  vendorName: { value: 'متجر غير واضح', confidence: 0.45 },
  totalAmount: { value: 1500, confidence: 0.55 },
};
const lowStatus = ReceiptReviewService.getFieldConfidenceStatus(lowConfidenceOCR);
assert.strictEqual(lowStatus.vendorName.isLow, true);
assert.strictEqual(lowStatus.vendorName.confidence, 0.45);
assert.strictEqual(lowStatus.totalAmount.isLow, true);
assert.strictEqual(lowStatus.totalAmount.confidence, 0.55);
assert.strictEqual(lowStatus.currency.isLow, false);
console.log('✅ Passed Test 3: Low confidence');

// 4. Arabic numerals parsing
console.log('Test 4: Arabic numbers normalization...');
assert.strictEqual(ReceiptReviewService.parseNumericInput('١٥٠٠٠'), 15000);
assert.strictEqual(ReceiptReviewService.parseNumericInput('٤٥٠٠.٥٠'), 4500.5);
assert.strictEqual(ReceiptReviewService.parseNumericInput('٣,٥٠٠'), 3500);

editable.totalAmount = '٢٥٠٠٠';
const arabicVal = ReceiptReviewService.validate(editable);
assert.strictEqual(arabicVal.isValid, true);
const draftFromArabic = ReceiptReviewService.createStructuredDraft(editable, mockOCRResult);
assert.strictEqual(draftFromArabic.totalAmount, 25000);
console.log('✅ Passed Test 4: Arabic numbers');

// 5. Manual correction retention
console.log('Test 5: Manual correction...');
editable.partyName = 'شركة الأمل الحديثة المحدودة';
editable.invoiceNumber = 'INV-MODIFIED-999';
editable.totalAmount = '23500';
editable.notes = 'تم التعديل اليدوي بعد مراجعة الأصل';
const draft = ReceiptReviewService.createStructuredDraft(editable, mockOCRResult);
assert.strictEqual(draft.partyName, 'شركة الأمل الحديثة المحدودة');
assert.strictEqual(draft.invoiceNumber, 'INV-MODIFIED-999');
assert.strictEqual(draft.totalAmount, 23500);
assert.strictEqual(draft.notes, 'تم التعديل اليدوي بعد مراجعة الأصل');
assert.strictEqual(draft.isConfirmedByUser, true);
assert.ok(draft.confirmedAt);
console.log('✅ Passed Test 5: Manual correction');

// 6. Invalid totals rejection
console.log('Test 6: Invalid totals rejection...');
editable.totalAmount = '0';
let val = ReceiptReviewService.validate(editable);
assert.strictEqual(val.isValid, false);
assert.ok(val.errors.totalAmount);

editable.totalAmount = '-500';
val = ReceiptReviewService.validate(editable);
assert.strictEqual(val.isValid, false);
assert.ok(val.errors.totalAmount);

editable.totalAmount = 'ألف ريال';
val = ReceiptReviewService.validate(editable);
assert.strictEqual(val.isValid, false);
assert.ok(val.errors.totalAmount);
console.log('✅ Passed Test 6: Invalid totals');

// 7. Math verification (discrepancy warning)
console.log('Test 7: Line items vs total verification...');
editable.totalAmount = '50000';
val = ReceiptReviewService.validate(editable);
assert.ok(val.warnings.length > 0);
assert.ok(val.warnings[0].includes('مجموع الأصناف'));
console.log('✅ Passed Test 7: Math verification');

// 8. Safe Isolation: No automatic Transaction creation
console.log('Test 8: Safe transaction isolation...');
assert.strictEqual((draft as any).transactionId, undefined);
assert.strictEqual(draft.isConfirmedByUser, true);
console.log('✅ Passed Test 8: Safe transaction isolation');

console.log('🎉 ALL 8 TESTS PASSED SUCCESSFULLY!');
