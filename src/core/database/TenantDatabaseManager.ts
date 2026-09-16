import { HisabatiDatabase } from './db';

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

  private constructor() {}

  public static getInstance(): TenantDatabaseManager {
    if (!TenantDatabaseManager.instance) {
      TenantDatabaseManager.instance = new TenantDatabaseManager();
    }
    return TenantDatabaseManager.instance;
  }

  /**
   * Safely opens a database for a specific organization.
   * @param organizationId Valid organization ID
   * @returns The opened database instance
   */
  public async openTenantDatabase(organizationId: string): Promise<HisabatiDatabase> {
    const safeId = this.sanitizeOrgId(organizationId);

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
