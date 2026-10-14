import { HisabatiDatabase } from './db';

export interface TenantAccessGrant {
  authorized: boolean;
  grantReason?: 'local_mode' | 'server_verified' | 'offline_capability_lease' | 'unit_test_fixture';
  verifiedUid?: string;
}

/**
 * TenantDatabaseManager: Manages multiple Dexie instances for different organizations.
 * Ensures data isolation by creating a unique database per tenant.
 */
export class TenantDatabaseManager {
  private static instance: TenantDatabaseManager;
  private currentDb: HisabatiDatabase | null = null;
  private currentOrgId: string | null = null;
  private isSwitching: boolean = false;
  private switchingPromise: Promise<HisabatiDatabase> | null = null;
  private switchingOrgId: string | null = null;

  public getIsSwitching(): boolean {
    return this.isSwitching;
  }

  private constructor() {}

  public static getInstance(): TenantDatabaseManager {
    if (!TenantDatabaseManager.instance) {
      TenantDatabaseManager.instance = new TenantDatabaseManager();
    }
    return TenantDatabaseManager.instance;
  }

  // Isolated test harness registry - completely decoupled from production org IDs
  private static testAllowedOrgs: Set<string> = new Set();

  private static isTestEnvironment(): boolean {
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'production') {
      return false;
    }
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.PROD) {
      return false;
    }
    return true;
  }

  public static registerTestFixture(orgId: string): void {
    if (!this.isTestEnvironment()) {
      throw new Error('TenantDatabaseManager: registerTestFixture() is forbidden in production builds.');
    }
    this.testAllowedOrgs.add(orgId.replace(/[^a-z0-9_]/gi, '_').toLowerCase());
  }

  public static isTestFixture(orgId: string): boolean {
    if (!this.isTestEnvironment()) {
      return false;
    }
    const safeId = orgId.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    return this.testAllowedOrgs.has(safeId);
  }

  public static clearTestFixtures(): void {
    if (!this.isTestEnvironment()) {
      throw new Error('TenantDatabaseManager: clearTestFixtures() is forbidden in production builds.');
    }
    this.testAllowedOrgs.clear();
  }

  /**
   * Safely opens a database for a specific organization.
   * STRICT SECURITY BOUNDARY:
   * Requires an authoritative TenantAccessGrant (server_verified or offline_capability_lease)
   * unless operating in local mode or registered unit test fixtures.
   * 
   * @param organizationId Valid organization ID
   * @param grant Optional authoritative security grant
   * @returns The opened database instance
   */
  public async openTenantDatabase(
    organizationId: string,
    grant?: TenantAccessGrant
  ): Promise<HisabatiDatabase> {
    const safeId = this.sanitizeOrgId(organizationId);

    // Hardened Security Boundary:
    // Opening a Tenant DB strictly requires:
    // 1. Local Mode (organizationId === 'local')
    // 2. Authoritative Grant (grant.authorized === true from server verification or valid Capability Lease)
    // 3. Isolated Test Fixture registered explicitly in test harnesses
    const isLocal = safeId === 'local';
    const isAuthoritativeGrant = grant?.authorized === true;
    const isTestFixture = TenantDatabaseManager.isTestFixture(safeId);
    const isAuthorized = isLocal || isAuthoritativeGrant || isTestFixture;

    if (!isAuthorized) {
      throw new Error(
        'تم رفض فتح قاعدة بيانات المؤسسة: لم يتم اجتياز التحقق الخادمي أو لا يوجد تصريح Capability Lease صالح (Authentication != Membership != Authorization)'
      );
    }

    if (this.isSwitching && this.switchingOrgId === safeId && this.switchingPromise) {
      return this.switchingPromise;
    }

    if (this.isSwitching) {
      throw new Error('عملية تبديل المؤسسة قيد التنفيذ حالياً لمؤسسة أخرى');
    }

    if (this.currentOrgId === safeId && this.currentDb) {
      return this.currentDb;
    }

    this.isSwitching = true;
    this.switchingOrgId = safeId;
    this.switchingPromise = (async () => {
      try {
        const dbName = `hisabati_db_${safeId}`;
        
        // Close previous database if it exists
        if (this.currentDb) {
          try {
            // [3.3] Flush any pending debounce resolvers to prevent data leaks or stale UI updates across tenants
            const { flushDueDebtsDebounce } = await import('@/shared/stores/messagingStore');
            flushDueDebtsDebounce();
          } catch {
            // Non-blocking if store is not yet initialized
          }
          await this.currentDb.close();
        }

        const newDb = new HisabatiDatabase(dbName);
        await newDb.open();
        
        this.currentDb = newDb;
        this.currentOrgId = safeId;
        
        console.log(`TenantDatabaseManager: Opened database for organization ${safeId}`);
        return newDb;
      } catch (error) {
        console.error(`TenantDatabaseManager: Failed to open database for ${safeId}`, error);
        throw error;
      } finally {
        this.isSwitching = false;
        this.switchingPromise = null;
        this.switchingOrgId = null;
      }
    })();

    return this.switchingPromise;
  }

  /**
   * Returns the currently active database instance.
   * Throws if no database is open.
   */
  public getActiveDatabase(): HisabatiDatabase {
    if (!this.currentDb) {
      // Fallback for initial load if not switched yet
      // In a real app, we might want to wait for init
      throw new Error('لم يتم تهيئة قاعدة بيانات المؤسسة بعد');
    }
    return this.currentDb;
  }

  /**
   * Closes the current database safely.
   */
  public async closeCurrentDatabase(): Promise<void> {
    if (this.currentDb) {
      await this.currentDb.close();
      this.currentDb = null;
      this.currentOrgId = null;
    }
  }

  private sanitizeOrgId(id: string): string {
    // Only allow alphanumeric and underscores
    return id.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
  }
}

export const tenantDbManager = TenantDatabaseManager.getInstance();
