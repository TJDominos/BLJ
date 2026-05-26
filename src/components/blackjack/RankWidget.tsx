import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Trophy, X, Zap, Medal, Clock, CalendarDays, Coins } from 'lucide-react';

// Rank entry interface
export interface RankEntry {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  rank: number;
  value: number;
  valueLabel?: string;
}

const mockNames = ["Alice", "Bob", "Charlie", "Dave", "Eve", "Frank", "Grace", "Heidi", "Ivan", "Judy", "Mallory", "Victor", "Peggy"];

function generateMockLeaderboard(seed: number, dimension: 'rounds' | 'amount', currentUserId?: string, userCurrentRounds: number = 0, userCurrentAmount: number = 0): RankEntry[] {
  const entries: RankEntry[] = [];
  let baseValue = dimension === 'rounds' ? 500 : 500000;
  
  for (let i = 0; i < 50; i++) {
    // Determine random names and avatars
    const randomIdx = (seed + i * 13) % mockNames.length;
    const name = mockNames[randomIdx] + (Math.floor((seed + i) % 99) + 1);
    const userId = `mock_${i}_${seed}`;
    const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`;
    
    // Add random variance to value
    const decrease = dimension === 'rounds' ? (Math.random() * 5 + 1) : (Math.random() * 5000 + 1000);
    baseValue -= decrease;
    
    entries.push({
      id: userId,
      userId,
      name,
      avatar,
      rank: i + 1,
      value: Math.max(0, baseValue)
    });
  }

  return entries;
}

export const RankWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  
  const [activeDimension, setActiveDimension] = useState<'rounds' | 'amount'>('amount');
  const [activeTimeframe, setActiveTimeframe] = useState<'allTime' | '30Days'>('allTime');
  const [isLoading, setIsLoading] = useState(false);

  // Generate deterministic mock data based on selected dimension/timeframe
  const currentData = useMemo(() => {
    const seed = (activeDimension === 'rounds' ? 100 : 200) + (activeTimeframe === 'allTime' ? 10 : 20);
    return generateMockLeaderboard(seed, activeDimension);
  }, [activeDimension, activeTimeframe]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const updateMobileState = (event?: MediaQueryList | MediaQueryListEvent) => {
      setIsMobile(event?.matches ?? mediaQuery.matches);
    };

    updateMobileState(mediaQuery);

    const handleChange = (event: MediaQueryListEvent) => {
      updateMobileState(event);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const getRankAppearance = (rank: number) => {
    if (rank === 1) return { color: 'text-yellow-400', bg: 'bg-yellow-400/20', border: 'border-yellow-400', icon: true };
    if (rank === 2) return { color: 'text-zinc-300', bg: 'bg-zinc-300/20', border: 'border-zinc-300', icon: true };
    if (rank === 3) return { color: 'text-amber-600', bg: 'bg-amber-600/20', border: 'border-amber-600', icon: true };
    return { color: 'text-zinc-500', bg: 'bg-zinc-800', border: 'border-transparent', icon: false };
  };

  return (
    <>
      {/* Floating Rank Button */}
      <div className="fixed right-0 top-[calc(50%+2.5rem)] md:top-[calc(50%+3.5rem)] -translate-y-1/2 z-[90] flex flex-col gap-[7px] pointer-events-auto">
        <div 
          className="bg-zinc-950 border-y-2 border-l-2 border-yellow-500 rounded-l-2xl p-2 md:p-3 pr-2.5 md:pr-4 shadow-[0_0_15px_rgba(234,179,8,0.3)] transition-transform hover:-translate-x-1 cursor-pointer flex flex-col items-center group relative"
          onClick={() => setIsOpen(true)}
        >
          <Trophy className="w-5 h-5 md:w-6 md:h-6 text-yellow-400" />
        </div>
      </div>

      {/* Rank Panel / Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={isMobile ? { opacity: 0 } : { opacity: 1 }}
              animate={isMobile ? { opacity: 1 } : { opacity: 1 }}
              exit={isMobile ? { opacity: 0 } : { opacity: 1 }}
              onClick={() => setIsOpen(false)}
              className={`fixed inset-0 z-[90] pointer-events-auto ${isMobile ? 'bg-black/60 backdrop-blur-[4px]' : 'bg-transparent'}`}
            />

            {/* Panel */}
            <motion.div
              initial={isMobile ? { y: '100%' } : { x: '100%' }}
              animate={isMobile ? { y: 0 } : { x: 0 }}
              exit={isMobile ? { y: '100%' } : { x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed z-[100] bg-[#18181b] flex flex-col overflow-hidden shadow-2xl border-l-[1px] border-zinc-800 pointer-events-auto
                ${isMobile 
                  ? 'bottom-0 left-0 right-0 h-[85vh] rounded-t-[21px]' 
                  : 'top-0 right-0 bottom-0 w-[320px]'
                }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-[14px] border-b-[1px] border-zinc-800 bg-zinc-900 shrink-0">
                <div className="flex items-center gap-[10.5px]">
                  <button onClick={() => setIsOpen(false)} className="p-[3.5px] hover:bg-zinc-800 rounded-full transition-colors">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                  <h2 className="text-[15.75px] font-semibold text-white flex items-center gap-[7px]">
                    <Trophy className="w-5 h-5 text-yellow-400" />
                    Game Ranks
                  </h2>
                </div>
              </div>

              {/* Sub-Header / Filters */}
              <div className="p-[14px] bg-zinc-900/50 border-b-[1px] border-zinc-800 shrink-0 flex flex-col gap-[10.5px]">
                {/* Dimension Toggle */}
                <div className="flex bg-zinc-950 rounded-[10.5px] p-[3.5px] border-[1px] border-zinc-800">
                  <button
                    onClick={() => setActiveDimension('rounds')}
                    className={`flex-1 flex items-center justify-center gap-[7px] py-[7px] text-[12.25px] font-semibold rounded-[7px] transition-colors ${
                      activeDimension === 'rounds' ? 'bg-zinc-800 text-yellow-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Zap className="w-4 h-4" /> Win Rounds
                  </button>
                  <button
                    onClick={() => setActiveDimension('amount')}
                    className={`flex-1 flex items-center justify-center gap-[7px] py-[7px] text-[12.25px] font-semibold rounded-[7px] transition-colors ${
                      activeDimension === 'amount' ? 'bg-zinc-800 text-emerald-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Coins className="w-4 h-4" /> Win Amount
                  </button>
                </div>

                {/* Timeframe Toggle */}
                <div className="flex bg-zinc-950 rounded-[7px] p-[3.5px] border-[1px] border-zinc-800 w-2/3 mx-auto">
                  <button
                    onClick={() => setActiveTimeframe('30Days')}
                    className={`flex-1 flex items-center justify-center gap-[5.25px] py-[5.25px] text-[10.5px] font-semibold rounded-[5.25px] transition-colors ${
                      activeTimeframe === '30Days' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <CalendarDays className="w-3 h-3" /> 30 Days
                  </button>
                  <button
                    onClick={() => setActiveTimeframe('allTime')}
                    className={`flex-1 flex items-center justify-center gap-[5.25px] py-[5.25px] text-[10.5px] font-semibold rounded-[5.25px] transition-colors ${
                      activeTimeframe === 'allTime' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Clock className="w-3 h-3" /> All-Time
                  </button>
                </div>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-[14px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="flex flex-col gap-[7px]">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={`${activeDimension}_${activeTimeframe}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex flex-col gap-[7px]"
                    >
                      {currentData.length === 0 ? (
                        <div className="px-[10.5px] py-[21px] text-center text-[12px] text-zinc-500">
                          {isLoading ? 'Loading ranking data...' : 'No ranking data yet.'}
                        </div>
                      ) : currentData.map((player) => {
                        const style = getRankAppearance(player.rank);
                        const valueLabel = player.valueLabel
                          ? player.valueLabel
                          : activeDimension === 'rounds'
                            ? `${Math.floor(player.value)}`
                            : player.value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
                        
                        return (
                          <div 
                            key={player.id} 
                            className="flex items-center gap-[10.5px] p-[8.75px] bg-zinc-800/40 hover:bg-zinc-800/80 transition-colors rounded-[10.5px] border-[1px] border-white/5"
                          >
                            <div className={`w-[28px] h-[28px] rounded-full flex items-center justify-center border-2 shrink-0 ${style.bg} ${style.border}`}>
                              {style.icon ? (
                                <Medal className={`w-4 h-4 ${style.color}`} />
                              ) : (
                                <span className={`text-[10.5px] font-bold font-mono ${style.color}`}>
                                  {player.rank}
                                </span>
                              )}
                            </div>
                            
                            <div className="shrink-0">
                              <img src={player.avatar} alt={player.name} className="w-8 h-8 rounded-full border border-white/10 bg-zinc-900" />
                            </div>
                            
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-zinc-200 text-sm truncate">
                                {player.name}
                              </div>
                              {player.rank <= 3 && (
                                <p className={`text-[10px] uppercase tracking-wider font-bold ${style.color}`}>
                                  {player.rank === 1 ? '1st Place' : player.rank === 2 ? '2nd Place' : '3rd Place'}
                                </p>
                              )}
                            </div>
                            
                            <div className="text-right shrink-0">
                              <div className={`${activeDimension === 'rounds' ? 'text-yellow-400' : 'text-emerald-400'} font-mono font-bold text-[14px]`}>
                                {activeDimension === 'rounds' ? valueLabel : (
                                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                    <span className="text-xs">$</span>
                                    <span>{valueLabel}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
              
              {/* Footer text */}
              <div className="p-[10.5px] bg-zinc-900 border-t-[1px] border-zinc-800 text-center shrink-0">
                <p className="text-[10px] text-zinc-500 font-mono">Showing Top 50 Global Players ({activeDimension === 'rounds' ? 'Rounds' : 'Wins'})</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
