import { db } from '../../database/db';
import {
  StructuredReceiptDraft,
  InvoiceAuditReport,
  InvoiceAuditFinding,
  AuditRiskLevel,
  AuditFindingSeverity,
  DuplicateInvoiceCheckResult,
} from '@/shared/types';
import { receiptTransactionBridge } from './ReceiptTransactionBridge.service';
import { roundMoney } from '../../utils/financial';

export interface AuditInvoiceOptions {
  draft: StructuredReceiptDraft;
  targetAccountId?: string;
  selectedTransactionType?: 'debit' | 'credit';
  skipAiOnline?: boolean;
}

export class InvoiceAuditEngineService {
  /**
   * Main entry point for AI & Rule-based Invoice Audit & Anomaly Detection.
   * STRICT GUARANTEE:
   * - Read-only analysis. Never writes, modifies, or deletes financial transactions.
   * - Fully offline-capable with robust local deterministic heuristics.
   * - Logs all audit executions to db.aiAuditLogs.
   */
  async auditInvoiceDraft(options: AuditInvoiceOptions): Promise<InvoiceAuditReport> {
    const { draft, targetAccountId, selectedTransactionType, skipAiOnline = false } = options;

    const findings: InvoiceAuditFinding[] = [];
    const now = new Date();

    // 1. Math Verification of Line Items
    let lineItemsSum = 0;
    let itemsMathValid = true;

    if (draft.lineItems && draft.lineItems.length > 0) {
      for (let i = 0; i < draft.lineItems.length; i++) {
        const item = draft.lineItems[i];
        const qty = Number(item.quantity) || 0;
        const price = Number(item.unitPrice) || 0;
        const total = Number(item.totalPrice) || 0;

        lineItemsSum = roundMoney(lineItemsSum + total);

        // Check non-positive quantities
        if (qty <= 0) {
          findings.push({
            id: `item_qty_${i}`,
            category: 'quantities',
            severity: 'warning',
            titleAr: 'كمية الصنف غير صالحة',
            messageAr: `الصنف "${item.name || i + 1}" مسجل بكمية (${qty})، يجب أن تكون الكمية أكبر من صفر.`,
            field: `lineItems[${i}].quantity`,
            actual: qty,
            expected: '> 0',
          });
        }

        // Check negative unit price
        if (price < 0) {
          findings.push({
            id: `item_price_${i}`,
            category: 'prices',
            severity: 'error',
            titleAr: 'سعر الصنف سالب',
            messageAr: `الصنف "${item.name || i + 1}" يحتوي على سعر وحدة سالب (${price}).`,
            field: `lineItems[${i}].unitPrice`,
            actual: price,
            expected: '>= 0',
          });
        }

        // Check calculation: Quantity * UnitPrice == TotalPrice
        if (qty > 0 && price >= 0) {
          const expectedTotal = roundMoney(qty * price);
          const diff = Math.abs(expectedTotal - total);
          if (diff > 0.05) {
            itemsMathValid = false;
            findings.push({
              id: `item_math_${i}`,
              category: 'line_items',
              severity: 'warning',
              titleAr: 'عدم تطابق حساب الصنف',
              messageAr: `الصنف "${item.name || i + 1}": الكمية (${qty}) × السعر (${price}) = ${expectedTotal}، بينما الإجمالي المسجل هو ${total} (فارق: ${roundMoney(diff)}).`,
              field: `lineItems[${i}].totalPrice`,
              expected: expectedTotal,
              actual: total,
            });
          }
        }
      }
    }

    // 2. Math Verification of Totals (Subtotal + Tax vs Total)
    const statedSubtotal = roundMoney(Number(draft.subtotal) || 0);
    const statedTax = roundMoney(Number(draft.tax) || 0);
    const statedTotal = roundMoney(Number(draft.totalAmount) || 0);

    let calculatedTotal = statedSubtotal > 0 ? roundMoney(statedSubtotal + statedTax) : statedTotal;
    let discrepancy = 0;
    let isBalanced = true;

    if (statedTotal <= 0) {
      findings.push({
        id: 'total_zero_or_negative',
        category: 'totals',
        severity: 'critical',
        titleAr: 'إجمالي الفاتورة غير صالح',
        messageAr: 'إجمالي الفاتورة المسجل صفر أو سالب، ولا يمكن اعتماد عملية مالية بدون مبلغ إيجابي.',
        field: 'totalAmount',
        actual: statedTotal,
        expected: '> 0',
      });
      isBalanced = false;
    }

    if (statedSubtotal > 0) {
      const expectedTotal = roundMoney(statedSubtotal + statedTax);
      discrepancy = roundMoney(Math.abs(expectedTotal - statedTotal));
      if (discrepancy > 0.05) {
        isBalanced = false;
        const isSevere = statedTotal > 0 && discrepancy / statedTotal > 0.1;
        findings.push({
          id: 'subtotal_tax_mismatch',
          category: 'totals',
          severity: isSevere ? 'critical' : 'error',
          titleAr: 'تضارب حسابي في الإجمالي',
          messageAr: `المجموع الفرعي (${statedSubtotal}) + الضريبة (${statedTax}) = ${expectedTotal}، بينما الإجمالي المسجل هو ${statedTotal} (فارق مالي: ${discrepancy}).`,
          field: 'totalAmount',
          expected: expectedTotal,
          actual: statedTotal,
        });
      }
    }

    // Check line items sum vs Subtotal / Total
    if (draft.lineItems && draft.lineItems.length > 0) {
      if (statedSubtotal > 0) {
        const diffWithSubtotal = roundMoney(Math.abs(lineItemsSum - statedSubtotal));
        if (diffWithSubtotal > 0.05) {
          isBalanced = false;
          findings.push({
            id: 'line_items_vs_subtotal',
            category: 'totals',
            severity: diffWithSubtotal / (statedSubtotal || 1) > 0.1 ? 'error' : 'warning',
            titleAr: 'مجموع الأصناف لا يطابق المجموع الفرعي',
            messageAr: `مجموع قيم بنود الأصناف (${lineItemsSum}) لا يطابق المجموع الفرعي المسجل بالفاتورة (${statedSubtotal}) بفارق ${diffWithSubtotal}.`,
            field: 'subtotal',
            expected: lineItemsSum,
            actual: statedSubtotal,
          });
        }
      } else if (statedTax === 0 && statedTotal > 0) {
        const diffWithTotal = roundMoney(Math.abs(lineItemsSum - statedTotal));
        if (diffWithTotal > 0.05) {
          isBalanced = false;
          findings.push({
            id: 'line_items_vs_total',
            category: 'totals',
            severity: diffWithTotal / statedTotal > 0.1 ? 'error' : 'warning',
            titleAr: 'مجموع الأصناف لا يطابق الإجمالي',
            messageAr: `مجموع بنود الأصناف (${lineItemsSum}) لا يطابق الإجمالي الكلي المسجل (${statedTotal}) بفارق ${diffWithTotal}.`,
            field: 'totalAmount',
            expected: lineItemsSum,
            actual: statedTotal,
          });
        }
      }
    }

    // 3. Tax Anomaly Checks
    if (statedTax < 0) {
      findings.push({
        id: 'tax_negative',
        category: 'tax',
        severity: 'error',
        titleAr: 'مبلغ الضريبة سالب',
        messageAr: `مبلغ الضريبة المسجل سالب (${statedTax})، وهو غير مسموح به محاسبياً.`,
        field: 'tax',
        actual: statedTax,
        expected: '>= 0',
      });
    } else if (statedSubtotal > 0 && statedTax > statedSubtotal) {
      findings.push({
        id: 'tax_exceeds_subtotal',
        category: 'tax',
        severity: 'critical',
        titleAr: 'مبلغ الضريبة يتجاوز قيمة الفاتورة',
        messageAr: `مبلغ الضريبة (${statedTax}) أكبر من المجموع الفرعي للبضاعة (${statedSubtotal})، مما يشير لخطأ واضح في قراءة المستند.`,
        field: 'tax',
        actual: statedTax,
        expected: `< ${statedSubtotal}`,
      });
    } else if (statedSubtotal > 0 && statedTax / statedSubtotal > 0.3) {
      const percentage = Math.round((statedTax / statedSubtotal) * 100);
      findings.push({
        id: 'tax_rate_unusually_high',
        category: 'tax',
        severity: 'warning',
        titleAr: 'نسبة الضريبة مرتفعة بشكل استثنائي',
        messageAr: `نسبة الضريبة المحسوبة هي ${percentage}% من المجموع الفرعي، وهي نسبة غير معتادة للفواتير التجارية.`,
        field: 'tax',
        actual: `${percentage}%`,
        expected: '<= 15%',
      });
    }

    // 4. Currency Validation
    const supportedCurrencies = ['YER', 'SAR', 'USD', 'AED'];
    if (!draft.currency || !supportedCurrencies.includes(draft.currency)) {
      findings.push({
        id: 'currency_unsupported',
        category: 'currency',
        severity: 'warning',
        titleAr: 'رمز العملة غير قياسي',
        messageAr: `العملة المسجلة (${draft.currency || 'غير محددة'}) تختلف عن العملات المعتمدة (YER / SAR / USD / AED).`,
        field: 'currency',
        actual: draft.currency || 'غير محددة',
        expected: supportedCurrencies.join(', '),
      });
    }

    // 5. Date Validation
    if (!draft.date || !draft.date.trim()) {
      findings.push({
        id: 'date_missing',
        category: 'date',
        severity: 'warning',
        titleAr: 'تاريخ الفاتورة غير محدد',
        messageAr: 'لم يتم استخراج تاريخ واضح من الفاتورة؛ سيتم افتراض تاريخ اليوم الحالي ما لم يتم التعديل.',
        field: 'date',
        actual: 'غير محدد',
      });
    } else {
      const parsedDate = new Date(draft.date);
      if (isNaN(parsedDate.getTime())) {
        findings.push({
          id: 'date_invalid_format',
          category: 'date',
          severity: 'warning',
          titleAr: 'تنسيق التاريخ غير صحيح',
          messageAr: `صيغة التاريخ (${draft.date}) غير صالحة، يرجى التحقق وإدخال تاريخ صحيح.`,
          field: 'date',
          actual: draft.date,
        });
      } else {
        // Check future date (> tomorrow)
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (parsedDate > tomorrow) {
          findings.push({
            id: 'date_future',
            category: 'date',
            severity: 'error',
            titleAr: 'تاريخ الفاتورة في المستقبل',
            messageAr: `تاريخ الفاتورة المسجل (${draft.date}) يقع في المستقبل مقارنة باليوم، يرجى التأكد من صحة التاريخ.`,
            field: 'date',
            actual: draft.date,
            expected: '<= اليوم الحالي',
          });
        }

        // Check if date is older than 365 days
        const oneYearAgo = new Date(now);
        oneYearAgo.setDate(oneYearAgo.getDate() - 365);
        if (parsedDate < oneYearAgo) {
          findings.push({
            id: 'date_too_old',
            category: 'date',
            severity: 'info',
            titleAr: 'تاريخ الفاتورة قديم',
            messageAr: `تاريخ الفاتورة (${draft.date}) يعود لأكثر من عام مضى. تأكد من أن هذا السند لم يُسجل سابقاً.`,
            field: 'date',
            actual: draft.date,
          });
        }
      }
    }

    // 6. Invoice Number & Duplicate Detection
    let duplicateAssessment: DuplicateInvoiceCheckResult | undefined;
    if (!draft.invoiceNumber || !draft.invoiceNumber.trim()) {
      findings.push({
        id: 'invoice_number_missing',
        category: 'invoice_number',
        severity: 'info',
        titleAr: 'رقم الفاتورة/السند غير مسجل',
        messageAr: 'المستند لا يحتوي على رقم تسلسلي واضح، مما قد يصعّب منع تكرار تسجيله مستقبلاً.',
        field: 'invoiceNumber',
        actual: 'مفقود',
      });
    } else {
      duplicateAssessment = await receiptTransactionBridge.checkDuplicateInvoice({
        invoiceNumber: draft.invoiceNumber,
        accountId: targetAccountId || draft.matchedAccountId,
        amount: statedTotal,
        date: draft.date,
        receiptId: draft.id,
      });

      if (duplicateAssessment.isDuplicate) {
        if (duplicateAssessment.matchingTransactions && duplicateAssessment.matchingTransactions.length > 0) {
          const match = duplicateAssessment.matchingTransactions[0];
          const isExactNum =
            match.receiptNumber &&
            draft.invoiceNumber &&
            match.receiptNumber.trim().toLowerCase() === draft.invoiceNumber.trim().toLowerCase();

          findings.push({
            id: 'duplicate_transaction_found',
            category: 'duplicate',
            severity: isExactNum ? 'critical' : 'error',
            titleAr: isExactNum ? 'رقم الفاتورة مسجل مسبقاً (تكرار مؤكد)' : 'اشتباه تكرار عملية مالية سابقة',
            messageAr:
              duplicateAssessment.messageAr ||
              `توجد عملية سابقة للحساب "${match.accountName || ''}" بمبلغ ${match.amount} بتاريخ ${match.date}.`,
            field: 'invoiceNumber',
            actual: draft.invoiceNumber,
            expected: 'رقم فريد غير مكرر',
          });
        } else if (duplicateAssessment.matchingDrafts && duplicateAssessment.matchingDrafts.length > 0) {
          findings.push({
            id: 'duplicate_draft_found',
            category: 'duplicate',
            severity: 'warning',
            titleAr: 'توجد مسودة أخرى بنفس رقم الفاتورة',
            messageAr:
              duplicateAssessment.messageAr || 'توجد مسودة غير مرحّلة مسبقاً مسجلة بنفس رقم الفاتورة.',
            field: 'invoiceNumber',
            actual: draft.invoiceNumber,
          });
        }
      }
    }

    // 7. Target Account Consistency Comparison
    let accountComparison: InvoiceAuditReport['accountComparison'];
    const accId = targetAccountId || draft.matchedAccountId;

    if (accId) {
      const account = await db.accounts.get(accId);
      if (account) {
        const partyName = (draft.partyName || '').trim();
        const accName = account.name.trim();

        const cleanStr = (s: string) =>
          s
            .replace(/^(مؤسسة|شركة|مكتب|محلات|سوبرماركت|معرض)\s+/g, '')
            .replace(/^ال/g, '')
            .replace(/[أإآ]/g, 'ا')
            .replace(/ة/g, 'ه')
            .replace(/ى/g, 'ي')
            .toLowerCase()
            .trim();

        const cleanParty = cleanStr(partyName);
        const cleanAcc = cleanStr(accName);

        let nameMatchStatus: 'matched' | 'partial' | 'mismatch' | 'unknown' = 'unknown';
        let similarityScore = 1.0;

        if (!cleanParty) {
          nameMatchStatus = 'unknown';
          similarityScore = 0.5;
        } else if (cleanParty === cleanAcc || cleanAcc.includes(cleanParty) || cleanParty.includes(cleanAcc)) {
          nameMatchStatus = 'matched';
          similarityScore = 1.0;
        } else {
          // Check word overlap
          const partyWords = cleanParty.split(/\s+/).filter((w) => w.length > 2);
          const accWords = cleanAcc.split(/\s+/).filter((w) => w.length > 2);
          const common = partyWords.filter((w) => accWords.some((aw) => aw.includes(w) || w.includes(aw)));

          if (common.length > 0) {
            nameMatchStatus = 'partial';
            similarityScore = 0.7;
          } else {
            nameMatchStatus = 'mismatch';
            similarityScore = 0.2;

            findings.push({
              id: 'account_name_mismatch',
              category: 'account_mismatch',
              severity: 'warning',
              titleAr: 'اختلاف اسم الحساب عن اسم الفاتورة',
              messageAr: `اسم الجهة المكتوب في الفاتورة "${partyName}" يختلف تماماً عن اسم الحساب المالي المحدد "${account.name}".`,
              field: 'partyName',
              actual: partyName,
              expected: account.name,
            });
          }
        }

        accountComparison = {
          targetAccountId: account.id,
          targetAccountName: account.name,
          partyName,
          nameMatchStatus,
          similarityScore,
        };
      }
    }

    // 8. Calculate Risk Score and Overall Risk Level
    let riskScore = 0;
    for (const f of findings) {
      if (f.severity === 'critical') riskScore += 50;
      else if (f.severity === 'error') riskScore += 30;
      else if (f.severity === 'warning') riskScore += 15;
      else if (f.severity === 'info') riskScore += 5;
    }
    riskScore = Math.min(100, riskScore);

    let overallRisk: AuditRiskLevel = 'LOW';
    if (findings.some((f) => f.severity === 'critical') || riskScore >= 70) {
      overallRisk = 'CRITICAL';
    } else if (findings.some((f) => f.severity === 'error') || riskScore >= 40) {
      overallRisk = 'HIGH';
    } else if (findings.some((f) => f.severity === 'warning') || riskScore >= 15) {
      overallRisk = 'MEDIUM';
    } else {
      overallRisk = 'LOW';
    }

    // 9. Generate Deterministic Arabic Summary & Recommendation
    let summaryAr = '';
    let recommendationAr = '';

    if (overallRisk === 'LOW') {
      summaryAr =
        findings.length === 0
          ? 'الفاتورة سليمة ومتوازنة حسابياً بنسبة 100% ولا توجد أي تناقضات أو مؤشرات خطورة.'
          : 'الفاتورة مقبولة ومستقرة مع وجود ملاحظات شكلية طفيفة لا تؤثر على سلامة القيد المالي.';
      recommendationAr = 'جاهزة للاعتماد والترحيل المالي إلى حساب العميل/المورد مباشرة.';
    } else if (overallRisk === 'MEDIUM') {
      summaryAr = `تم رصد ملاحظات متوسطة الأهمية (${findings.length} ملاحظات) تتعلق بصيغة التاريخ أو العملة أو تطابق اسم الجهة.`;
      recommendationAr = 'يُنصح بمراجعة البيانات المشار إليها أعلاه للتأكد من دقتها قبل تأكيد الترحيل.';
    } else if (overallRisk === 'HIGH') {
      summaryAr = `تم اكتشاف تناقضات حسابية أو تضارب في الإجماليات أو اشتباه تكرار بقيمة خطر (${riskScore}%).`;
      recommendationAr = 'يُرجى عدم ترحيل الفاتورة قبل تصحيح الفارق المالي وتدقيق بنود الأصناف.';
    } else {
      summaryAr = 'تحذير حرج: توجد أخطاء جسيمة في الفاتورة (تكرار سند مؤكد، أو مبالغ غير صالحة، أو تضارب حسابي حاد).';
      recommendationAr = 'ممنوع الترحيل في الوضع الحالي حتى يتم التحقق اليدوي التام وتصحيح الخلل.';
    }

    // 10. AI Contextual Enhancement (Hybrid Mode with Offline Fallback)
    let provider: 'local_deterministic' | 'gemini_ai' | 'hybrid' = 'local_deterministic';
    let isOfflineFallback = true;

    if (!skipAiOnline && typeof window !== 'undefined' && navigator.onLine) {
      try {
        const aiResponse = await fetch('/api/ai/audit-invoice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            draft,
            accountContext: accountComparison,
          }),
        });

        if (aiResponse.ok) {
          const aiJson = await aiResponse.json();
          if (aiJson.audit) {
            provider = 'hybrid';
            isOfflineFallback = false;

            if (aiJson.audit.summaryAr && aiJson.audit.summaryAr.trim()) {
              summaryAr = `${aiJson.audit.summaryAr} (${summaryAr})`;
            }
            if (aiJson.audit.recommendationAr && aiJson.audit.recommendationAr.trim()) {
              recommendationAr = aiJson.audit.recommendationAr;
            }

            // Integrate qualitative AI observations
            if (Array.isArray(aiJson.audit.aiObservations)) {
              aiJson.audit.aiObservations.forEach((obs: string, idx: number) => {
                findings.push({
                  id: `ai_obs_${idx}`,
                  category: 'totals',
                  severity: 'info',
                  titleAr: 'ملاحظة الذكاء الاصطناعي',
                  messageAr: obs,
                });
              });
            }
          }
        }
      } catch {
        // Seamless offline fallback: silent continuation
        provider = 'local_deterministic';
        isOfflineFallback = true;
      }
    }

    const reportId = `audit_rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const auditReport: InvoiceAuditReport = {
      id: reportId,
      draftId: draft.id,
      timestamp: new Date().toISOString(),
      overallRisk,
      riskScore,
      confidence: overallRisk === 'CRITICAL' ? 0.95 : overallRisk === 'HIGH' ? 0.9 : 0.85,
      summaryAr,
      recommendationAr,
      findings,
      mathVerification: {
        lineItemsSum,
        statedSubtotal,
        statedTax,
        statedTotal,
        calculatedTotal,
        discrepancy,
        isBalanced,
        itemsMathValid,
      },
      duplicateAssessment,
      accountComparison,
      provider,
      isOfflineFallback,
    };

    // 11. Record in AI Audit Log (Mandate for compliance and traceability)
    try {
      if (db.aiAuditLogs) {
        await db.aiAuditLogs.add({
          id: `log_${reportId}`,
          requestId: `req_audit_${draft.id}`,
          intent: 'AUDIT_INVOICE',
          timestamp: auditReport.timestamp,
          status: overallRisk === 'CRITICAL' ? 'rejected' : 'success',
          provider,
          confidence: auditReport.confidence,
          action: `تدقيق فاتورة (${draft.invoiceNumber || 'بدون رقم'}) - مستوى الخطر: ${overallRisk} (${findings.length} ملاحظات)`,
          confirmed: false,
          relatedEntityId: draft.id,
        });
      }
    } catch (logErr) {
      console.warn('Failed to record AI audit log entry:', logErr);
    }

    return auditReport;
  }
}

export const invoiceAuditEngine = new InvoiceAuditEngineService();
