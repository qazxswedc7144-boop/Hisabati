import Dexie from 'dexie';
import { db } from '../database/db';
import { 
  FinancialAuditEntry, 
  FinancialAuditEventType, 
  AuditActor, 
  AuditChainVerificationResult,
  CurrencyCode
} from '@/shared/types';
import { calculateSHA256 } from '../utils/crypto';
import { authService } from './rbac/AuthService.service';
import { useTenantStore } from '@/shared/stores/tenantStore';

export class FinancialAuditService {
  private static instance: FinancialAuditService;
  private readonly GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

  public static getInstance(): FinancialAuditService {
    if (!FinancialAuditService.instance) {
      FinancialAuditService.instance = new FinancialAuditService();
    }
    return FinancialAuditService.instance;
  }

  /**
   * Deterministically computes the tamper-resistant chained hash of a financial audit entry.
   * Includes all critical financial metadata to prevent attribute tampering.
   */
  public async computeEntryHash(entry: {
    previousHash: string;
    sequenceNumber: number;
    timestamp: string;
    actorId: string;
    eventType: string;
    targetType: string;
    targetId: string;
    amountMinor?: number;
    operationId?: string;
    beforeState?: Record<string, any>;
    afterState?: Record<string, any>;
  }): Promise<string> {
    const canonicalPayload = [
      entry.previousHash,
      entry.sequenceNumber.toString(),
      entry.timestamp,
      entry.actorId,
      entry.eventType,
      entry.targetType,
      entry.targetId,
      entry.amountMinor?.toString() || '0',
      entry.operationId || '',
      entry.beforeState ? JSON.stringify(entry.beforeState) : '',
      entry.afterState ? JSON.stringify(entry.afterState) : '',
    ].join('|');

    return await calculateSHA256(canonicalPayload);
  }

  /**
   * Records a cryptographically chained, immutable financial audit entry.
   * Must be executed within a database transaction alongside the actual operation.
   */
  async logFinancialEvent(params: {
    eventType: FinancialAuditEventType;
    targetType: 'transaction' | 'account' | 'snapshot' | 'system';
    targetId: string;
    amountMinor?: number;
    currency?: CurrencyCode;
    operationId?: string;
    beforeState?: FinancialAuditEntry['beforeState'];
    afterState?: FinancialAuditEntry['afterState'];
    metadata?: Record<string, any>;
    tx?: any; // Dexie transaction instance
  }): Promise<FinancialAuditEntry> {
    const timestamp = new Date().toISOString();
    const actor = authService.getActiveActor();
    const orgId = useTenantStore.getState().activeOrganization?.id || 'local';
    
    // Use the provided transaction if available to ensure atomicity
    const database = params.tx ? params.tx : db;
    
    // Get last entry to maintain the chain
    const lastEntry = await database.table('financialAuditLogs').orderBy('sequenceNumber').last();
    const sequenceNumber = (lastEntry?.sequenceNumber || 0) + 1;
    const previousHash = lastEntry?.hash || this.GENESIS_HASH;

    // Use Dexie.waitFor to ensure the transaction doesn't close during the non-IndexedDB async hash computation
    const hash = await Dexie.waitFor(this.computeEntryHash({
      previousHash,
      sequenceNumber,
      timestamp,
      actorId: actor.id,
      eventType: params.eventType,
      targetType: params.targetType,
      targetId: params.targetId,
      amountMinor: params.amountMinor,
      operationId: params.operationId,
      beforeState: params.beforeState,
      afterState: params.afterState,
    }));

    const entry: FinancialAuditEntry = {
      id: `audit_seq_${sequenceNumber}`,
      sequenceNumber,
      timestamp,
      eventType: params.eventType,
      actor,
      organizationId: orgId,
      operationId: params.operationId,
      targetType: params.targetType,
      targetId: params.targetId,
      amountMinor: params.amountMinor,
      currency: params.currency,
      beforeState: params.beforeState,
      afterState: params.afterState,
      previousHash,
      hash,
      metadata: params.metadata,
    };

    if (params.tx) {
      await params.tx.table('financialAuditLogs').add(entry);
    } else {
      await db.financialAuditLogs.add(entry);
    }
    
    return entry;
  }

  /**
   * Verifies the cryptographic integrity of the entire financial audit chain.
   */
  async verifyChainIntegrity(): Promise<AuditChainVerificationResult> {
    const entries = await db.financialAuditLogs.orderBy('sequenceNumber').toArray();
    const verifiedAt = new Date().toISOString();

    if (entries.length === 0) {
      return {
        isValid: true,
        totalEntries: 0,
        messageAr: 'سجل التدقيق المالي فارغ وجاهز للعمل.',
        verifiedAt,
      };
    }

    let expectedPrevHash = this.GENESIS_HASH;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // 1. Verify Sequence
      if (entry.sequenceNumber !== i + 1) {
        return {
          isValid: false,
          totalEntries: entries.length,
          tamperedEntryId: entry.id,
          messageAr: `فشل في تسلسل السجل المالي: الرقم ${entry.sequenceNumber} لا يطابق الترتيب المتوقع ${i + 1}.`,
          verifiedAt,
        };
      }

      // 2. Verify Link
      if (entry.previousHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalEntries: entries.length,
          tamperedEntryId: entry.id,
          messageAr: `تم رصد تلاعب في ترابط سجل التدقيق المالي عند السجل #${entry.sequenceNumber}.`,
          verifiedAt,
        };
      }

      // 3. Verify Content Hash
      const computedHash = await this.computeEntryHash({
        previousHash: entry.previousHash,
        sequenceNumber: entry.sequenceNumber,
        timestamp: entry.timestamp,
        actorId: entry.actor.id,
        eventType: entry.eventType,
        targetType: entry.targetType,
        targetId: entry.targetId,
        amountMinor: entry.amountMinor,
        operationId: entry.operationId,
        beforeState: entry.beforeState,
        afterState: entry.afterState,
      });

      if (computedHash !== entry.hash) {
        return {
          isValid: false,
          totalEntries: entries.length,
          tamperedEntryId: entry.id,
          messageAr: `تم اكتشاف تلاعب في بيانات السجل المالي رقم #${entry.sequenceNumber} (البصمة الرقمية غير مطابقة).`,
          verifiedAt,
        };
      }

      expectedPrevHash = entry.hash;
    }

    return {
      isValid: true,
      totalEntries: entries.length,
      messageAr: `تم التحقق من سلامة سجل التدقيق المالي بنجاح (${entries.length} سجل موثق).`,
      verifiedAt,
    };
  }
}

export const financialAuditService = FinancialAuditService.getInstance();
