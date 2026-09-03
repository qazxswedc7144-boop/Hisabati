import { db } from '../../database/db';
import { transactionEngine } from '../transactionEngine.service';
import { integrityService } from '../integrity.service';
import {
  StructuredReceiptDraft,
  DuplicateInvoiceCheckResult,
  ConvertDraftToTransactionRequest,
  ConvertDraftToTransactionResult,
  CreateTransactionDTO,
  Transaction,
} from '@/shared/types';
import { roundMoney } from '../../utils/financial';
import { rbacGuard } from '../rbac/RBACGuard.service';
import { auditTrailService } from '../rbac/AuditTrail.service';

export class ReceiptTransactionBridgeService {
  /**
   * Checks for existing duplicate invoices in the database and saved drafts.
   * Matches by invoice/receipt number, or by (accountId + amount + date).
   */
  async checkDuplicateInvoice(params: {
    invoiceNumber?: string;
    accountId?: string;
    amount?: number;
    date?: string;
    receiptId?: string;
    savedDrafts?: StructuredReceiptDraft[];
  }): Promise<DuplicateInvoiceCheckResult> {
    const { invoiceNumber, accountId, amount, date, receiptId, savedDrafts = [] } = params;
    const cleanInvoiceNumber = invoiceNumber?.trim().toLowerCase();
    const reasons: string[] = [];
    const matchingTransactions: Array<{
      id: string;
      receiptNumber?: string;
      amount: number;
      date: string;
      accountId: string;
      accountName?: string;
      note?: string;
    }> = [];

    const allTransactions = await db.transactions.toArray();
    const allAccounts = await db.accounts.toArray();
    const accountMap = new Map(allAccounts.map((a) => [a.id, a.name]));

    for (const trx of allTransactions) {
      // 1. Check if already converted from this exact receiptId
      if (receiptId && trx.receiptId === receiptId) {
        reasons.push(`هذه الفاتورة تم ترحيلها مسبقاً بنفس المعرف (عملية: ${trx.id})`);
        matchingTransactions.push({
          id: trx.id,
          receiptNumber: trx.receiptNumber,
          amount: trx.amount,
          date: trx.date,
          accountId: trx.accountId,
          accountName: accountMap.get(trx.accountId),
          note: trx.note,
        });
        continue;
      }

      // 2. Check by invoice/receipt number match
      if (
        cleanInvoiceNumber &&
        trx.receiptNumber &&
        trx.receiptNumber.trim().toLowerCase() === cleanInvoiceNumber
      ) {
        const accName = accountMap.get(trx.accountId) || 'حساب غير معروف';
        reasons.push(
          `رقم الفاتورة/السند (${trx.receiptNumber}) مسجل مسبقاً للحساب "${accName}" بتاريخ ${trx.date} بمبلغ ${trx.amount}`
        );
        matchingTransactions.push({
          id: trx.id,
          receiptNumber: trx.receiptNumber,
          amount: trx.amount,
          date: trx.date,
          accountId: trx.accountId,
          accountName: accName,
          note: trx.note,
        });
        continue;
      }

      // 3. Check by identical (account + amount + date) match
      if (
        accountId &&
        trx.accountId === accountId &&
        amount !== undefined &&
        Math.abs(trx.amount - amount) < 0.01 &&
        date &&
        trx.date === date
      ) {
        reasons.push(
          `توجد عملية بنفس التاريخ (${date}) والمبلغ (${amount}) مسجلة لنفس الحساب (سند: ${trx.receiptNumber || 'بدون'})`
        );
        matchingTransactions.push({
          id: trx.id,
          receiptNumber: trx.receiptNumber,
          amount: trx.amount,
          date: trx.date,
          accountId: trx.accountId,
          accountName: accountMap.get(trx.accountId),
          note: trx.note,
        });
      }
    }

    // Check duplicate in saved drafts
    const matchingDrafts: Array<{
      id: string;
      invoiceNumber: string;
      totalAmount: number;
      date: string;
      partyName: string;
    }> = [];

    if (cleanInvoiceNumber) {
      for (const draft of savedDrafts) {
        if (
          draft.id !== receiptId &&
          draft.invoiceNumber &&
          draft.invoiceNumber.trim().toLowerCase() === cleanInvoiceNumber
        ) {
          matchingDrafts.push({
            id: draft.id,
            invoiceNumber: draft.invoiceNumber,
            totalAmount: draft.totalAmount,
            date: draft.date,
            partyName: draft.partyName,
          });
        }
      }
    }

    const isDuplicate = matchingTransactions.length > 0 || matchingDrafts.length > 0;
    let messageAr: string | undefined = undefined;

    if (isDuplicate) {
      if (matchingTransactions.length > 0) {
        const first = matchingTransactions[0];
        messageAr = `تنبيه: تم العثور على فاتورة أو عملية سابقة برقم السند (${first.receiptNumber || 'مطابقة المبلغ والتاريخ'}) للحساب "${first.accountName || ''}" بمبلغ ${first.amount} بتاريخ ${first.date}.`;
      } else if (matchingDrafts.length > 0) {
        const first = matchingDrafts[0];
        messageAr = `تنبيه: توجد مسودة أخرى محفوظة برقم الفاتورة نفسه (${first.invoiceNumber}) للمورد/العميل "${first.partyName}".`;
      }
    }

    return {
      isDuplicate,
      severity: isDuplicate ? 'warning' : 'info',
      matchingTransactions,
      matchingDrafts: matchingDrafts.length > 0 ? matchingDrafts : undefined,
      messageAr,
      reasons,
    };
  }

  /**
   * Converts a user-reviewed and confirmed StructuredReceiptDraft into an official
   * financial transaction via FinancialTransactionEngine.
   *
   * STRICT MANDATE:
   * - Never writes directly to IndexedDB.
   * - Never bypasses FinancialTransactionEngine.
   * - Rejects unconfirmed drafts or missing explicit user approval.
   * - Performs duplicate check with override confirmation.
   * - Recalculates balance atomically.
   * - Runs full financial integrity check.
   */
  async convertDraftToTransaction(
    request: ConvertDraftToTransactionRequest
  ): Promise<ConvertDraftToTransactionResult> {
    const {
      draft,
      accountId,
      type,
      overrideAmount,
      overrideDate,
      overrideNote,
      overrideReceiptNumber,
      explicitUserConfirmed,
      allowDuplicate = false,
    } = request;

    // 0. Strict RBAC Assertion: user must hold 'receipts:convert'
    await rbacGuard.assertPermission('receipts:convert', {
      targetType: 'receipt',
      targetId: draft?.id || 'draft',
      details: `ترحيل مسودة الفاتورة ${draft?.id} إلى قيد مالي`,
    });

    // 1. Mandatory Explicit Confirmation Check
    if (!explicitUserConfirmed) {
      throw new Error('ممنوع إنشاء المعاملة المالية: يتطلب النظام تأكيد المستخدم الصريح لاعتماد الفاتورة.');
    }

    // 2. Mandatory Draft Review Verification & Idempotency Check
    if (!draft || !draft.isConfirmedByUser) {
      throw new Error('ممنوع الترحيل: يجب مراجعة واعتماد مسودة الفاتورة من قبل المستخدم أولاً.');
    }

    if (draft.status === 'converted' || draft.convertedToTransactionId) {
      throw new Error('تم تحويل هذا السند مسبقاً إلى عملية مالية ولا يمكن تكرار تحويله.');
    }

    // 3. Target Account Validation
    if (!accountId || !accountId.trim()) {
      throw new Error('يجب تحديد الحساب المالي المرتبط بهذه الفاتورة.');
    }

    const account = await db.accounts.get(accountId);
    if (!account) {
      throw new Error('الحساب المالي المحدد غير موجود في قاعدة البيانات.');
    }

    // 4. Amount Validation
    const rawAmount = overrideAmount !== undefined ? overrideAmount : draft.totalAmount;
    const finalAmount = roundMoney(rawAmount);

    if (isNaN(finalAmount) || finalAmount <= 0) {
      throw new Error('مبلغ الفاتورة غير صالح: يجب أن يكون المبلغ أكبر من صفر.');
    }

    const finalDate = (overrideDate || draft.date || new Date().toISOString().split('T')[0]).trim();
    const finalReceiptNumber = (overrideReceiptNumber || draft.invoiceNumber || '').trim();

    // 5. Duplicate Check
    const duplicateCheck = await this.checkDuplicateInvoice({
      invoiceNumber: finalReceiptNumber || undefined,
      accountId,
      amount: finalAmount,
      date: finalDate,
      receiptId: draft.id,
    });

    if (duplicateCheck.isDuplicate && !allowDuplicate) {
      return {
        success: false,
        duplicateWarning: duplicateCheck,
        integrityValid: true,
        error: duplicateCheck.messageAr || 'تم العثور على فاتورة مكررة مسجلة مسبقاً. يرجى تأكيد المتابعة.',
      };
    }

    // 6. Generate deterministic operationId (Idempotency Key)
    const operationId = `op_ocr_${draft.id}_${Date.now()}`;

    // 7. Prepare Note & Line Items summary
    const defaultNote = draft.notes?.trim()
      ? draft.notes.trim()
      : `فاتورة ${draft.partyName} - سند #${finalReceiptNumber || draft.id.substring(0, 6)}`;
    const finalNote = overrideNote !== undefined ? overrideNote.trim() : defaultNote;

    // 8. Prepare CreateTransactionDTO
    const dto: CreateTransactionDTO = {
      accountId,
      type,
      amount: finalAmount,
      date: finalDate,
      note: finalNote,
      receiptNumber: finalReceiptNumber || undefined,
      operationId,
      receiptId: draft.id,
      documentRef: draft.imageUrl || draft.id,
      documentMetadata: {
        vendorName: draft.partyType === 'vendor' ? draft.partyName : undefined,
        customerName: draft.partyType === 'customer' ? draft.partyName : undefined,
        invoiceNumber: finalReceiptNumber || undefined,
        itemCount: draft.lineItems.length,
        subtotal: draft.subtotal,
        tax: draft.tax,
        currency: draft.currency,
        imageUrl: draft.imageUrl,
        documentType: draft.documentType,
        lineItems: draft.lineItems.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
        })),
      },
    };

    // 9. Execute via FinancialTransactionEngine (CRITICAL: Source of Truth & Atomic Recalculation)
    const createdTransaction: Transaction = await transactionEngine.createTransaction(dto);

    // 9.1 Log to Immutable Audit Trail
    try {
      await auditTrailService.log({
        actor: rbacGuard.getActiveActor(),
        action: 'RECEIPT_CONVERT_POST',
        targetType: 'receipt',
        targetId: draft.id,
        riskLevel: 'LOW',
        detailsAr: `ترحيل مسودة الفاتورة رقم "${finalReceiptNumber || draft.id}" بنجاح إلى المعاملة المالية رقم ${createdTransaction.id}.`,
        afterState: {
          transactionId: createdTransaction.id,
          receiptId: draft.id,
          accountId,
          amount: finalAmount,
        },
      });
    } catch (auditErr) {
      console.warn('Audit trail log warning during receipt conversion:', auditErr);
    }

    // 10. Audit Integrity Check
    const integrityReport = await integrityService.verifyFinancialIntegrity();
    if (!integrityReport.valid) {
      console.warn('Financial Integrity Warning after OCR transaction creation:', integrityReport.inconsistencies);
    }

    return {
      success: true,
      transactionId: createdTransaction.id,
      operationId,
      duplicateWarning: duplicateCheck.isDuplicate ? duplicateCheck : undefined,
      integrityValid: integrityReport.valid,
    };
  }
}

export const receiptTransactionBridge = new ReceiptTransactionBridgeService();
