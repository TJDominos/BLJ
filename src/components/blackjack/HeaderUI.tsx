import React from 'react';
import { LogOut, Volume2, Bell, Menu, Plus } from 'lucide-react';

export function HeaderUI({
  onLeave,
  isMuted,
  setIsMuted,
  onOpenTable,
  onToggleSidebar
}: {
  onLeave: () => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  onOpenTable?: () => void;
  onToggleSidebar?: () => void;
}) {
  return (
    <div className="w-full h-[60px] bg-[#1e2025] shadow flex items-center justify-center z-50 shrink-0 border-b border-white/5">
      <div className="w-full max-w-[1024px] h-full px-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button 
            disabled
            className="w-10 h-10 flex items-center justify-center text-white/30 rounded-full cursor-not-allowed"
            title="Exit Game (Disabled)"
          >
            <LogOut className="w-5 h-5 scale-x-[-1]" />
          </button>
        </div>
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-white tracking-wider">
            Blackjack
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5"
          >
            {isMuted ? <Volume2 className="w-5 h-5 opacity-50" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5 relative items-center justify-center">
            <Bell className="w-5 h-5" />
            <span className="absolute top-[10px] right-[10px] w-1.5 h-1.5 bg-red-500 rounded-full border border-[#1e2025]"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
