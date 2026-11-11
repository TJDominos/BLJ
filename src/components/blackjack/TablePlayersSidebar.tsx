import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Crown, Coins, User, Trophy } from 'lucide-react';
import { Table, GameRecord, useGameStore, SeatResult } from '@/store/gameStore';
import { cn } from '@/lib/utils';

interface TablePlayersSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table;
  gameRecords: GameRecord[];
}

interface NormalizedRound {
  id: string;
  timestamp: number;
  seatResults: SeatResult[];
}

export function TablePlayersSidebar({ isOpen, onClose, table, gameRecords }: TablePlayersSidebarProps) {
  const { currentUser, onlinePlayers, tables } = useGameStore();

  // Merge server/room roundHistory for this table with local gameRecords for this table (deduplicated)
  const mergedTableRounds = useMemo<NormalizedRound[]>(() => {
    const map = new Map<string, NormalizedRound>();

    if (Array.isArray(table.roundHistory)) {
      for (const r of table.roundHistory) {
        if (!r || !Array.isArray(r.seatResults)) continue;
        const key = (r as any).id || r.roundId || `ts_${r.timestamp}`;
        map.set(key, {
          id: key,
          timestamp: r.timestamp || 0,
          seatResults: r.seatResults,
        });
      }
    }

    for (const rec of gameRecords) {
      if (rec.tableId !== table.id || !Array.isArray(rec.seatResults)) continue;
      const key = rec.id.replace(/^rec_/, '');
      if (!map.has(key)) {
        map.set(key, {
          id: key,
          timestamp: rec.timestamp || 0,
          seatResults: rec.seatResults,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
  }, [table.id, table.roundHistory, gameRecords]);

  // Helper to resolve real player name & avatar
  const resolvePlayerIdentity = (userId: string, fallbackName?: string, fallbackAvatar?: string) => {
    if (currentUser && userId === currentUser.id) {
      return {
        name: currentUser.name || fallbackName || 'Player',
        avatar: currentUser.avatar || fallbackAvatar,
      };
    }

    const onlineMatch = onlinePlayers.find(p => p.userId === userId);
    if (onlineMatch) {
      return {
        name: onlineMatch.name || fallbackName || userId.substring(0, 12),
        avatar: onlineMatch.avatar || fallbackAvatar,
      };
    }

    for (const t of Object.values(tables)) {
      for (const s of t.seats) {
        if (s.userId === userId) {
          return {
            name: s.name || fallbackName || userId.substring(0, 12),
            avatar: s.avatar || fallbackAvatar,
          };
        }
      }
    }

    return {
      name: fallbackName || userId.replace(/^bot_/, 'Bot ').substring(0, 12),
      avatar: fallbackAvatar,
    };
  };

  // My Record on THIS table
  const myTableStats = useMemo(() => {
    let rounds = 0;
    let wins = 0;
    let net = 0;
    let blackjacks = 0;
    let bestSingleWin = 0;
    let sideBetHands = 0;
    let sideBetWins = 0;
    let sideBetNet = 0;
    let sideBetGrossWin = 0;
    let pairHits = 0;
    let plus3Hits = 0;

    if (!currentUser) {
      return {
        rounds: 0,
        wins: 0,
        winRate: 0,
        net: 0,
        blackjacks: 0,
        bestSingleWin: 0,
        sideBetHands: 0,
        sideBetWins: 0,
        sideBetNet: 0,
        sideBetGrossWin: 0,
        pairHits: 0,
        plus3Hits: 0,
      };
    }

    for (const round of mergedTableRounds) {
      const mySeats = (round.seatResults || []).filter(sr => sr.userId === currentUser.id);
      if (mySeats.length === 0) continue;

      for (const sr of mySeats) {
        rounds += 1;
        const handNet = Number(sr.net || 0);
        const actionStr = String(sr.action || '').toLowerCase();
        const isWin = actionStr.includes('won') || actionStr.includes('blackjack') || handNet > 0;
        const isBJ = actionStr.includes('blackjack');

        if (isWin) wins += 1;
        if (isBJ) blackjacks += 1;
        if (handNet > bestSingleWin) bestSingleWin = handNet;
        net += handNet;

        const sbWager = Number(sr.sideBet || 0);
        const sbWin = Number(sr.sideBetWin || 0);
        if (sbWager > 0 || sbWin > 0) {
          sideBetHands += 1;
          if (sbWin > 0) sideBetWins += 1;
          sideBetGrossWin += sbWin;
          sideBetNet += sbWin - sbWager;
        }
        if (Number(sr.pairWin || 0) > 0) pairHits += 1;
        if (Number(sr.plus3Win || 0) > 0) plus3Hits += 1;
      }
    }

    const winRate = rounds > 0 ? Math.round((wins / rounds) * 100) : 0;
    return {
      rounds,
      wins,
      winRate,
      net,
      blackjacks,
      bestSingleWin,
      sideBetHands,
      sideBetWins,
      sideBetNet,
      sideBetGrossWin,
      pairHits,
      plus3Hits,
    };
  }, [mergedTableRounds, currentUser]);

  // Table Record: Cumulative net ranking for all players who played on THIS table
  const tableLeaderboard = useMemo(() => {
    const stats: Record<
      string,
      {
        userId: string;
        name: string;
        avatar?: string;
        rounds: number;
        wins: number;
        amountWon: number;
        sideBetWins: number;
        sideBetNet: number;
      }
    > = {};

    for (const round of mergedTableRounds) {
      const usersInRound = new Set<string>();

      for (const sr of round.seatResults || []) {
        if (!sr.userId) continue;
        usersInRound.add(sr.userId);
        const identity = resolvePlayerIdentity(sr.userId, sr.playerName, sr.playerAvatar);
        if (!stats[sr.userId]) {
          stats[sr.userId] = {
            userId: sr.userId,
            name: identity.name,
            avatar: identity.avatar,
            rounds: 0,
            wins: 0,
            amountWon: 0,
            sideBetWins: 0,
            sideBetNet: 0,
          };
        } else {
          if (identity.name && stats[sr.userId].name === sr.userId.substring(0, 12)) {
            stats[sr.userId].name = identity.name;
          }
          if (identity.avatar && !stats[sr.userId].avatar) {
            stats[sr.userId].avatar = identity.avatar;
          }
        }

        const handNet = Number(sr.net || 0);
        const actionStr = String(sr.action || '').toLowerCase();
        const isWin = actionStr.includes('won') || actionStr.includes('blackjack') || handNet > 0;
        if (isWin) {
          stats[sr.userId].wins += 1;
        }
        stats[sr.userId].amountWon += handNet;

        const sbWager = Number(sr.sideBet || 0);
        const sbWin = Number(sr.sideBetWin || 0);
        if (sbWin > 0) {
          stats[sr.userId].sideBetWins += 1;
        }
        if (sbWager > 0 || sbWin > 0) {
          stats[sr.userId].sideBetNet += sbWin - sbWager;
        }
      }

      usersInRound.forEach(uid => {
        if (stats[uid]) {
          stats[uid].rounds += 1;
        }
      });
    }

    return Object.values(stats).sort((a, b) => b.amountWon - a.amountWon);
  }, [mergedTableRounds, currentUser, onlinePlayers, tables]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm pointer-events-auto"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-[88vw] max-w-[384px] sm:w-96 bg-zinc-950/95 backdrop-blur-xl border-r border-[#d4af37]/30 z-[260] shadow-[10px_0_30px_rgba(0,0,0,0.85)] flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-zinc-800 rounded-full transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Coins className="w-5 h-5 text-[#ffd86b] shrink-0" />
                    <span className="truncate">Play Board</span>
                  </h2>
                  <p className="text-[11px] text-zinc-400 truncate">{table.name}</p>
                </div>
              </div>
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-[#d4af37]/15 border border-[#d4af37]/30 text-[#ffd86b] shrink-0">
                {mergedTableRounds.length} Rounds
              </span>
            </div>

            {/* Content Area: My Record (This Table) + Table Record (Sorted by Cumulative Net) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Section 1: My Record on This Table */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#f5d97e] flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-[#ffd86b]" />
                    My Record
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">This Table</span>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Rounds</div>
                    <div className="text-xl font-mono font-bold text-white mt-1">
                      {myTableStats.rounds}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                      {myTableStats.wins} wins ({myTableStats.winRate}%)
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Net Won</div>
                    <div
                      className={cn(
                        'text-xl font-mono font-bold mt-1',
                        myTableStats.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {myTableStats.net >= 0 ? '+' : ''}
                      {myTableStats.net.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">Coins</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Blackjacks</div>
                    <div className="text-xl font-mono font-bold text-[#ffd86b] mt-1">
                      {myTableStats.blackjacks}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Natural 21s</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Best Single Win</div>
                    <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                      +{myTableStats.bestSingleWin.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Highest Hand Net</div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Won</div>
                    <div className="text-xl font-mono font-bold text-sky-300 mt-1">
                      {myTableStats.sideBetWins}
                      <span className="text-xs text-slate-400 font-normal">/{myTableStats.sideBetHands}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Pair: {myTableStats.pairHits} · 21+3: {myTableStats.plus3Hits}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/10">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Net</div>
                    <div
                      className={cn(
                        'text-xl font-mono font-bold mt-1',
                        myTableStats.sideBetNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}
                    >
                      {myTableStats.sideBetNet >= 0 ? '+' : ''}
                      {myTableStats.sideBetNet.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      Paid: +{myTableStats.sideBetGrossWin.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Table Record (Ranked by Cumulative Net on This Table) */}
              <div className="space-y-2.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                    Table Record
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">Sorted by Net Won</span>
                </div>

                <div className="rounded-xl bg-white/[0.02] border border-white/10 overflow-hidden">
                  <div className="grid grid-cols-12 py-2 px-3 bg-white/[0.03] border-b border-white/10 text-[10px] font-bold text-white/50 uppercase tracking-widest">
                    <span className="col-span-6">Player</span>
                    <span className="col-span-3 text-center">Rounds</span>
                    <span className="col-span-3 text-right">Net</span>
                  </div>

                  <div className="divide-y divide-white/5">
                    {tableLeaderboard.length === 0 ? (
                      <div className="text-center py-8 px-4 text-white/35 text-xs">
                        No table records yet. Complete a hand on this table to appear on the leaderboard.
                      </div>
                    ) : (
                      tableLeaderboard.map((user, idx) => {
                        const isMe = user.userId === currentUser?.id;
                        return (
                          <div
                            key={user.userId}
                            className={cn(
                              'grid grid-cols-12 items-center py-2.5 px-3 hover:bg-white/[0.04] transition-colors',
                              idx === 0 ? 'bg-yellow-500/5' : '',
                              isMe ? 'bg-emerald-500/5' : ''
                            )}
                          >
                            {/* Player Identity */}
                            <div className="col-span-6 flex items-center gap-2.5 min-w-0 pr-1">
                              <span
                                className={cn(
                                  'w-4 text-[11px] font-mono font-bold text-center shrink-0',
                                  idx === 0
                                    ? 'text-yellow-400'
                                    : idx === 1
                                    ? 'text-slate-300'
                                    : idx === 2
                                    ? 'text-amber-500'
                                    : 'text-zinc-500'
                                )}
                              >
                                {idx + 1}
                              </span>
                              <div className="relative shrink-0">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#126b6f] to-[#0a3e40] border border-white/15 overflow-hidden flex items-center justify-center text-white font-bold text-[11px] select-none">
                                  {user.avatar ? (
                                    <img
                                      src={user.avatar}
                                      alt={user.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    (user.name || 'P').charAt(0).toUpperCase()
                                  )}
                                </div>
                                {idx === 0 && (
                                  <div className="absolute -top-1 -right-1 bg-yellow-500 rounded-full p-[2px] shadow-lg">
                                    <Crown className="w-2 h-2 text-zinc-950" />
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div
                                  className={cn(
                                    'text-xs font-bold truncate flex items-center gap-1',
                                    idx === 0 ? 'text-yellow-400' : 'text-white'
                                  )}
                                >
                                  <span className="truncate">{user.name}</span>
                                  {isMe && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-zinc-400 font-mono flex items-center gap-1.5">
                                  <span>{user.wins} wins</span>
                                  {user.sideBetWins > 0 && (
                                    <span className="text-sky-300">· {user.sideBetWins} side</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Rounds */}
                            <div className="col-span-3 text-center font-mono text-xs text-zinc-300">
                              {user.rounds}
                            </div>

                            {/* Cumulative Net Amount */}
                            <div className="col-span-3 text-right">
                              <span
                                className={cn(
                                  'text-xs font-mono font-bold whitespace-nowrap',
                                  user.amountWon >= 0 ? 'text-emerald-400' : 'text-rose-400'
                                )}
                              >
                                {user.amountWon >= 0 ? '+' : ''}
                                {user.amountWon.toLocaleString()}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 bg-zinc-900 border-t border-zinc-800 text-center shrink-0">
              <p className="text-[10px] text-zinc-400 font-mono">
                Real-time cumulative standings for {table.name}
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
