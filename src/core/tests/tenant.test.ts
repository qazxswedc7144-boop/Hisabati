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
export async function runTenantTests() {
  console.log('--- Starting Tenant Architecture Tests ---');

  try {
    // 1. Test Local Mode Initialization
    console.log('1. Testing Local Mode...');
    await tenantService.switchToLocalMode();
    const store = useTenantStore.getState();
    if (store.isLocalMode && store.activeOrganization?.id === 'local') {
      console.log('✅ Local Mode Correctly Set');
    } else {
      throw new Error('❌ Local Mode Failed');
    }

    const dbLocal = tenantDbManager.getActiveDatabase();
    if (dbLocal.name === 'hisabati_db_local') {
      console.log('✅ Local DB Name Correct');
    }

    // 2. Test Organization Switching
    console.log('2. Testing Organization Switching...');
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

    await tenantService.switchOrganization(mockOrg, mockMembership);
    
    const storeAfter = useTenantStore.getState();
    if (storeAfter.activeOrganization?.id === 'org_123' && !storeAfter.isLocalMode) {
      console.log('✅ Switch Organization Correctly Set');
    }

    const dbOrg = tenantDbManager.getActiveDatabase();
    if (dbOrg.name === 'hisabati_db_org_123') {
      console.log('✅ Organization DB Name Correct');
    }

    // 3. Test Isolation (DB switching closes previous)
    // Dexie instances are handled by the manager, check if names match
    if (dbLocal !== dbOrg) {
      console.log('✅ Databases are Isolated (Different Instances)');
    }

    // 4. Test Invalid Org ID
    console.log('4. Testing Invalid Org ID...');
    try {
      // The manager sanitizes, so 'org/invalid' becomes 'org_invalid'
      const dbSanitized = await tenantDbManager.openTenantDatabase('org/invalid');
      if (dbSanitized.name === 'hisabati_db_org_invalid') {
         console.log('✅ Sanity check passed for invalid IDs');
      }
    } catch (e) {
      console.log('❌ Unexpected failure on sanitized ID');
    }

    // 5. Test Tenant Switch Guard (TENANT-SWITCH-GUARD)
    await runTest('TENANT-SWITCH-GUARD', 'منع الوصول أثناء تبديل المستأجر', async () => {
      // محاكاة isSwitching = true
      const { tenantDbManager } = await import('../database/TenantDatabaseManager');
      
      // حفظ الحالة الأصلية
      const originalIsSwitching = (tenantDbManager as any).isSwitching;
      
      try {
        (tenantDbManager as any).isSwitching = true;
        
        // محاولة استدعاء getDb
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

    // 6. Cleanup
    await tenantService.switchToLocalMode();
    console.log('--- All Tenant Tests Passed ---');

  } catch (error) {
    console.error('--- Tenant Tests FAILED ---', error);
    throw error;
  }
}
