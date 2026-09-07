import { OCRFieldParser } from '@/core/services/ocr/OCRFieldParser';
import { ImagePreprocessor } from '@/core/services/ocr/ImagePreprocessor';
import { localHeuristicOCRProvider } from '@/core/services/ocr/providers/LocalHeuristicOCRProvider';
import { ocrService } from '@/core/services/ocr/OCRService';
import { db } from '@/core/database/db';

export interface OCRTestResultItem {
  id: string;
  title: string;
  description: string;
  passed: boolean;
  error?: string;
  details?: any;
  durationMs: number;
}

export interface OCRTestSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  durationMs: number;
  results: OCRTestResultItem[];
}

export class OCRTestSuite {
  public static async runAll(): Promise<OCRTestSuiteSummary> {
    const suiteStart = performance.now();
    const results: OCRTestResultItem[] = [];

    const tests: Array<{
      id: string;
      title: string;
      description: string;
      fn: () => Promise<void>;
    }> = [
      // 1. Document Types
      {
        id: 'OCR-01',
        title: 'Document Type: Invoice Detection',
        description: 'التعرف على الفاتورة الضريبية والمبيعات بدقة وتصنيفها كـ invoice',
        fn: async () => {
          const sample = 'فاتورة ضريبية مبيعات\nمؤسسة النور\nالإجمالي: 5000 ريال';
          const res = OCRFieldParser.parse(sample);
          if (res.documentType.value !== 'invoice' || res.documentType.confidence < 0.8) {
            throw new Error(`Expected documentType 'invoice' with >=0.8 conf, got ${res.documentType.value} (${res.documentType.confidence})`);
          }
        },
      },
      {
        id: 'OCR-02',
        title: 'Document Type: Receipt Detection',
        description: 'التعرف على سندات القبض والإيصالات وتصنيفها كـ receipt',
        fn: async () => {
          const sample = 'سند قبض نقدية رقم: 4410\nوصلنا من السيد: خالد\nالمبلغ: 12000 ريال';
          const res = OCRFieldParser.parse(sample);
          if (res.documentType.value !== 'receipt' || res.documentType.confidence < 0.8) {
            throw new Error(`Expected documentType 'receipt', got ${res.documentType.value}`);
          }
        },
      },
      {
        id: 'OCR-03',
        title: 'Document Type: Statement Detection',
        description: 'التعرف على كشف الحساب وتصنيفه كـ statement',
        fn: async () => {
          const sample = 'كشف حساب عميل\nحساب رقم: 102\nالرصيد: 34000 ريال';
          const res = OCRFieldParser.parse(sample);
          if (res.documentType.value !== 'statement') {
            throw new Error(`Expected documentType 'statement', got ${res.documentType.value}`);
          }
        },
      },

      // 2. Entities
      {
        id: 'OCR-04',
        title: 'Vendor Extraction: Arabic Keyword Anchor',
        description: 'استخراج اسم المورد/المتجر من ترويسة الفاتورة (مؤسسة/شركة)',
        fn: async () => {
          const sample = 'فاتورة ضريبية\nمؤسسة الأمل للتجارة العامة\nتاريخ: 2026-09-02\nالإجمالي: 1500 ريال';
          const res = OCRFieldParser.parse(sample);
          if (!res.vendorName.value || !res.vendorName.value.includes('الأمل للتجارة')) {
            throw new Error(`Expected vendor containing 'الأمل للتجارة', got: '${res.vendorName.value}'`);
          }
          if (res.vendorName.confidence < 0.8) {
            throw new Error(`Confidence too low: ${res.vendorName.confidence}`);
          }
        },
      },
      {
        id: 'OCR-05',
        title: 'Customer Extraction: Bill-To Label',
        description: 'استخراج اسم العميل من وسم "العميل" أو "السيد /"',
        fn: async () => {
          const sample = 'فاتورة مبيعات\nالمورد: شركة البركة\nالعميل: المهندس عادل الشرعبي\nالإجمالي: 8500';
          const res = OCRFieldParser.parse(sample);
          if (!res.customerName.value || !res.customerName.value.includes('عادل الشرعبي')) {
            throw new Error(`Expected customer containing 'عادل الشرعبي', got: '${res.customerName.value}'`);
          }
        },
      },

      // 3. Invoice Number & Numerals
      {
        id: 'OCR-06',
        title: 'Invoice Number: Western Digits & Codes',
        description: 'استخراج رقم الفاتورة والرموز المرجعية المكتوبة بالأرقام الإنجليزية',
        fn: async () => {
          const sample = 'فاتورة مبيعات\nرقم الفاتورة: INV-2026-904\nالإجمالي: 20000 ريال';
          const res = OCRFieldParser.parse(sample);
          if (res.invoiceNumber.value !== 'INV-2026-904') {
            throw new Error(`Expected 'INV-2026-904', got '${res.invoiceNumber.value}'`);
          }
          if (res.invoiceNumber.confidence < 0.9) {
            throw new Error(`Expected high confidence, got ${res.invoiceNumber.confidence}`);
          }
        },
      },
      {
        id: 'OCR-07',
        title: 'Invoice Number: Eastern Arabic Digits (٠-٩)',
        description: 'استخراج رقم الفاتورة المكتوب بالأرقام المشرقية وتحويله بدقة',
        fn: async () => {
          const sample = 'سند قبض\nفاتورة رقم: ١٠٥٨٢\nالمبلغ: 500 ريال';
          const res = OCRFieldParser.parse(sample);
          if (res.invoiceNumber.value !== '10582') {
            throw new Error(`Expected normalized digits '10582', got '${res.invoiceNumber.value}'`);
          }
        },
      },

      // 4. Dates
      {
        id: 'OCR-08',
        title: 'Date Extraction: Standard YYYY/MM/DD',
        description: 'استخراج التاريخ المكتوب بصيغة YYYY/MM/DD وتوحيده لـ ISO',
        fn: async () => {
          const sample = 'فاتورة رقم: 12\nالتاريخ: 2026/09/02\nالإجمالي: 1500';
          const res = OCRFieldParser.parse(sample);
          if (res.date.value !== '2026-09-02') {
            throw new Error(`Expected '2026-09-02', got '${res.date.value}'`);
          }
        },
      },
      {
        id: 'OCR-09',
        title: 'Date Extraction: Eastern Numerals & DD/MM/YYYY',
        description: 'استخراج التاريخ المكتوب بالصيغة المقلوبة والأرقام الشرقية',
        fn: async () => {
          const sample = 'فاتورة رقم: 15\nتاريخ الفاتورة: ١٥/٠٨/٢٠٢٦\nالمبلغ: 3000';
          const res = OCRFieldParser.parse(sample);
          if (res.date.value !== '2026-08-15') {
            throw new Error(`Expected '2026-08-15', got '${res.date.value}'`);
          }
        },
      },

      // 5. Currencies
      {
        id: 'OCR-10',
        title: 'Currency Extraction: YER, SAR, USD',
        description: 'التعرف الدقيق على العملات المالية (ريال يمني، سعودي، دولار)',
        fn: async () => {
          const sampleYER = 'فاتورة رقم 1\nالإجمالي: 5000 ريال يمني';
          const resYER = OCRFieldParser.parse(sampleYER);
          if (resYER.currency.value !== 'YER') throw new Error(`Expected YER, got ${resYER.currency.value}`);

          const sampleSAR = 'فاتورة رقم 2\nالمجموع: 450 ريال سعودي';
          const resSAR = OCRFieldParser.parse(sampleSAR);
          if (resSAR.currency.value !== 'SAR') throw new Error(`Expected SAR, got ${resSAR.currency.value}`);

          const sampleUSD = 'Invoice #3\nTotal: 120 USD';
          const resUSD = OCRFieldParser.parse(sampleUSD);
          if (resUSD.currency.value !== 'USD') throw new Error(`Expected USD, got ${resUSD.currency.value}`);
        },
      },

      // 6. Financial Amounts & Minor Units
      {
        id: 'OCR-11',
        title: 'Total Amount & Minor Units Calculation',
        description: 'استخراج المبلغ الإجمالي وتحويله إلى Minor Units (أعداد صحيحة)',
        fn: async () => {
          const sample = 'فاتورة رقم: 88\nالمبلغ الإجمالي: 45000.50 ريال';
          const res = OCRFieldParser.parse(sample);
          if (res.totalAmount.value !== 45000.5) {
            throw new Error(`Expected 45000.5, got ${res.totalAmount.value}`);
          }
          if (res.totalAmountMinor.value !== 4500050) {
            throw new Error(`Expected 4500050 minor units, got ${res.totalAmountMinor.value}`);
          }
        },
      },
      {
        id: 'OCR-12',
        title: 'Subtotal and Tax Breakdown',
        description: 'فصل الضريبة والمجموع الجزئي عن الإجمالي الكلي',
        fn: async () => {
          const sample = `
            فاتورة ضريبية
            المجموع الجزئي: 10000
            ضريبة القيمة المضافة: 1500
            صافي الفاتورة: 11500 ريال
          `;
          const res = OCRFieldParser.parse(sample);
          if (res.subtotal?.value !== 10000) throw new Error(`Expected subtotal 10000, got ${res.subtotal?.value}`);
          if (res.tax?.value !== 1500) throw new Error(`Expected tax 1500, got ${res.tax?.value}`);
          if (res.totalAmount.value !== 11500) throw new Error(`Expected total 11500, got ${res.totalAmount.value}`);
        },
      },

      // 7. Line Items
      {
        id: 'OCR-13',
        title: 'Line Items: Tabular Row Parsing',
        description: 'استخراج الأصناف والكميات والأسعار الفردية من الأسطر المجدولة',
        fn: async () => {
          const sample = `
            فاتورة مشتريات
            الصنف   الكمية  السعر   المجموع
            أرز بسمتي 10كجم   2   4000   8000
            زيت عافية 3 لتر   3   2500   7500
            المجموع الكلي: 15500 ريال
          `;
          const res = OCRFieldParser.parse(sample);
          if (res.lineItems.length < 2) {
            throw new Error(`Expected at least 2 line items, found ${res.lineItems.length}`);
          }
          const item1 = res.lineItems[0];
          if (!item1.name.value?.includes('أرز بسمتي')) {
            throw new Error(`Expected item name containing 'أرز بسمتي', got '${item1.name.value}'`);
          }
          if (item1.quantity.value !== 2 || item1.totalPrice.value !== 8000) {
            throw new Error(`Expected qty 2 and total 8000, got qty=${item1.quantity.value}, tot=${item1.totalPrice.value}`);
          }
        },
      },

      // 8. Confidence & Warnings
      {
        id: 'OCR-14',
        title: 'Confidence Calculation & Warnings on Incomplete Input',
        description: 'احتساب نسبة الثقة والتحذير عند نقص الحقول الأساسية',
        fn: async () => {
          const incompleteSample = 'نص عشوائي غير منظم بدون مبالغ أو تواريخ واضحة';
          const res = OCRFieldParser.parse(incompleteSample);
          if (res.overallConfidence > 0.5) {
            throw new Error(`Expected low confidence for gibberish text, got ${res.overallConfidence}`);
          }
          if (res.warnings.length === 0) {
            throw new Error('Expected warnings on missing required financial fields');
          }
        },
      },

      // 9. Safety & Invariants
      {
        id: 'OCR-15',
        title: 'Safety Invariant: isUserConfirmed Flag Must Be False',
        description: 'التحقق الصارم من أن نتائج OCR غير مصدقة تلقائياً وتحتاج مراجعة المستخدم',
        fn: async () => {
          const sample = 'فاتورة رقم 1\nالإجمالي: 1000 ريال';
          const res = await ocrService.processDocument(sample);
          if (res.isUserConfirmed !== false) {
            throw new Error('Violation: isUserConfirmed must be false on initial OCR extraction');
          }
        },
      },
      {
        id: 'OCR-16',
        title: 'Safety Invariant: Zero Database Writes Guarantee',
        description: 'التأكد من عدم مساس طبقة OCR بقاعدة البيانات أو إضافة قيود مالية',
        fn: async () => {
          let transactionsBefore = 0;
          let accountsBefore = 0;
          const hasIndexedDb = typeof indexedDB !== 'undefined';
          if (hasIndexedDb) {
            transactionsBefore = await db.transactions.count();
            accountsBefore = await db.accounts.count();
          }

          // Execute full OCR pipeline
          const sample = 'فاتورة رقم 999\nمؤسسة التجارة\nالمبلغ: 500000 ريال يمني';
          await ocrService.processDocument(sample);

          if (hasIndexedDb) {
            const transactionsAfter = await db.transactions.count();
            const accountsAfter = await db.accounts.count();

            if (transactionsAfter !== transactionsBefore) {
              throw new Error(`Violation: OCR wrote to transactions table! Before: ${transactionsBefore}, After: ${transactionsAfter}`);
            }
            if (accountsAfter !== accountsBefore) {
              throw new Error(`Violation: OCR wrote to accounts table! Before: ${accountsBefore}, After: ${accountsAfter}`);
            }
          }
        },
      },

      // 10. Mobile Preprocessor & Bilingual
      {
        id: 'OCR-17',
        title: 'Mobile Preprocessor: Aspect Ratio & Safe Resizing',
        description: 'التحقق من عمل ImagePreprocessor ومعالجة الأبعاد المناسبة للهواتف',
        fn: async () => {
          const result = await ImagePreprocessor.preprocess('data:image/jpeg;base64,mock', {
            maxWidth: 1600,
            maxHeight: 1600,
            grayscale: true,
          });
          if (!result.dataUrl) {
            throw new Error('Preprocessed result missing dataUrl');
          }
          if (result.width > 1600 || result.height > 1600) {
            throw new Error(`Dimensions exceeded maximum bounds: ${result.width}x${result.height}`);
          }
        },
      },
      {
        id: 'OCR-18',
        title: 'Bilingual Document: English & Arabic Mixed Parsing',
        description: 'دقة الاستخراج في الفواتير ثنائية اللغة (Tax Invoice - فاتورة ضريبية)',
        fn: async () => {
          const bilingualSample = `
            Tax Invoice - فاتورة ضريبية
            Al-Noor Trading Est. - مؤسسة النور للتجارة
            Invoice No: INV-8821
            Date: 2026-09-02
            Grand Total: 3450.00 SAR
          `;
          const res = OCRFieldParser.parse(bilingualSample);
          if (res.invoiceNumber.value !== 'INV-8821') {
            throw new Error(`Expected invoice INV-8821, got ${res.invoiceNumber.value}`);
          }
          if (res.currency.value !== 'SAR') {
            throw new Error(`Expected currency SAR, got ${res.currency.value}`);
          }
          if (res.totalAmount.value !== 3450) {
            throw new Error(`Expected total 3450, got ${res.totalAmount.value}`);
          }
        },
      },
    ];

    for (const test of tests) {
      const start = performance.now();
      try {
        await test.fn();
        const durationMs = Math.round(performance.now() - start);
        results.push({
          id: test.id,
          title: test.title,
          description: test.description,
          passed: true,
          durationMs,
        });
      } catch (err: any) {
        const durationMs = Math.round(performance.now() - start);
        results.push({
          id: test.id,
          title: test.title,
          description: test.description,
          passed: false,
          error: err?.message || String(err),
          durationMs,
        });
      }
    }

    const suiteDuration = Math.round(performance.now() - suiteStart);
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    return {
      total: results.length,
      passed,
      failed,
      durationMs: suiteDuration,
      results,
    };
  }
}
