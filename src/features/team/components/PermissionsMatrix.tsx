import React from 'react';
import { Check, X, Shield, Lock } from 'lucide-react';
import { UserRole, Permission } from '@/shared/types';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';

export const PermissionsMatrix: React.FC = () => {
  const roles: UserRole[] = ['owner', 'admin', 'accountant', 'employee', 'viewer'];

  const permissionGroups: Array<{
    title: string;
    permissions: Permission[];
  }> = [
    {
      title: 'الحسابات المالية (Accounts)',
      permissions: ['accounts:read', 'accounts:create', 'accounts:update', 'accounts:delete'],
    },
    {
      title: 'العمليات والقيود المالية (Financial Transactions)',
      permissions: ['transactions:read', 'transactions:create', 'transactions:update', 'transactions:delete'],
    },
    {
      title: 'الفواتير والإيصالات وOCR (Receipts & Invoices)',
      permissions: ['receipts:read', 'receipts:create', 'receipts:update', 'receipts:convert', 'receipts:delete'],
    },
    {
      title: 'التقارير وسجل التدقيق (Reports & Audit Trail)',
      permissions: ['reports:read', 'reports:export', 'audit:read', 'audit:export'],
    },
    {
      title: 'إدارة الفريق والنظام (Team, Backup & Settings)',
      permissions: ['team:manage_members', 'team:manage_roles', 'backup:create', 'backup:restore', 'system:settings'],
    },
    {
      title: 'الذكاء الاصطناعي والمستشار (AI Capabilities)',
      permissions: ['ai:query', 'ai:audit'],
    },
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Shield className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          مصفوفة الصلاحيات المطبقة (Role-Based Access Control Matrix)
        </h4>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          هذه الصلاحيات مفروضة جبرياً داخل نواة المحاسبة FinancialTransactionEngine ونظام التدقيق.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-start border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
              <th className="p-3 text-start font-bold text-slate-700 dark:text-slate-300 min-w-[200px]">
                الصلاحية الإجرائية
              </th>
              {roles.map((role) => (
                <th
                  key={role}
                  className="p-3 text-center font-bold text-slate-800 dark:text-slate-200 min-w-[90px]"
                >
                  <span className="block">{rbacGuard.getRoleLabel(role).split(' ')[0]}</span>
                  <span className="text-[10px] font-normal text-slate-400 font-mono">({role})</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {permissionGroups.map((group) => (
              <React.Fragment key={group.title}>
                <tr className="bg-slate-100/50 dark:bg-slate-800/30">
                  <td
                    colSpan={roles.length + 1}
                    className="py-2 px-3 font-extrabold text-[11px] text-teal-900 dark:text-teal-300"
                  >
                    {group.title}
                  </td>
                </tr>
                {group.permissions.map((perm) => (
                  <tr
                    key={perm}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition"
                  >
                    <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                      {rbacGuard.getPermissionLabel(perm)}
                      <span className="block text-[10px] font-mono text-slate-400 font-normal">
                        {perm}
                      </span>
                    </td>
                    {roles.map((role) => {
                      const allowed = rbacGuard.hasPermission(role, perm);
                      return (
                        <td key={`${role}-${perm}`} className="p-3 text-center">
                          {allowed ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400">
                              <X className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
