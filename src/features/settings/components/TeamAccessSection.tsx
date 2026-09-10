import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Shield, 
  ExternalLink, 
  CheckCircle2, 
  UserCircle,
  ShieldCheck,
  ShieldAlert,
  Lock,
  ArrowLeftRight
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';
import { teamManagementService } from '@/core/services/rbac/TeamManagement.service';
import { AuditActor, TeamMember, UserRole } from '@/shared/types';
import { useUIStore } from '@/shared/stores';

export const TeamAccessSection: React.FC = () => {
  const navigate = useNavigate();
  const showToast = useUIStore((state) => state.showToast);
  const [currentActor, setCurrentActor] = useState<AuditActor>(rbacGuard.getActiveActor());
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const teamMembers = await teamManagementService.getTeamMembers();
      setMembers(teamMembers);
    } catch (error) {
      console.error('Failed to load team members:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchActor = (member: TeamMember) => {
    const newActor: AuditActor = {
      id: member.userId,
      name: member.name,
      role: member.role,
      email: member.email,
    };
    rbacGuard.setActiveActor(newActor);
    setCurrentActor(newActor);
    showToast(`تم التبديل إلى دور: ${rbacGuard.getRoleLabel(member.role)}`, 'success');
    
    // Refresh page to apply new permissions across all components
    setTimeout(() => window.location.reload(), 500);
  };

  const currentPermissions = rbacGuard.getRolePermissions(currentActor.role);

  return (
    <section className="rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            <span>إدارة الوصول والأدوار (RBAC)</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            التحكم في صلاحيات الفريق وسجلات الوصول المحاسبي
          </p>
        </div>
        <button
          onClick={() => navigate('/team')}
          className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
          title="إدارة الفريق كاملة"
        >
          <ExternalLink className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Active User Identity */}
      <div className="p-5 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200/60 dark:border-teal-900/40 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-teal-100 dark:bg-teal-900/40 text-teal-600 flex items-center justify-center shrink-0 shadow-inner">
          <UserCircle className="w-8 h-8" />
        </div>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-slate-900 dark:text-slate-100">{currentActor.name}</span>
            <span className="px-2 py-0.5 rounded-lg bg-teal-600 text-white text-[10px] font-bold uppercase tracking-tight">
              {rbacGuard.getRoleLabel(currentActor.role)}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            أنت تستخدم النظام حالياً بصلاحيات <span className="font-bold text-slate-700 dark:text-slate-200">{rbacGuard.getRoleLabel(currentActor.role)}</span>. 
            يتم تسجيل كافة تحركاتك في سجل التدقيق المالي لضمان الشفافية.
          </p>
        </div>
      </div>

      {/* Role Permissions Summary */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">صلاحيات دورك الحالي</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {currentPermissions.slice(0, 6).map((perm) => (
            <div key={perm} className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span className="text-[11px] font-medium text-slate-700 dark:text-slate-300">
                {rbacGuard.getPermissionLabel(perm)}
              </span>
            </div>
          ))}
          {currentPermissions.length > 6 && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 border-dashed italic">
              <span className="text-[10px] text-slate-400">
                + {currentPermissions.length - 6} صلاحيات إضافية أخرى...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Team Members List (Quick Switch for Demo/Testing) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">أعضاء الفريق (تبديل سريع للمعاينة)</h4>
          {isLoading && <div className="w-3 h-3 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />}
        </div>
        <div className="space-y-2">
          {members.map((member) => {
            const isActive = member.userId === currentActor.id;
            return (
              <div 
                key={member.id}
                className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                  isActive 
                    ? 'bg-white dark:bg-slate-900 border-teal-500 dark:border-teal-600 shadow-md ring-1 ring-teal-500/10' 
                    : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isActive ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}>
                    <UserCircle className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[12px] font-bold text-slate-900 dark:text-slate-100">{member.name}</span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">{rbacGuard.getRoleLabel(member.role)}</span>
                  </div>
                </div>
                
                {!isActive && (
                  <button
                    onClick={() => handleSwitchActor(member)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  >
                    <ArrowLeftRight className="w-3 h-3" />
                    <span>تبديل</span>
                  </button>
                )}
                
                {isActive && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-teal-600 dark:text-teal-400">
                    <ShieldCheck className="w-3 h-3" />
                    <span>نشط حالياً</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Security Warning */}
      <div className="p-4 rounded-2xl bg-slate-900 dark:bg-slate-800 text-white space-y-2">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-teal-400" />
          <span className="text-[11px] font-bold">ملاحظة أمنية هامة</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          نظام الصلاحيات (RBAC) يمنع المستخدمين من حذف أو تعديل العمليات المالية القديمة ما لم يمتلكوا صلاحية "مدير". أي محاولة وصول غير مصرح بها يتم حظرها برمجياً وتسجيلها فوراً في سجل التدقيق غير القابل للتعديل.
        </p>
      </div>
    </section>
  );
};
