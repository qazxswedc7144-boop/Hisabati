import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      id="offline-status-indicator"
      className="fixed bottom-20 md:bottom-6 start-4 z-40 flex items-center gap-2 rounded-xl bg-amber-600/95 text-white px-3.5 py-2 text-xs font-semibold shadow-lg backdrop-blur-sm border border-amber-400/30 animate-in slide-in-from-bottom duration-300"
    >
      <WifiOff className="w-4 h-4 animate-pulse" />
      <span>وضع عدم الاتصال — بياناتك محفوظة محلياً</span>
    </div>
  );
};
