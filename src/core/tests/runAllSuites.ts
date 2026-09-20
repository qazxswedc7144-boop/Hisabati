import 'fake-indexeddb/auto';
import { runFinancialEngineTests } from './transactionEngine.test';
import { ReportsTestSuite } from './reports.test';
import { CloudSyncTestSuite } from './cloudSync.test';
import { BackupMigratorTestSuite } from './backupMigrator.test';
import { RestoreHardeningTestSuite } from './restoreHardening.test';
import { MessagingTestSuite } from './messaging.test';
import { AITestSuite } from './ai.test';
import { OCRTestSuite } from './ocr.test';
import { RBACTestSuite } from './rbac.test';
import { runBITests } from './bi.test';
import { MoneyTestSuite } from './money.test';
import { DualRepresentationTestSuite } from './dualRepresentation.test';
import { FinancialIntegrationTestSuite } from './financialIntegration.test';
import { SettingsTestSuite } from './settings.test';
import { KeyLifecycleTestSuite } from './keyLifecycle.test';
import { Phase24SyncHardeningTestSuite } from './phase24SyncHardening.test';
import { Phase25TombstoneHardeningTestSuite } from './phase25TombstoneHardening.test';
import { Phase3SecurityHardeningTestSuite } from './phase3SecurityHardening.test';
import { NavigationConsistencyTestSuite } from './navigationConsistency.test';
import { SecurityP0TestSuite } from './securityP0.test';
import { FirebaseAuthP11TestSuite } from './firebaseAuthP11.test';
import { FirebaseMembershipP12TestSuite } from './firebaseMembershipP12.test';
import { runPhaseP13Tests } from './mobileUxP13.test';
import { FinancialCoreHardeningTestSuite } from './financialCoreHardening.test';
import { FinancialAuditPart2TestSuite } from './financialAuditPart2.test';
import { FinancialHardeningPart3TestSuite } from './financialHardeningPart3.test';
import { SyncHardeningPart1TestSuite } from './syncHardeningPart1.test';
import { tenantService } from '../services/TenantService';

async function main() {
  console.log('====================================================');
  console.log('🚀 Running Complete Hisabati Multi-Phase Test Suites');
  console.log('====================================================\n');

  try {
    await tenantService.switchToLocalMode();
  } catch (e) {
    console.warn('Failed to initialize local tenant mode', e);
  }

  // P0 Fix: Initialize default system currency to prevent regressions in legacy tests
  // that rely on silent fallbacks (which we have now removed for security).
  try {
    const { db } = await import('../database/db');
    await db.settings.put({
      id: 'currency',
      key: 'currency',
      value: 'YER',
      updatedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Failed to initialize test currency', e);
  }

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

  // Phase 4.1: Backup Migrator Tests
  console.log('\n--- [Phase 4.1] Backup Migrator & Schema Version Tests ---');
  try {
    const pMig = await BackupMigratorTestSuite.runAllTests();
    console.log(`Backup Migrator Result: Passed ${pMig.passedCount}/${pMig.totalCount}`);
    totalPassed += pMig.passedCount;
    totalFailed += pMig.failedCount;
    totalCount += pMig.totalCount;
    if (pMig.failedCount > 0) {
      for (const r of pMig.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Backup Migrator crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // Phase 4.2: Restore Security Hardening Tests
  console.log('\n--- [Phase 4.2] Restore Security Hardening Tests ---');
  try {
    const pRes = await RestoreHardeningTestSuite.runAllTests();
    console.log(`Restore Hardening Result: Passed ${pRes.passedCount}/${pRes.totalCount}`);
    totalPassed += pRes.passedCount;
    totalFailed += pRes.failedCount;
    totalCount += pRes.totalCount;
    if (pRes.failedCount > 0) {
      for (const r of pRes.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Restore Hardening crashed:', err);
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

  // 9. Phase B: Financial Money Model Foundation (Part 1)
  console.log('\n--- [Phase B: Part 1] Financial Money Model Foundation (Minor Units) Tests ---');
  try {
    const pMoney = await MoneyTestSuite.runAllTests();
    console.log(`Phase B Money Result: Passed ${pMoney.passedCount}/${pMoney.totalCount}`);
    totalPassed += pMoney.passedCount;
    totalFailed += pMoney.failedCount;
    totalCount += pMoney.totalCount;
    if (pMoney.failedCount > 0) {
      for (const r of pMoney.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase B Money Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 10. Phase B Part 2: Dual Representation & Canonical Write Path Tests
  console.log('\n--- [Phase B: Part 2] Dual Representation & Write Path Tests ---');
  try {
    const pDual = await DualRepresentationTestSuite.runAllTests();
    console.log(`Phase B Dual Rep Result: Passed ${pDual.passedCount}/${pDual.totalCount}`);
    totalPassed += pDual.passedCount;
    totalFailed += pDual.failedCount;
    totalCount += pDual.totalCount;
    if (pDual.failedCount > 0) {
      for (const r of pDual.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase B Dual Representation Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 11. Phase B Part 3: Minor Units Final Integration Tests (FIN-01 to FIN-20)
  console.log('\n--- [Phase B: Part 3] Minor Units Final Integration Tests (FIN-01 to FIN-20) ---');
  try {
    const pFin = await FinancialIntegrationTestSuite.runAllTests();
    console.log(`Phase B Final Integration Result: Passed ${pFin.passedCount}/${pFin.totalCount}`);
    totalPassed += pFin.passedCount;
    totalFailed += pFin.failedCount;
    totalCount += pFin.totalCount;
    if (pFin.failedCount > 0) {
      for (const r of pFin.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase B Final Integration Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 12. Phase F Part 1: Settings Architecture & Financial Invariants Tests (SETTINGS-01 to SETTINGS-10)
  console.log('\n--- [Phase F: Part 1] Settings Architecture, Profile & Currency Tests ---');
  try {
    const pSet = await SettingsTestSuite.runAll();
    console.log(`Phase F Part 1 Settings Result: Passed ${pSet.passedCount}/${pSet.totalCount} (${pSet.durationMs}ms)`);
    totalPassed += pSet.passedCount;
    totalFailed += pSet.failedCount;
    totalCount += pSet.totalCount;
    if (pSet.failedCount > 0) {
      for (const r of pSet.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.description}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase F Settings Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 13. Phase 2.1: Key Lifecycle & Security Hardening Tests
  console.log('\n--- [Phase 2.1] Key Lifecycle & Security Hardening Tests ---');
  try {
    const pKey = await KeyLifecycleTestSuite.runAllTests();
    console.log(`Key Lifecycle Result: Passed ${pKey.passedCount}/${pKey.totalCount}`);
    totalPassed += pKey.passedCount;
    totalFailed += pKey.failedCount;
    totalCount += pKey.totalCount;
    if (pKey.failedCount > 0) {
      for (const r of pKey.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Key Lifecycle Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 14. Phase 2.4: Sync Ordering & Long-Offline Safety Tests
  console.log('\n--- [Phase 2.4] Sync Ordering, Clock Drift & Long-Offline Safety Tests ---');
  try {
    const p24 = await Phase24SyncHardeningTestSuite.runAllTests();
    console.log(`Phase 2.4 Sync Hardening Result: Passed ${p24.passedCount}/${p24.totalCount}`);
    totalPassed += p24.passedCount;
    totalFailed += p24.failedCount;
    totalCount += p24.totalCount;
    if (p24.failedCount > 0) {
      for (const r of p24.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 2.4 Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 15. Phase 2.5: Permanent Tombstone Hardening Tests
  console.log('\n--- [Phase 2.5] Permanent Tombstone Hardening Tests ---');
  try {
    const p25 = await Phase25TombstoneHardeningTestSuite.runAllTests();
    console.log(`Phase 2.5 Tombstone Hardening Result: Passed ${p25.passedCount}/${p25.totalCount}`);
    totalPassed += p25.passedCount;
    totalFailed += p25.failedCount;
    totalCount += p25.totalCount;
    if (p25.failedCount > 0) {
      for (const r of p25.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 2.5 Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 16. Phase 3: Server Security & Hardening Tests
  console.log('\n--- [Phase 3] Server Security & Hardening Tests ---');
  try {
    const p3 = await Phase3SecurityHardeningTestSuite.runAllTests();
    console.log(`Phase 3 Server Security Result: Passed ${p3.passedCount}/${p3.totalCount}`);
    totalPassed += p3.passedCount;
    totalFailed += p3.failedCount;
    totalCount += p3.totalCount;
    if (p3.failedCount > 0) {
      for (const r of p3.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Phase 3 Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 17. Responsive Navigation Consistency & Mobile Access Tests
  console.log('\n--- [Navigation] Responsive Consistency & Mobile Access Tests ---');
  try {
    const pNav = await NavigationConsistencyTestSuite.runAllTests();
    console.log(`Navigation Result: Passed ${pNav.passedCount}/${pNav.totalCount}`);
    totalPassed += pNav.passedCount;
    totalFailed += pNav.failedCount;
    totalCount += pNav.totalCount;
    for (const r of pNav.results) {
      if (r.passed) {
        console.log(`  ✓ [${r.id}] ${r.nameAr}`);
      } else {
        console.error(`  ❌ [${r.id}] ${r.nameAr}: ${r.message}`);
      }
    }
  } catch (err: any) {
    console.error('Navigation Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 18. Phase P0: Production Security & Financial Hardening Tests
  console.log('\n--- [Phase P0] Production Security & Financial Hardening Tests ---');
  try {
    const p0 = await SecurityP0TestSuite.runAll();
    console.log(`Phase P0 Result: Passed ${p0.passed}/${p0.total} (${Math.round(p0.durationMs)}ms)`);
    totalPassed += p0.passed;
    totalFailed += p0.failed;
    totalCount += p0.total;
    if (p0.failed > 0) {
      for (const r of p0.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase P0 Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 19. Phase P1.1: Firebase Authentication Foundation Tests
  console.log('\n--- [Phase P1.1] Firebase Authentication Foundation Tests ---');
  try {
    const p11 = await FirebaseAuthP11TestSuite.runAll();
    console.log(`Phase P1.1 Result: Passed ${p11.passed}/${p11.total} (${Math.round(p11.durationMs)}ms)`);
    totalPassed += p11.passed;
    totalFailed += p11.failed;
    totalCount += p11.total;
    if (p11.failed > 0) {
      for (const r of p11.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase P1.1 Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 20. Phase P1.2-B-H: Firebase Identity & Membership Isolation Tests
  console.log('\n--- [Phase P1.2-B-H] Firebase Identity & Membership Isolation Tests ---');
  try {
    const p12 = await FirebaseMembershipP12TestSuite.runAll();
    console.log(`Phase P1.2-B-H Result: Passed ${p12.passed}/${p12.total} (${Math.round(p12.durationMs)}ms)`);
    totalPassed += p12.passed;
    totalFailed += p12.failed;
    totalCount += p12.total;
    if (p12.failed > 0) {
      for (const r of p12.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase P1.2-B-H Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 21. Phase P1.3: Mobile UX, WhatsApp Integration & Biometrics Tests
  console.log('\n--- [Phase P1.3] Mobile UX, WhatsApp & Biometric Security Tests ---');
  try {
    const p13 = await runPhaseP13Tests();
    console.log(`Phase P1.3 Result: Passed ${p13.passedCount}/${p13.totalCount}`);
    totalPassed += p13.passedCount;
    totalFailed += p13.failedCount;
    totalCount += p13.totalCount;
    if (p13.failedCount > 0) {
      for (const r of p13.results.filter((x) => !x.passed)) {
        console.error(`  ❌ [${r.id}] ${r.name}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Phase P1.3 Test Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 22. Phase Financial Core Hardening: Integrity & Amount Safety
  console.log('\n--- [Phase Financial Core Hardening] Integrity & Amount Safety Tests ---');
  try {
    const fch = await FinancialCoreHardeningTestSuite.runAll();
    console.log(`Financial Core Hardening Result: Passed ${fch.passed}/${fch.total}`);
    totalPassed += fch.passed;
    totalFailed += fch.failed;
    totalCount += fch.total;
    if (fch.failed > 0) {
      for (const r of fch.results.filter((x) => !x.passed)) {
        console.error(`  ❌ ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Financial Core Hardening Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 23. Phase 2/3: Audit Logs & Financial Snapshots
  console.log('\n--- [Phase 2/3] Audit Logs, Financial State Snapshots & Tamper Detection ---');
  try {
    const fap2 = await FinancialAuditPart2TestSuite.runAll();
    console.log(`Financial Audit Part 2 Result: Passed ${fap2.passed}/${fap2.total}`);
    totalPassed += fap2.passed;
    totalFailed += fap2.failed;
    totalCount += fap2.total;
    if (fap2.failed > 0) {
      for (const r of fap2.results.filter((x) => !x.passed)) {
        console.error(`  ❌ ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Financial Audit Part 2 Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 24. Phase Financial Core Hardening Part 3: Concurrency, Failure & Recovery
  console.log('\n--- [Phase Financial Core Hardening Part 3] Concurrency, Failure & Recovery Tests ---');
  try {
    const fch3 = await FinancialHardeningPart3TestSuite.runAll();
    console.log(`Financial Core Hardening Part 3 Result: Passed ${fch3.passed}/${fch3.total}`);
    totalPassed += fch3.passed;
    totalFailed += fch3.failed;
    totalCount += fch3.total;
    if (fch3.failed > 0) {
      for (const r of fch3.results.filter((x) => !x.passed)) {
        console.error(`  ❌ ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Financial Core Hardening Part 3 Suite crashed:', err);
    totalFailed++;
    totalCount++;
  }

  // 25. SYNC ENGINE HARDENING — PART 1/3
  console.log('\n--- [SYNC ENGINE HARDENING — PART 1/3] Audit + State Machine + Revision Safety ---');
  try {
    const sync1 = await SyncHardeningPart1TestSuite.runAll();
    console.log(`Sync Hardening Part 1 Result: Passed ${sync1.passed}/${sync1.total}`);
    totalPassed += sync1.passed;
    totalFailed += sync1.total - sync1.passed;
    totalCount += sync1.total;
    if (sync1.total - sync1.passed > 0) {
      for (const r of sync1.results.filter((x: any) => !x.passed)) {
        console.error(`  ❌ ${r.title}: ${r.error}`);
      }
    }
  } catch (err: any) {
    console.error('Sync Hardening Part 1 Suite crashed:', err);
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
