import 'fake-indexeddb/auto';
import { tenantDbManager } from '../database/TenantDatabaseManager';
import { getDb } from '../database/db';
import { reminderService } from '../services/messaging/reminder.service';

async function runPerformanceTestTH() {
  console.log('--- [T-H] Performance Scan Test ---');
  await tenantDbManager.openTenantDatabase('perf_test_org');
  const db = getDb();
  
  await db.accounts.clear();
  await db.debts.clear();

  const accCount = 500;
  const debtsPerAcc = 2;
  
  console.log(`Seeding ${accCount} accounts and ${accCount * debtsPerAcc} debts...`);
  
  const accs = [];
  const debts = [];
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  for (let i = 0; i < accCount; i++) {
    const id = `acc_perf_${i}`;
    accs.push({
      id,
      name: `Customer ${i}`,
      currentBalance: 100,
      currentBalanceMinor: 10000,
      archived: false,
      createdAt: now,
      updatedAt: now,
      transactionCount: 0
    });
    for (let j = 0; j < debtsPerAcc; j++) {
      debts.push({
        id: `debt_perf_${i}_${j}`,
        accountId: id,
        amountMinor: 5000,
        paidMinor: 0,
        remainingMinor: 5000,
        dueDate: todayStr,
        status: 'open',
        createdAt: now,
        updatedAt: now
      });
    }
  }

  await db.accounts.bulkAdd(accs);
  await db.debts.bulkAdd(debts);

  console.log('Starting scan...');
  const t0 = performance.now();
  const result = await reminderService.getDueDebtAlerts(7);
  const t1 = performance.now();
  
  const duration = t1 - t0;
  console.log(`Scan complete.`);
  console.log(`performance.now() before: ${t0}`);
  console.log(`performance.now() after: ${t1}`);
  console.log(`Resulting duration: ${duration.toFixed(2)}ms`);
  console.log(`Alerts generated: ${result.alerts.length}`);
  
  if (duration < 300) {
    console.log('✅ Performance check PASSED (< 300ms for 1000 items)');
  } else {
    console.log('❌ Performance check FAILED (> 300ms)');
  }
  
  process.exit(0);
}

runPerformanceTestTH().catch(err => {
  console.error(err);
  process.exit(1);
});
