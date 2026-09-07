import React, { useState } from 'react';
import {
  Users,
  Shield,
  Trash2,
  Edit2,
  Check,
  X,
  Phone,
  Mail,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import { useRBACStore, useUIStore } from '@/shared/stores';
import { UserRole, TeamMember } from '@/shared/types';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';

export const TeamMembersList: React.FC = () => {
  const members = useRBACStore((state) => state.members);
  const currentActor = useRBACStore((state) => state.currentActor);
  const updateMemberRole = useRBACStore((state) => state.updateMemberRole);
  const removeMember = useRBACStore((state) => state.removeMember);
  const showToast = useUIStore((state) => state.showToast);

  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole>('accountant');
  const [isUpdating, setIsUpdating] = useState(false);

  const canManageRoles = rbacGuard.hasPermission(currentActor, 'team:manage_roles');
  const canManageMembers = rbacGuard.hasPermission(currentActor, 'team:manage_members');

  const handleStartEditRole = (member: TeamMember) => {
    setEditingMemberId(member.id);
    setSelectedRole(member.role);
  };

  const handleSaveRole = async (memberId: string) => {
    setIsUpdating(true);
    try {
      await updateMemberRole(memberId, selectedRole);
      showToast('تم تحديث دور العضو بنجاح', 'success');
      setEditingMemberId(null);
    } catch (err: any) {
      showToast(err?.message || 'فشل تحديث الدور', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemove = async (member: TeamMember) => {
    if (!window.confirm(`هل أنت متأكد من رغبتك في إزالة العضو "${member.name}" من الفريق؟`)) {
      return;
    }
    try {
      await removeMember(member.id);
      showToast(`تمت إزالة العضو "${member.name}" بنجاح`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'فشلت إزالة العضو', 'error');
    }
  };

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'accountant':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case 'employee':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'viewer':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
      {members.map((member) => {
        const isCurrentActiveUser = member.userId === currentActor.id;
        const isEditing = editingMemberId === member.id;
        const permissions = rbacGuard.getRolePermissions(member.role);

        return (
          <div key={member.id} className="p-4 transition hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Member details */}
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-sm flex items-center justify-center shrink-0">
                  {member.name.substring(0, 1)}
                </div>

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                      {member.name}
                    </span>
                    {isCurrentActiveUser && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-extrabold">
                        (أنت / الجلسة الحالية)
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${getRoleBadgeColor(member.role)}`}>
                      {rbacGuard.getRoleLabel(member.role)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {member.email}
                    </span>
                    {member.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {member.phone}
                      </span>
                    )}
                    <span>انضم: {new Date(member.joinedAt).toLocaleDateString('ar-YE')}</span>
                  </div>
                </div>
              </div>

              {/* Actions & Role Edit */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                {isEditing ? (
                  <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                    <select
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                      className="px-2 py-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-200 focus:outline-none"
                    >
                      <option value="admin">مدير النظام (Admin)</option>
                      <option value="accountant">محاسب (Accountant)</option>
                      <option value="employee">موظف (Employee)</option>
                      <option value="viewer">مشاهد (Viewer)</option>
                    </select>

                    <button
                      onClick={() => handleSaveRole(member.id)}
                      disabled={isUpdating}
                      className="p-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition disabled:opacity-50"
                      title="حفظ الدور"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingMemberId(null)}
                      className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition"
                      title="إلغاء"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    {canManageRoles && member.role !== 'owner' && (
                      <button
                        onClick={() => handleStartEditRole(member)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[36px]"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                        <span>تعديل الدور</span>
                      </button>
                    )}

                    {canManageMembers && member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemove(member)}
                        className="p-2 rounded-xl text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-900 transition"
                        title="إزالة من الفريق"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Permissions Summary Badges */}
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-slate-400 font-bold me-1">الصلاحيات:</span>
              {permissions.slice(0, 7).map((p) => (
                <span
                  key={p}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium"
                >
                  {rbacGuard.getPermissionLabel(p)}
                </span>
              ))}
              {permissions.length > 7 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold">
                  +{permissions.length - 7} المزيد
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
