import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { db } from '../../../database/db';
import { transactionEngine } from '../../transactionEngine.service';
import { invoiceAuditEngine } from '../InvoiceAuditEngine.service';
import { StructuredReceiptDraft, StructuredReceiptDraftItem } from '../../../../shared/types';

console.log('🚀 Running Phase 7-D AI Invoice Audit & Anomaly Detection Tests...');

function makeItem(item: { id: string; name: string; quantity: number; unitPrice: number; totalPrice: number }): StructuredReceiptDraftItem {
  return {
    ...item,
    unitPriceMinor: Math.round(item.unitPrice * 100),
    totalPriceMinor: Math.round(item.totalPrice * 100),
  };
}

function makeTestDraft(overrides: Partial<StructuredReceiptDraft>): StructuredReceiptDraft {
  const subtotal = overrides.subtotal ?? 10000;
  const tax = overrides.tax ?? 0;
  const totalAmount = overrides.totalAmount ?? (subtotal + tax);

  return {
    id: 'draft-test',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    confirmedAt: new Date().toISOString(),
    isConfirmedByUser: true,
    source: 'ocr_reviewed',
    documentType: 'invoice',
    partyType: 'vendor',
    partyName: 'شركة النجم الساطع',
    invoiceNumber: 'INV-001',
    date: '2026-08-15',
    currency: 'YER',
    subtotal,
    subtotalMinor: Math.round(subtotal * 100),
    tax,
    taxMinor: Math.round(tax * 100),
    totalAmount,
    totalAmountMinor: Math.round(totalAmount * 100),
    lineItems: [],
    rawText: 'فاتورة تجريبية',
    ...overrides,
  };
}

async function runPhase7DTests() {
  // Clear any existing database state for isolated test execution
  await db.transactions.clear();
  await db.accounts.clear();
  if (db.aiAuditLogs) await db.aiAuditLogs.clear();

  // Setup Test Account
  const testAccount = {
    id: 'acc-audit-test-01',
    name: 'شركة النجم الساطع التجارية',
    phone: '777000111',
    currentBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    transactionCount: 0,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.accounts.add(testAccount);

  // Test 1: Clean, balanced invoice -> LOW risk
  console.log('Test 1: Perfectly balanced invoice should produce LOW risk...');
  {
    const cleanDraft = makeTestDraft({
      id: 'draft-clean-01',
      invoiceNumber: 'INV-2026-001',
      date: '2026-08-15',
      subtotal: 10000,
      tax: 500,
      totalAmount: 10500,
      lineItems: [
        makeItem({ id: 'item-1', name: 'سكر 50 كجم', quantity: 2, unitPrice: 5000, totalPrice: 10000 }),
      ],
      rawText: 'فاتورة ضريبية رسمية',
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: cleanDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    assert.strictEqual(report.overallRisk, 'LOW', 'Expected LOW risk for clean invoice');
    assert.strictEqual(report.mathVerification.isBalanced, true, 'Math should be balanced');
    assert.strictEqual(report.mathVerification.discrepancy, 0, 'Discrepancy should be 0');
    assert.strictEqual(report.findings.filter((f) => f.severity === 'critical' || f.severity === 'error').length, 0);
    console.log('✅ Test 1 Passed: Clean invoice verified with LOW risk.');
  }

  // Test 2: Line Item Math Inconsistency (qty * unitPrice != total)
  console.log('Test 2: Line item math inconsistency detection...');
  {
    const badItemDraft = makeTestDraft({
      id: 'draft-bad-item-02',
      invoiceNumber: 'INV-2026-002',
      date: '2026-08-15',
      subtotal: 10000,
      tax: 0,
      totalAmount: 10000,
      lineItems: [
        // 3 * 2000 = 6000, but stated is 7500!
        makeItem({ id: 'item-1', name: 'زيت طبخ', quantity: 3, unitPrice: 2000, totalPrice: 7500 }),
      ],
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: badItemDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    const mathFinding = report.findings.find((f) => f.category === 'line_items');
    assert.ok(mathFinding, 'Should detect line item calculation error');
    assert.strictEqual(mathFinding?.expected, 6000);
    assert.strictEqual(mathFinding?.actual, 7500);
    console.log('✅ Test 2 Passed: Line item math anomaly detected accurately.');
  }

  // Test 3: Totals Discrepancy (Subtotal + Tax != Total)
  console.log('Test 3: Subtotal + Tax vs Total discrepancy detection...');
  {
    const mismatchedDraft = makeTestDraft({
      id: 'draft-mismatch-03',
      invoiceNumber: 'INV-2026-003',
      date: '2026-08-15',
      subtotal: 50000,
      tax: 2500, // Expected total = 52500
      totalAmount: 65000, // Stated is 65000 (diff: 12500 > 10%)
      lineItems: [],
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: mismatchedDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    assert.strictEqual(report.mathVerification.isBalanced, false);
    assert.strictEqual(report.mathVerification.discrepancy, 12500);
    assert.ok(report.overallRisk === 'HIGH' || report.overallRisk === 'CRITICAL');
    const totalsFinding = report.findings.find((f) => f.category === 'totals');
    assert.ok(totalsFinding, 'Should report totals mismatch finding');
    console.log('✅ Test 3 Passed: Major totals discrepancy flagged as high/critical.');
  }

  // Test 4: Tax Exceeds Subtotal Anomaly
  console.log('Test 4: Tax exceeds subtotal anomaly detection...');
  {
    const abnormalTaxDraft = makeTestDraft({
      id: 'draft-tax-04',
      invoiceNumber: 'INV-2026-004',
      date: '2026-08-15',
      subtotal: 1000,
      tax: 4000, // 400% tax!
      totalAmount: 5000,
      lineItems: [],
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: abnormalTaxDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    const taxFinding = report.findings.find((f) => f.category === 'tax' && f.severity === 'critical');
    assert.ok(taxFinding, 'Should detect critical tax anomaly');
    assert.strictEqual(report.overallRisk, 'CRITICAL');
    console.log('✅ Test 4 Passed: Unrealistic tax rate flagged with CRITICAL severity.');
  }

  // Test 5: Future Date Detection
  console.log('Test 5: Future date anomaly detection...');
  {
    const futureDraft = makeTestDraft({
      id: 'draft-future-05',
      invoiceNumber: 'INV-2026-005',
      date: '2099-01-01',
      subtotal: 1000,
      tax: 0,
      totalAmount: 1000,
      lineItems: [],
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: futureDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    const dateFinding = report.findings.find((f) => f.category === 'date' && f.severity === 'error');
    assert.ok(dateFinding, 'Should flag future date as an error finding');
    console.log('✅ Test 5 Passed: Future date flagged appropriately.');
  }

  // Test 6: Duplicate Invoice Number Detection -> CRITICAL risk
  console.log('Test 6: Duplicate invoice number against existing financial transactions...');
  {
    // Commit a real transaction with invoice number 'INV-EXACT-88'
    await transactionEngine.createTransaction({
      accountId: testAccount.id,
      amount: 25000,
      type: 'credit',
      date: '2026-08-01',
      note: 'فاتورة سابقة معتمدة',
      receiptNumber: 'INV-EXACT-88',
    });

    const dupDraft = makeTestDraft({
      id: 'draft-dup-06',
      invoiceNumber: 'INV-EXACT-88',
      date: '2026-08-01',
      subtotal: 25000,
      tax: 0,
      totalAmount: 25000,
      lineItems: [],
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: dupDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    assert.strictEqual(report.overallRisk, 'CRITICAL', 'Duplicate invoice number MUST yield CRITICAL risk');
    const dupFinding = report.findings.find((f) => f.category === 'duplicate' && f.severity === 'critical');
    assert.ok(dupFinding, 'Must have critical duplicate finding');
    console.log('✅ Test 6 Passed: Confirmed duplicate invoice correctly classified as CRITICAL.');
  }

  // Test 7: Account Name Mismatch
  console.log('Test 7: Target account name mismatch detection...');
  {
    const mismatchAccountDraft = makeTestDraft({
      id: 'draft-acc-mismatch-07',
      partyName: 'مؤسسة الأمل للإلكترونيات', // Totally different from "شركة النجم الساطع التجارية"
      invoiceNumber: 'INV-2026-007',
      date: '2026-08-10',
      subtotal: 1000,
      tax: 0,
      totalAmount: 1000,
      lineItems: [],
    });

    const report = await invoiceAuditEngine.auditInvoiceDraft({
      draft: mismatchAccountDraft,
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    assert.ok(report.accountComparison);
    assert.strictEqual(report.accountComparison.nameMatchStatus, 'mismatch');
    const accFinding = report.findings.find((f) => f.category === 'account_mismatch');
    assert.ok(accFinding, 'Should include account mismatch finding');
    console.log('✅ Test 7 Passed: Account name divergence detected and reported.');
  }

  // Test 8: Read-Only Safety & Audit Log Persistence
  console.log('Test 8: Read-only safety and AI audit log record creation...');
  {
    const initialTxCount = await db.transactions.count();
    const accountBefore = await db.accounts.get(testAccount.id);

    // Run audit
    await invoiceAuditEngine.auditInvoiceDraft({
      draft: makeTestDraft({
        id: 'draft-safety-08',
        invoiceNumber: 'INV-SAFE-01',
        date: '2026-08-10',
        subtotal: 5000,
        tax: 0,
        totalAmount: 5000,
        lineItems: [],
      }),
      targetAccountId: testAccount.id,
      skipAiOnline: true,
    });

    // Verify ZERO transactions were written by the audit engine
    const finalTxCount = await db.transactions.count();
    assert.strictEqual(finalTxCount, initialTxCount, 'Audit engine must NEVER write transactions directly');

    const accountAfter = await db.accounts.get(testAccount.id);
    assert.strictEqual(accountAfter?.currentBalance, accountBefore?.currentBalance, 'Account balance must not change');

    // Verify AI audit log was written
    const logs = await db.aiAuditLogs.where('intent').equals('AUDIT_INVOICE').toArray();
    assert.ok(logs.length > 0, 'Audit execution must be logged in db.aiAuditLogs');
    console.log(`✅ Test 8 Passed: Strict read-only guarantee confirmed & ${logs.length} audit logs stored.`);
  }

  console.log('\n🎉 ALL Phase 7-D AI Invoice Audit Tests Passed Successfully! (8/8)');
}

runPhase7DTests().catch((err) => {
  console.error('❌ Phase 7-D Test Failed:', err);
  process.exit(1);
});
