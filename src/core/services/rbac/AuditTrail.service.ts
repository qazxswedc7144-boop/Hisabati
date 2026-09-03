import { db } from '../../database/db';
import {
  AuditTrailEntry,
  AuditActor,
  AuditAction,
  AuditRiskLevel,
  AuditIntegrityVerificationResult,
} from '@/shared/types';
import { calculateSHA256 } from '../../utils/crypto';

export class AuditTrailService {
  private static instance: AuditTrailService;
  private readonly GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

  public static getInstance(): AuditTrailService {
    if (!AuditTrailService.instance) {
      AuditTrailService.instance = new AuditTrailService();
    }
    return AuditTrailService.instance;
  }

  /**
   * Deterministically computes the tamper-resistant chained hash of an audit entry.
   */
  public async computeEntryHash(entry: {
    previousEntryHash: string;
    sequenceNumber: number;
    timestamp: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    detailsAr: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
  }): Promise<string> {
    const canonicalPayload = [
      entry.previousEntryHash,
      entry.sequenceNumber.toString(),
      entry.timestamp,
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId,
      entry.detailsAr,
      entry.beforeState ? JSON.stringify(entry.beforeState) : '',
      entry.afterState ? JSON.stringify(entry.afterState) : '',
    ].join('||');

    return await calculateSHA256(canonicalPayload);
  }

  /**
   * Records a cryptographically chained, immutable audit trail entry.
   */
  async log(params: {
    actor: AuditActor;
    action: AuditAction;
    targetType: 'transaction' | 'account' | 'receipt' | 'team' | 'backup' | 'system' | 'ai';
    targetId: string;
    riskLevel?: AuditRiskLevel;
    detailsAr: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<AuditTrailEntry> {
    const timestamp = new Date().toISOString();
    const id = `audit_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Get the last audit entry to maintain the cryptographic hash chain
    const lastEntry = await db.auditTrail.orderBy('sequenceNumber').last();
    const sequenceNumber = lastEntry ? lastEntry.sequenceNumber + 1 : 1;
    const previousEntryHash = lastEntry ? lastEntry.hash : this.GENESIS_HASH;

    const hash = await this.computeEntryHash({
      previousEntryHash,
      sequenceNumber,
      timestamp,
      actorId: params.actor.id,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      detailsAr: params.detailsAr,
      beforeState: params.beforeState,
      afterState: params.afterState,
    });

    const entry: AuditTrailEntry = {
      id,
      sequenceNumber,
      timestamp,
      actor: {
        id: params.actor.id,
        name: params.actor.name,
        role: params.actor.role,
        email: params.actor.email,
        ipAddress: params.actor.ipAddress,
      },
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      riskLevel: params.riskLevel || 'LOW',
      detailsAr: params.detailsAr,
      beforeState: params.beforeState,
      afterState: params.afterState,
      metadata: params.metadata,
      previousEntryHash,
      hash,
    };

    await db.auditTrail.add(entry);
    return entry;
  }

  /**
   * Verifies the complete cryptographic chain of the audit trail.
   * If any entry was modified, injected, or removed, the verification will pinpoint it.
   */
  async verifyIntegrity(): Promise<AuditIntegrityVerificationResult> {
    const entries = await db.auditTrail.orderBy('sequenceNumber').toArray();
    const verifiedAt = new Date().toISOString();

    if (entries.length === 0) {
      return {
        isValid: true,
        totalEntries: 0,
        messageAr: 'سجل التدقيق فارغ حالياً ومستعد لتسجيل العمليات.',
        verifiedAt,
      };
    }

    let expectedPrevHash = this.GENESIS_HASH;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // 1. Verify sequence order
      if (entry.sequenceNumber !== i + 1) {
        return {
          isValid: false,
          totalEntries: entries.length,
          tamperedEntryId: entry.id,
          tamperedIndex: i,
          messageAr: `فشل التسلسل: السجل رقم ${entry.sequenceNumber} لا يطابق الترتيب المتوقع ${i + 1}.`,
          verifiedAt,
        };
      }

      // 2. Verify link to previous entry
      if (entry.previousEntryHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalEntries: entries.length,
          tamperedEntryId: entry.id,
          tamperedIndex: i,
          messageAr: `تم رصد كسر في السلسلة التشفيرية عند السجل رقم #${entry.sequenceNumber} (المعرف: ${entry.id}).`,
          verifiedAt,
        };
      }

      // 3. Recompute and verify entry hash
      const computedHash = await this.computeEntryHash({
        previousEntryHash: entry.previousEntryHash,
        sequenceNumber: entry.sequenceNumber,
        timestamp: entry.timestamp,
        actorId: entry.actor.id,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        detailsAr: entry.detailsAr,
        beforeState: entry.beforeState,
        afterState: entry.afterState,
      });

      if (computedHash !== entry.hash) {
        return {
          isValid: false,
          totalEntries: entries.length,
          tamperedEntryId: entry.id,
          tamperedIndex: i,
          messageAr: `تم اكتشاف تلاعب في محتويات السجل رقم #${entry.sequenceNumber} (البيانات لا تطابق البصمة الرقمية).`,
          verifiedAt,
        };
      }

      expectedPrevHash = entry.hash;
    }

    return {
      isValid: true,
      totalEntries: entries.length,
      messageAr: `سجل التدقيق الرقابي سليم ومترابط تشفيرياً بنسبة 100% (${entries.length} عملية موثقة ومؤمنة).`,
      verifiedAt,
    };
  }

  /**
   * Retrieves recent audit trail entries with optional pagination.
   */
  async getRecentEntries(limit: number = 100): Promise<AuditTrailEntry[]> {
    return await db.auditTrail
      .orderBy('sequenceNumber')
      .reverse()
      .limit(limit)
      .toArray();
  }

  /**
   * Filter audit entries by criteria.
   */
  async filterEntries(filters: {
    action?: AuditAction;
    targetType?: string;
    targetId?: string;
    actorId?: string;
    riskLevel?: AuditRiskLevel;
  }): Promise<AuditTrailEntry[]> {
    let collection = db.auditTrail.orderBy('sequenceNumber').reverse();

    const all = await collection.toArray();
    return all.filter((entry) => {
      if (filters.action && entry.action !== filters.action) return false;
      if (filters.targetType && entry.targetType !== filters.targetType) return false;
      if (filters.targetId && entry.targetId !== filters.targetId) return false;
      if (filters.actorId && entry.actor.id !== filters.actorId) return false;
      if (filters.riskLevel && entry.riskLevel !== filters.riskLevel) return false;
      return true;
    });
  }
}

export const auditTrailService = AuditTrailService.getInstance();
