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
      className={`fixed top-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:rtl:translate-x-1/2 z-100 flex items-center justify-between gap-3 px-4 py-3.5 rounded-2xl shadow-2xl border backdrop-blur-lg text-xs sm:text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300 sm:max-w-md ${config.bg}`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon className="w-5 h-5 shrink-0" />
        <span className="truncate leading-relaxed">{message}</span>
      </div>
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
