import React, { useEffect, useState } from 'react';
import {
  Users,
  Shield,
  FileCheck,
  UserPlus,
  Grid,
  ShieldAlert,
} from 'lucide-react';
import { useRBACStore } from '@/shared/stores';
import { TeamMembersList } from '../components/TeamMembersList';
import { AuditTrailViewer } from '../components/AuditTrailViewer';
import { PermissionsMatrix } from '../components/PermissionsMatrix';
import { AddMemberModal } from '../components/AddMemberModal';
import { ActiveActorSwitcher } from '../components/ActiveActorSwitcher';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';

export const TeamPage: React.FC = () => {
  const initialize = useRBACStore((state) => state.initialize);
  const currentActor = useRBACStore((state) => state.currentActor);
  const team = useRBACStore((state) => state.team);
  const members = useRBACStore((state) => state.members);
  const isLoading = useRBACStore((state) => state.isLoading);

  const [activeTab, setActiveTab] = useState<'members' | 'audit' | 'matrix'>('members');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const canAddMembers = rbacGuard.hasPermission(currentActor, 'team:manage_members');

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
              Phase 8 • RBAC & Audit
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {team?.name || 'فريق العمل'} ({members.length} أعضاء)
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100">
            إدارة الفريق والصلاحيات والتدقيق الرقابي
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            إدارة الأدوار والمستخدمين وسجل تدقيق مالي غير قابل للتلاعب مشفر بسلسلة SHA-256.
          </p>
        </div>

        {/* Action Controls & Active Actor Switcher */}
        <div className="flex flex-wrap items-center gap-2.5">
          <ActiveActorSwitcher />

          {canAddMembers && (
            <button
              id="btn-open-add-member"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold shadow-sm shadow-teal-700/20 active:scale-[0.98] transition min-h-[40px]"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة عضو جديد</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          id="tab-team-members"
          onClick={() => setActiveTab('members')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition -mb-px ${
            activeTab === 'members'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>أعضاء الفريق ({members.length})</span>
        </button>

        <button
          id="tab-audit-trail"
          onClick={() => setActiveTab('audit')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition -mb-px ${
            activeTab === 'audit'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>سجل التدقيق المشفر (Audit Trail)</span>
        </button>

        <button
          id="tab-permissions-matrix"
          onClick={() => setActiveTab('matrix')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition -mb-px ${
            activeTab === 'matrix'
              ? 'border-teal-600 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Grid className="w-4 h-4" />
          <span>مصفوفة الصلاحيات</span>
        </button>
      </div>

      {/* Active Tab Content */}
      <div>
        {activeTab === 'members' && <TeamMembersList />}
        {activeTab === 'audit' && <AuditTrailViewer />}
        {activeTab === 'matrix' && <PermissionsMatrix />}
      </div>

      {/* Add Member Modal */}
      <AddMemberModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </div>
  );
};
