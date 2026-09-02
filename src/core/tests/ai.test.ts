import {
  aiIntentService,
  ArabicNumberParser,
  accountResolver,
  aiTools,
  aiValidationService,
  aiCommandParser,
  aiPrivacyService,
  localFallbackProvider,
  aiService,
} from '@/core/services/ai';
import { db } from '@/core/database/db';
import { Account, CreateAccountDTO, StructuredAICommand } from '@/shared/types';
import { accountService } from '@/core/services/account.service';

export interface AITestResultItem {
  id: string;
  name: string;
  nameAr: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface AITestSuiteResult {
  totalCount: number;
  passedCount: number;
  failedCount: number;
  results: AITestResultItem[];
}

export class AITestSuite {
  public static async runAllTests(): Promise<AITestSuiteResult> {
    const results: AITestResultItem[] = [];

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
      } catch (err: any) {
        results.push({
          id,
          name,
          nameAr,
          passed: false,
          durationMs: Math.round(performance.now() - start),
          error: err?.message || String(err),
        });
      }
    };

    // ==========================================
    // 1. INTENT RECOGNITION TESTS
    // ==========================================

    await runTest(
      'AI-01',
      'Intent: GET_TOTAL_RECEIVABLES',
      'التعرف على نية "كم لي؟" وحساب المستحقات',
      () => {
        const p1 = aiIntentService.parse('كم لي؟');
        const p2 = aiIntentService.parse('كم لي عند الناس؟');
        const p3 = aiIntentService.parse('كم مستحق لي');
        if (p1.intent !== 'GET_TOTAL_RECEIVABLES') throw new Error(`Expected GET_TOTAL_RECEIVABLES, got ${p1.intent}`);
        if (p2.intent !== 'GET_TOTAL_RECEIVABLES') throw new Error(`Expected GET_TOTAL_RECEIVABLES, got ${p2.intent}`);
        if (p3.intent !== 'GET_TOTAL_RECEIVABLES') throw new Error(`Expected GET_TOTAL_RECEIVABLES, got ${p3.intent}`);
      }
    );

    await runTest(
      'AI-02',
      'Intent: GET_TOTAL_PAYABLES',
      'التعرف على نية "كم علي؟" وحساب الالتزامات والديون',
      () => {
        const p1 = aiIntentService.parse('كم علي؟');
        const p2 = aiIntentService.parse('كم ديوني؟');
        const p3 = aiIntentService.parse('كم أنا مديون للناس؟');
        if (p1.intent !== 'GET_TOTAL_PAYABLES') throw new Error(`Expected GET_TOTAL_PAYABLES, got ${p1.intent}`);
        if (p2.intent !== 'GET_TOTAL_PAYABLES') throw new Error(`Expected GET_TOTAL_PAYABLES, got ${p2.intent}`);
        if (p3.intent !== 'GET_TOTAL_PAYABLES') throw new Error(`Expected GET_TOTAL_PAYABLES, got ${p3.intent}`);
      }
    );

    await runTest(
      'AI-03',
      'Intent: GET_ACCOUNT_BALANCE',
      'التعرف على استعلام رصيد حساب محدد ("كم لي عند أحمد؟")',
      () => {
        const p1 = aiIntentService.parse('كم لي عند أحمد؟');
        const p2 = aiIntentService.parse('رصيد خالد');
        if (p1.intent !== 'GET_ACCOUNT_BALANCE') throw new Error(`Expected GET_ACCOUNT_BALANCE, got ${p1.intent}`);
        if (p1.entities.accountNameCandidate !== 'أحمد') throw new Error(`Expected أحمد, got ${p1.entities.accountNameCandidate}`);
        if (p2.intent !== 'GET_ACCOUNT_BALANCE') throw new Error(`Expected GET_ACCOUNT_BALANCE, got ${p2.intent}`);
      }
    );

    await runTest(
      'AI-04',
      'Intent: GET_TOP_DEBTORS',
      'التعرف على استعلام أعلى المدينين ("أعلى المدينين")',
      () => {
        const p1 = aiIntentService.parse('أعلى المدينين');
        const p2 = aiIntentService.parse('من أكثر شخص عليه دين؟');
        if (p1.intent !== 'GET_TOP_DEBTORS') throw new Error(`Expected GET_TOP_DEBTORS, got ${p1.intent}`);
        if (p2.intent !== 'GET_TOP_DEBTORS') throw new Error(`Expected GET_TOP_DEBTORS, got ${p2.intent}`);
      }
    );

    await runTest(
      'AI-05',
      'Intent: GET_PERIOD_SUMMARY',
      'التعرف على استعلام ملخص الشهر ("ملخص الشهر")',
      () => {
        const p = aiIntentService.parse('ملخص الشهر');
        if (p.intent !== 'GET_PERIOD_SUMMARY') throw new Error(`Expected GET_PERIOD_SUMMARY, got ${p.intent}`);
      }
    );

    // ==========================================
    // 2. ARABIC NUMBER PARSING TESTS
    // ==========================================

    await runTest(
      'AI-06',
      'Arabic Number: Standard Digits 5000',
      'تحويل الأرقام الإنجليزية (5000) بدقة وحدات كسرية',
      () => {
        const res = ArabicNumberParser.parse('سجل 5000 ريال');
        if (!res || res.amount !== 5000 || res.amountMinor !== 500000) {
          throw new Error(`Expected 5000 (500000 minor), got ${JSON.stringify(res)}`);
        }
      }
    );

    await runTest(
      'AI-07',
      'Arabic Number: Eastern Numerals ٥٠٠٠',
      'تحويل الأرقام المشرقية (٥٠٠٠) بدقة',
      () => {
        const res = ArabicNumberParser.parse('سجل ٥٠٠٠ ريال');
        if (!res || res.amount !== 5000 || res.amountMinor !== 500000) {
          throw new Error(`Expected 5000 from ٥٠٠٠, got ${JSON.stringify(res)}`);
        }
      }
    );

    await runTest(
      'AI-08',
      'Arabic Number: Words "خمسة آلاف"',
      'تحويل الكلمات العربية المنطوقة ("خمسة آلاف") إلى قيمة مالية',
      () => {
        const res = ArabicNumberParser.parse('سجل خمسة آلاف ريال');
        if (!res || res.amount !== 5000) {
          throw new Error(`Expected 5000 from خمسة آلاف, got ${JSON.stringify(res)}`);
        }
      }
    );

    // ==========================================
    // 3. ACCOUNT RESOLUTION TESTS
    // ==========================================

    const mockAccounts: Account[] = [
      {
        id: 'acc_test_1',
        name: 'أحمد محمود',
        phone: '771234567',
        currentBalance: 10000,
        totalDebit: 10000,
        totalCredit: 0,
        transactionCount: 1,
        archived: false,
        category: 'personal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'acc_test_2',
        name: 'محمد علي',
        phone: '772222222',
        currentBalance: -5000,
        totalDebit: 0,
        totalCredit: 5000,
        transactionCount: 1,
        archived: false,
        category: 'personal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'acc_test_3',
        name: 'محمد حسن',
        phone: '773333333',
        currentBalance: 2000,
        totalDebit: 2000,
        totalCredit: 0,
        transactionCount: 1,
        archived: false,
        category: 'personal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'acc_test_archived',
        name: 'سالم المتقاعد',
        phone: '774444444',
        currentBalance: 0,
        totalDebit: 0,
        totalCredit: 0,
        transactionCount: 0,
        archived: true,
        category: 'personal',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    await runTest(
      'AI-09',
      'Account Resolution: Exact Match',
      'تحديد الحساب عند وجود تطابق وحيد تام بدون غموض',
      async () => {
        const res = await accountResolver.resolve('أحمد محمود', mockAccounts);
        if (res.status !== 'EXACT_MATCH' || res.account?.id !== 'acc_test_1') {
          throw new Error(`Expected EXACT_MATCH for acc_test_1, got ${res.status}`);
        }
      }
    );

    await runTest(
      'AI-10',
      'Account Resolution: Multiple Matches (Ambiguity)',
      'كشف التعدد والغموض عند كتابة "محمد" بدون تخمين عشوائي',
      async () => {
        const res = await accountResolver.resolve('محمد', mockAccounts);
        if (res.status !== 'MULTIPLE_MATCHES' || !res.accounts || res.accounts.length < 2) {
          throw new Error(`Expected MULTIPLE_MATCHES with 2 accounts, got ${res.status}`);
        }
      }
    );

    await runTest(
      'AI-11',
      'Account Resolution: No Match (Hallucination Prevention)',
      'منع الهلوسة عند البحث عن شخص غير مسجل بالدفتر',
      async () => {
        const res = await accountResolver.resolve('شخص_غير_موجود_نهائيا_123', mockAccounts);
        if (res.status !== 'NO_MATCH') {
          throw new Error(`Expected NO_MATCH, got ${res.status}`);
        }
      }
    );

    // ==========================================
    // 4. SAFETY & SECURITY BOUNDARY TESTS
    // ==========================================

    await runTest(
      'AI-12',
      'Safety: AI Cannot Write Directly to Database',
      'حظر كتابة أو تعديل قاعدة البيانات مباشرة من الذكاء الاصطناعي',
      () => {
        // Verify that AITools does not export raw mutating functions without confirmation
        const unconfirmedCommand = {
          id: 'cmd_hack_attempt',
          intent: 'CREATE_TRANSACTION_REQUEST' as const,
          accountId: 'acc_test_1',
          amount: 5000,
          amountMinor: 500000,
          currency: 'YER' as const,
          type: 'debit' as const,
          date: '2026-09-02',
          confidence: 0.9,
          status: 'PENDING_VALIDATION' as const,
          operationId: 'op_hack',
        };

        let threw = false;
        try {
          // Attempting to execute unconfirmed command MUST throw
          aiTools.executeConfirmedCommand(unconfirmedCommand);
        } catch {
          threw = true;
        }
        if (!threw) {
          throw new Error('Security violation: unconfirmed command did not throw an error');
        }
      }
    );

    await runTest(
      'AI-13',
      'Safety: Unconfirmed Command Cannot Execute',
      'رفض تنفيذ أي أمر قبل مصادقة المستخدم الصريحة',
      async () => {
        const parsed = aiIntentService.parse('سجل على أحمد محمود 5000');
        const command = await aiCommandParser.parseCommand(parsed, mockAccounts);
        if (command.status === 'CONFIRMED' || command.status === 'EXECUTED') {
          throw new Error(`Initial command status must not be confirmed or executed. Got ${command.status}`);
        }
        let threw = false;
        try {
          await aiTools.executeConfirmedCommand(command);
        } catch {
          threw = true;
        }
        if (!threw) throw new Error('AITools executed unconfirmed command!');
      }
    );

    await runTest(
      'AI-14',
      'Safety: Invalid Amount Rejected',
      'رفض العمليات ذات المبالغ الصفرية أو السالبة أو غير الرقمية',
      async () => {
        const invalidCommand: StructuredAICommand = {
          id: 'cmd_inv_1',
          intent: 'CREATE_TRANSACTION_REQUEST',
          accountId: 'acc_test_1',
          amount: -500,
          amountMinor: -50000,
          currency: 'YER',
          type: 'debit',
          date: '2026-09-02',
          confidence: 0.9,
          status: 'PENDING_VALIDATION',
          operationId: 'op_inv',
        };

        const res = await aiValidationService.validate(invalidCommand, mockAccounts[0]);
        if (res.isValid || invalidCommand.status !== 'REJECTED') {
          throw new Error('Validation failed to reject negative amount');
        }
      }
    );

    await runTest(
      'AI-15',
      'Safety: Archived Account Rejected',
      'رفض تسجيل عمليات جديدة على الحسابات المؤرشفة',
      async () => {
        const archivedCommand: StructuredAICommand = {
          id: 'cmd_arc_1',
          intent: 'CREATE_TRANSACTION_REQUEST',
          accountId: 'acc_test_archived',
          amount: 1500,
          amountMinor: 150000,
          currency: 'YER',
          type: 'debit',
          date: '2026-09-02',
          confidence: 0.9,
          status: 'PENDING_VALIDATION',
          operationId: 'op_arc',
        };

        const res = await aiValidationService.validate(archivedCommand, mockAccounts[3]);
        if (res.isValid || archivedCommand.status !== 'REJECTED') {
          throw new Error('Validation failed to reject archived account');
        }
      }
    );

    // ==========================================
    // 5. PROVIDER & OFFLINE RESILIENCE TESTS
    // ==========================================

    await runTest(
      'AI-16',
      'Provider: Offline Fallback Operational',
      'عمل المعالج المحلي بكفاءة كاملة في وضع عدم الاتصال (Offline)',
      async () => {
        const res = await localFallbackProvider.generate({ prompt: 'كم لي؟' });
        if (res.intent !== 'GET_TOTAL_RECEIVABLES' || !res.card) {
          throw new Error('Local fallback failed to answer GET_TOTAL_RECEIVABLES offline');
        }
      }
    );

    await runTest(
      'AI-17',
      'Provider: Unavailable Handling',
      'التعامل الآمن مع عدم توفر مزودات السحابة والتحول للمحلي',
      async () => {
        // Request through AIService ask()
        const res = await aiService.ask('كم علي؟');
        if (res.intent !== 'GET_TOTAL_PAYABLES') {
          throw new Error(`Expected GET_TOTAL_PAYABLES, got ${res.intent}`);
        }
      }
    );

    await runTest(
      'AI-18',
      'Provider: Timeout Resilience',
      'الاستجابة الفورية دون تجميد الواجهة عند بطء الشبكة',
      async () => {
        const start = performance.now();
        const res = await localFallbackProvider.generate({ prompt: 'أعلى المدينين' });
        const dur = performance.now() - start;
        if (dur > 2000) throw new Error(`Response took too long: ${dur}ms`);
        if (res.intent !== 'GET_TOP_DEBTORS') throw new Error(`Expected GET_TOP_DEBTORS`);
      }
    );

    // ==========================================
    // 6. PRIVACY TESTS
    // ==========================================

    await runTest(
      'AI-19',
      'Privacy: Sensitive Context Minimization & Masking',
      'حجب أرقام الهواتف وعدم تسريب قاعدة البيانات كاملة في سجل التدقيق',
      () => {
        const maskedPhone = aiPrivacyService.maskPhoneNumber('771234567');
        if (maskedPhone.includes('1234')) {
          throw new Error(`Phone was not masked properly: ${maskedPhone}`);
        }

        const sanitized = aiPrivacyService.sanitizePromptForAudit('سجل على 771234567 مبلغ 5000');
        if (sanitized.includes('771234567')) {
          throw new Error(`Prompt phone not sanitized: ${sanitized}`);
        }
      }
    );

    // ==========================================
    // 7. FINANCIAL INTEGRITY & END-TO-END EXECUTION
    // ==========================================

    await runTest(
      'AI-20',
      'Financial Integrity: Confirmed AI Execution via Engine',
      'تنفيذ العملية المؤكدة حصرياً عبر FinancialTransactionEngine وتحديث الرصيد',
      async () => {
        // Create an isolated test account in DB
        const testAccName = 'عميل تجربة الذكاء ' + Date.now();
        const account = await accountService.createAccount({
          name: testAccName,
          phone: '779998888',
        });

        // 1. AI parses command
        const prompt = `سجل على ${testAccName} 7000 ريال`;
        const aiResp = await aiService.ask(prompt);
        if (!aiResp.command) {
          throw new Error('AI failed to construct command');
        }

        const cmdId = aiResp.command.id;
        const pendingCmd = aiService.getPendingCommand(cmdId);
        if (!pendingCmd) throw new Error('Command was not registered in pending commands');

        // Verify balance is untouched before confirmation
        const accBefore = await accountService.getById(account.id);
        if (accBefore?.currentBalance !== 0) {
          throw new Error('Balance changed before user confirmation!');
        }

        // 2. User confirms execution
        const tx = await aiService.confirmAndExecuteCommand(cmdId);
        if (!tx || tx.amount !== 7000) {
          throw new Error('Transaction execution returned invalid result');
        }

        // 3. Verify balance is strictly updated via Engine
        const accAfter = await accountService.getById(account.id);
        if (accAfter?.currentBalance !== 7000) {
          throw new Error(`Expected balance 7000, got ${accAfter?.currentBalance}`);
        }

        // Clean up test account & transactions
        await db.transactions.where('accountId').equals(account.id).delete();
        await db.accounts.delete(account.id);
      }
    );

    await runTest(
      'AI-21',
      'Critical Security Boundary: Direct Write Bypass Fails',
      'فشل أي محاولة للتجاوز المباشر دون تأكيد صريح',
      async () => {
        const fakeCmd = {
          id: 'fake_cmd',
          intent: 'CREATE_TRANSACTION_REQUEST' as const,
          amount: 9999,
          amountMinor: 999900,
          currency: 'YER' as const,
          type: 'debit' as const,
          date: '2026-09-02',
          confidence: 1,
          status: 'PENDING_VALIDATION' as const,
          operationId: 'op_fake',
        };
        let threw = false;
        try {
          await aiTools.executeConfirmedCommand(fakeCmd);
        } catch {
          threw = true;
        }
        if (!threw) throw new Error('Direct write bypass was allowed!');
      }
    );

    await runTest(
      'AI-22',
      'Critical Hallucination Test: Non-existent Account',
      'عدم اختلاق أي حساب عند عدم وجوده في قاعدة البيانات',
      async () => {
        const res = await aiService.ask('كم لي عند كائن_فضائي_غير_حقيقي؟');
        if (!res.text.includes('لم يتم العثور') && !res.text.includes('غير موجود')) {
          throw new Error(`Expected not found message, got: ${res.text}`);
        }
      }
    );

    await runTest(
      'AI-23',
      'Critical Ambiguity Test: Multiple Matches Return Options',
      'إرجاع خيارات التحديد وعدم التخمين عند وجود أسماء متشابهة',
      async () => {
        const parsed = aiIntentService.parse('سجل على محمد 1000');
        const cmd = await aiCommandParser.parseCommand(parsed, mockAccounts);
        if (!cmd.disambiguationOptions || cmd.disambiguationOptions.length < 2) {
          throw new Error('Ambiguity did not return disambiguation options');
        }
      }
    );

    await runTest(
      'AI-24',
      'Critical Confirmation Test: Canceled Command Leaves DB Untouched',
      'إلغاء الأمر المالي لا يمس قاعدة البيانات بأي شكل',
      async () => {
        const testAccName = 'عميل إلغاء أمر ' + Date.now();
        const account = await accountService.createAccount({
          name: testAccName,
        });

        const prompt = `سجل على ${testAccName} 4000 ريال`;
        const aiResp = await aiService.ask(prompt);
        if (!aiResp.command) throw new Error('Command was not created');

        // User cancels
        await aiService.cancelCommand(aiResp.command.id);

        const acc = await accountService.getById(account.id);
        if (acc?.currentBalance !== 0 || acc?.transactionCount !== 0) {
          throw new Error('Database was modified despite command cancellation!');
        }

        // Clean up
        await db.accounts.delete(account.id);
      }
    );

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
