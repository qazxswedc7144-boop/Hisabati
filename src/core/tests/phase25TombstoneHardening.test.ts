/**
 * Phase 2.5 Permanent Tombstone Hardening Test Suite.
 * Validates permanent delete markers, long-offline reconnections (70 days, 365 days), and backup restore safety.
 */

import { syncEngine } from '../services/syncEngine.service';
import { googleDriveService } from '../services/googleDrive.service';
import { transactionEngine } from '../services/transactionEngine.service';
import { accountRepository } from '../repositories/account.repository';
import { backupService } from '../services/backup.service';
import { db } from '../database/db';

export interface Phase25TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class Phase25TombstoneHardeningTestSuite {
  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: Phase25TestResult[];
  }> {
    const results: Phase25TestResult[] = [];

    const runTest = async (id: string, nameAr: string, testFn: () => Promise<void>) => {
      const start = Date.now();
      try {
        await db.transactions.clear();
        await db.accounts.clear();
        await db.syncQueue.clear();
        await db.syncAuditLogs.clear();
        await db.settings.delete('hisabati_permanent_tombstones');

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
            id: 'file_cloud_sync_25',
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
        return { id: 'file_cloud_sync_25', name };
      };
      googleDriveService.updateJsonFile = async (id: string, name: string, content: any) => {
        inMemoryCloudFile = JSON.parse(JSON.stringify(content));
        return { id, name };
      };
    };

    setupMocks();

    try {
      // Test 1: Day 70 Reconnect (Exceeding 60 days sliding window)
      await runTest(
        'P25-01',
        'منع إحياء المعاملة المحذوفة بعد 70 يوماً من الانقطاع (Permanent Tombstone 70 Days)',
        async () => {
          inMemoryCloudFile = null;
          const acc = await accountRepository.create({ name: 'حساب 70' });
          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 1500,
            date: '2026-01-01',
            operationId: 'op_70_days',
          });

          // Sync to cloud
          await syncEngine.performFullSync();

          // Delete transaction
          await transactionEngine.deleteTransaction(trx.id);

          // Simulate long offline period by artificially aging the permanent tombstone to 70 days ago
          const entry = await db.settings.get('hisabati_permanent_tombstones');
          if (entry && Array.isArray(entry.value)) {
            const oldDate = new Date(Date.now() - 70 * 86400000).toISOString();
            entry.value.forEach((t: any) => {
              t.deletedAt = oldDate;
            });
            await db.settings.put(entry);
          }

          // Reconnect and sync
          await syncEngine.performFullSync();

          const resurrected = await db.transactions.get(trx.id);
          if (resurrected) {
            throw new Error('خطأ حرج: عادت المعاملة للحياة بعد 70 يوماً!');
          }
        }
      );

      // Test 2: Day 365 Reconnect (1 Year Offline)
      await runTest(
        'P25-02',
        'منع إحياء المعاملة المحذوفة بعد 365 يوماً من الانقطاع (Permanent Tombstone 365 Days)',
        async () => {
          inMemoryCloudFile = null;
          const acc = await accountRepository.create({ name: 'حساب 365' });
          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'credit',
            amount: 2500,
            date: '2025-01-01',
            operationId: 'op_365_days',
          });

          await syncEngine.performFullSync();
          await transactionEngine.deleteTransaction(trx.id);

          const entry = await db.settings.get('hisabati_permanent_tombstones');
          if (entry && Array.isArray(entry.value)) {
            const ancientDate = new Date(Date.now() - 365 * 86400000).toISOString();
            entry.value.forEach((t: any) => {
              t.deletedAt = ancientDate;
            });
            await db.settings.put(entry);
          }

          await syncEngine.performFullSync();

          const resurrected = await db.transactions.get(trx.id);
          if (resurrected) {
            throw new Error('خطأ حرج: عادت المعاملة للحياة بعد سنة كاملة!');
          }
        }
      );

      // Test 3: Scenario E - Restore old backup containing deleted transaction, then sync/reconnect
      await runTest(
        'P25-03',
        'منع الإحياء عند استعادة نسخة احتياطية قديمة تحتوي على المعاملة المحذوفة ثم المزامنة (Backup Restore Safety)',
        async () => {
          inMemoryCloudFile = null;
          const acc = await accountRepository.create({ name: 'حساب النسخة' });
          const trx = await transactionEngine.createTransaction({
            accountId: acc.id,
            type: 'debit',
            amount: 3000,
            date: '2026-05-01',
            operationId: 'op_backup_res',
          });

          // Create backup before deletion
          const backupPayload = await backupService.generateBackupPayload();

          // Delete transaction (records permanent tombstone)
          await transactionEngine.deleteTransaction(trx.id);

          // Now restore the old backup (which contains trx)
          await backupService.restoreFromPayload(backupPayload, 'replace');

          // Reconnect to Cloud / Sync
          await syncEngine.performFullSync();

          const resurrected = await db.transactions.get(trx.id);
          if (resurrected) {
            throw new Error('خطأ حرج: عادت المعاملة للحياة بعد استعادة النسخة القديمة والمزامنة!');
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
