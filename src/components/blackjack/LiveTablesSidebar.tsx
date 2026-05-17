import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Table } from '@/store/gameStore';

interface LiveTablesSidebarProps {
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
  activeTables: Table[];
  currentTableId: string;
  joinTable: (tableId: string, seatIndex: number) => void;
}

export function LiveTablesSidebar({
  showSidebar,
  setShowSidebar,
  activeTables,
  currentTableId,
  joinTable
}: LiveTablesSidebarProps) {
  
  return (
    <div className="fixed inset-y-0 left-0 z-[60] flex pointer-events-none">
      <motion.div 
        initial={{ x: -300 }}
        animate={{ x: 0 }}
        exit={{ x: -300 }}
        className="w-[300px] h-full bg-[#1e2025] border-r border-white/5 flex flex-col shadow-2xl relative p-4 pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-serif uppercase tracking-widest text-[#ffc53d]">Live Tables</h2>
          <button onClick={() => setShowSidebar(false)} className="text-white/50 hover:text-white">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
          {activeTables.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">No public tables available.</div>
          ) : (
            activeTables.map(t => {
              const isCurrent = t.id === currentTableId;
              return (
                <div key={t.id} className={cn("p-3 rounded-xl border transition-all cursor-pointer", isCurrent ? "bg-white/10 border-[#ffc53d]/50" : "bg-black/20 border-white/5 hover:border-white/20")} onClick={() => {
                  if (!isCurrent) {
                     joinTable(t.id, 0); // Might want to just observe, but joining seat 0 for simplicity or just navigating
                     setShowSidebar(false);
                  }
                }}>
                  <div className="font-bold text-white mb-1">{t.name}</div>
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>Bet: ${t.settings.minBet}-${t.settings.maxBet}</span>
                    <span>{t.seats.filter(s => s.userId !== null).length}/{t.settings.maxSeats} Seats</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </motion.div>
    </div>
  );
}
