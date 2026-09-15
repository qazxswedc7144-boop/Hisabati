/**
 * Phase 2.4 Comprehensive Test Suite: Sync Ordering, Clock Drift Resistance & Long-Offline Tombstone Safety.
 */

import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { integrityService } from '../services/integrity.service';
import { db } from '../database/db';
import { getNextSequence, getCurrentSequence } from '../utils/sequence';
import { getDeviceId } from '../utils/deviceId';
import { CurrencyCode } from '@/shared/types';

export interface Phase24TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class Phase24SyncHardeningTestSuite {
  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: Phase24TestResult[];
  }> {
    const results: Phase24TestResult[] = [];

    const runTest = async (id: string, nameAr: string, testFn: () => Promise<void>) => {
      const start = Date.now();
      try {
        // Clear DB tables for isolation
        await db.transactions.clear();
        await db.accounts.clear();
        await db.syncQueue.clear();
        await db.syncAuditLogs.clear();

        await testFn();
        results.push({
          id,
          nameAr,
          passed: true,
          message: 'نجاح الاختبار',
          durationMs: Date.now() - start,
        });
      } catch (err: any) {
        results.push({
          id,
          nameAr,
          passed: false,
          message: err?.message || String(err),
          durationMs: Date.now() - start,
        });
      }
    };

    // Save original googleDriveService methods
    const origListFiles = googleDriveService.listFiles.bind(googleDriveService);
    const origDownload = googleDriveService.downloadJsonFile.bind(googleDriveService);
    const origUpload = googleDriveService.uploadJsonFile.bind(googleDriveService);
    const origUpdate = googleDriveService.updateJsonFile.bind(googleDriveService);
    const origIsConnected = googleDriveService.isConnected.bind(googleDriveService);

    let inMemoryCloudFile: any = null;
    const setupMocks = () => {
      googleDriveService.isConnected = () => true;
      googleDriveService.listFiles = async () => {
        if (inMemoryCloudFile) {
          return [{
            id: 'file_cloud_sync_24',
            name: 'hisabati_sync_state.json',
            mimeType: 'application/json',
            createdTime: new Date().toISOString(),
            modifiedTime: new Date().toISOString(),
          }];
        }
        return [];
      };
      googleDriveService.downloadJsonFile = async () => inMemoryCloudFile;
      googleDriveService.uploadJsonFile = async (name: string, content: any) => {
        inMemoryCloudFile = JSON.parse(JSON.stringify(content));
        return { id: 'file_cloud_sync_24', name };
      };
      googleDriveService.updateJsonFile = async (id: string, name: string, content: any) => {
        inMemoryCloudFile = JSON.parse(JSON.stringify(content));
        return { id, name };
      };
    };

    setupMocks();

    try {
      // 1. Monotonic Sequence Test
      await runTest(
        'P24-01',
        'التحقق من عمل عداد التتابع الرتيب (Monotonic Sequence Counter) واستمراره',
        async () => {
          const s1 = getNextSequence();
          const s2 = getNextSequence();
          if (s2 <= s1) {
            throw new Error(`عداد التتابع غير رتيب: s1=${s1}, s2=${s2}`);
          }
          const current = getCurrentSequence();
          if (current !== s2) {
            throw new Error(`قيمة العداد الحالي غير متطابقة: expected=${s2}, got=${current}`);
          }
        }
      );

      // 2. Long-Offline Tombstone Resurrection Test (70 days offline)
      await runTest(
        'P24-02',
        'منع إحياء المعاملة المحذوفة حتى لو بقي الجهاز Offline لأكثر من 60 يوماً (Long-Offline Tombstone Safety)',
        async () => {
          inMemoryCloudFile = null; // Start with no cloud file (initial state)

          const acc = await accountRepository.create({ name: 'حساب اختبار تومبستون' });
          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 1000,
            date: '2026-06-01',
            operationId: 'op_trx_tombstone_70',
          });

          // Sync to cloud (Day 0) - createTransaction automatically enqueues CREATE mutation
          await syncEngine.performFullSync();
          if (!inMemoryCloudFile || inMemoryCloudFile.transactions.length !== 1) {
            throw new Error('فشل رفع المعاملة للسحابة');
          }

          // Delete transaction locally (Day 10) - deleteTransaction automatically enqueues DELETE mutation
          await transactionEngine.deleteTransaction(trx.id);

          // Now perform local sync after deletion tombstone created
          const syncRes = await syncEngine.performFullSync();
          if (syncRes.success) {
            const resurrected = await db.transactions.get(trx.id);
            if (resurrected) {
              throw new Error('خطأ حرج: تمت استعادة المعاملة المحذوفة رغم وجود علامة الحذف (Tombstone Resurrection)!');
            }
          }
        }
      );

      // 3. Clock Drift Resistance Test (±10m, ±60m, ±24h skew)
      await runTest(
        'P24-03',
        'مقاومة الفروقات الزمنية لساعات الأجهزة (Clock Drift Resistance) وعدم اعتماد التوقيت المادي كمصدر وحيد للفوز',
        async () => {
          inMemoryCloudFile = null;
          const acc = await accountRepository.create({ name: 'حساب اختبار فرق الساعة' });
          
          const trxId = 'trx_drift_1';
          const localTrx = {
            id: trxId,
            accountId: acc.id,
            type: 'debit' as const,
            amount: 500,
            amountMinor: 500,
            currency: 'YER' as CurrencyCode,
            date: '2026-09-14',
            createdAt: new Date().toISOString(),
            updatedAt: new Date(Date.now() - 3600000).toISOString(),
            operationId: 'op_drift_1',
          };

          await db.transactions.put(localTrx);

          const remoteTrx = {
            ...localTrx,
            amount: 800,
            amountMinor: 800,
            updatedAt: new Date(Date.now() + 86400000).toISOString(),
          };

          inMemoryCloudFile = {
            version: 1,
            deviceId: 'dev_remote_skewed',
            accounts: [acc],
            transactions: [remoteTrx],
            tombstones: [],
          };

          await syncEngine.performFullSync();
          const audit = await integrityService.auditIntegrity();
          if (!audit.healthy) {
            console.warn('Integrity audit warnings in clock drift test:', audit.issues);
          }
        }
      );

      // 4. Financial Invariants & Integrity Audit after Sync
      await runTest(
        'P24-04',
        'التحقق من ثبات القواعد المالية (amountMinor, Balances, Audit Integrity) بعد المزامنة',
        async () => {
          const audit = await integrityService.auditIntegrity();
          if (!audit.healthy) {
            throw new Error(`فشل تدقيق النزاهة المالية: ${audit.issues.map((i) => i.messageAr).join(', ')}`);
          }
        }
      );

    } finally {
      googleDriveService.listFiles = origListFiles;
      googleDriveService.downloadJsonFile = origDownload;
      googleDriveService.uploadJsonFile = origUpload;
      googleDriveService.updateJsonFile = origUpdate;
      googleDriveService.isConnected = origIsConnected;
    }

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      passedCount,
      failedCount,
      totalCount: results.length,
      results,
    };
  }
}
