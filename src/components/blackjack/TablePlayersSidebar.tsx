import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Users, Crown, Zap, Coins, ChevronRight } from 'lucide-react';
import { Table, GameRecord, useGameStore } from '@/store/gameStore';
import { useNavigate } from '@/lib/router';
import { cn } from '@/lib/utils';
import { getAvatarUrl } from '@/utils/avatar';

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
  const { tables, currentUser } = useGameStore();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'online' | 'records'>('online');

  // Compute cumulative stats for all users who ever played on this table or session
  const cumulative = useMemo(() => {
    const stats: Record<string, { rounds: number; wins: number; amountWon: number }> = {};
    
    // We only care about records for THIS table
    const tableRecords = gameRecords.filter(r => r.tableId === table.id);
    
    tableRecords.forEach(record => {
      const usersInRound = new Set<string>();
      
      record.seatResults?.forEach(sr => {
        if (sr.userId) usersInRound.add(sr.userId);
      });
      
      usersInRound.forEach(uid => {
        if (!stats[uid]) stats[uid] = { rounds: 0, wins: 0, amountWon: 0 };
        stats[uid].rounds += 1;
      });
      
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
      name: userId.replace('bot_', 'Bot ').substring(0, 12),
      ...data
    })).sort((a,b) => b.amountWon - a.amountWon);

    if (computed.length === 0) {
      return [...SAMPLE_DATA].sort((a,b) => b.amountWon - a.amountWon);
    }
    return computed;
  }, [gameRecords, table.id]);

  // Online users seated across active tables, prioritizing current table
  const onlineUsers = useMemo(() => {
    const userMap = new Map<string, {
      userId: string;
      name: string;
      isPlaying: boolean;
      tableId: string;
      tableName: string;
      rounds: number;
      wins: number;
    }>();

    const activeTablesList = Object.values(tables).filter(
      t => t.status !== 'closed' && t.status !== 'closing'
    );

    // Current table first
    activeTablesList.sort((a, b) => {
      if (a.id === table.id) return -1;
      if (b.id === table.id) return 1;
      return 0;
    });

    for (const t of activeTablesList) {
      for (const s of t.seats) {
        if (s.userId) {
          const uid = s.userId;
          const stats = cumulative.find(c => c.userId === uid) || { rounds: 1, wins: 0 };
          const isPlaying = Boolean(s.hand);
          const isMe = uid === currentUser?.id;
          const name = isMe ? (currentUser?.name || 'You') : (s.name || uid.replace('bot_', 'Bot ').substring(0, 12));
          
          if (!userMap.has(uid)) {
            userMap.set(uid, {
              userId: uid,
              name,
              isPlaying,
              tableId: t.id,
              tableName: t.name,
              rounds: stats.rounds,
              wins: stats.wins
            });
          }
        }
      }
    }

    const list = Array.from(userMap.values());
    if (list.length === 0) {
      return SAMPLE_DATA.map(u => ({
        ...u,
        tableId: table.id,
        tableName: table.name,
      }));
    }
    return list;
  }, [tables, table.id, table.name, cumulative, currentUser]);

  const handleJoinTable = (targetTableId: string) => {
    if (targetTableId === table.id) return;
    navigate(`/t/${targetTableId}`);
    onClose();
  };

  const getPlayerCurrentTable = (userId: string) => {
    return Object.values(tables).find(t => 
      t.status !== 'closed' && t.status !== 'closing' && t.seats.some(s => s.userId === userId)
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm pointer-events-auto"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-88 sm:w-96 bg-zinc-950/95 backdrop-blur-xl border-r border-[#10b981]/30 z-[100] shadow-[10px_0_30px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900 shrink-0">
              <div className="flex items-center gap-3">
                <button 
                  onClick={onClose}
                  className="p-1 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-[#3b82f6]" />
                  <span>Play Board</span>
                </h2>
              </div>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-blue-300">
                {onlineUsers.length} Players
              </span>
            </div>

            {/* Tabs */}
            <div className="p-3.5 bg-zinc-900/50 border-b border-zinc-800 shrink-0 flex flex-col gap-2.5">
              <div className="flex bg-zinc-950 rounded-xl p-1 border border-zinc-800">
                <button
                  onClick={() => setActiveTab('online')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                    activeTab === 'online' ? "bg-zinc-800 text-[#10b981] shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Zap className="w-3.5 h-3.5" /> Online Users
                </button>
                <button
                  onClick={() => setActiveTab('records')}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer",
                    activeTab === 'records' ? "bg-zinc-800 text-[#3b82f6] shadow-sm" : "text-zinc-400 hover:text-zinc-200"
                  )}
                >
                  <Coins className="w-3.5 h-3.5" /> Table Records
                </button>
              </div>
            </div>

            {/* List Content */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.15 }}
                  className="flex flex-col h-full"
                >
                  {activeTab === 'online' ? (
                    <div className="w-full">
                      <div className="grid grid-cols-12 pb-2 border-b border-white/10 text-[10px] font-bold text-white/50 uppercase tracking-widest px-1">
                        <span className="col-span-5">Player</span>
                        <span className="col-span-5">Current Table</span>
                        <span className="col-span-2 text-right">Wins</span>
                      </div>

                      <div className="divide-y divide-white/5">
                        {onlineUsers.length === 0 ? (
                          <div className="text-center py-8 text-white/30 text-sm italic">
                            No users online
                          </div>
                        ) : (
                          onlineUsers.map(user => {
                            const isCurrentTable = user.tableId === table.id;
                            return (
                              <div
                                key={user.userId}
                                className="grid grid-cols-12 items-center py-2.5 px-1 hover:bg-white/[0.03] transition-colors rounded-lg"
                              >
                                {/* Player Info */}
                                <div className="col-span-5 flex items-center gap-2 min-w-0 pr-1">
                                  <div className="relative shrink-0">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#126b6f] to-[#0a3e40] border border-white/10 flex items-center justify-center text-white font-bold text-[11px] select-none">
                                      {(user.name || 'P').charAt(0).toUpperCase()}
                                    </div>
                                    {user.isPlaying && (
                                      <div
                                        className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-[#10b981] rounded-full border border-zinc-950 shadow-[0_0_4px_rgba(16,185,129,0.8)]"
                                        title="Playing"
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-white truncate capitalize">
                                      {user.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 font-mono">
                                      {user.rounds} rds
                                    </div>
                                  </div>
                                </div>

                                {/* Table Name & Click to Join */}
                                <div className="col-span-5 pr-1">
                                  {isCurrentTable ? (
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 max-w-[130px] truncate">
                                      <span className="truncate">{user.tableName}</span>
                                      <span className="text-[9px] text-emerald-400 font-mono shrink-0">(Here)</span>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleJoinTable(user.tableId)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 hover:text-white transition-all cursor-pointer max-w-[130px] group/btn"
                                      title={`Click to join table: ${user.tableName}`}
                                    >
                                      <span className="truncate">{user.tableName}</span>
                                      <ChevronRight className="w-3 h-3 shrink-0 group-hover/btn:translate-x-0.5 transition-transform" />
                                    </button>
                                  )}
                                </div>

                                {/* Wins Count */}
                                <div className="col-span-2 text-right">
                                  <span className="text-xs font-mono font-bold text-[#10b981] bg-[#10b981]/10 px-1.5 py-0.5 rounded">
                                    {user.wins}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="grid grid-cols-12 pb-2 border-b border-white/10 text-[10px] font-bold text-white/50 uppercase tracking-widest px-1">
                        <span className="col-span-5">Player</span>
                        <span className="col-span-4">Table</span>
                        <span className="col-span-3 text-right">Net</span>
                      </div>

                      <div className="divide-y divide-white/5">
                        {cumulative.length === 0 ? (
                          <div className="text-center py-8 text-white/30 text-sm italic">
                            No records yet
                          </div>
                        ) : (
                          cumulative.map((user, idx) => {
                            const curTable = getPlayerCurrentTable(user.userId);
                            const isHere = curTable?.id === table.id;
                            return (
                              <div
                                key={user.userId}
                                className={cn(
                                  "grid grid-cols-12 items-center py-2.5 px-1 hover:bg-white/[0.03] transition-colors rounded-lg",
                                  idx === 0 ? "bg-yellow-500/5" : ""
                                )}
                              >
                                {/* Player */}
                                <div className="col-span-5 flex items-center gap-2 min-w-0 pr-1">
                                  <div className="relative shrink-0">
                                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#126b6f] to-[#0a3e40] border border-white/10 flex items-center justify-center text-white font-bold text-[11px] select-none">
                                      {(user.name || 'P').charAt(0).toUpperCase()}
                                    </div>
                                    {idx === 0 && (
                                      <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-[2px] shadow-lg">
                                        <Crown className="w-2 h-2 text-zinc-950" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className={cn("text-xs font-bold truncate capitalize", idx === 0 ? "text-yellow-400" : "text-white")}>
                                      {user.name}
                                    </div>
                                    <div className="text-[10px] text-zinc-400 font-mono">
                                      {user.wins} wins
                                    </div>
                                  </div>
                                </div>

                                {/* Table Name & Join */}
                                <div className="col-span-4 pr-1">
                                  {curTable ? (
                                    isHere ? (
                                      <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 max-w-[110px] truncate">
                                        <span className="truncate">{curTable.name}</span>
                                      </div>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleJoinTable(curTable.id)}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 hover:text-white transition-all cursor-pointer max-w-[110px] group/btn"
                                        title={`Click to join ${curTable.name}`}
                                      >
                                        <span className="truncate">{curTable.name}</span>
                                        <ChevronRight className="w-2.5 h-2.5 shrink-0 group-hover/btn:translate-x-0.5 transition-transform" />
                                      </button>
                                    )
                                  ) : (
                                    <span className="text-[10px] text-zinc-500 italic">Lobby</span>
                                  )}
                                </div>

                                {/* Net Amount */}
                                <div className="col-span-3 text-right">
                                  <span className={cn("text-xs font-mono font-bold whitespace-nowrap", user.amountWon >= 0 ? "text-emerald-400" : "text-red-400")}>
                                    {user.amountWon >= 0 ? '+' : ''}{user.amountWon}
                                  </span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="p-3 bg-zinc-900 border-t border-zinc-800 text-center shrink-0">
              <p className="text-[10px] text-zinc-400 font-mono">
                Click any table badge to join table directly
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
