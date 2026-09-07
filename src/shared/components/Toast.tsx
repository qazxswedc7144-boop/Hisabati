import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore } from '@/shared/stores';

export const Toast: React.FC = () => {
  const message = useUIStore((state) => state.toastMessage);
  const type = useUIStore((state) => state.toastType);
  const hide = useUIStore((state) => state.hideToast);

  if (!message) return null;

  const typeConfig = {
    success: {
      bg: 'bg-emerald-800/95 text-emerald-50 border-emerald-600/40',
      icon: CheckCircle2,
    },
    error: {
      bg: 'bg-rose-800/95 text-rose-50 border-rose-600/40',
      icon: AlertCircle,
    },
    info: {
      bg: 'bg-slate-800/95 text-slate-50 border-slate-600/40',
      icon: Info,
    },
  };

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      id="app-toast-notification"
      className={`fixed top-4 start-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border backdrop-blur-md text-xs sm:text-sm font-semibold animate-in fade-in slide-in-from-top-3 duration-200 max-w-[90vw] ${config.bg}`}
    >
      <Icon className="w-4 h-4 shrink-0" />
      <span className="truncate">{message}</span>
      <button
        onClick={hide}
        className="p-1 text-white/70 hover:text-white ms-1 rounded-md"
        aria-label="Close"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};
