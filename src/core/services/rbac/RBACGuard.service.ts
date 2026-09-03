import {
  UserRole,
  Permission,
  AuditActor,
  AuditAction,
} from '@/shared/types';
import { auditTrailService } from './AuditTrail.service';

export class RBACUnauthorizedError extends Error {
  public readonly requiredPermission: Permission;
  public readonly actor: AuditActor;
  public readonly targetType?: string;
  public readonly targetId?: string;

  constructor(
    messageAr: string,
    params: {
      requiredPermission: Permission;
      actor: AuditActor;
      targetType?: string;
      targetId?: string;
    }
  ) {
    super(messageAr);
    this.name = 'RBACUnauthorizedError';
    this.requiredPermission = params.requiredPermission;
    this.actor = params.actor;
    this.targetType = params.targetType;
    this.targetId = params.targetId;
  }
}

/**
 * Standard Role-Permission Mapping Matrix
 */
const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  owner: new Set<Permission>([
    'accounts:read',
    'accounts:create',
    'accounts:update',
    'accounts:delete',
    'transactions:read',
    'transactions:create',
    'transactions:update',
    'transactions:delete',
    'receipts:read',
    'receipts:create',
    'receipts:update',
    'receipts:convert',
    'receipts:delete',
    'reports:read',
    'reports:export',
    'audit:read',
    'audit:export',
    'team:manage_members',
    'team:manage_roles',
    'backup:create',
    'backup:restore',
    'sync:manage',
    'ai:query',
    'ai:audit',
    'system:settings',
  ]),

  admin: new Set<Permission>([
    'accounts:read',
    'accounts:create',
    'accounts:update',
    'accounts:delete',
    'transactions:read',
    'transactions:create',
    'transactions:update',
    'transactions:delete',
    'receipts:read',
    'receipts:create',
    'receipts:update',
    'receipts:convert',
    'receipts:delete',
    'reports:read',
    'reports:export',
    'audit:read',
    'audit:export',
    'team:manage_members',
    'backup:create',
    'sync:manage',
    'ai:query',
    'ai:audit',
    'system:settings',
  ]),

  accountant: new Set<Permission>([
    'accounts:read',
    'accounts:create',
    'accounts:update',
    'transactions:read',
    'transactions:create',
    'transactions:update',
    'receipts:read',
    'receipts:create',
    'receipts:update',
    'receipts:convert',
    'reports:read',
    'reports:export',
    'audit:read',
    'ai:query',
    'ai:audit',
  ]),

  employee: new Set<Permission>([
    'accounts:read',
    'transactions:read',
    'transactions:create',
    'receipts:read',
    'receipts:create',
    'receipts:update',
    'reports:read',
    'ai:query',
  ]),

  viewer: new Set<Permission>([
    'accounts:read',
    'transactions:read',
    'receipts:read',
    'reports:read',
  ]),
};

const PERMISSION_LABELS_AR: Record<Permission, string> = {
  'accounts:read': 'عرض الحسابات المالية',
  'accounts:create': 'إضافة حساب مالي جديد',
  'accounts:update': 'تعديل بيانات الحسابات المالية',
  'accounts:delete': 'حذف الحسابات المالية',
  'transactions:read': 'عرض العمليات والقيود المالية',
  'transactions:create': 'تسجيل عمليات مالية جديدة',
  'transactions:update': 'تعديل قيود العمليات المالية',
  'transactions:delete': 'حذف القيود والمعاملات المالية',
  'receipts:read': 'عرض الفواتير والإيصالات المسحوبة',
  'receipts:create': 'مسح وإضافة إيصالات وفواتير',
  'receipts:update': 'تعديل مسودات الفواتير',
  'receipts:convert': 'ترحيل وتحويل الفواتير إلى قيود مالية',
  'receipts:delete': 'حذف الفواتير والإيصالات',
  'reports:read': 'الاطلاع على التقارير المالية',
  'reports:export': 'تصدير التقارير (PDF / Excel)',
  'audit:read': 'الاطلاع على سجل التدقيق الرقابي',
  'audit:export': 'تصدير سجل التدقيق الرقابي',
  'team:manage_members': 'إدارة أعضاء الفريق والدعوات',
  'team:manage_roles': 'تعديل وتعيين الصلاحيات والأدوار',
  'backup:create': 'إنشاء نسخ احتياطية للبيانات',
  'backup:restore': 'استعادة النسخ الاحتياطية',
  'sync:manage': 'إدارة المزامنة السحابية',
  'ai:query': 'استخدام المستشار المحاسبي الذكي AI',
  'ai:audit': 'إجراء تدقيق ذكي للفواتير والعمليات',
  'system:settings': 'تعديل إعدادات النظام العامة',
};

const ROLE_LABELS_AR: Record<UserRole, string> = {
  owner: 'المالك (Owner)',
  admin: 'مدير النظام (Admin)',
  accountant: 'محاسب (Accountant)',
  employee: 'موظف (Employee)',
  viewer: 'مشاهد (Viewer)',
};

export class RBACGuardService {
  private static instance: RBACGuardService;

  // Default active session actor (Owner)
  private currentActor: AuditActor = {
    id: 'user_owner_default',
    name: 'المدير المالي (المالك)',
    role: 'owner',
    email: 'owner@hisabati.app',
  };

  public static getInstance(): RBACGuardService {
    if (!RBACGuardService.instance) {
      RBACGuardService.instance = new RBACGuardService();
    }
    return RBACGuardService.instance;
  }

  /**
   * Sets the active session actor (used when switching user/role in UI).
   */
  public setActiveActor(actor: AuditActor): void {
    this.currentActor = { ...actor };
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('hisabati_active_actor', JSON.stringify(this.currentActor));
      }
    } catch {
      // Ignore storage errors in non-browser or sandbox environments
    }
  }

  /**
   * Returns the current active session actor.
   */
  public getActiveActor(): AuditActor {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const stored = localStorage.getItem('hisabati_active_actor');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed && parsed.id && parsed.role) {
            this.currentActor = parsed;
          }
        }
      }
    } catch {
      // Return memory actor
    }
    return this.currentActor;
  }

  /**
   * Evaluates if a given actor or role holds a specific permission.
   */
  public hasPermission(actorOrRole: AuditActor | UserRole, permission: Permission): boolean {
    const role = typeof actorOrRole === 'string' ? actorOrRole : actorOrRole.role;
    const permissions = ROLE_PERMISSIONS[role];
    if (!permissions) return false;
    return permissions.has(permission);
  }

  /**
   * Get all granted permissions for a given role.
   */
  public getRolePermissions(role: UserRole): Permission[] {
    const permissions = ROLE_PERMISSIONS[role];
    return permissions ? Array.from(permissions) : [];
  }

  /**
   * Returns Arabic label for a permission.
   */
  public getPermissionLabel(permission: Permission): string {
    return PERMISSION_LABELS_AR[permission] || permission;
  }

  /**
   * Returns Arabic label for a role.
   */
  public getRoleLabel(role: UserRole): string {
    return ROLE_LABELS_AR[role] || role;
  }

  /**
   * Core Security Guard: Asserts that the actor holds the required permission.
   * If unauthorized, it records a security violation in the Audit Trail and throws RBACUnauthorizedError.
   * This is executed inside FinancialTransactionEngine and service business logic.
   */
  public async assertPermission(
    permission: Permission,
    context?: {
      actor?: AuditActor;
      targetType?: 'transaction' | 'account' | 'receipt' | 'team' | 'backup' | 'system' | 'ai';
      targetId?: string;
      details?: string;
    }
  ): Promise<void> {
    const actor = context?.actor || this.getActiveActor();
    const isGranted = this.hasPermission(actor, permission);

    if (!isGranted) {
      const permLabel = this.getPermissionLabel(permission);
      const roleLabel = this.getRoleLabel(actor.role);
      const errorMessage = `عملية مرفوضة: لا يمتلك دور "${roleLabel}" صلاحية "${permLabel}". يرجى مراجعة مدير النظام.`;

      // Log security violation in the immutable audit trail
      try {
        await auditTrailService.log({
          actor,
          action: 'SECURITY_UNAUTHORIZED_ATTEMPT',
          targetType: context?.targetType || 'system',
          targetId: context?.targetId || 'security_guard',
          riskLevel: 'HIGH',
          detailsAr: `محاولة غير مصرح بها من "${actor.name}" (${roleLabel}) لتنفيذ: ${permLabel}.`,
          metadata: {
            requiredPermission: permission,
            actorRole: actor.role,
            contextDetails: context?.details,
          },
        });
      } catch (err) {
        console.error('Failed logging security violation to audit trail:', err);
      }

      throw new RBACUnauthorizedError(errorMessage, {
        requiredPermission: permission,
        actor,
        targetType: context?.targetType,
        targetId: context?.targetId,
      });
    }
  }
}

export const rbacGuard = RBACGuardService.getInstance();
