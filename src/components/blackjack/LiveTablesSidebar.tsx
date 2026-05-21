import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { Table } from '@/store/gameStore';

interface LiveTablesSidebarProps {
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
  activeTables: Table[];
  currentTableId: string;
  observeTable: (tableId: string) => void;
  onNavigate?: () => void;
}

export function LiveTablesSidebar({
  showSidebar,
  setShowSidebar,
  activeTables,
  currentTableId,
  observeTable,
  onNavigate
}: LiveTablesSidebarProps) {
  
  return (
    <div className="fixed inset-y-0 left-0 z-[60] flex w-full pointer-events-none">
      {/* Click outside overlay */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
        onClick={() => setShowSidebar(false)}
      />
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
                <div key={t.id} className={cn("p-3 rounded-xl border transition-all cursor-pointer relative", isCurrent ? "bg-white/10 border-[#ffc53d]/50" : "bg-black/20 border-white/5 hover:border-white/20")} onClick={() => {
                  if (!isCurrent) {
                     observeTable(t.id);
                  }
                  if (onNavigate) onNavigate();
                  setShowSidebar(false);
                }}>
                  <div className="font-bold text-white mb-1 flex items-center pr-12">
                     <span className="truncate">{t.name}</span>
                  </div>
                  {t.settings.mode === 'tournament' && (
                     <div className="absolute top-3 right-3 text-[10px] font-bold text-yellow-500 bg-yellow-500/10 border border-yellow-500/30 px-1.5 py-0.5 rounded tracking-wider shadow-sm flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></span>
                        TRNMNT
                     </div>
                  )}
                  {t.description && <div className="text-xs text-white/50 mb-2 truncate italic">"{t.description}"</div>}
                  <div className="text-xs text-gray-400 flex justify-between">
                    <span>
                      {t.settings.mode === 'tournament' 
                        ? `Buy-In: $${t.settings.tournament?.ticketPrice || 0}`
                        : `Bet: $${t.settings.minBet}-${t.settings.maxBet}`}
                    </span>
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
