import { useState, useMemo, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Shield, Lock, Coins, Filter, ChevronDown, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useGameStore } from '@/store/gameStore';

interface LiveTablesSidebarProps {
  showSidebar: boolean;
  setShowSidebar: (show: boolean) => void;
  currentTableId: string;
  observeTable: (tableId: string) => void;
  onNavigate?: () => void;
  activeTables?: any; // kept for backwards compatibility but ignored
}

export function LiveTablesSidebar({
  showSidebar,
  setShowSidebar,
  currentTableId,
  observeTable,
  onNavigate
}: LiveTablesSidebarProps) {
  const { tables, currentUser } = useGameStore();
  const [activeTab, setActiveTab] = useState<'regular' | 'tournament'>('regular');
  const [sortBy, setSortBy] = useState<'createdAt' | 'liquidity' | 'minBet' | 'maxBet' | 'availableSeats'>('createdAt');
  const [showFilters, setShowFilters] = useState(false);
  
  // For lazy loading
  const [visibleCount, setVisibleCount] = useState(15);
  const scrollRef = useRef<HTMLDivElement>(null);

  const processedTables = useMemo(() => {
    let result = Object.values(tables).filter(t => t.status !== 'closed' && t.status !== 'closing');
    
    // Filter by mode
    result = result.filter(t => activeTab === 'regular' ? t.settings.mode !== 'tournament' : t.settings.mode === 'tournament');
    
    // Also include non-public if the user is house or already has money locked there
    result = result.filter(t => t.settings.isPublic || t.houseId === currentUser?.id || (currentUser && t.userBalances?.[currentUser.id]));
    
    // Sort
    result.sort((a, b) => {
      // Randseed official always pinned to top
      if (a.houseId === 'system' && b.houseId !== 'system') return -1;
      if (b.houseId === 'system' && a.houseId !== 'system') return 1;
      
      let valA = 0;
      let valB = 0;
      
      switch (sortBy) {
        case 'createdAt':
          return (b.createdAt || 0) - (a.createdAt || 0);
        case 'liquidity':
          valA = a.liquidity || 0;
          valB = b.liquidity || 0;
          return valB - valA; // Descending
        case 'minBet':
          valA = a.settings.minBet || 0;
          valB = b.settings.minBet || 0;
          return valA - valB; // Ascending
        case 'maxBet':
          valA = a.settings.maxBet || 0;
          valB = b.settings.maxBet || 0;
          return valB - valA; // Descending
        case 'availableSeats':
          valA = a.settings.maxSeats - a.seats.filter(s => s.userId !== null).length;
          valB = b.settings.maxSeats - b.seats.filter(s => s.userId !== null).length;
          return valB - valA; // Descending
      }
      return 0;
    });
    
    return result;
  }, [tables, activeTab, sortBy, currentUser]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (scrollTop + clientHeight >= scrollHeight - 100) {
        setVisibleCount(prev => Math.min(prev + 10, processedTables.length));
      }
    }
  };

  useEffect(() => {
    setVisibleCount(15); // Reset limit when tab or sort changes
  }, [activeTab, sortBy]);
  
  const visibleTables = processedTables.slice(0, visibleCount);
  
  const getSpeedLabel = (timeLimit: number) => {
    if (timeLimit <= 10) return 'Fast';
    if (timeLimit >= 30) return 'Slow';
    return 'Normal';
  };

  return (
    <div className="fixed inset-y-0 left-0 z-[100] flex w-full pointer-events-none">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
        onClick={() => setShowSidebar(false)}
      />
      <motion.div 
        initial={{ x: -400 }}
        animate={{ x: 0 }}
        exit={{ x: -400 }}
        className="w-[360px] md:w-[400px] h-full bg-[#111216] border-r border-white/5 flex flex-col shadow-2xl relative pointer-events-auto"
      >
        <div className="p-4 border-b border-white/5 bg-gradient-to-b from-[#1a1c22] to-transparent">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif uppercase tracking-widest text-amber-400 font-bold shadow-amber-900 drop-shadow-md">Tables Lobby</h2>
            <button onClick={() => setShowSidebar(false)} className="text-white/50 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full hover:bg-white/10">✕</button>
          </div>
          
          <div className="flex bg-black/40 rounded-lg p-1 border border-white/5 gap-1 shadow-inner relative">
             <div 
                className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-md cursor-pointer transition-colors relative z-10 ${activeTab === 'regular' ? 'text-amber-400' : 'text-white/50 hover:text-white'}`}
                onClick={() => setActiveTab('regular')}
             >
                Regular Table
             </div>
             <div 
                className={`flex-1 text-center py-2 text-xs font-bold uppercase tracking-wider rounded-md cursor-pointer transition-colors relative z-10 ${activeTab === 'tournament' ? 'text-amber-400' : 'text-white/50 hover:text-white'}`}
                onClick={() => setActiveTab('tournament')}
             >
                Tournament
             </div>
             {/* Slider bg */}
             <div className="absolute inset-y-1 bg-white/10 rounded-md transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] shadow-sm border border-white/10 z-0" style={{ width: 'calc(50% - 6px)', left: activeTab === 'regular' ? '4px' : 'calc(50% + 2px)' }}></div>
          </div>
          
          <div className="mt-3 flex justify-between items-center px-1">
             <div className="text-xs text-white/40 uppercase tracking-widest">{processedTables.length} Tables Found</div>
             <div className="relative isolate z-50">
               <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-amber-200/70 hover:text-amber-200 transition-colors bg-white/5 px-2 py-1 rounded"
               >
                  <Filter className="w-3 h-3" />
                  Sort By
               </button>
               {showFilters && (
                 <>
                 <div className="fixed inset-0 z-40" onClick={() => setShowFilters(false)} />
                 <div className="absolute top-full right-0 mt-1 w-40 bg-[#1e2025] border border-white/10 rounded-lg shadow-xl shadow-black/50 overflow-hidden z-50">
                   {[
                     { id: 'createdAt', label: 'Time Created' },
                     { id: 'liquidity', label: 'High Liquidity' },
                     { id: 'minBet', label: 'Lowest Bet' },
                     { id: 'maxBet', label: 'Highest Bet' },
                     { id: 'availableSeats', label: 'Available Seats' }
                   ].map(opt => (
                     <div 
                       key={opt.id}
                       className={cn("px-4 py-2.5 text-xs font-semibold cursor-pointer transition-colors", sortBy === opt.id ? "bg-amber-500/20 text-amber-400" : "text-white/60 hover:text-white hover:bg-white/5")}
                       onClick={() => { setSortBy(opt.id as any); setShowFilters(false); }}
                     >
                       {opt.label}
                     </div>
                   ))}
                 </div>
                 </>
               )}
             </div>
          </div>
        </div>
        
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5 pb-16"
        >
          {visibleTables.length === 0 ? (
            <div className="text-sm text-white/30 text-center py-12 italic">No {activeTab} tables found.</div>
          ) : (
            visibleTables.map(t => {
              const isCurrent = t.id === currentTableId;
              const hasFundLocked = currentUser ? !!t.userBalances?.[currentUser.id]?.balance : false;
              const isOfficial = t.houseId === 'system';
              const availableSeats = t.settings.maxSeats - t.seats.filter(s => s.userId !== null).length;
              
              const tournamentNetPrize = t.settings.mode === 'tournament' && t.settings.tournament 
                    ? Math.round(t.settings.tournament.ticketPrice * t.settings.maxSeats * (1 - ((t.settings.tournament.hostFeePct || 3) + (t.settings.tournament.platformFeePct || 2)) / 100))
                    : 0;
              
              return (
                <div 
                  key={t.id} 
                  className={cn(
                    "p-3 rounded-xl border transition-all cursor-pointer relative group isolate overflow-hidden", 
                    isCurrent ? "bg-white/10 border-amber-400/50 shadow-[0_0_20px_rgba(251,191,36,0.1)]" : "bg-black/30 border-white/5 hover:border-white/10 hover:bg-black/40"
                  )} 
                  onClick={() => {
                    if (!isCurrent) observeTable(t.id);
                    if (onNavigate) onNavigate();
                  }}
                >
                  {/* Pinned background glow for official */}
                  {isOfficial && (
                    <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent z-[-1]" />
                  )}
                  
                  {hasFundLocked && (
                    <div className="absolute top-0 right-0 bg-emerald-500/20 border-b border-l border-emerald-500/30 px-2 py-1 rounded-bl-lg">
                      <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        Funds Locked
                      </span>
                    </div>
                  )}

                  <div className="flex flex-col pr-12">
                     <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-white flex items-center gap-2 text-[15px]">
                           {isOfficial && <Shield className="w-4 h-4 text-amber-500 shrink-0" />}
                           {t.settings.mode === 'tournament' && !isOfficial && <Trophy className="w-4 h-4 text-yellow-500 shrink-0" />}
                           {t.settings.mode !== 'tournament' && !isOfficial && (
                              <div className="relative w-4 h-4 text-pink-400 shrink-0 inline-flex items-center justify-center">
                                 <Heart className="absolute w-4 h-4" strokeWidth={2} />
                                 <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="absolute top-1"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>
                              </div>
                           )}
                           <span className="truncate">{isOfficial ? "Randseed Table" : t.name}</span>
                           {!t.settings.isPublic && (
                              <Lock className="w-3 h-3 text-red-400 shrink-0" title="Private Table" />
                           )}
                           {t.settings.mode === 'tournament' && tournamentNetPrize > 0 && (
                              <span className="text-[10px] font-mono text-yellow-400 flex items-center gap-1 bg-yellow-500/10 px-1 border border-yellow-500/20 rounded">
                                 Prize: <Coins className="w-3 h-3" /> {tournamentNetPrize.toLocaleString()}
                              </span>
                           )}
                        </span>
                        {!isOfficial && t.settings.mode !== 'tournament' && (
                           <div className="flex items-center gap-1 text-teal-400 font-mono tracking-widest uppercase mt-0.5 shrink-0">
                              <span className="text-[9px]">LIQ:</span>
                              <Coins className="w-3 h-3" />
                              <span className="text-[10px]">{t.liquidity.toLocaleString()}</span>
                           </div>
                        )}
                     </div>
                     
                     <div className="text-sm text-white/60 mb-1 flex items-center gap-1">
                        {!isOfficial && t.description && <span className="truncate italic">"{t.description}"</span>}
                     </div>

                     <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                         <span className={cn("font-medium", getSpeedLabel(t.settings.actionTimeLimit) === 'Fast' ? 'text-amber-400' : 'text-emerald-400')}>
                             {getSpeedLabel(t.settings.actionTimeLimit)} Pace
                         </span>
                         {t.settings.mode === 'tournament' ? (
                             <span className="text-white/60 flex items-center gap-1">
                                 Ticket: <Coins className="w-3 h-3 text-amber-400" />
                                 {t.settings.tournament?.ticketPrice || 0}
                             </span>
                         ) : (
                             <span className="text-white/60 flex items-center gap-1">
                                 <Coins className="w-3 h-3 text-amber-400" />
                                 {t.settings.minBet} - {t.settings.maxBet}
                             </span>
                         )}
                         <span className={cn("text-[10px] font-black uppercase tracking-widest", availableSeats > 0 ? "text-white/80" : "text-red-400")}>
                             {availableSeats} / {t.settings.maxSeats} Available
                         </span>
                     </div>
                     
                     <div className="mt-2.5 flex items-center justify-between text-xs pt-2.5 border-t border-white/5">
                        <div className="flex items-center gap-1.5 text-white/50 cursor-pointer hover:text-white transition-colors">
                           <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                              <span className="text-[10px] font-black">{isOfficial ? "RS" : t.houseId.substring(0, 2).toUpperCase()}</span>
                           </div>
                           <span className="truncate max-w-[160px] text-[11px] font-semibold">{isOfficial ? "Randseed Official" : t.houseId}</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            {t.settings.mode === 'tournament' && (
                               <span className={cn("text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded", t.status === 'playing' ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400")}>
                                  {t.status === 'playing' ? 'Running' : 'Waiting'}
                               </span>
                            )}
                        </div>
                     </div>
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
