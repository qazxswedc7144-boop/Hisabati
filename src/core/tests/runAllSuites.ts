import 'fake-indexeddb/auto';
import { runFinancialEngineTests } from './transactionEngine.test';
import { ReportsTestSuite } from './reports.test';
import { CloudSyncTestSuite } from './cloudSync.test';
import { MessagingTestSuite } from './messaging.test';
import { AITestSuite } from './ai.test';
import { OCRTestSuite } from './ocr.test';
import { RBACTestSuite } from './rbac.test';
import { runBITests } from './bi.test';

async function main() {
  console.log('====================================================');
  console.log('🚀 Running Complete Hisabati Multi-Phase Test Suites');
  console.log('====================================================\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalCount = 0;

  // 1. Phase 2: Financial Engine Tests
  console.log('--- [Phase 2] Financial Engine & Integrity Tests ---');
  try {
    const p2 = await runFinancialEngineTests();
    console.log(`Phase 2 Result: Passed ${p2.passed}/${p2.total} (${p2.durationMs}ms)`);
    totalPassed += p2.passed;
    totalFailed += p2.failed;
    totalCount += p2.total;
    if (p2.failed > 0) {
      for (const r of p2.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.title}: ${r.error || r.actual}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 2 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 2. Phase 3: Reports & Export Tests
  console.log('\n--- [Phase 3] Reports, PDF & Excel Tests ---');
  try {
    const p3 = await ReportsTestSuite.runAllTests();
    console.log(`Phase 3 Result: Passed ${p3.passedCount}/${p3.totalCount}`);
    totalPassed += p3.passedCount;
    totalFailed += p3.failedCount;
    totalCount += p3.totalCount;
    if (p3.failedCount > 0) {
      for (const r of p3.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 3 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 3. Phase 4: Cloud Sync & Backup Tests
  console.log('\n--- [Phase 4] Cloud Sync & Backup Tests ---');
  try {
    const p4 = await CloudSyncTestSuite.runAllTests();
    console.log(`Phase 4 Result: Passed ${p4.passedCount}/${p4.totalCount}`);
    totalPassed += p4.passedCount;
    totalFailed += p4.failedCount;
    totalCount += p4.totalCount;
    if (p4.failedCount > 0) {
      for (const r of p4.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 4 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 4. Phase 5: Messaging & Notifications Tests
  console.log('\n--- [Phase 5] Messaging, WhatsApp & Notifications Tests ---');
  try {
    const p5 = await MessagingTestSuite.runAllTests();
    console.log(`Phase 5 Result: Passed ${p5.passedCount}/${p5.totalCount}`);
    totalPassed += p5.passedCount;
    totalFailed += p5.failedCount;
    totalCount += p5.totalCount;
    if (p5.failedCount > 0) {
      for (const r of p5.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 5 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 5. Phase 6: AI Accountant & Natural Language Tests
  console.log('\n--- [Phase 6] AI Accountant & Command Engine Tests ---');
  try {
    const p6 = await AITestSuite.runAllTests();
    console.log(`Phase 6 Result: Passed ${p6.passedCount}/${p6.totalCount}`);
    totalPassed += p6.passedCount;
    totalFailed += p6.failedCount;
    totalCount += p6.totalCount;
    if (p6.failedCount > 0) {
      for (const r of p6.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 6 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 6. Phase 7: OCR & Smart Receipts Tests
  console.log('\n--- [Phase 7] OCR, Smart Receipts & Preprocessing Tests ---');
  try {
    const p7 = await OCRTestSuite.runAll();
    console.log(`Phase 7 Result: Passed ${p7.passed}/${p7.total} (${Math.round(p7.durationMs)}ms)`);
    totalPassed += p7.passed;
    totalFailed += p7.failed;
    totalCount += p7.total;
    if (p7.failed > 0) {
      for (const r of p7.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 7 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 7. Phase 8: Teams, RBAC & Immutable Audit Trail Tests
  console.log('\n--- [Phase 8] Teams, Roles (RBAC) & Audit Trail Tests ---');
  try {
    const p8 = await RBACTestSuite.runAll();
    console.log(`Phase 8 Result: Passed ${p8.passed}/${p8.total} (${Math.round(p8.durationMs)}ms)`);
    totalPassed += p8.passed;
    totalFailed += p8.failed;
    totalCount += p8.total;
    if (p8.failed > 0) {
      for (const r of p8.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 8 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 8. Phase 9: Business Intelligence & Financial Health Tests
  console.log('\n--- [Phase 9] Business Intelligence & Financial Health Tests ---');
  try {
    const p9 = await runBITests();
    console.log(`Phase 9 Result: Passed ${p9.passed}/${p9.passed + p9.failed}`);
    totalPassed += p9.passed;
    totalFailed += p9.failed;
    totalCount += p9.passed + p9.failed;
    if (p9.failed > 0) {
      for (const err of p9.errors) {
        console.error(`  ❌ ${err}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 9 crashed:', err);
    totalFailed++;
    totalCount++;
  }

  console.log('\n====================================================');
  console.log(`🎉 GRAND TOTAL: ${totalPassed}/${totalCount} tests PASSED`);
  if (totalFailed > 0) {
    console.error(`⚠️ FAILED: ${totalFailed} tests`);
    process.exit(1);
  } else {
    console.log('✅ ALL TEST SUITES GREEN & VALIDATED!');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
