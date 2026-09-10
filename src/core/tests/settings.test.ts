import { settingsRepository } from '@/core/repositories/settings.repository';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { accountRepository } from '@/core/repositories/account.repository';
import { transactionRepository } from '@/core/repositories/transaction.repository';
import { transactionEngine } from '@/core/services/transactionEngine.service';
import { SUPPORTED_CURRENCIES } from '@/core/utils/formatters';
import { CURRENCY_PRECISION_MAP } from '@/core/money/currency';
import { CurrencyCode, ThemeMode, LanguageCode } from '@/shared/types';

export interface SettingsTestResult {
  id: string;
  description: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

export interface SettingsTestSuiteResult {
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  results: SettingsTestResult[];
}

export class SettingsTestSuite {
  static async runAll(): Promise<SettingsTestSuiteResult> {
    const startTime = Date.now();
    const results: SettingsTestResult[] = [];

    // 1. SETTINGS-01: Baseline settings loading and default values
    await this.runTest(
      'SETTINGS-01',
      'التحقق من تحميل الإعدادات الافتراضية بنجاح وثبات القيم الأساسية',
      async () => {
        const settings = await settingsRepository.getSettings();
        if (!settings.currency || !settings.language || !settings.theme) {
          throw new Error('الإعدادات الافتراضية تفتقر إلى الحقول الأساسية (العملة، اللغة، المظهر)');
        }
        if (!['YER', 'SAR', 'USD', 'AED', 'EGP', 'KWD', 'QAR', 'OMR'].includes(settings.currency)) {
          throw new Error(`قيمة العملة الافتراضية غير صالحة: ${settings.currency}`);
        }
        if (!['ar', 'en'].includes(settings.language)) {
          throw new Error(`قيمة اللغة غير صالحة: ${settings.language}`);
        }
        if (!['light', 'dark', 'system'].includes(settings.theme)) {
          throw new Error(`نمط المظهر غير صالح: ${settings.theme}`);
        }
      },
      results
    );

    // 2. SETTINGS-02: Business profile updates
    await this.runTest(
      'SETTINGS-02',
      'حفظ وتحديث بيانات المنشأة (الاسم، المسؤول، الهاتف، العنوان) واسترجاعها بدقة',
      async () => {
        const testName = `مؤسسة الاختبار الحديثة ${Date.now()}`;
        const testOwner = 'فهد المنصوري';
        const testPhone = '+967 771 234 567';
        const testAddress = 'صنعاء - شارع الستين';

        await settingsRepository.updateSettings({
          businessName: testName,
          ownerName: testOwner,
          phone: testPhone,
          businessAddress: testAddress,
        });

        const updated = await settingsRepository.getSettings();
        if (
          updated.businessName !== testName ||
          updated.ownerName !== testOwner ||
          updated.phone !== testPhone ||
          updated.businessAddress !== testAddress
        ) {
          throw new Error('فشل استرجاع بيانات المنشأة بعد التحديث');
        }
      },
      results
    );

    // 3. SETTINGS-03: Business logo safe persistence
    await this.runTest(
      'SETTINGS-03',
      'حفظ واسترجاع وحذف شعار المنشأة بأمان دون التأثير على السجلات المالية',
      async () => {
        const mockLogo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
        
        await settingsRepository.updateSettings({ businessLogo: mockLogo });
        let current = await settingsRepository.getSettings();
        if (current.businessLogo !== mockLogo) {
          throw new Error('فشل حفظ شعار المنشأة في قاعدة البيانات');
        }

        // Test logo removal
        await settingsRepository.updateSettings({ businessLogo: '' });
        current = await settingsRepository.getSettings();
        if (current.businessLogo !== '') {
          throw new Error('فشل حذف شعار المنشأة');
        }
      },
      results
    );

    // 4. SETTINGS-04: Theme switching and persistence
    await this.runTest(
      'SETTINGS-04',
      'التحقق من دورة حياة أنماط المظهر (light, dark, system) وثباتها في الـ Store والـ Repository',
      async () => {
        for (const mode of ['dark', 'light', 'system'] as ThemeMode[]) {
          await useSettingsStore.getState().setTheme(mode);
          const inStore = useSettingsStore.getState().settings.theme;
          const inRepo = await settingsRepository.get<ThemeMode>('theme');
          if (inStore !== mode || inRepo !== mode) {
            throw new Error(`فشل تطبيق نمط المظهر ${mode}`);
          }
        }
      },
      results
    );

    // 5. SETTINGS-05: Language switching and document attributes
    await this.runTest(
      'SETTINGS-05',
      'التحقق من تبديل اللغة (ar, en) وتحديث اتجاه النصوص (RTL / LTR) دون فقدان البيانات',
      async () => {
        // Switch to English
        await useSettingsStore.getState().setLanguage('en');
        if (useSettingsStore.getState().settings.language !== 'en') {
          throw new Error('فشل تعيين اللغة إلى English');
        }
        if (typeof document !== 'undefined') {
          if (document.documentElement.lang !== 'en' || document.documentElement.dir !== 'ltr') {
            throw new Error('فشل تحديث سمات document.documentElement للغة الإنجليزية');
          }
        }

        // Switch back to Arabic
        await useSettingsStore.getState().setLanguage('ar');
        if (useSettingsStore.getState().settings.language !== 'ar') {
          throw new Error('فشل تعيين اللغة إلى العربية');
        }
        if (typeof document !== 'undefined') {
          if (document.documentElement.lang !== 'ar' || document.documentElement.dir !== 'rtl') {
            throw new Error('فشل إعادة سمات document.documentElement للغة العربية');
          }
        }
      },
      results
    );

    // 6. SETTINGS-06: Currency switching in settings
    await this.runTest(
      'SETTINGS-06',
      'تحديث العملة الرئيسية للنظام والتحقق من حفظها واسترجاعها الصحيح',
      async () => {
        const initialCurrency = useSettingsStore.getState().settings.currency;
        const targetCurrency: CurrencyCode = initialCurrency === 'SAR' ? 'USD' : 'SAR';

        await useSettingsStore.getState().setCurrency(targetCurrency);
        const storedCurrency = await settingsRepository.get<CurrencyCode>('currency');
        const storeCurrent = useSettingsStore.getState().settings.currency;
        if (storedCurrency !== targetCurrency || storeCurrent !== targetCurrency) {
          throw new Error(`فشل تحديث العملة إلى ${targetCurrency} (stored=${storedCurrency}, store=${storeCurrent})`);
        }

        // Restore initial
        await useSettingsStore.getState().setCurrency(initialCurrency);
      },
      results
    );

    // 7. SETTINGS-07: Financial Non-Destructive Invariant
    await this.runTest(
      'SETTINGS-07',
      'قانون عدم المساس المالي: تغيير العملة الرئيسية لا يعدل أو يحول أرصدة الحسابات أو مبالغ المعاملات التاريخية',
      async () => {
        const initialCurrency = useSettingsStore.getState().settings.currency;
        // Create an account with a transaction
        const testAccount = await accountRepository.create({
          name: `حساب اختبار العملة ${Date.now()}`,
          phone: '770000111',
          category: 'customer',
        });

        try {
          const trx = await transactionEngine.createTransaction({
            accountId: testAccount.id,
            type: 'debit',
            amount: 5000,
            note: 'معاملة قبل تغيير العملة',
            date: new Date().toISOString().split('T')[0],
          });

          const accBefore = await accountRepository.getById(testAccount.id);
          const trxBefore = await transactionRepository.getById(trx.id);

          const balanceBefore = accBefore?.currentBalanceMinor;
          const amountBefore = trxBefore?.amountMinor;

          // Switch currency
          await useSettingsStore.getState().setCurrency('KWD');
          await useSettingsStore.getState().setCurrency('USD');

          const accAfter = await accountRepository.getById(testAccount.id);
          const trxAfter = await transactionRepository.getById(trx.id);

          if (accAfter?.currentBalanceMinor !== balanceBefore) {
            throw new Error('انتهاك مالي: تغيير العملة أدى لتعديل الرصيد التاريخي للحساب!');
          }
          if (trxAfter?.amountMinor !== amountBefore) {
            throw new Error('انتهاك مالي: تغيير العملة أدى لتعديل مبلغ المعاملة التاريخية!');
          }

          // Cleanup test transaction
          await transactionRepository.delete(trx.id);
        } finally {
          await accountRepository.delete(testAccount.id);
          await useSettingsStore.getState().setCurrency(initialCurrency);
        }
      },
      results
    );

    // 8. SETTINGS-08: Currency precision consistency
    await this.runTest(
      'SETTINGS-08',
      'تطابق جدول العملات المعتمدة مع خريطة الدقة والكسور العشرية (0 لليمني، 2 للسعودي/الدولار، 3 للكويتي)',
      async () => {
        for (const curr of SUPPORTED_CURRENCIES) {
          const config = CURRENCY_PRECISION_MAP[curr.code];
          if (!config) {
            throw new Error(`العملة ${curr.code} غير معرّفة في CURRENCY_PRECISION_MAP`);
          }
          if (curr.decimals !== config.minorUnitDigits) {
            throw new Error(
              `تعارض في عدد المنازل العشرية للعملة ${curr.code}: formatters=${curr.decimals}, precisionMap=${config.minorUnitDigits}`
            );
          }
        }

        // Check specific known currencies
        if (CURRENCY_PRECISION_MAP['YER'].minorUnitDigits !== 0) throw new Error('الريال اليمني يجب أن يكون 0 منازل عشرية');
        if (CURRENCY_PRECISION_MAP['SAR'].minorUnitDigits !== 2) throw new Error('الريال السعودي يجب أن يكون 2 منزلتان عشريتان');
        if (CURRENCY_PRECISION_MAP['USD'].minorUnitDigits !== 2) throw new Error('الدولار الأمريكي يجب أن يكون 2 منزلتان عشريتان');
        if (CURRENCY_PRECISION_MAP['KWD'].minorUnitDigits !== 3) throw new Error('الدينار الكويتي يجب أن يكون 3 منازل عشرية');
      },
      results
    );

    // 9. SETTINGS-09: Partial update isolation
    await this.runTest(
      'SETTINGS-09',
      'عزل التحديثات الجزئية: تحديث حقل واحد لا يمسح أو يغير الحقول الأخرى غير المحددة',
      async () => {
        await settingsRepository.updateSettings({ businessName: 'مؤسسة السلام للتقنية' });
        const before = await settingsRepository.getSettings();

        // Update only phone
        await settingsRepository.updateSettings({ phone: '+967 777 888 999' });
        const after = await settingsRepository.getSettings();

        if (after.businessName !== before.businessName) {
          throw new Error('التحديث الجزئي للهاتف مسح أو غير اسم المنشأة المحفوظ!');
        }
        if (after.phone !== '+967 777 888 999') {
          throw new Error('فشل تحديث رقم الهاتف الجديد');
        }
      },
      results
    );

    // 10. SETTINGS-10: Resilient key retrieval with default fallback
    await this.runTest(
      'SETTINGS-10',
      'مرونة الاستعلام: طلب مفتاح غير موجود يعيد القيمة الافتراضية الممررة دون أخطاء',
      async () => {
        const nonExistentKey = `unknown_setting_${Date.now()}`;
        const defaultValue = 'SAFE_FALLBACK';
        const val = await settingsRepository.get<string>(nonExistentKey, defaultValue);
        if (val !== defaultValue) {
          throw new Error(`القيمة الافتراضية لم تُعد بشكل صحيح عند طلب مفتاح غير موجود`);
        }
      },
      results
    );

    // 11. SETTINGS-11: Invoice preferences saving and reload
    await this.runTest(
      'SETTINGS-11',
      'حفظ واسترجاع تفضيلات الفواتير (البادئة، الرقم التالي، ونمط الترقيم) بدقة تامة',
      async () => {
        await settingsRepository.updateSettings({
          invoicePrefix: 'REC-TEST-',
          nextInvoiceNumber: 2050,
          invoiceNumberingFormat: 'yearly_sequential',
          defaultInvoiceNotes: 'ملاحظة فواتير تجريبية موحدة',
        });

        const reloaded = await settingsRepository.getSettings();
        if (reloaded.invoicePrefix !== 'REC-TEST-') {
          throw new Error(`البادئة المسترجعة غير متطابقة: ${reloaded.invoicePrefix}`);
        }
        if (reloaded.nextInvoiceNumber !== 2050) {
          throw new Error(`الرقم التالي المسترجع غير متطابق: ${reloaded.nextInvoiceNumber}`);
        }
        if (reloaded.invoiceNumberingFormat !== 'yearly_sequential') {
          throw new Error(`نمط الترقيم غير متطابق: ${reloaded.invoiceNumberingFormat}`);
        }
        if (reloaded.defaultInvoiceNotes !== 'ملاحظة فواتير تجريبية موحدة') {
          throw new Error(`ملاحظات التذييل غير متطابقة: ${reloaded.defaultInvoiceNotes}`);
        }
      },
      results
    );

    // 12. SETTINGS-12: Deterministic formatInvoiceNumber formatting
    await this.runTest(
      'SETTINGS-12',
      'التحقق من خوارزمية صياغة وتوليد أرقام الفواتير الحتمية (formatInvoiceNumber)',
      async () => {
        const { formatInvoiceNumber } = await import('@/core/utils/formatters');
        
        // Sequential test
        const seq1 = formatInvoiceNumber('INV-', 1, 'sequential');
        if (seq1 !== 'INV-0001') {
          throw new Error(`صيغة الترقيم التسلسلي خاطئة: ${seq1}`);
        }
        const seq42 = formatInvoiceNumber('BILL-', 42, 'sequential');
        if (seq42 !== 'BILL-0042') {
          throw new Error(`صيغة الترقيم التسلسلي خاطئة: ${seq42}`);
        }

        // Yearly sequential test
        const yearly = formatInvoiceNumber('TAX-', 5, 'yearly_sequential', '2026-05-15');
        if (yearly !== 'TAX-2026-0005') {
          throw new Error(`صيغة الترقيم السنوي خاطئة: ${yearly}`);
        }

        // Manual mode test
        const manual = formatInvoiceNumber('ANY-', 99, 'manual');
        if (manual !== '') {
          throw new Error(`الوضع اليدوي يجب أن يعيد نصاً فارغاً ولكن أعاد: ${manual}`);
        }
      },
      results
    );

    // 13. SETTINGS-13: Financial Non-Destructive Invariant
    await this.runTest(
      'SETTINGS-13',
      'حماية النزاهة المالية: تعديل إعدادات الترقيم لا يغير amountMinor أو currentBalanceMinor إطلاقاً',
      async () => {
        // Create an account and a transaction
        const acc = await accountRepository.create({
          name: `عميل فحص الفواتير ${Date.now()}`,
          phone: '+967 770 111 222',
        });

        const trx = await transactionEngine.createTransaction({
          accountId: acc.id,
          type: 'debit',
          amount: 500,
          receiptNumber: 'HISTORIC-INV-777',
          date: new Date().toISOString().split('T')[0],
        });

        const accBefore = await accountRepository.getById(acc.id);
        const trxBefore = await transactionRepository.getById(trx.id);

        if (!accBefore || !trxBefore) throw new Error('فشل إنشاء بيانات الفحص المالي');

        // Mutate invoice preferences drastically
        await settingsRepository.updateSettings({
          invoicePrefix: 'MUTATED-PREFIX-',
          nextInvoiceNumber: 99999,
          invoiceNumberingFormat: 'manual',
          defaultInvoiceNotes: 'ملاحظة جديدة تماماً',
        });

        const accAfter = await accountRepository.getById(acc.id);
        const trxAfter = await transactionRepository.getById(trx.id);

        if (accAfter?.currentBalanceMinor !== accBefore.currentBalanceMinor) {
          throw new Error('خرق مالي خطير: تعديل إعدادات الفاتورة أثر على رصيد الحساب currentBalanceMinor!');
        }
        if (trxAfter?.amountMinor !== trxBefore.amountMinor) {
          throw new Error('خرق مالي خطير: تعديل إعدادات الفاتورة أثر على مبلغ المعاملة amountMinor!');
        }
      },
      results
    );

    // 14. SETTINGS-14: Historic Invoices & Receipt Numbers Immutability
    await this.runTest(
      'SETTINGS-14',
      'ثبات الفواتير والسندات التاريخية: المعاملات السابقة تحتفظ برقمها الأصلي دون مساس',
      async () => {
        const acc = await accountRepository.create({
          name: `عميل اختبار الثبات التاريخي ${Date.now()}`,
        });

        const originalReceipt = 'INV-ORIGINAL-999888';
        const trx = await transactionEngine.createTransaction({
          accountId: acc.id,
          type: 'credit',
          amount: 350,
          receiptNumber: originalReceipt,
          date: new Date().toISOString().split('T')[0],
        });

        // Change settings
        await settingsRepository.updateSettings({
          invoicePrefix: 'NEW-PREFIX-',
          nextInvoiceNumber: 1,
          invoiceNumberingFormat: 'sequential',
        });

        const verifiedTrx = await transactionRepository.getById(trx.id);
        if (verifiedTrx?.receiptNumber !== originalReceipt) {
          throw new Error(`تم تعديل رقم السند التاريخي! المتوقع: ${originalReceipt}، الفعلي: ${verifiedTrx?.receiptNumber}`);
        }
      },
      results
    );

    // 15. SETTINGS-15: Header layout toggles persistence
    await this.runTest(
      'SETTINGS-15',
      'حفظ واسترجاع تفضيلات إظهار عناصر الترويسة (الشعار، الهاتف، العنوان، السجل)',
      async () => {
        await settingsRepository.updateSettings({
          showBusinessLogoOnInvoice: false,
          showTaxNumberOnInvoice: true,
          showPhoneOnInvoice: false,
          showAddressOnInvoice: true,
        });

        const s = await settingsRepository.getSettings();
        if (
          s.showBusinessLogoOnInvoice !== false ||
          s.showTaxNumberOnInvoice !== true ||
          s.showPhoneOnInvoice !== false ||
          s.showAddressOnInvoice !== true
        ) {
          throw new Error('فشل حفظ أو استرجاع خيارات إظهار عناصر الترويسة بدقة');
        }
      },
      results
    );

    // 16. SETTINGS-16: Partial updates isolation for invoice preferences
    await this.runTest(
      'SETTINGS-16',
      'عزل التحديثات الجزئية لتفضيلات الفواتير مع الحفاظ على إعدادات المنشأة السابقة',
      async () => {
        await settingsRepository.updateSettings({
          businessName: 'مؤسسة النزاهة الهندسية',
          invoicePrefix: 'BILL-',
        });

        // Update ONLY nextInvoiceNumber
        await settingsRepository.updateSettings({
          nextInvoiceNumber: 8844,
        });

        const s = await settingsRepository.getSettings();
        if (s.businessName !== 'مؤسسة النزاهة الهندسية') {
          throw new Error('التحديث الجزئي لرقم الفاتورة مسح اسم المنشأة المحفوظ!');
        }
        if (s.invoicePrefix !== 'BILL-') {
          throw new Error('التحديث الجزئي مسح بادئة الفاتورة!');
        }
        if (s.nextInvoiceNumber !== 8844) {
          throw new Error('فشل حفظ الرقم التالي للفاتورة');
        }
      },
      results
    );
    
    // 17. SETTINGS-17: Default transaction type persistence
    await this.runTest(
      'SETTINGS-17',
      'حفظ واسترجاع نوع العملية الافتراضي (debit/credit) وتأثيره على الواجهة',
      async () => {
        await settingsRepository.updateSettings({ defaultTransactionType: 'credit' });
        const s = await settingsRepository.getSettings();
        if (s.defaultTransactionType !== 'credit') {
          throw new Error('فشل حفظ نوع العملية الافتراضي كـ credit');
        }
        
        await useSettingsStore.getState().updateSettings({ defaultTransactionType: 'debit' });
        const inStore = useSettingsStore.getState().settings.defaultTransactionType;
        if (inStore !== 'debit') {
          throw new Error('فشل تحديث نوع العملية الافتراضي في الـ Store');
        }
      },
      results
    );

    // 18. SETTINGS-18: Auto-increment invoice number on addTransaction
    await this.runTest(
      'SETTINGS-18',
      'التحقق من زيادة رقم الفاتورة تلقائياً عند إضافة عملية جديدة بنجاح',
      async () => {
        const { useTransactionStore } = await import('@/shared/stores/transactionStore');
        
        await settingsRepository.updateSettings({
          invoiceNumberingFormat: 'sequential',
          nextInvoiceNumber: 500,
          invoicePrefix: 'AUTO-',
        });
        
        await useSettingsStore.getState().loadSettings();
        
        const acc = await accountRepository.create({ name: 'حساب اختبار الترقيم' });
        try {
          const trx = await useTransactionStore.getState().addTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 100,
            date: new Date().toISOString().split('T')[0],
          });
          
          if (trx.receiptNumber !== 'AUTO-0500') {
            throw new Error(`رقم الفاتورة المولد غير صحيح: ${trx.receiptNumber}`);
          }
          
          const updatedSettings = await settingsRepository.getSettings();
          if (updatedSettings.nextInvoiceNumber !== 501) {
            throw new Error(`لم يتم زيادة الرقم التالي للفاتورة. القيمة الحالية: ${updatedSettings.nextInvoiceNumber}`);
          }
        } finally {
          await accountRepository.delete(acc.id);
        }
      },
      results
    );

    // 19. SETTINGS-19: Integrity Check Detection
    await this.runTest(
      'SETTINGS-19',
      'التحقق من قدرة نظام النزاهة على رصد عدم تطابق الأرصدة (Integrity Detection)',
      async () => {
        const { integrityService } = await import('@/core/services/integrity.service');
        const { db } = await import('@/core/database/db');
        
        const acc = await accountRepository.create({ name: 'حساب فحص النزاهة' });
        try {
          // Manually corrupt account balance in DB
          await db.accounts.update(acc.id, { currentBalance: 999999 });
          
          const report = await integrityService.verifyFinancialIntegrity();
          const issue = report.inconsistencies.find(i => i.entityId === acc.id && i.type === 'balance_mismatch');
          
          if (!issue) {
            throw new Error('فشل نظام النزاهة في رصد التلاعب المتعمد بالرصيد');
          }
        } finally {
          await accountRepository.delete(acc.id);
        }
      },
      results
    );

    // 20. SETTINGS-20: Recalculate Balances Safety & Correctness
    await this.runTest(
      'SETTINGS-20',
      'التحقق من سلامة وصحة عملية إعادة احتساب الأرصدة (Recalculate Correction)',
      async () => {
        const { integrityService } = await import('@/core/services/integrity.service');
        const { db } = await import('@/core/database/db');
        
        const acc = await accountRepository.create({ name: 'حساب اختبار الإصلاح' });
        try {
          // Add a real transaction
          await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 1250.50,
            date: '2026-01-01'
          });
          
          // Corrupt balance
          await db.accounts.update(acc.id, { currentBalance: 0, totalDebit: 0 });
          
          // Repair
          await integrityService.repairFinancialIntegrity();
          
          const repaired = await accountRepository.getById(acc.id);
          if (repaired?.currentBalance !== 1250.50) {
            throw new Error(`فشل إصلاح الرصيد. القيمة الحالية: ${repaired?.currentBalance}`);
          }
          
          const report = await integrityService.verifyFinancialIntegrity();
          if (!report.valid && report.inconsistencies.some(i => i.entityId === acc.id)) {
            throw new Error('لا يزال هناك تعارض في البيانات بعد عملية الإصلاح');
          }
        } finally {
          await accountRepository.delete(acc.id);
        }
      },
      results
    );

    // 21. SETTINGS-21: Invoice Number Atomic Increment
    await this.runTest(
      'SETTINGS-21',
      'التحقق من ذرية زيادة رقم الفاتورة ومنع التكرار في العمليات المتتالية',
      async () => {
        const { useTransactionStore } = await import('@/shared/stores/transactionStore');
        
        await settingsRepository.updateSettings({
          invoiceNumberingFormat: 'sequential',
          nextInvoiceNumber: 1000,
          invoicePrefix: 'ATOMIC-',
        });
        
        const acc = await accountRepository.create({ name: 'حساب اختبار الذرية' });
        try {
          // Concurrent-like additions (Sequential but rapid)
          const p1 = useTransactionStore.getState().addTransaction({
            accountId: acc.id, type: 'debit', amount: 10, date: '2026-01-01'
          });
          const p2 = useTransactionStore.getState().addTransaction({
            accountId: acc.id, type: 'debit', amount: 20, date: '2026-01-01'
          });
          
          const [t1, t2] = await Promise.all([p1, p2]);
          
          if (t1.receiptNumber === t2.receiptNumber) {
            throw new Error(`حدث تكرار في رقم الفاتورة: ${t1.receiptNumber}`);
          }
          
          const numbers = [t1.receiptNumber, t2.receiptNumber].sort();
          if (numbers[0] !== 'ATOMIC-1000' || numbers[1] !== 'ATOMIC-1001') {
            throw new Error(`الأرقام المولدة غير متسلسلة بشكل صحيح: ${numbers.join(', ')}`);
          }
        } finally {
          await accountRepository.delete(acc.id);
        }
      },
      results
    );
    
    // 22. SETTINGS-22: Notification Settings Persistence
    await this.runTest(
      'SETTINGS-22',
      'التحقق من حفظ واستمرار تفضيلات التنبيهات (Notification Persistence)',
      async () => {
        await settingsRepository.updateSettings({
          enableWebPushNotifications: true,
          enableSoundAlerts: false
        });
        
        const s1 = await settingsRepository.getSettings();
        if (s1.enableWebPushNotifications !== true || s1.enableSoundAlerts !== false) {
          throw new Error('فشل حفظ إعدادات التنبيهات');
        }
        
        await settingsRepository.updateSettings({ enableSoundAlerts: true });
        const s2 = await settingsRepository.getSettings();
        if (s2.enableWebPushNotifications !== true || s2.enableSoundAlerts !== true) {
          throw new Error('تحديث إعداد واحد أدى لفقدان إعداد آخر (Partial Update Failure)');
        }
      },
      results
    );

    // 23. SETTINGS-23: Backup Validation Logic
    await this.runTest(
      'SETTINGS-23',
      'التحقق من نظام تدقيق صحة ملف النسخة الاحتياطية (Backup Validation)',
      async () => {
        const { backupService } = await import('@/core/services/backup.service');
        
        // 1. Invalid Structure
        const v1 = await backupService.validateBackupPayload({ foo: 'bar' });
        if (v1.isValid) throw new Error('فشل كشف هيكل النسخة غير الصالح');
        
        // 2. Corrupt Transaction
        const validPayload = await backupService.generateBackupPayload();
        const corruptPayload = JSON.parse(JSON.stringify(validPayload));
        corruptPayload.transactions[0].amount = -500; // Invalid amount
        
        const v2 = await backupService.validateBackupPayload(corruptPayload);
        if (v2.isValid) throw new Error('فشل كشف مبلغ معاملة غير صالح في النسخة');
        
        // 3. Integrity Hash Mismatch
        const hashPayload = JSON.parse(JSON.stringify(validPayload));
        hashPayload.metadata.integrityHash = 'wrong_hash';
        const v3 = await backupService.validateBackupPayload(hashPayload);
        if (v3.isValid) throw new Error('فشل كشف تعارض بصمة النزاهة (Integrity Hash Mismatch)');
      },
      results
    );

    const durationMs = Date.now() - startTime;
    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      passedCount,
      failedCount,
      totalCount: results.length,
      durationMs,
      results,
    };
  }

  private static async runTest(
    id: string,
    description: string,
    fn: () => Promise<void>,
    results: SettingsTestResult[]
  ) {
    const start = Date.now();
    try {
      await fn();
      results.push({
        id,
        description,
        passed: true,
        durationMs: Date.now() - start,
      });
    } catch (err: any) {
      results.push({
        id,
        description,
        passed: false,
        error: err?.message || String(err),
        durationMs: Date.now() - start,
      });
    }
  }
}
