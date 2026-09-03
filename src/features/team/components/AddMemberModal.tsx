import React, { useState } from 'react';
import { X, UserPlus, Shield, Mail, Phone, User } from 'lucide-react';
import { UserRole } from '@/shared/types';
import { rbacGuard } from '@/core/services/rbac/RBACGuard.service';
import { useRBACStore, useUIStore } from '@/shared/stores';

interface AddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({ isOpen, onClose }) => {
  const addMember = useRBACStore((state) => state.addMember);
  const showToast = useUIStore((state) => state.showToast);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<UserRole>('accountant');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const rolesList: Array<{ role: UserRole; title: string; desc: string }> = [
    { role: 'admin', title: 'مدير النظام (Admin)', desc: 'صلاحية كاملة لإدارة العمليات والحسابات وأعضاء الفريق' },
    { role: 'accountant', title: 'محاسب (Accountant)', desc: 'تسجيل وتعديل العمليات وترحيل الفواتير وتصدير التقارير' },
    { role: 'employee', title: 'موظف (Employee)', desc: 'تسجيل معاملات جديدة ومسح الإيصالات دون صلاحية الحذف أو الترحيل' },
    { role: 'viewer', title: 'مشاهد (Viewer)', desc: 'صلاحية قراءة واطلاع فقط دون إمكانية التعديل أو الإضافة' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('يرجى إدخال اسم العضو');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError('يرجى إدخال بريد إلكتروني صالح');
      return;
    }

    setIsSubmitting(true);
    try {
      await addMember({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role,
      });

      showToast(`تمت إضافة العضو "${name}" بدور (${rbacGuard.getRoleLabel(role)}) بنجاح`, 'success');
      setName('');
      setEmail('');
      setPhone('');
      setRole('accountant');
      onClose();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء إضافة العضو');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="modal-add-team-member"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">إضافة عضو جديد للفريق</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">حدد بيانات العضو ومستوى الصلاحيات (RBAC)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              الاسم الكامل <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-member-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثال: يحيى المحاسب"
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              البريد الإلكتروني <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-member-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="member@company.com"
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
              />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
              رقم الهاتف (اختياري)
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                id="input-member-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="770000000"
                className="w-full ps-9 pe-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              الدور والصلاحيات (RBAC Role) <span className="text-rose-500">*</span>
            </label>
            <div className="space-y-2">
              {rolesList.map((item) => {
                const isSelected = role === item.role;
                return (
                  <label
                    key={item.role}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/40 text-teal-950 dark:text-teal-100 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="userRole"
                      value={item.role}
                      checked={isSelected}
                      onChange={() => setRole(item.role)}
                      className="mt-1 text-teal-600 focus:ring-teal-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Shield className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span className="text-xs font-bold">{item.title}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{item.desc}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition min-h-[44px]"
            >
              إلغاء
            </button>
            <button
              id="btn-submit-add-member"
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs shadow-md shadow-teal-700/20 active:scale-[0.98] transition disabled:opacity-50 min-h-[44px]"
            >
              {isSubmitting ? 'جاري الإضافة...' : 'حفظ وإضافة العضو'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
