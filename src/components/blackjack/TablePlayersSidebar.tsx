import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Crown, Zap, Coins } from 'lucide-react';
import { Table, GameRecord } from '@/store/gameStore';
import { cn } from '@/lib/utils';

interface TablePlayersSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  gameRecords: GameRecord[];
}

const SAMPLE_DATA = [
  { userId: 'mock_1', name: 'Alice', rounds: 45, wins: 12, amountWon: 1250, isPlaying: true },
  { userId: 'mock_2', name: 'Bob', rounds: 32, wins: 8, amountWon: -400, isPlaying: true },
  { userId: 'mock_3', name: 'Charlie', rounds: 12, wins: 5, amountWon: 300, isPlaying: false },
  { userId: 'mock_4', name: 'Dave', rounds: 115, wins: 42, amountWon: 5400, isPlaying: false },
  { userId: 'mock_5', name: 'Eve', rounds: 88, wins: 33, amountWon: 2100, isPlaying: false },
];

export function TablePlayersSidebar({ isOpen, onClose, table, gameRecords }: TablePlayersSidebarProps) {
  const [activeTab, setActiveTab] = useState<'online' | 'records'>('online');

  // Compute cumulative stats for all users who ever played on this table
  const cumulative = React.useMemo(() => {
    const stats: Record<string, { rounds: number, wins: number, amountWon: number }> = {};
    
    // We only care about records for THIS table
    const tableRecords = gameRecords.filter(r => r.tableId === table.id);
    
    tableRecords.forEach(record => {
      // Keep track of which users played in this round so we increment their rounds only once per game
      const usersInRound = new Set<string>();
      
      record.seatResults?.forEach(sr => {
        if (sr.userId) usersInRound.add(sr.userId);
      });
      
      usersInRound.forEach(uid => {
        if (!stats[uid]) stats[uid] = { rounds: 0, wins: 0, amountWon: 0 };
        stats[uid].rounds += 1;
      });
      
      // Accumulate wins and amounts
      record.seatResults?.forEach(sr => {
        if (!sr.userId) return;
        const isWin = sr.action.includes('won') || sr.action.includes('blackjack') || sr.net > 0;
        if (isWin) {
          stats[sr.userId].wins += 1;
        }
        stats[sr.userId].amountWon += (sr.net || 0);
      });
    });
    
    const computed = Object.entries(stats).map(([userId, data]) => ({
      userId,
      name: userId.replace('bot_', 'Bot ').substring(0, 10),
      ...data
    })).sort((a,b) => b.amountWon - a.amountWon);

    if (computed.length === 0) {
      return [...SAMPLE_DATA].sort((a,b) => b.amountWon - a.amountWon);
    }
    return computed;
  }, [gameRecords, table.id]);

  // Online users are those currently seated
  const onlineUsers = React.useMemo(() => {
    const users = new Set<string>();
    // Collect users in order of seats, which roughly gives some order
    table.seats.forEach(s => {
      if (s.userId) users.add(s.userId);
    });
    
    const computed = Array.from(users).map(uid => {
      const stats = cumulative.find(c => c.userId === uid) || { rounds: 0, wins: 0, amountWon: 0 };
      const isPlaying = table.seats.some(s => s.userId === uid && s.hand);
      return {
        userId: uid,
        name: uid.replace('bot_', 'Bot ').substring(0, 10),
        isPlaying,
        ...stats
      };
    });

    if (computed.length === 0) {
      return SAMPLE_DATA.filter(u => u.isPlaying);
    }
    return computed;
  }, [table.seats, cumulative]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-transparent pointer-events-auto"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-80 bg-zinc-950/95 backdrop-blur-xl border-r border-[#10b981]/30 z-[100] shadow-[10px_0_30px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto"
          >
        <div className="flex items-center justify-between p-[14px] border-b-[1px] border-zinc-800 bg-zinc-900 shrink-0">
          <div className="flex items-center gap-[10.5px]">
            <button 
              onClick={onClose}
              className="p-[3.5px] hover:bg-zinc-800 rounded-full transition-colors inline-block"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
            <h2 className="text-[15.75px] font-semibold text-white flex items-center gap-[7px]">
              <Users className="w-5 h-5 text-[#3b82f6]" />
              Play Board
            </h2>
          </div>
        </div>

        {/* Header / Tabs */}
        <div className="p-[14px] bg-zinc-900/50 border-b-[1px] border-zinc-800 shrink-0 flex flex-col gap-[10.5px]">
          <div className="flex bg-zinc-950 rounded-[10.5px] p-[3.5px] border-[1px] border-zinc-800">
            <button
              onClick={() => setActiveTab('online')}
              className={cn(
                "flex-1 flex items-center justify-center gap-[7px] py-[7px] text-[12.25px] font-semibold rounded-[7px] transition-colors",
                activeTab === 'online' ? "bg-zinc-800 text-[#10b981] shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Zap className="w-4 h-4" /> Online Users
            </button>
            <button
              onClick={() => setActiveTab('records')}
              className={cn(
                "flex-1 flex items-center justify-center gap-[7px] py-[7px] text-[12.25px] font-semibold rounded-[7px] transition-colors",
                activeTab === 'records' ? "bg-zinc-800 text-[#3b82f6] shadow-sm" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              <Coins className="w-4 h-4" /> Table Records
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-[14px] custom-scrollbar flex flex-col gap-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col h-full"
            >
              {activeTab === 'online' ? (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="pb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest">Player</th>
                        <th className="pb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest text-right">Rounds</th>
                        <th className="pb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest text-right">Wins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {onlineUsers.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-4 text-white/30 text-sm italic">No users online</td>
                        </tr>
                      ) : (
                        onlineUsers.map(user => (
                          <tr key={user.userId} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-2">
                                <div className="relative shrink-0">
                                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.userId}`} alt="avatar" className="w-7 h-7 rounded-full bg-black/40" />
                                  {user.isPlaying && (
                                    <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-[#10b981] rounded-full border border-zinc-950/95 shadow-[0_0_4px_rgba(16,185,129,0.8)]" title="Playing"></div>
                                  )}
                                </div>
                                <div className="text-[12px] font-bold text-white truncate max-w-[80px] capitalize">
                                  {user.name}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 text-right text-[11px] font-mono text-white/80">{user.rounds}</td>
                            <td className="py-2 text-right">
                              <span className="text-[11px] font-mono text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded">{user.wins}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="pb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest">Player</th>
                        <th className="pb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest text-right">Wins</th>
                        <th className="pb-2 text-[10px] font-bold text-white/50 uppercase tracking-widest text-right">Net Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cumulative.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="text-center py-4 text-white/30 text-sm italic">No records yet</td>
                        </tr>
                      ) : (
                        cumulative.map((user, idx) => (
                          <tr key={user.userId} className={cn("border-b border-white/5 hover:bg-white/5 transition-colors", idx === 0 ? "bg-yellow-500/5 group" : "")}>
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-2">
                                <div className="relative shrink-0">
                                  <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.userId}`} alt="avatar" className="w-7 h-7 rounded-full bg-black/40" />
                                  {idx === 0 && (
                                    <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-[2px] shadow-lg">
                                      <Crown className="w-2 h-2 text-zinc-950" />
                                    </div>
                                  )}
                                </div>
                                <div className={cn("text-[12px] font-bold truncate max-w-[80px] capitalize", idx === 0 ? "text-yellow-500" : "text-white")}>
                                  {user.name}
                                </div>
                              </div>
                            </td>
                            <td className="py-2 text-right text-[11px] font-mono text-white/80">{user.wins}</td>
                            <td className="py-2 text-right">
                              <span className={cn("text-[11px] font-mono font-bold whitespace-nowrap", user.amountWon >= 0 ? "text-emerald-400" : "text-red-400")}>
                                {user.amountWon >= 0 ? '+' : ''}{user.amountWon}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
      </>
      )}
    </AnimatePresence>
  );
}
