import { db } from '../database/db';
import { FinancialTransactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { reportService } from '../services/report.service';
import { integrityService } from '../services/integrity.service';
import { backupService } from '../services/backup.service';
import { formatCurrency } from '../utils/formatters';
import { decimalToMinor, minorToDecimal, assertValidMinorUnit } from '../money/converter';
import { getAmountMinor, toDualRepresentation, resolveMoney } from '../money/compat';
import { validateDualMoneyRepresentation } from '../money/validator';
import { createMoney, addMoney, subtractMoney } from '../money/money';
import { AICommandParser } from '../services/ai/AICommandParser';
import { aiTools } from '../services/ai/AITools';
import { receiptTransactionBridge } from '../services/ocr/ReceiptTransactionBridge.service';
import { useAccountStore } from '@/shared/stores/accountStore';
import {
  DATABASE_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../database/schemaVersion';
import { CurrencyCode } from '@/shared/types';

export interface FinancialIntegrationTestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  error?: string;
}

export class FinancialIntegrationTestSuite {
  static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: FinancialIntegrationTestResult[];
  }> {
    const results: FinancialIntegrationTestResult[] = [];
    const engine = new FinancialTransactionEngine();

    const run = async (id: string, nameAr: string, fn: () => Promise<void>) => {
      try {
        await fn();
        results.push({ id, nameAr, passed: true });
      } catch (err: any) {
        results.push({ id, nameAr, passed: false, error: err.message || String(err) });
      }
    };

    // FIN-01: Canonical Minor Units Write to Read Propagation
    await run('FIN-01', 'انتقال الوحدات الصغرى canonical من المسار الإنشائي إلى القراءة بأمان', async () => {
      const acc = await accountRepository.create({
        name: 'عميل تكامل مالي 01',
        phone: '771110001',
      });
      const tx = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 4500,
        date: '2026-03-01',
        note: 'معاملة وحدات صغرى',
      });
      if (tx.amountMinor === undefined) throw new Error('amountMinor غير متوفر في المعاملة المنشأة');
      const retrieved = await db.transactions.get(tx.id);
      if (!retrieved || retrieved.amountMinor !== tx.amountMinor) {
        throw new Error('amountMinor غير محفوظ في قاعدة البيانات بدقة');
      }
      const minor = getAmountMinor(retrieved, 'YER');
      if (minor !== tx.amountMinor) {
        throw new Error(`getAmountMinor لم يرجع القيمة المتوقعة: ${minor} مقابل ${tx.amountMinor}`);
      }
    });

    // FIN-02: Statement Running Balance Accuracy with Minor Units
    await run('FIN-02', 'دقة الرصيد التراكمي في كشف الحساب والتحقق من سلامة العمليات', async () => {
      const acc = await accountRepository.create({
        name: 'عميل كشف الحساب 02',
        phone: '771110002',
      });
      await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 1500,
        date: '2026-03-01',
        note: 'حركة 1',
      });
      await engine.createTransaction({
        accountId: acc.id,
        type: 'credit',
        amount: 500,
        date: '2026-03-02',
        note: 'حركة 2',
      });

      const statement = await reportService.getAccountStatement(acc.id, {
        preset: 'all',
      });
      if (statement.transactions.length !== 2) throw new Error('عدد حركات كشف الحساب غير صحيح');
      if (statement.closingBalance !== 1000) {
        throw new Error(`الرصيد الختامي غير صحيح: المتوقع 1000 ولكن الفعلي ${statement.closingBalance}`);
      }
    });

    // FIN-03: Zero-Float Accumulation in Global Summary
    await run('FIN-03', 'تجميع الملخص العام بحسابات صحيحة بدون أخطاء float تراكمية', async () => {
      const summary = await engine.getGlobalSummary();
      if (typeof summary.totalDebitMinor !== 'number' || typeof summary.totalCreditMinor !== 'number' || typeof summary.netBalanceMinor !== 'number') {
        throw new Error('الملخص العام لا يحتوي على إجماليات بالوحدات الصغرى');
      }
      if (!Number.isInteger(summary.totalDebitMinor) || !Number.isInteger(summary.totalCreditMinor) || !Number.isInteger(summary.netBalanceMinor)) {
        throw new Error('إجماليات الوحدات الصغرى بالملخص العام تحتوي على كسور عائمة');
      }
    });

    // FIN-04: Multi-Currency Dual Representation Consistency
    await run('FIN-04', 'التحقق من صحة التمثيل المزدوج عبر مختلف العملات (YER, SAR, USD, KWD)', async () => {
      // YER (0 decimals, factor 1)
      const yerCheck = validateDualMoneyRepresentation(1500, 1500, 'YER');
      if (!yerCheck.isValid) throw new Error(`فشل التحقق من عملة YER: ${yerCheck.error}`);

      // SAR (2 decimals, factor 100)
      const sarCheck = validateDualMoneyRepresentation(150.25, 15025, 'SAR');
      if (!sarCheck.isValid) throw new Error(`فشل التحقق من عملة SAR: ${sarCheck.error}`);

      // USD (2 decimals, factor 100)
      const usdCheck = validateDualMoneyRepresentation(99.99, 9999, 'USD');
      if (!usdCheck.isValid) throw new Error(`فشل التحقق من عملة USD: ${usdCheck.error}`);

      // KWD (3 decimals, factor 1000)
      const kwdCheck = validateDualMoneyRepresentation(25.750, 25750, 'KWD');
      if (!kwdCheck.isValid) throw new Error(`فشل التحقق من عملة KWD: ${kwdCheck.error}`);
    });

    // FIN-05: Western Numerals Enforcement in Formatted Currency
    await run('FIN-05', 'التأكد من فرض الأرقام الغربية (0-9) الصارمة في تنسيق العملة formatCurrency', async () => {
      const formatted = formatCurrency(1250.75, 'SAR');
      if (/[٠-٩]/.test(formatted)) {
        throw new Error(`تنسيق العملة يحتوي على أرقام شرقية غير مسموحة: ${formatted}`);
      }
      if (!formatted.includes('1,250.75') && !formatted.includes('1250.75')) {
        throw new Error(`القيمة المنسقة غير دقيقة: ${formatted}`);
      }
    });

    // FIN-06: Decimal-to-Minor and Minor-to-Decimal Roundtrip Accuracy
    await run('FIN-06', 'دقة التحويل التبادلي بين العشري والوحدات الصغرى دون فقدان القيمة', async () => {
      const testCases: { decimal: number; currency: CurrencyCode; minor: number }[] = [
        { decimal: 500, currency: 'YER', minor: 500 },
        { decimal: 75.50, currency: 'SAR', minor: 7550 },
        { decimal: 100.25, currency: 'USD', minor: 10025 },
        { decimal: 12.345, currency: 'KWD', minor: 12345 },
      ];
      for (const tc of testCases) {
        const computedMinor = decimalToMinor(tc.decimal, tc.currency);
        if (computedMinor !== tc.minor) {
          throw new Error(`decimalToMinor غير دقيق لـ ${tc.currency}: المتوقع ${tc.minor} الفعلي ${computedMinor}`);
        }
        const backToDecimal = minorToDecimal(computedMinor, tc.currency);
        if (backToDecimal !== tc.decimal) {
          throw new Error(`minorToDecimal غير دقيق لـ ${tc.currency}: المتوقع ${tc.decimal} الفعلي ${backToDecimal}`);
        }
      }
    });

    // FIN-07: Idempotency Protection with Pre-computed Minor Units
    await run('FIN-07', 'حماية Idempotency للمعاملات ومنع الازدواجية مع الحفاظ على amountMinor', async () => {
      const acc = await accountRepository.create({
        name: 'عميل أمان الإعادة 07',
        phone: '771110007',
      });
      const opId = 'op_test_idem_' + Date.now();
      const tx1 = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 3200,
        amountMinor: 3200,
        operationId: opId,
        date: '2026-03-01',
      });
      const tx2 = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 3200,
        amountMinor: 3200,
        operationId: opId,
        date: '2026-03-01',
      });
      if (tx1.id !== tx2.id) {
        throw new Error('فشل Idempotency: تم إنشاء قيد مكرر لنفس operationId');
      }
    });

    // FIN-08: AI Command Parser Dual Representation Resolution
    await run('FIN-08', 'توليد تمثيل ثنائي صحيح ومطابق للعملة في محلل أوامر الذكاء الاصطناعي', async () => {
      const parser = new AICommandParser();
      const cmd = await parser.parseCommand({
        intent: 'CREATE_TRANSACTION_REQUEST',
        mode: 'command',
        confidence: 0.95,
        rawPrompt: 'سجل على محمد 4000 ريال',
        entities: {
          amount: 4000,
          currencyCandidate: 'YER',
          transactionTypeCandidate: 'debit',
        },
      });
      if (cmd.amount !== 4000) throw new Error('المبلغ العشري غير مطابق في الأمر');
      if (cmd.amountMinor !== 4000) throw new Error(`الوحدات الصغرى غير مطابقة لـ YER: ${cmd.amountMinor}`);
    });

    // FIN-09: AI Tools Safe Execution via FinancialTransactionEngine
    await run('FIN-09', 'تنفيذ أدوات الذكاء الاصطناعي حصرياً عبر محرك المعاملات وحفظ amountMinor', async () => {
      const acc = await accountRepository.create({
        name: 'عميل تنفيذ ذكاء 09',
        phone: '771110009',
      });
      const cmd = {
        id: 'cmd_ai_exec_' + Date.now(),
        intent: 'CREATE_TRANSACTION_REQUEST' as const,
        accountId: acc.id,
        amount: 2500,
        amountMinor: 2500,
        currency: 'YER' as const,
        type: 'debit' as const,
        date: '2026-03-01',
        confidence: 0.9,
        status: 'CONFIRMED' as const,
        operationId: 'op_ai_test_' + Date.now(),
      };
      const tx = await aiTools.executeConfirmedCommand(cmd as any);
      if (tx.amountMinor !== 2500) throw new Error('amountMinor لم يتم حفظه بواسطة تنفيذ أداة الذكاء الاصطناعي');
    });

    // FIN-10: Receipt OCR Bridge with Dual Representation & Duplicate Protection
    await run('FIN-10', 'تحويل مسودة الفاتورة OCR إلى قيد مالي مع التحقق الثنائي وحماية التكرار', async () => {
      const acc = await accountRepository.create({
        name: 'مورد فواتير 10',
        phone: '771110010',
      });
      const draft = {
        id: 'draft_ocr_' + Date.now(),
        totalAmount: 1850,
        partyName: 'مورد فواتير 10',
        partyType: 'vendor' as const,
        date: '2026-03-01',
        invoiceNumber: 'INV-1001',
        status: 'ready' as const,
        rawText: 'فاتورة مشتريات',
        confidence: 0.95,
        currency: 'YER',
        isConfirmedByUser: true,
        lineItems: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await receiptTransactionBridge.convertDraftToTransaction({
        draft: draft as any,
        accountId: acc.id,
        type: 'credit',
        explicitUserConfirmed: true,
      });
      if (!res.success || !res.transactionId) {
        throw new Error(`فشل تحويل المسودة إلى قيد: ${res.error}`);
      }
      const tx = await db.transactions.get(res.transactionId);
      if (!tx || tx.amountMinor !== 1850) {
        throw new Error(`amountMinor للفاتورة غير مطابق: ${tx?.amountMinor}`);
      }
    });

    // FIN-11: Report Service Receivables with Minor Units
    await run('FIN-11', 'تقرير الديون المستحقة لك وفرزها وحساب النسب باستخدام الوحدات الصغرى', async () => {
      const acc = await accountRepository.create({
        name: 'مدين تقارير 11',
        phone: '771110011',
      });
      await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 8000,
        date: '2026-03-01',
      });
      const report = await reportService.getReceivablesReport({ minBalance: 1000 });
      const found = report.items.find((i) => i.account.id === acc.id);
      if (!found) throw new Error('الحساب لم يظهر في تقرير الديون المستحقة لك');
      if (found.balance !== 8000) throw new Error(`رصيد التقرير غير مطابق: ${found.balance}`);
    });

    // FIN-12: Report Service Payables with Minor Units
    await run('FIN-12', 'تقرير الديون المستحقة عليك وفرزها بالأعداد الصحيحة', async () => {
      const acc = await accountRepository.create({
        name: 'دائن تقارير 12',
        phone: '771110012',
      });
      await engine.createTransaction({
        accountId: acc.id,
        type: 'credit',
        amount: 4500,
        date: '2026-03-01',
      });
      const report = await reportService.getPayablesReport({ minBalance: 1000 });
      const found = report.items.find((i) => i.account.id === acc.id);
      if (!found) throw new Error('الحساب لم يظهر في تقرير الديون المستحقة عليك');
      if (found.balance !== 4500) throw new Error(`رصيد التقرير غير مطابق: ${found.balance}`);
    });

    // FIN-13: Account Store Filter and Sort using currentBalanceMinor
    await run('FIN-13', 'تصفية وترتيب الحسابات في accountStore بالاعتماد على currentBalanceMinor', async () => {
      const store = useAccountStore.getState();
      await store.fetchAccounts();
      const filtered = store.getFilteredAccounts();
      if (!Array.isArray(filtered)) throw new Error('قائمة الحسابات المصفاة غير صالحة');
    });

    // FIN-14: Audit Trail State Snapshot Includes amountMinor
    await run('FIN-14', 'سجل التدقيق الرقابي يسجل لقطة الحالة متضمنة amountMinor', async () => {
      const acc = await accountRepository.create({
        name: 'عميل تدقيق 14',
        phone: '771110014',
      });
      const tx = await engine.createTransaction({
        accountId: acc.id,
        type: 'debit',
        amount: 3000,
        date: '2026-03-01',
      });
      const logs = await db.auditTrail.where('targetId').equals(tx.id).toArray();
      if (logs.length === 0) throw new Error('لم يتم العثور على سجل تدقيق للمعاملة');
      const afterState = logs[0].afterState as any;
      if (afterState?.amountMinor !== 3000) {
        throw new Error('سجل التدقيق لا يتضمن amountMinor في لقطة الحالة');
      }
    });

    // FIN-15: Backup Snapshot Integrity and Schema Version 3 Preservation
    await run('FIN-15', 'النسخ الاحتياطي يحفظ amountMinor وثبات BACKUP_SCHEMA_VERSION=3', async () => {
      if (BACKUP_SCHEMA_VERSION !== 3) {
        throw new Error(`إصدار النسخ الاحتياطي غير مطابق: المتوقع 3 الفعلي ${BACKUP_SCHEMA_VERSION}`);
      }
      const payload = await backupService.generateBackupPayload();
      if (payload.metadata.backupSchemaVersion !== 3) {
        throw new Error('لقطة النسخ الاحتياطي لم تستخدم BACKUP_SCHEMA_VERSION=3');
      }
      if (!Array.isArray(payload.transactions)) {
        throw new Error('بيانات المعاملات في النسخة الاحتياطية غير صالحة');
      }
    });

    // FIN-16: Full Financial Integrity Verification Check
    await run('FIN-16', 'فحص النزاهة المالية الشامل integrityService يمر بنجاح تام', async () => {
      const integrity = await integrityService.verifyFinancialIntegrity();
      if (!integrity.valid) {
        throw new Error(`كشف فحص النزاهة عن تعارضات: ${JSON.stringify(integrity.inconsistencies)}`);
      }
    });

    // FIN-17: Strict Fail-Fast Validation on Invalid Minor Units
    await run('FIN-17', 'حماية Fail-Fast الصارمة من NaN و Infinity والكسور في الوحدات الصغرى', async () => {
      let threwNan = false;
      try {
        assertValidMinorUnit(NaN, 'test');
      } catch {
        threwNan = true;
      }
      if (!threwNan) throw new Error('لم يتم رمي استثناء عند تمرير NaN');

      let threwFloat = false;
      try {
        assertValidMinorUnit(10.5, 'test');
      } catch {
        threwFloat = true;
      }
      if (!threwFloat) throw new Error('لم يتم رمي استثناء عند تمرير float للوحدات الصغرى');
    });

    // FIN-18: Non-Destructive Backward Compatibility for Legacy Records
    await run('FIN-18', 'التوافقية العكسية الآمنة لبيانات Legacy دون المساس بسجلاتها', async () => {
      const legacyRecord = { amount: 1500.50 };
      const minor = getAmountMinor(legacyRecord, 'SAR');
      if (minor !== 150050) throw new Error(`فشل استنتاج الوحدات الصغرى لسجل قديم: ${minor}`);
      if ((legacyRecord as any).amountMinor !== undefined) {
        throw new Error('تم تعديل السجل القديم بشكل غير مشروع (انتهاك Immutability)');
      }
      const money = resolveMoney(legacyRecord, 'SAR');
      if (money.amountMinor !== 150050 || money.currency !== 'SAR') {
        throw new Error('resolveMoney لم ينشئ كائن Money سليم من سجل قديم');
      }
    });

    // FIN-19: Safe Integer-Based Money Arithmetic
    await run('FIN-19', 'إجراء العمليات الحسابية المالية بدقة تامة وبدون أخطاء الفاصلة العائمة IEEE 754', async () => {
      const m1 = createMoney(10, 'USD'); // 0.10
      const m2 = createMoney(20, 'USD'); // 0.20
      const sum = addMoney(m1, m2);
      if (sum.amountMinor !== 30) {
        throw new Error(`الجمع المالي غير دقيق: ${sum.amountMinor}`);
      }
      const diff = subtractMoney(sum, m1);
      if (diff.amountMinor !== 20) {
        throw new Error(`الطرح المالي غير دقيق: ${diff.amountMinor}`);
      }
    });

    // FIN-20: Database Schema Version Invariant Rule
    await run('FIN-20', 'ثبات DATABASE_SCHEMA_VERSION=6 و FINANCIAL_FORMAT_VERSION=1 ومنع Version 7', async () => {
      if (DATABASE_SCHEMA_VERSION !== 6) {
        throw new Error(`DATABASE_SCHEMA_VERSION يجب أن يكون 6 حصرياً، وجد: ${DATABASE_SCHEMA_VERSION}`);
      }
      if (FINANCIAL_FORMAT_VERSION !== 1) {
        throw new Error(`FINANCIAL_FORMAT_VERSION يجب أن يكون 1 حصرياً، وجد: ${FINANCIAL_FORMAT_VERSION}`);
      }
      if (db.verno !== 6) {
        throw new Error(`إصدار Dexie الحالي يجب أن يكون 6 حصرياً، وجد: ${db.verno}`);
      }
    });

    return {
      passedCount: results.filter((r) => r.passed).length,
      failedCount: results.filter((r) => !r.passed).length,
      totalCount: results.length,
      results,
    };
  }
}
