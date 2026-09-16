import React, { useState } from 'react';
import { LogIn, LogOut, User, Shield, CloudOff, Cloud } from 'lucide-react';
import { useRBACStore } from '@/shared/stores';

export const UserAuthSection: React.FC = () => {
  const { authStatus, currentActor, logout, login } = useRBACStore();
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      setShowLogin(false);
    } catch (err: any) {
      setError(err.message || 'فشل تسجيل الدخول');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = () => {
    switch (authStatus) {
      case 'authenticated':
        return <Cloud className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />;
      case 'offline':
        return <CloudOff className="w-4 h-4 text-amber-500 shrink-0" />;
      default:
        return <Shield className="w-4 h-4 text-slate-400 shrink-0" />;
    }
  };

  const getStatusLabel = () => {
    switch (authStatus) {
      case 'authenticated':
        return 'متصل بالسحابة';
      case 'offline':
        return 'وضع العمل دون اتصال';
      default:
        return 'وضع محلي مستقل';
    }
  };

  return (
    <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 space-y-2">
      <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
        {getStatusIcon()}
        <div className="truncate flex-1">
          <p className="font-bold text-slate-700 dark:text-slate-300 truncate">{currentActor.name}</p>
          <p className="text-[10px] text-slate-400 truncate">{getStatusLabel()}</p>
        </div>
        {authStatus === 'authenticated' ? (
          <button 
            onClick={() => logout()}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 transition"
            title="تسجيل الخروج"
          >
            <LogOut className="w-4 h-4" />
          </button>
        ) : (
          <button 
            onClick={() => setShowLogin(true)}
            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-teal-600 transition"
            title="تسجيل الدخول للسحابة"
          >
            <LogIn className="w-4 h-4" />
          </button>
        )}
      </div>

      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-teal-600 text-white flex items-center justify-center shadow-lg shadow-teal-600/20">
                <User className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">تسجيل الدخول</h3>
                <p className="text-xs text-slate-500">للمزامنة السحابية وتعدد المستخدمين</p>
              </div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 px-1">البريد الإلكتروني</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 focus:border-teal-500 dark:focus:border-teal-500 focus:ring-0 transition text-sm"
                  placeholder="name@example.com"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 px-1">كلمة المرور</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 focus:border-teal-500 dark:focus:border-teal-500 focus:ring-0 transition text-sm"
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-[11px] font-bold border border-red-100 dark:border-red-900/50">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLogin(false)}
                  className="flex-1 h-11 rounded-xl font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-sm"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] h-11 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold shadow-lg shadow-teal-600/20 disabled:opacity-50 disabled:scale-100 active:scale-[0.98] transition-all text-sm"
                >
                  {loading ? 'جاري التحميل...' : 'دخول'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
