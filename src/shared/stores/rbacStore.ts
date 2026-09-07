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
import { auditTrailService } from '@/core/services/rbac/AuditTrail.service';
import { teamManagementService } from '@/core/services/rbac/TeamManagement.service';

interface RBACState {
  currentActor: AuditActor;
  team: Team | null;
  members: TeamMember[];
  auditEntries: AuditTrailEntry[];
  verificationResult: AuditIntegrityVerificationResult | null;
  isLoading: boolean;
  isVerifying: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  switchActor: (member: TeamMember) => void;
  hasPermission: (permission: Permission) => boolean;
  addMember: (params: { name: string; email: string; phone?: string; role: UserRole }) => Promise<void>;
  updateMemberRole: (memberId: string, role: UserRole) => Promise<void>;
  removeMember: (memberId: string) => Promise<void>;
  fetchAuditTrail: (limit?: number) => Promise<void>;
  verifyAuditIntegrity: () => Promise<AuditIntegrityVerificationResult>;
}

export const useRBACStore = create<RBACState>((set, get) => ({
  currentActor: rbacGuard.getActiveActor(),
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
      const { team, members } = await teamManagementService.initializeDefaultTeamIfNeeded();
      const currentActor = rbacGuard.getActiveActor();
      const auditEntries = await auditTrailService.getRecentEntries(50);

      set({
        team,
        members,
        currentActor,
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

  switchActor: (member: TeamMember) => {
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
      const auditEntries = await auditTrailService.getRecentEntries(limit);
      set({ auditEntries });
    } catch (err) {
      console.error('Failed fetching audit entries:', err);
    }
  },

  verifyAuditIntegrity: async () => {
    set({ isVerifying: true });
    try {
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
