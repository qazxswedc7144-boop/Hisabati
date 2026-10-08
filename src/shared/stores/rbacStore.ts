import { create } from 'zustand';
import {
  AuditActor,
  TeamMember,
  Team,
  UserRole,
  Permission,
  AuditTrailEntry,
  AuditIntegrityVerificationResult,
} from '@/shared/types';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';
import { AuthStatus } from '@/core/services/rbac/AuthService.service';

interface RBACState {
  currentActor: AuditActor;
  authStatus: AuthStatus;
  team: Team | null;
  members: TeamMember[];
  auditEntries: AuditTrailEntry[];
  verificationResult: AuditIntegrityVerificationResult | null;
  isLoading: boolean;
  isVerifying: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  updateAuthStatus: (status: AuthStatus, actor: AuditActor) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  switchActor: (member: TeamMember) => void;
  hasPermission: (permission: Permission) => boolean;
  addMember: (params: { name: string; email: string; phone?: string; role: UserRole }) => Promise<void>;
  updateMemberRole: (memberId: string, role: UserRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  fetchAuditTrail: (limit?: number) => Promise<void>;
  verifyAuditIntegrity: () => Promise<AuditIntegrityVerificationResult>;
}

export const useRBACStore = create<RBACState>((set, get) => ({
  currentActor: {
    id: 'user_local_default',
    name: 'مستخدم محلي',
    role: 'owner',
    email: 'local@hisabati.app',
  },
  authStatus: 'loading',
  team: null,
  members: [],
  auditEntries: [],
  verificationResult: null,
  isLoading: false,
  isVerifying: false,
  error: null,

  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      const { teamManagementService } = await import('@/core/services/rbac/TeamManagement.service');
      const { auditTrailService } = await import('@/core/services/rbac/AuditTrail.service');
      const { authService } = await import('@/core/services/rbac/AuthService.service');
      const { rbacGuard } = await import('@/core/services/rbac/RBACGuard.service');

      // 1. Initialize Auth Listener (Lazily)
      const { auth } = await import('@/core/database/firebase');
      const { onAuthStateChanged } = await import('firebase/auth');

      if (auth) {
        onAuthStateChanged(auth, async (user) => {
          if (user) {
            const actor: AuditActor = {
              id: user.uid,
              name: user.displayName || user.email?.split('@')[0] || 'مستخدم',
              email: user.email || undefined,
              role: 'pending_membership',
            };
            get().updateAuthStatus('authenticated', actor);
          } else {
            const defaultActor: AuditActor = {
              id: 'user_local_default',
              name: 'مستخدم محلي',
              role: 'owner',
              email: 'local@hisabati.app',
            };
            get().updateAuthStatus('unauthenticated', defaultActor);
          }
          
          // Re-initialize tenant context on auth change (switches DB if needed)
          const { tenantService } = await import('@/core/services/TenantService');
          await tenantService.initialize();
        });
      }

      // 2. Initialize existing local state
      const { team, members } = await teamManagementService.initializeDefaultTeamIfNeeded();
      const currentActor = rbacGuard.getActiveActor();
      const authStatus = authService.getStatus();
      const auditEntries = await auditTrailService.getRecentEntries(50);

      set({
        team,
        members,
        currentActor,
        authStatus,
        auditEntries,
        isLoading: false,
      });
    } catch (err: any) {
      set({
        isLoading: false,
        error: err?.message || 'تعذر تحميل بيانات الفريق والصلاحيات',
      });
    }
  },

  updateAuthStatus: (status, actor) => {
    set({ authStatus: status, currentActor: actor });
    rbacGuard._setCachedActor(actor);
  },

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { authService } = await import('@/core/services/rbac/AuthService.service');
      await authService.login(email, password);
      // Status will be updated by onAuthStateChanged listener in AuthService
      // which we will connect in App.tsx or a provider
      set({ isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      const { authService } = await import('@/core/services/rbac/AuthService.service');
      await authService.logout();
      set({ isLoading: false });
    } catch (err) {
      set({ isLoading: false });
    }
  },

  switchActor: (member: TeamMember) => {
    // ✅ حماية: مسموح فقط في وضع التطوير أو للمالك الحقيقي
    const isDevMode = import.meta.env?.DEV === true;
    if (!isDevMode) {
      throw new Error('تبديل المستخدم النشط متاح في وضع التطوير فقط');
    }

    const newActor: AuditActor = {
      id: member.userId,
      name: member.name,
      role: member.role,
      email: member.email,
    };
    rbacGuard.setActiveActor(newActor);
    set({ currentActor: newActor });
  },

  hasPermission: (permission: Permission) => {
    const actor = get().currentActor;
    return rbacGuard.hasPermission(actor, permission);
  },

  addMember: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { teamManagementService } = await import('@/core/services/rbac/TeamManagement.service');
      const { auditTrailService } = await import('@/core/services/rbac/AuditTrail.service');

      await teamManagementService.addMember(params);
      const members = await teamManagementService.getTeamMembers();
      const auditEntries = await auditTrailService.getRecentEntries(50);
      set({ members, auditEntries, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'فشلت إضافة العضو' });
      throw err;
    }
  },

  updateMemberRole: async (memberId: string, role: UserRole) => {
    set({ isLoading: true, error: null });
    try {
      const { teamManagementService } = await import('@/core/services/rbac/TeamManagement.service');
      const { auditTrailService } = await import('@/core/services/rbac/AuditTrail.service');

      await teamManagementService.updateMemberRole(memberId, role);
      const members = await teamManagementService.getTeamMembers();
      const auditEntries = await auditTrailService.getRecentEntries(50);

      // If active user role was changed, update active actor
      const activeActor = get().currentActor;
      const updatedMember = members.find((m) => m.id === memberId);
      if (updatedMember && updatedMember.userId === activeActor.id) {
        const updatedActor = { ...activeActor, role: updatedMember.role };
        rbacGuard.setActiveActor(updatedActor);
        set({ currentActor: updatedActor });
      }

      set({ members, auditEntries, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'فشل تعديل الدور' });
      throw err;
    }
  },

  removeMember: async (memberId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { teamManagementService } = await import('@/core/services/rbac/TeamManagement.service');
      const { auditTrailService } = await import('@/core/services/rbac/AuditTrail.service');

      await teamManagementService.removeMember(memberId);
      const members = await teamManagementService.getTeamMembers();
      const auditEntries = await auditTrailService.getRecentEntries(50);
      set({ members, auditEntries, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false, error: err?.message || 'فشل حذف العضو' });
      throw err;
    }
  },

  fetchAuditTrail: async (limit: number = 100) => {
    try {
      const { auditTrailService } = await import('@/core/services/rbac/AuditTrail.service');
      const auditEntries = await auditTrailService.getRecentEntries(limit);
      set({ auditEntries });
    } catch (err) {
      console.error('Failed fetching audit entries:', err);
    }
  },

  verifyAuditIntegrity: async () => {
    set({ isVerifying: true });
    try {
      const { auditTrailService } = await import('@/core/services/rbac/AuditTrail.service');
      const result = await auditTrailService.verifyIntegrity();
      set({ verificationResult: result, isVerifying: false });
      return result;
    } catch (err: any) {
      const failResult: AuditIntegrityVerificationResult = {
        isValid: false,
        totalEntries: 0,
        messageAr: err?.message || 'حدث خطأ أثناء فحص البصمة الرقمية لسجل التدقيق.',
        verifiedAt: new Date().toISOString(),
      };
      set({ verificationResult: failResult, isVerifying: false });
      return failResult;
    }
  },
}));
