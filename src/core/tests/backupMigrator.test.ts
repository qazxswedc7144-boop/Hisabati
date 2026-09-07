import {
  getBackupSchemaVersion,
  migrateBackupV1ToV2,
  migrateBackupV2ToV3,
  migrateBackupPayload,
} from '../services/backup/backup-migrator';
import {
  DATABASE_SCHEMA_VERSION,
  BACKUP_SCHEMA_VERSION,
  FINANCIAL_FORMAT_VERSION,
} from '../database/schemaVersion';
import { backupService } from '../services/backup.service';

export interface TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class BackupMigratorTestSuite {
  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: TestResult[];
  }> {
    const results: TestResult[] = [];

    // Helper fixture generator
    const createMockPayload = (metadataOverrides: Record<string, any> = {}) => ({
      metadata: {
        backupSchemaVersion: undefined as number | undefined,
        databaseSchemaVersion: undefined as number | undefined,
        financialFormatVersion: undefined as number | undefined,
        schemaVersion: undefined as number | undefined,
        appVersion: '1.0.0',
        backupId: 'backup_test_123',
        deviceId: 'dev_test_123',
        deviceName: 'Test Phone',
        createdAt: '2026-01-01T00:00:00.000Z',
        accountCount: 2,
        transactionCount: 2,
        totalDebitSum: 1500,
        totalCreditSum: 500,
        integrityHash: 'test_hash',
        ...metadataOverrides,
      },
      accounts: [
        { id: 'acc_1', name: 'عميل أ', balance: 1000, type: 'customer', currency: 'SAR', createdAt: '2026-01-01' },
        { id: 'acc_2', name: 'مورد ب', balance: -500, type: 'supplier', currency: 'SAR', createdAt: '2026-01-01' },
      ],
      transactions: [
        { id: 'trx_1', accountId: 'acc_1', amount: 1000, type: 'debit', date: '2026-01-01', createdAt: '2026-01-01' },
        { id: 'trx_2', accountId: 'acc_2', amount: 500, type: 'credit', date: '2026-01-01', createdAt: '2026-01-01' },
      ],
      settings: [
        { key: 'currency', value: 'SAR' },
        { key: 'theme', value: 'light' },
      ],
    });

    // 1. Missing version treated as V1
    await this.runTest(
      results,
      'MIG-01',
      'معاملة النسخة عديمة الإصدار كـ V1 افتراضياً',
      async () => {
        const v = getBackupSchemaVersion({});
        if (v !== 1) throw new Error(`Expected 1, got ${v}`);

        const vNull = getBackupSchemaVersion(null);
        if (vNull !== 1) throw new Error(`Expected 1 for null metadata, got ${vNull}`);
      }
    );

    // 2. Legacy schemaVersion supported
    await this.runTest(
      results,
      'MIG-02',
      'دعم واستخراج schemaVersion القديم (Legacy Version Extraction)',
      async () => {
        const v1 = getBackupSchemaVersion({ schemaVersion: 1 });
        if (v1 !== 1) throw new Error(`Expected 1, got ${v1}`);

        const v2 = getBackupSchemaVersion({ schemaVersion: 2 });
        if (v2 !== 2) throw new Error(`Expected 2, got ${v2}`);

        const modern = getBackupSchemaVersion({ backupSchemaVersion: 3, schemaVersion: 2 });
        if (modern !== 3) throw new Error(`Modern backupSchemaVersion should take precedence, got ${modern}`);
      }
    );

    // 3. V1 → V3 Migration
    await this.runTest(
      results,
      'MIG-03',
      'ترحيل نسخة V1 إلى V3 مع ضبط ثوابت المخطط والمستند المالي',
      async () => {
        const p1 = createMockPayload({ schemaVersion: 1 });
        const migrated = await migrateBackupPayload(p1);

        if (migrated.metadata.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) {
          throw new Error(`Expected backupSchemaVersion=${BACKUP_SCHEMA_VERSION}, got ${migrated.metadata.backupSchemaVersion}`);
        }
        if (migrated.metadata.databaseSchemaVersion !== DATABASE_SCHEMA_VERSION) {
          throw new Error(`Expected databaseSchemaVersion=${DATABASE_SCHEMA_VERSION}, got ${migrated.metadata.databaseSchemaVersion}`);
        }
        if (migrated.metadata.financialFormatVersion !== FINANCIAL_FORMAT_VERSION) {
          throw new Error(`Expected financialFormatVersion=${FINANCIAL_FORMAT_VERSION}, got ${migrated.metadata.financialFormatVersion}`);
        }
        if (migrated.metadata.schemaVersion !== BACKUP_SCHEMA_VERSION) {
          throw new Error(`Expected legacy schemaVersion=${BACKUP_SCHEMA_VERSION}, got ${migrated.metadata.schemaVersion}`);
        }
      }
    );

    // 4. V2 → V3 Migration
    await this.runTest(
      results,
      'MIG-04',
      'ترحيل نسخة V2 إلى V3 بنجاح وتعيين القيم الافتراضية',
      async () => {
        const p2 = createMockPayload({ schemaVersion: 2 });
        const migrated = await migrateBackupPayload(p2);

        if (migrated.metadata.backupSchemaVersion !== 3) {
          throw new Error(`Expected backupSchemaVersion=3, got ${migrated.metadata.backupSchemaVersion}`);
        }
        if (migrated.metadata.databaseSchemaVersion !== 6) {
          throw new Error(`Expected databaseSchemaVersion=6, got ${migrated.metadata.databaseSchemaVersion}`);
        }
        if (migrated.metadata.financialFormatVersion !== 1) {
          throw new Error(`Expected financialFormatVersion=1, got ${migrated.metadata.financialFormatVersion}`);
        }
      }
    );

    // 5. V3 → V3 Idempotent Pass-through
    await this.runTest(
      results,
      'MIG-05',
      'توافق النسخة الحالية V3 مع نفسها دون تشويه أي حقول',
      async () => {
        const p3 = createMockPayload({
          backupSchemaVersion: 3,
          databaseSchemaVersion: 6,
          financialFormatVersion: 1,
          schemaVersion: 3,
        });
        const migrated = await migrateBackupPayload(p3);

        if (migrated.metadata.backupSchemaVersion !== 3) {
          throw new Error(`Expected backupSchemaVersion=3, got ${migrated.metadata.backupSchemaVersion}`);
        }
      }
    );

    // 6. Future V4 and V99 Rejection
    await this.runTest(
      results,
      'MIG-06',
      'رفض النسخ المستقبلية V4 أو V99 فورياً وحماية البيانات من الرجوع للخلف',
      async () => {
        const futurePayload4 = createMockPayload({ backupSchemaVersion: 4 });
        let rejected4 = false;
        try {
          await migrateBackupPayload(futurePayload4);
        } catch (err: any) {
          if (err.message.includes('newer than the supported version')) {
            rejected4 = true;
          }
        }
        if (!rejected4) throw new Error('Failed to reject future schema version 4');

        const futurePayload99 = createMockPayload({ backupSchemaVersion: 99 });
        let rejected99 = false;
        try {
          await migrateBackupPayload(futurePayload99);
        } catch (err: any) {
          if (err.message.includes('newer than the supported version')) {
            rejected99 = true;
          }
        }
        if (!rejected99) throw new Error('Failed to reject future schema version 99');
      }
    );

    // 7. Immutability: Original payload is not mutated
    await this.runTest(
      results,
      'MIG-07',
      'عدم تعديل كائن الـ Payload الأصلي (Immutability / Zero Mutation)',
      async () => {
        const original = createMockPayload({ schemaVersion: 1 });
        const originalCopy = JSON.parse(JSON.stringify(original));

        await migrateBackupPayload(original);

        if (original.metadata.backupSchemaVersion !== undefined) {
          throw new Error('Original payload was mutated: backupSchemaVersion was attached');
        }
        if (JSON.stringify(original) !== JSON.stringify(originalCopy)) {
          throw new Error('Original payload was unexpectedly modified during migration');
        }
      }
    );

    // 8. Financial and Entity Invariance: Accounts, Transactions, Settings, Amounts unchanged
    await this.runTest(
      results,
      'MIG-08',
      'الحفاظ التام على الحسابات، المعاملات، الإعدادات والمبالغ دون أدنى تغيير',
      async () => {
        const original = createMockPayload({ schemaVersion: 1 });
        const migrated = await migrateBackupPayload(original);

        if (JSON.stringify(migrated.accounts) !== JSON.stringify(original.accounts)) {
          throw new Error('Accounts array was altered during migration');
        }
        if (JSON.stringify(migrated.transactions) !== JSON.stringify(original.transactions)) {
          throw new Error('Transactions array was altered during migration');
        }
        if (JSON.stringify(migrated.settings) !== JSON.stringify(original.settings)) {
          throw new Error('Settings array was altered during migration');
        }

        // Validate exact amounts remain unchanged
        if (migrated.transactions[0].amount !== 1000 || migrated.transactions[1].amount !== 500) {
          throw new Error('Financial amounts in transactions were modified!');
        }
        if (migrated.accounts[0].balance !== 1000 || migrated.accounts[1].balance !== -500) {
          throw new Error('Account balances were modified!');
        }
      }
    );

    // 9. Integration with restoreFromPayload: Future Version Rejected Before DB Mutation
    await this.runTest(
      results,
      'MIG-09',
      'تكامل restoreFromPayload ورفض النسخة المستقبلية قبل لمس قاعدة البيانات',
      async () => {
        const futurePayload = createMockPayload({ backupSchemaVersion: 99 });
        let threw = false;
        try {
          await backupService.restoreFromPayload(futurePayload);
        } catch (err: any) {
          if (err.message.includes('newer than the supported version')) {
            threw = true;
          }
        }
        if (!threw) {
          throw new Error('restoreFromPayload failed to block future payload at version gate');
        }
      }
    );

    const passedCount = results.filter((r) => r.passed).length;
    const failedCount = results.filter((r) => !r.passed).length;

    return {
      passedCount,
      failedCount,
      totalCount: results.length,
      results,
    };
  }

  private static async runTest(
    results: TestResult[],
    id: string,
    nameAr: string,
    fn: () => Promise<void>
  ): Promise<void> {
    const start = performance.now();
    try {
      await fn();
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        nameAr,
        passed: true,
        message: 'نجح الاختبار بنجاح وبدقة متطابقة 100%',
        durationMs,
      });
    } catch (err: any) {
      const durationMs = Math.round(performance.now() - start);
      results.push({
        id,
        nameAr,
        passed: false,
        message: err?.message || 'فشل الاختبار',
        durationMs,
      });
    }
  }
}
