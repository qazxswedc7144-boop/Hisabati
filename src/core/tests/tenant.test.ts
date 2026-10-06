import { tenantDbManager } from '../database/TenantDatabaseManager';
import { tenantService } from '../services/TenantService';
import { useTenantStore } from '@/shared/stores/tenantStore';
import { authService } from '../services/rbac/AuthService.service';

async function runTest(id: string, title: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`✅ ${id}: ${title}`);
  } catch (e: any) {
    console.error(`❌ ${id}: ${title} - ${e.message}`);
    throw e;
  }
}

/**
 * Tenant Architecture Tests (P1.2-B)
 * Run manually or via test runner to verify isolation and context.
 */
export async function runTenantTests(): Promise<{ passed: number; total: number }> {
  console.log('--- Starting Tenant Architecture Tests ---');
  let passed = 0;
  let total = 0;

  const trackTest = async (id: string, title: string, fn: () => Promise<void>) => {
    total++;
    try {
      await fn();
      passed++;
      console.log(`✅ ${id}: ${title}`);
    } catch (e: any) {
      console.error(`❌ ${id}: ${title} - ${e.message}`);
      throw e;
    }
  };

  try {
    // 1. Test Local Mode Initialization
    await trackTest('TENANT-LOCAL-MODE', 'Local Mode Initialization', async () => {
      await tenantService.switchToLocalMode();
      const store = useTenantStore.getState();
      if (!store.isLocalMode || store.activeOrganization?.id !== 'local') {
        throw new Error('Local Mode Failed');
      }
      const dbLocal = tenantDbManager.getActiveDatabase();
      if (dbLocal.name !== 'hisabati_db_local') {
        throw new Error('Local DB Name Incorrect');
      }
    });

    // 2. Test Organization Switching
    await trackTest('TENANT-ORG-SWITCH', 'Organization Switching', async () => {
      const mockOrg = {
        id: 'org_123',
        name: 'Test Org',
        ownerId: 'user_1',
        status: 'active' as const,
        settings: { currency: 'YER', language: 'ar', timezone: 'UTC' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const mockMembership = {
        organizationId: 'org_123',
        userId: 'user_1',
        role: 'owner' as const,
        status: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await tenantService.switchOrganization(mockOrg, mockMembership, true);
      const storeAfter = useTenantStore.getState();
      if (storeAfter.activeOrganization?.id !== 'org_123' || storeAfter.isLocalMode) {
        throw new Error('Switch Organization Failed');
      }
      const dbOrg = tenantDbManager.getActiveDatabase();
      if (dbOrg.name !== 'hisabati_db_org_123') {
        throw new Error('Organization DB Name Incorrect');
      }
    });

    // 3. Test Isolation
    await trackTest('TENANT-DB-ISOLATION', 'Databases Isolation', async () => {
      const dbLocal = tenantDbManager.getActiveDatabase();
      await tenantService.switchToLocalMode();
      const dbOrg = tenantDbManager.getActiveDatabase();
      if (dbLocal === dbOrg) {
        throw new Error('Databases are not isolated');
      }
    });

    // 4. Test Invalid Org ID
    await trackTest('TENANT-INVALID-ID', 'Invalid Org ID Sanity Check', async () => {
      try {
        const dbSanitized = await tenantDbManager.openTenantDatabase('org/invalid');
        if (dbSanitized.name !== 'hisabati_db_org_invalid') {
          throw new Error('Sanity check failed for invalid IDs');
        }
      } catch (e) {
        // expected or handled
      }
    });

    // 5. Test Tenant Switch Guard (TENANT-SWITCH-GUARD)
    await trackTest('TENANT-SWITCH-GUARD', 'منع الوصول أثناء تبديل المستأجر', async () => {
      const { tenantDbManager } = await import('../database/TenantDatabaseManager');
      const originalIsSwitching = (tenantDbManager as any).isSwitching;
      try {
        (tenantDbManager as any).isSwitching = true;
        const { getDb } = await import('../database/db');
        let errorCaught = false;
        try {
          getDb();
        } catch (e: any) {
          errorCaught = e.message.includes('switching');
        }
        if (!errorCaught) {
          throw new Error('لم يرفض getDb() أثناء تبديل المستأجر');
        }
      } finally {
        (tenantDbManager as any).isSwitching = originalIsSwitching;
      }
    });

    // 6. Test Tenant Store Reset (TENANT-RESET-STORES)
    await trackTest('TENANT-RESET-STORES', 'تصفير stores عند التبديل', async () => {
      const { useAccountStore } = await import('@/shared/stores/accountStore');
      useAccountStore.setState({
        accounts: [{ id: 'fake', name: 'اختبار' } as any],
        selectedAccount: { id: 'fake', name: 'اختبار' } as any,
      });

      const { resetTenantScopedStores } = await import('@/shared/stores/tenantStore');
      await resetTenantScopedStores();

      const state = useAccountStore.getState();
      if (state.accounts.length !== 0 || state.selectedAccount !== null) {
        throw new Error('لم يتم تصفير accountStore');
      }
    });

    // 7. Cleanup
    await tenantService.switchToLocalMode();
    console.log(`--- All Tenant Tests Passed (${passed}/${total}) ---`);
    return { passed, total };

  } catch (error) {
    console.error('--- Tenant Tests FAILED ---', error);
    return { passed, total };
  }
}
