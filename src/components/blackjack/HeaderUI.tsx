import React from 'react';
import { LogOut, Volume2, VolumeX, Bell, Menu, Plus } from 'lucide-react';

export function HeaderUI({
  onLeave,
  isMuted,
  setIsMuted,
  onOpenTable,
  onToggleSidebar,
  hideLeaveButton,
  centerContent
}: {
  onLeave: () => void;
  isMuted: boolean;
  setIsMuted: (val: boolean) => void;
  onOpenTable?: () => void;
  onToggleSidebar?: () => void;
  hideLeaveButton?: boolean;
  centerContent?: React.ReactNode;
}) {
  return (
    <div className="w-full h-[52px] sm:h-[60px] bg-[#1e2025] shadow flex items-center justify-center z-50 shrink-0 border-b border-white/5 top-0 sticky">
      <div className="w-full max-w-[1024px] h-full px-1 sm:px-4 flex items-center justify-between relative">
        <div className="flex items-center gap-0 sm:gap-2 relative z-10 flex-1">
          {!hideLeaveButton && (
            <button 
              onClick={onLeave}
              className="w-10 h-10 sm:w-10 sm:h-10 flex items-center justify-center text-white/50 hover:text-white rounded-full transition-colors hover:bg-white/5"
              title="Return / Exit"
            >
              <LogOut className="w-5 h-5 sm:w-5 sm:h-5 scale-x-[-1]" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-4 justify-center z-0 flex-1 shrink-0 px-2">
          <h1 className="text-sm sm:text-xl font-bold text-white tracking-wider whitespace-nowrap">
            BLACKJACK
          </h1>
          {centerContent && (
             <div className="scale-90 sm:scale-100 origin-center flex shrink-0">
               {centerContent}
             </div>
          )}
        </div>
        <div className="flex items-center gap-0 sm:gap-2 relative z-10 flex-1 justify-end">
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="w-10 h-10 sm:w-10 sm:h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5"
          >
            {isMuted ? <VolumeX className="w-5 h-5 sm:w-5 sm:h-5 opacity-50" /> : <Volume2 className="w-5 h-5 sm:w-5 sm:h-5" />}
          </button>
          <button className="w-10 h-10 sm:w-10 sm:h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors rounded-full hover:bg-white/5 relative">
            <Bell className="w-5 h-5 sm:w-5 sm:h-5" />
            <span className="absolute top-[10px] right-[10px] sm:top-[10px] sm:right-[10px] w-1.5 h-1.5 bg-red-500 rounded-full border border-[#1e2025]"></span>
          </button>
        </div>
      </div>
    </div>
  );
}
