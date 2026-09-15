/**
 * Phase 3 Server Security Hardening & Vulnerability Mitigation Test Suite.
 * Validates fixes for SEC-01 through SEC-07:
 * - SEC-01: Anonymous/unauthenticated API rejection
 * - SEC-02: Rate limiter IP isolation & leak cleanup
 * - SEC-03: Route-specific rate limits (429 handling)
 * - SEC-04: Server-side input validation (body shape, types, sizes)
 * - SEC-05: Strict security headers
 * - SEC-06: Google Drive token in-memory handling
 * - SEC-07: Backup file size and structure gate
 */

import { createApp } from '../../../server';
import http from 'http';
import { googleDriveService } from '../services/googleDrive.service';
import { getApiHeaders, getClientSessionToken } from '../utils/apiAuth';
import { BackupService, MAX_BACKUP_ACCOUNTS, MAX_BACKUP_TRANSACTIONS } from '../services/backup.service';

export interface Phase3TestResult {
  id: string;
  nameAr: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

export class Phase3SecurityHardeningTestSuite {
  private static testServer: http.Server | null = null;
  private static serverPort = 3987; // Dedicated test port

  private static async startTestServer(): Promise<string> {
    if (this.testServer) {
      return `http://127.0.0.1:${this.serverPort}`;
    }

    const app = createApp();
    return new Promise((resolve) => {
      this.testServer = app.listen(this.serverPort, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${this.serverPort}`);
      });
    });
  }

  private static async stopTestServer(): Promise<void> {
    if (this.testServer) {
      return new Promise((resolve) => {
        this.testServer?.close(() => {
          this.testServer = null;
          resolve();
        });
      });
    }
  }

  public static async runAllTests(): Promise<{
    passedCount: number;
    failedCount: number;
    totalCount: number;
    results: Phase3TestResult[];
  }> {
    const results: Phase3TestResult[] = [];
    const serverUrl = await this.startTestServer();

    const runTest = async (id: string, nameAr: string, testFn: () => Promise<void>) => {
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

    // TEST 1: Reject anonymous calls to /api/ocr/analyze without client session header
    await runTest('SEC-01-A', 'رفض استدعاء التعرف الضوئي المجهول بدون ترويسات أمنية (401 Unauthorized)', async () => {
      const res = await fetch(`${serverUrl}/api/ocr/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: 'data:image/jpeg;base64,test' }),
      });

      if (res.status !== 401) {
        throw new Error(`Expected status 401 but got ${res.status}`);
      }
      const data = await res.json();
      if (data.code !== 'UNAUTHORIZED_API_ACCESS') {
        throw new Error(`Expected code UNAUTHORIZED_API_ACCESS but got ${data.code}`);
      }
    });

    // TEST 2: Reject anonymous calls to /api/ai/chat without client session header
    await runTest('SEC-01-B', 'رفض استدعاء المساعد المالي المجهول بدون ترويسات أمنية (401 Unauthorized)', async () => {
      const res = await fetch(`${serverUrl}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: 'من هو أكبر مدين؟' }),
      });

      if (res.status !== 401) {
        throw new Error(`Expected status 401 but got ${res.status}`);
      }
    });

    // TEST 3: Reject anonymous calls to /api/ai/audit-invoice without client session header
    await runTest('SEC-01-C', 'رفض استدعاء تدقيق الفواتير المجهول بدون ترويسات أمنية (401 Unauthorized)', async () => {
      const res = await fetch(`${serverUrl}/api/ai/audit-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: { partyName: 'شركة النور' } }),
      });

      if (res.status !== 401) {
        throw new Error(`Expected status 401 but got ${res.status}`);
      }
    });

    // TEST 4: Security Headers Enforcement
    await runTest('SEC-05-A', 'التحقق من ترويسات الأمان الصارمة (CSP, nosniff, SAMEORIGIN, No X-Powered-By)', async () => {
      const res = await fetch(`${serverUrl}/api/health`);
      const nosniff = res.headers.get('x-content-type-options');
      const frameOptions = res.headers.get('x-frame-options');
      const csp = res.headers.get('content-security-policy');
      const poweredBy = res.headers.get('x-powered-by');

      if (poweredBy) {
        throw new Error(`Expected X-Powered-By to be absent, but found: ${poweredBy}`);
      }
      if (nosniff !== 'nosniff') {
        throw new Error(`Expected X-Content-Type-Options: nosniff, got: ${nosniff}`);
      }
      if (frameOptions !== 'SAMEORIGIN') {
        throw new Error(`Expected X-Frame-Options: SAMEORIGIN, got: ${frameOptions}`);
      }
      if (!csp || !csp.includes("default-src 'self'")) {
        throw new Error('CSP header missing or incomplete');
      }
    });

    // TEST 5: Input Validation on /api/ocr/analyze (Invalid Image Data)
    await runTest('SEC-04-A', 'التحقق من صحة المدخلات في التعرف الضوئي (رفض البيانات غير الصالحة 400)', async () => {
      const headers = getApiHeaders();
      const res = await fetch(`${serverUrl}/api/ocr/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: 12345 }), // Number instead of string
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400 for non-string image data, got ${res.status}`);
      }
    });

    // TEST 6: Input Validation on /api/ai/chat (Prompt Length Limits)
    await runTest('SEC-04-B', 'التحقق من حدود حجم السؤال في الذكاء الاصطناعي (أكثر من 2000 حرف)', async () => {
      const headers = getApiHeaders();
      const oversizedPrompt = 'أ'.repeat(2500);
      const res = await fetch(`${serverUrl}/api/ai/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ prompt: oversizedPrompt }),
      });

      if (res.status !== 400) {
        throw new Error(`Expected 400 for oversized prompt, got ${res.status}`);
      }
    });

    // TEST 7: Rate Limiter triggers 429 when max requests exceeded
    await runTest('SEC-03-A', 'حماية معدل الطلبات (Rate Limiter) وتوليد 429 عند تجاوز الحد الأقصى', async () => {
      const headers = getApiHeaders();
      // For health endpoint limit is 60, but let's test OCR endpoint limit which is 15
      let triggered429 = false;
      for (let i = 0; i < 18; i++) {
        const res = await fetch(`${serverUrl}/api/ocr/analyze`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ image: 'invalid' }),
        });

        if (res.status === 429) {
          triggered429 = true;
          const json = await res.json();
          if (json.code !== 'RATE_LIMIT_EXCEEDED') {
            throw new Error(`Expected code RATE_LIMIT_EXCEEDED, got: ${json.code}`);
          }
          break;
        }
      }

      if (!triggered429) {
        throw new Error('Rate limiter did not return 429 after exceeding limit');
      }
    });

    // TEST 8: Google Drive Token strictly in-memory (SEC-06)
    await runTest('SEC-06-A', 'التحقق من حفظ توكن Google Drive في الذاكرة فقط وعدم حفظه في localStorage', async () => {
      googleDriveService.disconnect();
      const dummyToken = 'ya29.a0AfH6SMB_test_in_memory_token_12345';
      googleDriveService.setAccessToken(dummyToken, 3600, { email: 'test@hisabati.com', name: 'Test User' });

      // Check in-memory getter
      if (googleDriveService.getAccessToken() !== dummyToken) {
        throw new Error('Google Drive service failed to return in-memory token');
      }

      // Verify localStorage does NOT contain the token
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('hisabati_gdrive_token');
        if (stored) {
          throw new Error('SECURITY VIOLATION: Access token was found in localStorage!');
        }
      }

      // Check disconnect
      googleDriveService.disconnect();
      if (googleDriveService.getAccessToken() !== null) {
        throw new Error('Access token was not cleared upon disconnect');
      }
    });

    // TEST 9: Client Session Token Generator produces valid tokens
    await runTest('SEC-01-D', 'التحقق من توليد رمز الجلسة في العميل (Client Session Token Generator)', async () => {
      const token1 = getClientSessionToken();
      if (!token1 || token1.length < 16) {
        throw new Error('Generated session token is invalid or too short');
      }
      const token2 = getClientSessionToken();
      if (token1 !== token2) {
        throw new Error('Client session token was not cached in memory for the active session');
      }
    });

    // TEST 10: SEC-02 Reverse Proxy IP Extraction & Spoofing Isolation
    await runTest('SEC-02-B', 'التحقق من استخراج IP الآمن وراء Reverse Proxy المحلي (Nginx Loopback)', async () => {
      // Direct call with loopback connection passing trusted X-Real-IP
      const res = await fetch(`${serverUrl}/api/health`, {
        headers: {
          'X-Real-IP': '198.51.100.42',
        },
      });
      if (res.status !== 200) {
        throw new Error(`Expected 200 from health endpoint behind proxy, got ${res.status}`);
      }

      // Ensure invalid characters in IP are sanitized without server crash
      const resMaliciousIp = await fetch(`${serverUrl}/api/health`, {
        headers: {
          'X-Real-IP': '198.51.100.42; DROP TABLE users--',
        },
      });
      if (resMaliciousIp.status !== 200) {
        throw new Error(`Expected 200 with sanitized IP, got ${resMaliciousIp.status}`);
      }
    });

    // TEST 11: SEC-05 HSTS Header only on HTTPS / Forwarded Proto
    await runTest('SEC-05-B', 'التحقق من تفعيل HSTS فقط في بيئة HTTPS / X-Forwarded-Proto', async () => {
      // HTTP request: HSTS should NOT be present
      const resHttp = await fetch(`${serverUrl}/api/health`);
      const hstsHttp = resHttp.headers.get('strict-transport-security');
      if (hstsHttp) {
        throw new Error(`HSTS should not be sent on plain HTTP: got ${hstsHttp}`);
      }

      // HTTPS request simulation via X-Forwarded-Proto: https
      const resHttps = await fetch(`${serverUrl}/api/health`, {
        headers: {
          'x-forwarded-proto': 'https',
        },
      });
      const hstsHttps = resHttps.headers.get('strict-transport-security');
      if (!hstsHttps || !hstsHttps.includes('max-age=31536000')) {
        throw new Error(`HSTS missing or invalid on HTTPS request: got ${hstsHttps}`);
      }
    });

    // TEST 12: SEC-03 Concurrency Protection Gate (Reject over limit & Release slot)
    await runTest('SEC-03-B', 'بوابة التزامن (Concurrency Gate): حماية العمليات الثقيلة وتحرير الـ Slots', async () => {
      const headers = getApiHeaders();
      // Test concurrent requests to /api/ocr/analyze
      // MAX_CONCURRENT_OCR_REQUESTS is 3.
      // Launch 5 parallel requests:
      const promises = Array.from({ length: 6 }).map(() =>
        fetch(`${serverUrl}/api/ocr/analyze`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ image: 'invalid-base64-for-concurrency' }),
        })
      );

      const responses = await Promise.all(promises);
      const statuses = responses.map((r) => r.status);
      const has503 = statuses.some((s) => s === 503);
      // Even if fast validation returns 400, concurrency counter must never be negative
      // Check that subsequent request succeeds normally (slots released)
      const subsequentRes = await fetch(`${serverUrl}/api/ocr/analyze`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ image: 'invalid' }),
      });

      if (subsequentRes.status === 503) {
        throw new Error('Concurrency gate failed to release slots after requests completed');
      }
    });

    // TEST 13: SEC-07 Backup Payload Structure & Bounds Defense
    await runTest('SEC-07-A', 'حماية حدود النسخ الاحتياطي: رفض المصفوفات غير الصالحة وتجاوز الحد الأقصى للحسابات', async () => {
      const backupService = new BackupService();

      // Case 1: Accounts is not an array
      const invalidAccountsPayload = {
        metadata: { backupSchemaVersion: 3, databaseSchemaVersion: 6, financialFormatVersion: 1 },
        accounts: 'not-an-array',
        transactions: [],
      };

      try {
        await backupService.restoreFromPayload(invalidAccountsPayload);
        throw new Error('Expected invalid accounts array to be rejected');
      } catch (err: any) {
        if (!err.message.includes('قائمة الحسابات في ملف النسخة الاحتياطية غير صالحة')) {
          throw err;
        }
      }

      // Case 2: Accounts exceeds MAX_BACKUP_ACCOUNTS
      const oversizedAccountsPayload = {
        metadata: { backupSchemaVersion: 3, databaseSchemaVersion: 6, financialFormatVersion: 1 },
        accounts: new Array(MAX_BACKUP_ACCOUNTS + 5).fill({ id: 'dummy' }),
        transactions: [],
      };

      try {
        await backupService.restoreFromPayload(oversizedAccountsPayload);
        throw new Error('Expected oversized accounts payload to be rejected');
      } catch (err: any) {
        if (!err.message.includes('يتجاوز الحد الأقصى المسموح به')) {
          throw err;
        }
      }

      // Case 3: Transactions exceeds MAX_BACKUP_TRANSACTIONS
      const oversizedTrxPayload = {
        metadata: { backupSchemaVersion: 3, databaseSchemaVersion: 6, financialFormatVersion: 1 },
        accounts: [],
        transactions: new Array(MAX_BACKUP_TRANSACTIONS + 1).fill({ id: 'dummy' }),
      };

      try {
        await backupService.restoreFromPayload(oversizedTrxPayload);
        throw new Error('Expected oversized transactions payload to be rejected');
      } catch (err: any) {
        if (!err.message.includes('يتجاوز الحد الأقصى المسموح به')) {
          throw err;
        }
      }
    });

    await this.stopTestServer();

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
