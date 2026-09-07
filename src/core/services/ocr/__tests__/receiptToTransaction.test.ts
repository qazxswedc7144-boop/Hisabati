import 'fake-indexeddb/auto';
import assert from 'node:assert';
import { db } from '../../../database/db';
import { transactionEngine } from '../../transactionEngine.service';
import { receiptTransactionBridge } from '../ReceiptTransactionBridge.service';
import { StructuredReceiptDraft } from '../../../../shared/types';
import { integrityService } from '../../integrity.service';

console.log('🚀 Running Phase 7-C OCR to Financial Transaction Tests...');

async function runPhase7CTests() {
  // Clear any existing database state for isolated test execution
  await db.transactions.clear();
  await db.accounts.clear();
  if (db.aiAuditLogs) await db.aiAuditLogs.clear();

  // Setup Test Account
  const testAccount = {
    id: 'acc-ocr-test-01',
    name: 'مؤسسة السعادة للمواد الغذائية',
    phone: '777123456',
    currentBalance: 0,
    totalDebit: 0,
    totalCredit: 0,
    transactionCount: 0,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.accounts.add(testAccount);

  console.log('Test 1: Duplicate Detection by Invoice Number...');
  {
    // Seed an existing transaction with invoice number 'INV-9901' via transactionEngine
    const created1 = await transactionEngine.createTransaction({
      accountId: testAccount.id,
      amount: 15000,
      type: 'credit',
      date: '2026-05-10',
      note: 'فاتورة قديمة',
      receiptNumber: 'INV-9901',
    });

    const duplicateCheck = await receiptTransactionBridge.checkDuplicateInvoice({
      invoiceNumber: 'INV-9901',
      accountId: testAccount.id,
      amount: 15000,
      date: '2026-05-10',
    });

    assert.strictEqual(duplicateCheck.isDuplicate, true, 'Should detect duplicate invoice number');
    assert.ok(duplicateCheck.matchingTransactions.length > 0, 'Should return matching transactions');
    assert.strictEqual(duplicateCheck.matchingTransactions[0].id, created1.id);
    assert.strictEqual(duplicateCheck.matchingTransactions[0].receiptNumber, 'INV-9901');
    assert.ok(duplicateCheck.reasons.some((r) => r.includes('INV-9901')), 'Reason must cite invoice number');
    console.log('✅ Passed Test 1: Duplicate Detection by Invoice Number');
  }

  console.log('Test 2: Fuzzy Duplicate Detection by Account + Amount + Date...');
  {
    // Seed an existing transaction without invoice number via transactionEngine
    const created2 = await transactionEngine.createTransaction({
      accountId: testAccount.id,
      amount: 8500,
      type: 'debit',
      date: '2026-05-12',
      note: 'دفعة توريد',
    });

    const duplicateCheck = await receiptTransactionBridge.checkDuplicateInvoice({
      invoiceNumber: 'DIFFERENT-NUMBER-102',
      accountId: testAccount.id,
      amount: 8500,
      date: '2026-05-12',
    });

    assert.strictEqual(duplicateCheck.isDuplicate, true, 'Should detect fuzzy duplicate');
    assert.strictEqual(duplicateCheck.matchingTransactions.length, 1);
    assert.strictEqual(duplicateCheck.matchingTransactions[0].id, created2.id);
    assert.ok(duplicateCheck.reasons.some((r) => r.includes('8500')), 'Reason must cite amount');
    console.log('✅ Passed Test 2: Fuzzy Duplicate Detection by Account + Amount + Date');
  }

  console.log('Test 3: Forbidden: Direct conversion without explicit confirmation...');
  {
    const draft: StructuredReceiptDraft = {
      id: 'draft-test-3',
      ocrResultId: 'ocr-res-3',
      status: 'draft',
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      isConfirmedByUser: true, // reviewed by user
      source: 'ocr_reviewed',
      documentType: 'invoice',
      partyType: 'vendor',
      partyName: 'مؤسسة السعادة',
      invoiceNumber: 'INV-NEW-100',
      date: '2026-05-14',
      currency: 'YER',
      subtotal: 5000,
      subtotalMinor: 500000,
      tax: 0,
      taxMinor: 0,
      totalAmount: 5000,
      totalAmountMinor: 500000,
      lineItems: [],
    };

    let caughtError = false;
    try {
      await receiptTransactionBridge.convertDraftToTransaction({
        draft,
        accountId: testAccount.id,
        type: 'credit',
        explicitUserConfirmed: false, // Forbidden: No explicit user confirmation
      });
    } catch (err: any) {
      caughtError = true;
      assert.ok(err.message.includes('تأكيد المستخدم الصريح'), 'Error must specify explicit confirmation');
    }
    assert.strictEqual(caughtError, true, 'Must reject unconfirmed conversion');
    console.log('✅ Passed Test 3: Rejection of unconfirmed conversion');
  }

  console.log('Test 4: Forbidden: Unreviewed draft conversion...');
  {
    const unreviewedDraft: StructuredReceiptDraft = {
      id: 'draft-test-4',
      ocrResultId: 'ocr-res-4',
      status: 'draft',
      createdAt: new Date().toISOString(),
      confirmedAt: '',
      isConfirmedByUser: false, // Never confirmed by user!
      source: 'ocr_reviewed',
      documentType: 'invoice',
      partyType: 'vendor',
      partyName: 'اسم غير مؤكد',
      invoiceNumber: 'LOW-CONF-001',
      date: '2026-05-14',
      currency: 'YER',
      subtotal: 3000,
      subtotalMinor: 300000,
      tax: 0,
      taxMinor: 0,
      totalAmount: 3000,
      totalAmountMinor: 300000,
      lineItems: [],
    };

    let caughtError = false;
    try {
      await receiptTransactionBridge.convertDraftToTransaction({
        draft: unreviewedDraft,
        accountId: testAccount.id,
        type: 'credit',
        explicitUserConfirmed: true,
      });
    } catch (err: any) {
      caughtError = true;
      assert.ok(err.message.includes('مراجعة واعتماد مسودة الفاتورة'), 'Error must require draft review');
    }
    assert.strictEqual(caughtError, true, 'Must reject unreviewed draft');
    console.log('✅ Passed Test 4: Rejection of unreviewed draft');
  }

  console.log('Test 5: Valid Conversion Flow via FinancialTransactionEngine & Integrity...');
  {
    const validAccount = {
      id: 'acc-ocr-valid-01',
      name: 'مؤسسة الشروق التجارية',
      phone: '777999888',
      currentBalance: 0,
      totalDebit: 0,
      totalCredit: 0,
      transactionCount: 0,
      archived: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.accounts.add(validAccount);

    const validDraft: StructuredReceiptDraft = {
      id: 'draft-valid-1',
      ocrResultId: 'ocr-res-valid',
      status: 'draft',
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      isConfirmedByUser: true,
      source: 'ocr_reviewed',
      documentType: 'invoice',
      partyType: 'vendor',
      partyName: 'مؤسسة الشروق التجارية',
      invoiceNumber: 'INV-VALID-2026',
      date: '2026-05-15',
      currency: 'YER',
      subtotal: 50000,
      subtotalMinor: 5000000,
      tax: 0,
      taxMinor: 0,
      totalAmount: 50000,
      totalAmountMinor: 5000000,
      lineItems: [
        {
          id: 'item-1',
          name: 'زيت طبخ 4 لتر',
          quantity: 10,
          unitPrice: 5000,
          unitPriceMinor: 500000,
          totalPrice: 50000,
          totalPriceMinor: 5000000,
        },
      ],
      imageUrl: 'data:image/jpeg;base64,sampleBase64ImageData',
    };

    const result = await receiptTransactionBridge.convertDraftToTransaction({
      draft: validDraft,
      accountId: validAccount.id,
      type: 'credit', // عليك (فاتورة مشتريات)
      overrideNote: 'فاتورة توريد مواد غذائية (مستوردة بالمسح الذكي)',
      explicitUserConfirmed: true,
      allowDuplicate: true,
    });

    assert.strictEqual(result.success, true);
    assert.ok(result.transactionId, 'Transaction ID must be returned');
    assert.ok(result.operationId?.startsWith('op_ocr_'), 'OperationId must be generated');

    const createdTrx = await db.transactions.get(result.transactionId!);
    assert.ok(createdTrx, 'Transaction must be created in DB');
    assert.strictEqual(createdTrx.receiptId, validDraft.id);
    assert.strictEqual(createdTrx.documentRef, validDraft.imageUrl);
    assert.strictEqual(createdTrx.documentMetadata?.invoiceNumber, 'INV-VALID-2026');
    assert.strictEqual(createdTrx.documentMetadata?.itemCount, 1);

    // Verify Account Balance was recalculated through FinancialTransactionEngine
    const updatedAccount = await db.accounts.get(validAccount.id);
    assert.ok(updatedAccount);
    // 'credit' of 50,000 means -50,000 in currentBalance
    assert.strictEqual(updatedAccount.currentBalance, -50000, 'Account balance must be -50000');
    assert.strictEqual(updatedAccount.totalCredit, 50000);
    assert.strictEqual(updatedAccount.totalDebit, 0);

    // Verify Financial Integrity
    const integrity = await integrityService.verifyFinancialIntegrity();
    assert.strictEqual(integrity.valid, true, 'Integrity check must find zero skews');

    console.log('✅ Passed Test 5: Complete conversion through FinancialTransactionEngine & Integrity');
  }

  console.log('Test 6: Idempotency Protection against duplicate conversion...');
  {
    const convertedDraft: StructuredReceiptDraft = {
      id: 'draft-converted-already',
      ocrResultId: 'ocr-res-conv',
      status: 'converted', // Already converted!
      convertedToTransactionId: 'trx-previous',
      convertedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      confirmedAt: new Date().toISOString(),
      isConfirmedByUser: true,
      source: 'ocr_reviewed',
      documentType: 'invoice',
      partyType: 'vendor',
      partyName: 'مؤسسة السعادة',
      invoiceNumber: 'INV-CONV-001',
      date: '2026-05-15',
      currency: 'YER',
      subtotal: 1000,
      subtotalMinor: 100000,
      tax: 0,
      taxMinor: 0,
      totalAmount: 1000,
      totalAmountMinor: 100000,
      lineItems: [],
    };

    let caughtError = false;
    try {
      await receiptTransactionBridge.convertDraftToTransaction({
        draft: convertedDraft,
        accountId: testAccount.id,
        type: 'credit',
        explicitUserConfirmed: true,
      });
    } catch (err: any) {
      caughtError = true;
      assert.ok(err.message.includes('تم تحويل هذا السند مسبقاً'));
    }
    assert.strictEqual(caughtError, true, 'Must reject already converted draft');
    console.log('✅ Passed Test 6: Idempotency protection against duplicate conversion');
  }

  console.log('\n🎉 ALL 6 PHASE 7-C TESTS PASSED PERFECTLY!\n');
}

runPhase7CTests().catch((err) => {
  console.error('❌ Phase 7-C Test Failure:', err);
  process.exit(1);
});
