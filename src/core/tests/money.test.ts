import {
  decimalToMinor,
  minorToDecimal,
  minorToDecimalString,
  isValidMinorUnit,
  assertValidMinorUnit,
  createMoney,
  moneyFromDecimal,
  moneyToDecimal,
  moneyToDecimalString,
  addMoney,
  subtractMoney,
  compareMoney,
  equalsMoney,
  isPositiveMoney,
  isNegativeMoney,
  isZeroMoney,
  getAmountMinor,
  resolveMoney,
  toDualRepresentation,
  CURRENCY_PRECISION_MAP,
  getCurrencyDecimals,
  getCurrencyFactor,
  FinancialEngineMoneyAdapter,
} from '../money';
import { db } from '../database/db';
import {
  DATABASE_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../database/schemaVersion';
import { formatCurrency } from '../utils/formatters';

export interface MoneyTestResultItem {
  id: string;
  name: string;
  nameAr: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface MoneyTestSuiteResult {
  totalCount: number;
  passedCount: number;
  failedCount: number;
  results: MoneyTestResultItem[];
}

export class MoneyTestSuite {
  static async runAllTests(): Promise<MoneyTestSuiteResult> {
    const results: MoneyTestResultItem[] = [];

    const runTest = async (
      id: string,
      name: string,
      nameAr: string,
      fn: () => Promise<void> | void
    ) => {
      const start = performance.now();
      try {
        await fn();
        results.push({
          id,
          name,
          nameAr,
          passed: true,
          durationMs: Math.round(performance.now() - start),
        });
      } catch (err: unknown) {
        const errorText = err instanceof Error ? err.message : String(err);
        results.push({
          id,
          name,
          nameAr,
          passed: false,
          durationMs: Math.round(performance.now() - start),
          error: errorText,
        });
      }
    };

    // 1. Decimal -> Minor Conversion
    await runTest('MONEY_01', 'Decimal to Minor Conversion', 'تحويل الأرقام العشرية إلى وحدات صغرى', () => {
      // 2 decimal currency
      const sarMinor = decimalToMinor(123.45, 'SAR');
      if (sarMinor !== 12345) throw new Error(`Expected 12345 for 123.45 SAR, got ${sarMinor}`);

      // IEEE-754 precision edge case: 1.14 * 100 in standard JS = 113.99999999999999
      const edgeMinor = decimalToMinor(1.14, 'SAR');
      if (edgeMinor !== 114) throw new Error(`Expected 114 for 1.14 SAR without float error, got ${edgeMinor}`);

      // 0 decimal currency (YER)
      const yerMinor = decimalToMinor(250, 'YER');
      if (yerMinor !== 250) throw new Error(`Expected 250 for 250 YER, got ${yerMinor}`);

      // 3 decimal currency (KWD)
      const kwdMinor = decimalToMinor(5.125, 'KWD');
      if (kwdMinor !== 5125) throw new Error(`Expected 5125 for 5.125 KWD, got ${kwdMinor}`);

      // Negative values
      const negMinor = decimalToMinor(-45.5, 'SAR');
      if (negMinor !== -4550) throw new Error(`Expected -4550 for -45.50 SAR, got ${negMinor}`);
    });

    // 2. Minor -> Decimal Conversion
    await runTest('MONEY_02', 'Minor to Decimal Conversion', 'تحويل الوحدات الصغرى إلى عشرية', () => {
      const decSar = minorToDecimal(12345, 'SAR');
      if (decSar !== 123.45) throw new Error(`Expected 123.45, got ${decSar}`);

      const strSar = minorToDecimalString(12345, 'SAR');
      if (strSar !== '123.45') throw new Error(`Expected "123.45", got "${strSar}"`);

      const decYer = minorToDecimal(5000, 'YER');
      if (decYer !== 5000) throw new Error(`Expected 5000, got ${decYer}`);

      const strKwd = minorToDecimalString(5125, 'KWD');
      if (strKwd !== '5.125') throw new Error(`Expected "5.125", got "${strKwd}"`);

      const negStr = minorToDecimalString(-4550, 'SAR');
      if (negStr !== '-45.50') throw new Error(`Expected "-45.50", got "${negStr}"`);
    });

    // 3. Integer Validation
    await runTest('MONEY_03', 'Integer Validation', 'التحقق من سلامة الأعداد الصحيحة', () => {
      if (!isValidMinorUnit(100)) throw new Error('100 should be a valid minor unit');
      if (!isValidMinorUnit(0)) throw new Error('0 should be a valid minor unit');
      if (!isValidMinorUnit(-500)) throw new Error('-500 should be a valid minor unit');
      if (isValidMinorUnit(12.34)) throw new Error('12.34 float must NOT be a valid minor unit');
      if (isValidMinorUnit('100')) throw new Error('String "100" must NOT be a valid minor unit');
      if (isValidMinorUnit(null)) throw new Error('Null must NOT be a valid minor unit');
    });

    // 4. Safe Integer Validation
    await runTest('MONEY_04', 'Safe Integer Validation', 'التحقق من حدود الأمان الرقمي', () => {
      const safe = Number.MAX_SAFE_INTEGER;
      if (!isValidMinorUnit(safe)) throw new Error('MAX_SAFE_INTEGER should be valid');

      let errorThrown = false;
      try {
        assertValidMinorUnit(Number.MAX_SAFE_INTEGER + 10);
      } catch {
        errorThrown = true;
      }
      if (!errorThrown) throw new Error('Unsafe integer exceeding MAX_SAFE_INTEGER must be rejected');
    });

    // 5. NaN Rejection
    await runTest('MONEY_05', 'NaN Rejection', 'رفض القيم غير المعرفة NaN', () => {
      if (isValidMinorUnit(NaN)) throw new Error('NaN must not be valid minor unit');

      let errorThrown = false;
      try {
        decimalToMinor(NaN, 'SAR');
      } catch {
        errorThrown = true;
      }
      if (!errorThrown) throw new Error('decimalToMinor must throw on NaN');
    });

    // 6. Infinity Rejection
    await runTest('MONEY_06', 'Infinity Rejection', 'رفض المالانهاية Infinity', () => {
      if (isValidMinorUnit(Infinity)) throw new Error('Infinity must not be valid');
      if (isValidMinorUnit(-Infinity)) throw new Error('-Infinity must not be valid');

      let errorThrown = false;
      try {
        decimalToMinor(Infinity, 'SAR');
      } catch {
        errorThrown = true;
      }
      if (!errorThrown) throw new Error('decimalToMinor must throw on Infinity');
    });

    // 7. Currency Precision Registry
    await runTest('MONEY_07', 'Currency Precision Registry', 'فحص دقة العملات المعتمدة', () => {
      if (getCurrencyDecimals('YER') !== 0) throw new Error('YER must have 0 decimals');
      if (getCurrencyFactor('YER') !== 1) throw new Error('YER factor must be 1');

      if (getCurrencyDecimals('SAR') !== 2) throw new Error('SAR must have 2 decimals');
      if (getCurrencyDecimals('USD') !== 2) throw new Error('USD must have 2 decimals');
      if (getCurrencyDecimals('AED') !== 2) throw new Error('AED must have 2 decimals');
      if (getCurrencyDecimals('EGP') !== 2) throw new Error('EGP must have 2 decimals');
      if (getCurrencyDecimals('QAR') !== 2) throw new Error('QAR must have 2 decimals');

      if (getCurrencyDecimals('KWD') !== 3) throw new Error('KWD must have 3 decimals');
      if (getCurrencyFactor('KWD') !== 1000) throw new Error('KWD factor must be 1000');
      if (getCurrencyDecimals('OMR') !== 3) throw new Error('OMR must have 3 decimals');
    });

    // 8. Money Addition
    await runTest('MONEY_08', 'Money Addition', 'الجمع المالي الدقيق', () => {
      const m1 = moneyFromDecimal('100.25', 'SAR');
      const m2 = moneyFromDecimal('50.50', 'SAR');
      const sum = addMoney(m1, m2);

      if (sum.amountMinor !== 15075) throw new Error(`Expected 15075 minor units, got ${sum.amountMinor}`);
      if (moneyToDecimal(sum) !== 150.75) throw new Error(`Expected 150.75 decimal, got ${moneyToDecimal(sum)}`);

      // Mismatched currency check
      const mUsd = moneyFromDecimal('10.00', 'USD');
      let mismatchCaught = false;
      try {
        addMoney(m1, mUsd);
      } catch {
        mismatchCaught = true;
      }
      if (!mismatchCaught) throw new Error('Adding different currencies must throw error');
    });

    // 9. Money Subtraction
    await runTest('MONEY_09', 'Money Subtraction', 'الطرح المالي الدقيق', () => {
      const m1 = moneyFromDecimal('100.25', 'SAR');
      const m2 = moneyFromDecimal('50.50', 'SAR');
      const diff = subtractMoney(m1, m2);

      if (diff.amountMinor !== 4975) throw new Error(`Expected 4975 minor units, got ${diff.amountMinor}`);
      if (moneyToDecimal(diff) !== 49.75) throw new Error(`Expected 49.75 decimal, got ${moneyToDecimal(diff)}`);
    });

    // 10. Money Comparison & Equality
    await runTest('MONEY_10', 'Money Comparison & Equality', 'المقارنة والمطابقة المالية', () => {
      const a = createMoney(10000, 'SAR');
      const b = createMoney(5000, 'SAR');
      const c = createMoney(10000, 'SAR');

      if (compareMoney(a, b) !== 1) throw new Error('a should be > b');
      if (compareMoney(b, a) !== -1) throw new Error('b should be < a');
      if (compareMoney(a, c) !== 0) throw new Error('a should be == c');

      if (!equalsMoney(a, c)) throw new Error('a should equal c');
      if (equalsMoney(a, b)) throw new Error('a should NOT equal b');

      if (!isPositiveMoney(a)) throw new Error('a is positive');
      if (!isNegativeMoney(createMoney(-10, 'SAR'))) throw new Error('-10 is negative');
      if (!isZeroMoney(createMoney(0, 'SAR'))) throw new Error('0 is zero money');
    });

    // 11. Legacy Record Compatibility
    await runTest('MONEY_11', 'Legacy Record Compatibility', 'التوافق مع السجلات القديمة بدون تعديل', () => {
      const legacyRecord = { amount: 125.50 };
      const minor = getAmountMinor(legacyRecord, 'SAR');

      if (minor !== 12550) throw new Error(`Expected 12550 for legacy 125.50 SAR, got ${minor}`);

      const money = resolveMoney(legacyRecord, 'SAR');
      if (money.amountMinor !== 12550 || money.currency !== 'SAR') {
        throw new Error('Failed to resolve legacy record to Money object');
      }
    });

    // 12. Precedence of amountMinor in Dual Representation
    await runTest('MONEY_12', 'amountMinor Precedence', 'أولوية قراءة الوحدات الصغرى عند وجودها', () => {
      const dualRecord = { amount: 125.50, amountMinor: 12550 };
      const minor = getAmountMinor(dualRecord, 'SAR');

      if (minor !== 12550) throw new Error(`Expected 12550 read directly from amountMinor, got ${minor}`);
    });

    // 13. Immutability: No Mutation of Legacy Records
    await runTest('MONEY_13', 'No Mutation of Legacy Records', 'عدم التعديل على سجلات البيانات القديمة', () => {
      const original = Object.freeze({
        id: 'trx_test_immutable',
        accountId: 'acc_1',
        type: 'debit' as const,
        amount: 88.50,
        date: '2026-09-05',
      });

      // Passing frozen object must not throw mutation error
      const minor = getAmountMinor(original, 'SAR');
      if (minor !== 8850) throw new Error(`Expected 8850, got ${minor}`);

      if ('amountMinor' in original) {
        throw new Error('Legacy record was mutated! Must remain untouched.');
      }
    });

    // 14. Database Safety: Schema Versions Untouched
    await runTest('MONEY_14', 'Database & Schema Safety', 'الحفاظ الصارم على إصدارات المخطط وقاعدة البيانات', () => {
      // 1. Dexie versions inspection
      const version = (db as any).verno;
      if (version !== 6) {
        throw new Error(`Dexie version must be exactly 6, found ${version}`);
      }

      // 2. Constants checks
      if (DATABASE_SCHEMA_VERSION !== 6) {
        throw new Error(`DATABASE_SCHEMA_VERSION must remain 6, found ${DATABASE_SCHEMA_VERSION}`);
      }
      if (BACKUP_SCHEMA_VERSION !== 3) {
        throw new Error(`BACKUP_SCHEMA_VERSION must remain 3, found ${BACKUP_SCHEMA_VERSION}`);
      }
      if (FINANCIAL_FORMAT_VERSION !== 1) {
        throw new Error(`FINANCIAL_FORMAT_VERSION must remain 1, found ${FINANCIAL_FORMAT_VERSION}`);
      }
    });

    // 15. Formatter Dual Compatibility
    await runTest('MONEY_15', 'Central Formatter Dual Support', 'دعم المنسق المالي لكلا التمثيلين مع الأرقام القياسية', () => {
      // Legacy number formatting
      const formattedFromNumber = formatCurrency(125.5, 'SAR');
      if (!formattedFromNumber.includes('125.50') || !formattedFromNumber.includes('ر.س')) {
        throw new Error(`Unexpected format from number: ${formattedFromNumber}`);
      }

      // Money object formatting
      const money = createMoney(12550, 'SAR');
      const formattedFromMoney = formatCurrency(money);
      if (!formattedFromMoney.includes('125.50') || !formattedFromMoney.includes('ر.س')) {
        throw new Error(`Unexpected format from Money: ${formattedFromMoney}`);
      }

      // Zero decimal currency (YER)
      const yerMoney = createMoney(1000, 'YER');
      const formattedYer = formatCurrency(yerMoney);
      if (!formattedYer.includes('1,000') || !formattedYer.includes('ر.ي')) {
        throw new Error(`Unexpected format for YER: ${formattedYer}`);
      }
    });

    // 16. Financial Engine Adapter Metrics Computation
    await runTest('MONEY_16', 'Financial Engine Adapter Metrics', 'حساب المؤشرات الدقيقة عبر المحول المالي', () => {
      const mockTrx = [
        { id: '1', accountId: 'acc_1', type: 'debit' as const, amount: 100.5, date: '2026-09-01', createdAt: '', updatedAt: '' },
        { id: '2', accountId: 'acc_1', type: 'credit' as const, amount: 50.25, date: '2026-09-02', createdAt: '', updatedAt: '' },
      ];

      const metrics = FinancialEngineMoneyAdapter.computeMetricsMinor(mockTrx, 'SAR');
      if (metrics.totalDebitMinor !== 10050) throw new Error(`Expected debit minor 10050, got ${metrics.totalDebitMinor}`);
      if (metrics.totalCreditMinor !== 5025) throw new Error(`Expected credit minor 5025, got ${metrics.totalCreditMinor}`);
      if (metrics.currentBalanceMinor !== 5025) throw new Error(`Expected balance minor 5025, got ${metrics.currentBalanceMinor}`);

      const dual = FinancialEngineMoneyAdapter.computeDualMetrics(mockTrx, 'SAR');
      if (dual.currentBalance !== 50.25) throw new Error(`Expected balance decimal 50.25, got ${dual.currentBalance}`);
    });

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      totalCount: results.length,
      passedCount,
      failedCount,
      results,
    };
  }
}
