import { db } from '../../database/db';
import {
  Team,
  TeamMember,
  UserProfile,
  UserRole,
  AuditActor,
} from '@/shared/types';
import { rbacGuard } from './RBACGuard.service';
import { auditTrailService } from './AuditTrail.service';

export class TeamManagementService {
  private static instance: TeamManagementService;
  public readonly DEFAULT_TEAM_ID = 'team_main_default';

  public static getInstance(): TeamManagementService {
    if (!TeamManagementService.instance) {
      TeamManagementService.instance = new TeamManagementService();
    }
    return TeamManagementService.instance;
  }

  /**
   * Initializes the default workspace team and baseline team members if database is fresh.
   */
  async initializeDefaultTeamIfNeeded(): Promise<{ team: Team; members: TeamMember[] }> {
    let team = await db.teams.get(this.DEFAULT_TEAM_ID);

    if (!team) {
      const now = new Date().toISOString();
      team = {
        id: this.DEFAULT_TEAM_ID,
        name: 'مكتب الإدارة المالية الرئيسي',
        ownerId: 'user_owner_default',
        currency: 'YER',
        createdAt: now,
        updatedAt: now,
      };
      await db.teams.add(team);

      // Add default owner
      const defaultOwner: TeamMember = {
        id: 'member_owner',
        teamId: this.DEFAULT_TEAM_ID,
        userId: 'user_owner_default',
        name: 'المدير المالي (المالك)',
        email: 'owner@hisabati.app',
        phone: '777000111',
        role: 'owner',
        status: 'active',
        joinedAt: now,
      };

      // Add demo accountant for realistic multi-role testing
      const defaultAccountant: TeamMember = {
        id: 'member_accountant',
        teamId: this.DEFAULT_TEAM_ID,
        userId: 'user_accountant_default',
        name: 'أحمد المحاسب',
        email: 'accountant@hisabati.app',
        phone: '777000222',
        role: 'accountant',
        status: 'active',
        joinedAt: now,
      };

      // Add demo employee
      const defaultEmployee: TeamMember = {
        id: 'member_employee',
        teamId: this.DEFAULT_TEAM_ID,
        userId: 'user_employee_default',
        name: 'سالم الكاشير (موظف)',
        email: 'cashier@hisabati.app',
        phone: '777000333',
        role: 'employee',
        status: 'active',
        joinedAt: now,
      };

      // Add demo viewer
      const defaultViewer: TeamMember = {
        id: 'member_viewer',
        teamId: this.DEFAULT_TEAM_ID,
        userId: 'user_viewer_default',
        name: 'المراجع الخارجي (مشاهد)',
        email: 'auditor@hisabati.app',
        phone: '777000444',
        role: 'viewer',
        status: 'active',
        joinedAt: now,
      };

      await db.teamMembers.bulkAdd([
        defaultOwner,
        defaultAccountant,
        defaultEmployee,
        defaultViewer,
      ]);

      // Seed audit log entry for system initialization
      await auditTrailService.log({
        actor: {
          id: defaultOwner.userId,
          name: defaultOwner.name,
          role: 'owner',
          email: defaultOwner.email,
        },
        action: 'TEAM_MEMBER_INVITE',
        targetType: 'team',
        targetId: this.DEFAULT_TEAM_ID,
        riskLevel: 'LOW',
        detailsAr: 'تهيئة فريق العمل المالي وتفعيل الحسابات الأساسية الافتراضية بنجاح.',
      });
    }

    const members = await db.teamMembers.where('teamId').equals(this.DEFAULT_TEAM_ID).toArray();
    return { team, members };
  }

  /**
   * Retrieves all members of the active team.
   */
  async getTeamMembers(teamId: string = this.DEFAULT_TEAM_ID): Promise<TeamMember[]> {
    await this.initializeDefaultTeamIfNeeded();
    return await db.teamMembers.where('teamId').equals(teamId).toArray();
  }

  /**
   * Invites / Adds a new member to the team with a specific role.
   */
  async addMember(
    params: {
      name: string;
      email: string;
      phone?: string;
      role: UserRole;
    },
    actor?: AuditActor
  ): Promise<TeamMember> {
    const currentActor = actor || rbacGuard.getActiveActor();

    // Enforce permission check: only roles with 'team:manage_members' can add members
    await rbacGuard.assertPermission('team:manage_members', {
      actor: currentActor,
      targetType: 'team',
      targetId: this.DEFAULT_TEAM_ID,
      details: `إضافة عضو جديد: ${params.name} بدور ${params.role}`,
    });

    const now = new Date().toISOString();
    const userId = `user_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const memberId = `member_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const newMember: TeamMember = {
      id: memberId,
      teamId: this.DEFAULT_TEAM_ID,
      userId,
      name: params.name.trim(),
      email: params.email.trim().toLowerCase(),
      phone: params.phone?.trim(),
      role: params.role,
      status: 'active',
      joinedAt: now,
    };

    await db.teamMembers.add(newMember);

    // Record in immutable audit trail
    await auditTrailService.log({
      actor: currentActor,
      action: 'TEAM_MEMBER_INVITE',
      targetType: 'team',
      targetId: memberId,
      riskLevel: 'MEDIUM',
      detailsAr: `قام ${currentActor.name} بإضافة العضو "${newMember.name}" بدور (${rbacGuard.getRoleLabel(newMember.role)}).`,
      afterState: { ...newMember },
    });

    return newMember;
  }

  /**
   * Updates an existing member's role.
   */
  async updateMemberRole(
    memberId: string,
    newRole: UserRole,
    actor?: AuditActor
  ): Promise<TeamMember> {
    const currentActor = actor || rbacGuard.getActiveActor();

    // Enforce permission: only 'team:manage_roles' permitted
    await rbacGuard.assertPermission('team:manage_roles', {
      actor: currentActor,
      targetType: 'team',
      targetId: memberId,
      details: `تغيير دور العضو ${memberId} إلى ${newRole}`,
    });

    const member = await db.teamMembers.get(memberId);
    if (!member) {
      throw new Error('العضو المطلوب غير موجود في الفريق');
    }

    if (member.role === 'owner' && newRole !== 'owner') {
      throw new Error('لا يمكن تغيير دور مالك الفريق الأساسي مباشرة');
    }

    const oldRole = member.role;
    const updated = {
      ...member,
      role: newRole,
    };

    await db.teamMembers.put(updated);

    // Record in audit trail
    await auditTrailService.log({
      actor: currentActor,
      action: 'TEAM_MEMBER_ROLE_CHANGE',
      targetType: 'team',
      targetId: memberId,
      riskLevel: 'HIGH',
      detailsAr: `قام ${currentActor.name} بتعديل دور العضو "${member.name}" من (${rbacGuard.getRoleLabel(oldRole)}) إلى (${rbacGuard.getRoleLabel(newRole)}).`,
      beforeState: { role: oldRole },
      afterState: { role: newRole },
    });

    return updated;
  }

  /**
   * Removes a member from the team.
   */
  async removeMember(memberId: string, actor?: AuditActor): Promise<boolean> {
    const currentActor = actor || rbacGuard.getActiveActor();

    await rbacGuard.assertPermission('team:manage_members', {
      actor: currentActor,
      targetType: 'team',
      targetId: memberId,
    });

    const member = await db.teamMembers.get(memberId);
    if (!member) return false;

    if (member.role === 'owner') {
      throw new Error('لا يمكن إزالة مالك الفريق');
    }

    await db.teamMembers.delete(memberId);

    await auditTrailService.log({
      actor: currentActor,
      action: 'TEAM_MEMBER_REMOVE',
      targetType: 'team',
      targetId: memberId,
      riskLevel: 'HIGH',
      detailsAr: `قام ${currentActor.name} بإزالة العضو "${member.name}" من فريق العمل.`,
      beforeState: { ...member },
    });

    return true;
  }
}

export const teamManagementService = TeamManagementService.getInstance();
