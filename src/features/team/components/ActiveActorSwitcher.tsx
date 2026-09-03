import React from 'react';
import { ShieldCheck, UserCheck, ChevronDown, Check } from 'lucide-react';
import { useRBACStore } from '@/shared/stores';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';
import { UserRole } from '@/shared/types';

export const ActiveActorSwitcher: React.FC = () => {
  const currentActor = useRBACStore((state) => state.currentActor);
  const members = useRBACStore((state) => state.members);
  const switchActor = useRBACStore((state) => state.switchActor);
  const [isOpen, setIsOpen] = React.useState(false);

  const getRoleBadgeColor = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800';
      case 'admin':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800';
      case 'accountant':
        return 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border-teal-200 dark:border-teal-800';
      case 'employee':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'viewer':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700';
    }
  };

  return (
    <div className="relative inline-block text-start">
      <button
        id="btn-active-actor-switcher"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 transition shadow-xs"
        title="تغيير المستخدم النشط لاختبار الصلاحيات"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span className="truncate max-w-[120px] sm:max-w-[160px]">{currentActor.name}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${getRoleBadgeColor(currentActor.role)}`}>
          {rbacGuard.getRoleLabel(currentActor.role).split(' ')[0]}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div
            id="dropdown-active-actor-list"
            className="absolute start-0 mt-2 w-72 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl z-50 p-2 text-xs divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in zoom-in-95 duration-100"
          >
            <div className="px-3 py-2">
              <p className="font-bold text-slate-900 dark:text-slate-100">محاكي المستخدم النشط (RBAC)</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                اختر أي عضو لاختبار صلاحيات الإضافة والحذف والترحيل الحقيقية:
              </p>
            </div>

            <div className="py-1.5 space-y-1 max-h-64 overflow-y-auto">
              {members.map((member) => {
                const isSelected = member.userId === currentActor.id;
                return (
                  <button
                    key={member.id}
                    onClick={() => {
                      switchActor(member);
                      setIsOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-start transition ${
                      isSelected
                        ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 font-bold'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold">{member.name}</span>
                      <span className="text-[10px] text-slate-400">{member.email}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-bold ${getRoleBadgeColor(member.role)}`}>
                        {rbacGuard.getRoleLabel(member.role).split(' ')[0]}
                      </span>
                      {isSelected && <Check className="w-4 h-4 text-teal-600 dark:text-teal-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
