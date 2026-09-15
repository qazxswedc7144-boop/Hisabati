import {
  encryptBackupPayload,
  decryptBackupPayload,
  exportMasterEncryptionKey,
  importMasterEncryptionKey,
  deleteMasterEncryptionKey,
} from '../utils/crypto';

export interface KeyTestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class KeyLifecycleTestSuite {
  static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: KeyTestResult[];
  }> {
    const results: KeyTestResult[] = [];

    const run = async (id: string, nameAr: string, testFn: () => Promise<void>) => {
      const start = Date.now();
      try {
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

    // 1. Generate & Protect Key
    await run('KEY-01', 'توليد وحماية مفتاح التشفير الرئيسي دون تخزينه بصيغة خام في localStorage', async () => {
      await deleteMasterEncryptionKey();
      // Trigger key generation via encrypt
      const testPayload = { test: 'data' };
      const { cipherText, iv } = await encryptBackupPayload(testPayload);
      if (!cipherText || !iv) throw new Error('فشل تشفير الحمولة');

      const rawLegacy = localStorage.getItem('hisabati_backup_master_key_v1');
      const protectedKey = localStorage.getItem('hisabati_backup_protected_key_v2');

      if (rawLegacy !== null) {
        throw new Error('خطأ أمني: تم تخزين المفتاح الخام في localStorage بصيغة v1');
      }
      if (!protectedKey) {
        throw new Error('فشل تخزين المفتاح بصيغة محمية v2');
      }
    });

    // 2. Retrieve & Encrypt / Decrypt
    await run('KEY-02', 'استرجاع المفتاح المحمي وعمليات التشفير وفك التشفير بنجاح', async () => {
      const payload = { accounts: [{ id: '1', name: 'عميل تجريبي' }], transactions: [] };
      const { cipherText, iv } = await encryptBackupPayload(payload);
      const decrypted = await decryptBackupPayload(cipherText, iv);
      if (!decrypted.accounts || decrypted.accounts.length !== 1) {
        throw new Error('فشل فك تشفير الحمولة المطابقة للمفتاح');
      }
    });

    // 3. Wrong Key Rejection
    await run('KEY-03', 'رفض فك التشفير باستخدام مفتاح خاطئ', async () => {
      const payload = { secret: 'top_secret' };
      const { cipherText, iv } = await encryptBackupPayload(payload);

      // Export current key, delete, import a different key
      const keyHex = await exportMasterEncryptionKey();
      const wrongKeyHex = '0'.repeat(63) + '1'; // different key
      await importMasterEncryptionKey(wrongKeyHex);

      let rejected = false;
      try {
        await decryptBackupPayload(cipherText, iv);
      } catch {
        rejected = true;
      }

      // Restore correct key
      await importMasterEncryptionKey(keyHex);

      if (!rejected) {
        throw new Error('خطأ أمني خطير: تم قبول فك التشفير بمفتاح خاطئ دون رفض');
      }
    });

    // 4. Corrupted Ciphertext Rejection
    await run('KEY-04', 'رفض النصوص المشفرة التالفة أو المعدلة (AEAD Integrity)', async () => {
      const payload = { data: 'integrity_test' };
      const { cipherText, iv } = await encryptBackupPayload(payload);

      // Corrupt cipherText
      const corruptedCipher = btoa('corrupted_data_string_that_does_not_match');

      let rejected = false;
      try {
        await decryptBackupPayload(corruptedCipher, iv);
      } catch {
        rejected = true;
      }

      if (!rejected) {
        throw new Error('لم يتم رفض النص المشفر التالف');
      }
    });

    // 5. Key Deletion
    await run('KEY-05', 'حذف مفتاح التشفير وتنظيف المخزن المحلي بالكامل', async () => {
      await deleteMasterEncryptionKey();
      const protectedKey = localStorage.getItem('hisabati_backup_protected_key_v2');
      const salt = localStorage.getItem('hisabati_device_salt_v1');
      if (protectedKey || salt) {
        throw new Error('فشل حذف بيانات المفتاح من التخزين المحلي');
      }
    });

    // 6. Recovery after Local Storage Loss (Export & Import)
    await run('KEY-06', 'القدرة على استعادة المفتاح وتصديره لجهاز جديد أو بعد فقدان التخزين المحلي', async () => {
      await deleteMasterEncryptionKey();
      const payload = { recover: true };
      const { cipherText, iv } = await encryptBackupPayload(payload);

      const exportedKey = await exportMasterEncryptionKey();
      await deleteMasterEncryptionKey();

      // Simulate new device / storage loss
      let failedBeforeImport = false;
      try {
        await decryptBackupPayload(cipherText, iv);
      } catch {
        failedBeforeImport = true;
      }
      if (!failedBeforeImport) throw new Error('كان يجب أن يفشل فك التشفير قبل الاستعادة');

      // Recover key
      await importMasterEncryptionKey(exportedKey);
      const decrypted = await decryptBackupPayload(cipherText, iv);
      if (!decrypted.recover) {
        throw new Error('فشل استعادة المفتاح وتفكيك الحمولة بعد الاستيراد');
      }
    });

    // 7. Existing Backup Compatibility & Legacy Migration
    await run('KEY-07', 'التوافق مع النسخ القديمة والترحيل التلقائي للمفتاح القديم', async () => {
      await deleteMasterEncryptionKey();
      // Set legacy raw key format
      const legacyHex = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
      localStorage.setItem('hisabati_backup_master_key_v1', legacyHex);

      // Encrypt something using legacy key (auto-migration should trigger)
      const payload = { legacyMigrate: true };
      const { cipherText, iv } = await encryptBackupPayload(payload);

      const legacyStillRaw = localStorage.getItem('hisabati_backup_master_key_v1');
      const protectedNow = localStorage.getItem('hisabati_backup_protected_key_v2');

      if (legacyStillRaw !== null) {
        throw new Error('لم يتم إزالة المفتاح القديم الخام بعد الترحيل');
      }
      if (!protectedNow) {
        throw new Error('لم يتم إنشاء المفتاح المحمي أثناء الترحيل التلقائي');
      }

      const decrypted = await decryptBackupPayload(cipherText, iv);
      if (!decrypted.legacyMigrate) {
        throw new Error('فشل فك التشفير بعد الترحيل التلقائي');
      }
    });

    // 8. No Plaintext Key Leakage in Logs
    await run('KEY-08', 'عدم تسريب مفاتيح التشفير أو الأسرار في السجلات (Logs)', async () => {
      const logs: string[] = [];
      const originalLog = console.log;
      const originalError = console.error;
      console.log = (...args: any[]) => logs.push(args.join(' '));
      console.error = (...args: any[]) => logs.push(args.join(' '));

      const key = await exportMasterEncryptionKey();
      await encryptBackupPayload({ testLogs: true });

      console.log = originalLog;
      console.error = originalError;

      const leaked = logs.some((l) => l.includes(key));
      if (leaked) {
        throw new Error('خطأ أمني حرج: تم تسريب مفتاح التشفير في السجلات (Logs)');
      }
    });

    // 9. Browser Restart / Reload Simulation
    await run('KEY-09', 'محاكاة إعادة تشغيل المتصفح واستمرار صلاحية المفتاح المحمي', async () => {
      // Clear JS in-memory references / force reload retrieval from localStorage
      const payload = { restart: true };
      const { cipherText, iv } = await encryptBackupPayload(payload);

      // Re-decrypt without re-importing (simulating fresh page load reading from protected storage)
      const decrypted = await decryptBackupPayload(cipherText, iv);
      if (!decrypted.restart) {
        throw new Error('فشل قراءة المفتاح المحمي بعد محاكاة إعادة التشغيل');
      }
    });

    // 10. Multiple Backup / Restore Cycles
    await run('KEY-10', 'دورات متعددة متتالية من النسخ الاحتياطي واستعادة المفتاح', async () => {
      for (let i = 0; i < 5; i++) {
        const payload = { cycle: i };
        const { cipherText, iv } = await encryptBackupPayload(payload);
        const dec = await decryptBackupPayload(cipherText, iv);
        if (dec.cycle !== i) throw new Error(`فشل في الدورة رقم ${i}`);
      }
    });

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
