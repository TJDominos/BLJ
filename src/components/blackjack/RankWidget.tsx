import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User, X, Trophy, Coins, Zap, Shield, Flame, ChevronRight, History, Award } from 'lucide-react';
import { useGameStore, GameRecord } from '@/store/gameStore';
import { useNavigate } from '@/lib/router';
import { cn } from '@/lib/utils';
import { CurrencyIcon } from '@/components/CurrencyIcon';
import { getAvatarUrl } from '@/utils/avatar';

interface RankWidgetProps {
  externalOpen?: boolean;
  onExternalClose?: () => void;
  hideFloatingTrigger?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const RankWidget: React.FC<RankWidgetProps> = ({
  externalOpen,
  onExternalClose,
  hideFloatingTrigger = false,
  onOpenChange,
}) => {
  const { gameRecords, currentUser, tables } = useGameStore();
  const navigate = useNavigate();
  const [internalOpen, setInternalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'regular' | 'tournament'>('all');

  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const handleOpen = () => {
    setInternalOpen(true);
    onOpenChange?.(true);
  };
  const handleClose = () => {
    setInternalOpen(false);
    onOpenChange?.(false);
    onExternalClose?.();
  };

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

  // Filter player's personal records across all tables
  const playerRecords = useMemo(() => {
    if (!currentUser) return [];
    return gameRecords.filter(r => {
      return (r.seatResults || []).some(sr => sr.userId === currentUser.id);
    });
  }, [gameRecords, currentUser]);

  // Aggregate personal stats: cross-table, distinguishing regular and tournament
  const stats = useMemo(() => {
    let regularRounds = 0;
    let regularWins = 0;
    let regularNet = 0;
    let regularBlackjacks = 0;
    let regularDoubles = 0;
    let regularSplits = 0;
    let regularSideBetHands = 0;
    let regularSideBetWins = 0;
    let regularSideBetNet = 0;
    let regularSideBetGrossWin = 0;
    let regularPairWins = 0;
    let regularPlus3Wins = 0;
    let bestSingleWin = 0;

    let tournamentRounds = 0;
    let tournamentWins = 0;
    let tournamentNet = 0;
    let tournamentBlackjacks = 0;
    let tournamentSideBetHands = 0;
    let tournamentSideBetWins = 0;
    let tournamentSideBetNet = 0;
    let tournamentSideBetGrossWin = 0;
    let tournamentPairWins = 0;
    let tournamentPlus3Wins = 0;

    for (const record of playerRecords) {
      const targetTable = tables[record.tableId];
      const isTournament = targetTable?.settings.mode === 'tournament';
      const mySeats = (record.seatResults || []).filter(sr => sr.userId === currentUser?.id);

      for (const seat of mySeats) {
        const net = seat.net || 0;
        const isWin = seat.action.includes('won') || seat.action.includes('blackjack') || net > 0;
        const isBJ = seat.action.includes('blackjack');

        const sbWager = Number(seat.sideBet || 0);
        const sbWin = Number(seat.sideBetWin || 0);
        const hasSb = sbWager > 0 || sbWin > 0;
        const pWin = Number(seat.pairWin || 0);
        const p3Win = Number(seat.plus3Win || 0);

        if (net > bestSingleWin) {
          bestSingleWin = net;
        }

        if (isTournament) {
          tournamentRounds += 1;
          if (isWin) tournamentWins += 1;
          if (isBJ) tournamentBlackjacks += 1;
          tournamentNet += net;
          if (hasSb) {
            tournamentSideBetHands += 1;
            if (sbWin > 0) tournamentSideBetWins += 1;
            tournamentSideBetGrossWin += sbWin;
            tournamentSideBetNet += sbWin - sbWager;
          }
          if (pWin > 0) tournamentPairWins += 1;
          if (p3Win > 0) tournamentPlus3Wins += 1;
        } else {
          regularRounds += 1;
          if (isWin) regularWins += 1;
          if (isBJ) regularBlackjacks += 1;
          if (seat.action.includes('double') || seat.bet > (targetTable?.settings.minBet || 10) * 1.5) regularDoubles += 1;
          if (seat.isSplit) regularSplits += 1;
          regularNet += net;
          if (hasSb) {
            regularSideBetHands += 1;
            if (sbWin > 0) regularSideBetWins += 1;
            regularSideBetGrossWin += sbWin;
            regularSideBetNet += sbWin - sbWager;
          }
          if (pWin > 0) regularPairWins += 1;
          if (p3Win > 0) regularPlus3Wins += 1;
        }
      }
    }

    // Check tournament history from tables for tournament placement wins
    let tournamentsEntered = 0;
    let tournamentsWon = 0;
    let tournamentPrizeCoinsWon = 0;

    for (const t of Object.values(tables)) {
      if (t.settings.mode === 'tournament' && t.tournamentHistory) {
        for (const th of t.tournamentHistory) {
          const myIndex = th.winners.findIndex(w => w.userId === currentUser?.id);
          if (myIndex !== -1) {
            const myWin = th.winners[myIndex];
            tournamentsEntered += 1;
            tournamentPrizeCoinsWon += (myWin.prizeCoins || 0);
            if (myIndex === 0) tournamentsWon += 1;
          }
        }
      }
      // Also check if currently seated in an active tournament
      if (t.settings.mode === 'tournament' && t.seats.some(s => s.userId === currentUser?.id)) {
        tournamentsEntered = Math.max(tournamentsEntered, 1);
      }
    }

    const totalRounds = regularRounds + tournamentRounds;
    const totalWins = regularWins + tournamentWins;
    const totalNet = regularNet + tournamentNet + tournamentPrizeCoinsWon;
    const overallWinRate = totalRounds > 0 ? Math.round((totalWins / totalRounds) * 100) : 0;
    const regularWinRate = regularRounds > 0 ? Math.round((regularWins / regularRounds) * 100) : 0;
    const tournamentWinRate = tournamentRounds > 0 ? Math.round((tournamentWins / tournamentRounds) * 100) : 0;

    return {
      totalRounds,
      totalWins,
      overallWinRate,
      totalNet,
      bestSingleWin,
      sideBets: {
        hands: regularSideBetHands + tournamentSideBetHands,
        wins: regularSideBetWins + tournamentSideBetWins,
        net: regularSideBetNet + tournamentSideBetNet,
        grossWin: regularSideBetGrossWin + tournamentSideBetGrossWin,
        pairWins: regularPairWins + tournamentPairWins,
        plus3Wins: regularPlus3Wins + tournamentPlus3Wins,
      },
      regular: {
        rounds: regularRounds,
        wins: regularWins,
        winRate: regularWinRate,
        net: regularNet,
        blackjacks: regularBlackjacks,
        doubles: regularDoubles,
        splits: regularSplits,
        sideBetHands: regularSideBetHands,
        sideBetWins: regularSideBetWins,
        sideBetNet: regularSideBetNet,
        sideBetGrossWin: regularSideBetGrossWin,
        pairWins: regularPairWins,
        plus3Wins: regularPlus3Wins,
      },
      tournament: {
        entered: tournamentsEntered,
        topFinishes: tournamentsWon,
        rounds: tournamentRounds,
        wins: tournamentWins,
        winRate: tournamentWinRate,
        net: tournamentNet + tournamentPrizeCoinsWon,
        blackjacks: tournamentBlackjacks,
        sideBetHands: tournamentSideBetHands,
        sideBetWins: tournamentSideBetWins,
        sideBetNet: tournamentSideBetNet,
        sideBetGrossWin: tournamentSideBetGrossWin,
        pairWins: tournamentPairWins,
        plus3Wins: tournamentPlus3Wins,
      }
    };
  }, [playerRecords, tables, currentUser]);

  // Filtered recent game records
  const filteredRecords = useMemo(() => {
    return playerRecords.filter(r => {
      const isTournament = tables[r.tableId]?.settings.mode === 'tournament';
      if (activeTab === 'regular') return !isTournament;
      if (activeTab === 'tournament') return isTournament;
      return true;
    });
  }, [playerRecords, tables, activeTab]);

  const handleJoinTable = (targetTableId: string) => {
    navigate(`/t/${targetTableId}`);
    handleClose();
  };

  return (
    <>
      {/* Floating My Stats Trigger Button */}
      {!hideFloatingTrigger && (
        <div className="fixed right-0 top-[56%] -translate-y-1/2 z-[90] flex flex-col gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleOpen}
            title="My Stats"
            className="bg-zinc-950 border-y-2 border-l-2 border-[#d4af37] rounded-l-2xl p-2 md:p-2.5 pr-2.5 md:pr-3.5 shadow-[0_0_15px_rgba(212,175,55,0.35)] transition-all hover:-translate-x-1 cursor-pointer flex flex-col items-center group relative"
          >
            <User className="w-4 h-4 md:w-5 md:h-5 text-[#ffd86b] group-hover:scale-110 transition-transform" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-[#f5e6c8] mt-0.5">
              Stats
            </span>
          </button>
        </div>
      )}

      {/* Personal Stats Slide-Over Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-sm pointer-events-auto"
            />

            {/* Panel */}
            <motion.div
              initial={isMobile ? { y: '100%' } : { x: '100%' }}
              animate={isMobile ? { y: 0 } : { x: 0 }}
              exit={isMobile ? { y: '100%' } : { x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className={cn(
                'fixed z-[260] bg-[#101713] flex flex-col overflow-hidden shadow-2xl border-l border-[#d4af37]/30 pointer-events-auto',
                isMobile
                  ? 'bottom-0 left-0 right-0 h-[88vh] rounded-t-2xl'
                  : 'top-0 right-0 bottom-0 w-[380px]'
              )}
            >
              {/* Header */}
              <div className="p-4 border-b border-white/10 bg-[#0c120e] shrink-0 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleClose}
                    className="p-1 hover:bg-white/10 rounded-full transition-colors cursor-pointer text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-[#ffd86b]" />
                    <h2 className="text-base font-bold text-white tracking-wide">
                      My Stats
                    </h2>
                  </div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                  Cross-Table
                </span>
              </div>

              {/* Player Identity Card */}
              <div className="p-4 bg-gradient-to-r from-[#14231a] to-[#0d1611] border-b border-white/10 shrink-0 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-zinc-900 border border-[#d4af37]/60 overflow-hidden shrink-0 shadow-md flex items-center justify-center">
                    {currentUser?.avatar ? (
                      <img
                        src={currentUser.avatar}
                        alt="Player Avatar"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[#d4af37] font-bold text-sm bg-black/60 select-none">
                        {(currentUser?.name || 'P').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">
                      {currentUser?.name || 'Player'}
                    </div>
                    <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
                      <CurrencyIcon currency="Chip" className="w-3.5 h-3.5" />
                      <span className="text-[#ffd86b] font-bold">
                        {(currentUser?.balance ?? 5000).toLocaleString()}
                      </span>
                      <span>Coins</span>
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider">Net P/L</div>
                  <div className={cn(
                    'text-sm font-mono font-black mt-0.5',
                    stats.totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  )}>
                    {stats.totalNet >= 0 ? '+' : ''}{stats.totalNet.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Mode Tabs (Distinguishing Regular Table & Tournament) */}
              <div className="p-3 bg-black/40 border-b border-white/10 shrink-0">
                <div className="grid grid-cols-3 gap-1 bg-[#141b16] p-1 rounded-xl border border-white/10 text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab('all')}
                    className={cn(
                      'py-1.5 px-2 rounded-lg transition-all cursor-pointer truncate',
                      activeTab === 'all'
                        ? 'bg-[#d4af37] text-[#090d0b] font-bold shadow'
                        : 'text-slate-300 hover:text-white'
                    )}
                  >
                    All Modes
                  </button>
                  <button
                    onClick={() => setActiveTab('regular')}
                    className={cn(
                      'py-1.5 px-2 rounded-lg transition-all cursor-pointer truncate',
                      activeTab === 'regular'
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                        : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Regular
                  </button>
                  <button
                    onClick={() => setActiveTab('tournament')}
                    className={cn(
                      'py-1.5 px-2 rounded-lg transition-all cursor-pointer truncate',
                      activeTab === 'tournament'
                        ? 'bg-amber-500 text-slate-950 font-bold shadow'
                        : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Tournament
                  </button>
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* 1. Aggregate Stats Metrics Cards */}
                {activeTab === 'all' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Rounds</div>
                      <div className="text-xl font-mono font-bold text-white mt-1">
                        {stats.totalRounds}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                        {stats.totalWins} wins ({stats.overallWinRate}%)
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Total Net Won</div>
                      <div className={cn(
                        'text-xl font-mono font-bold mt-1',
                        stats.totalNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {stats.totalNet >= 0 ? '+' : ''}{stats.totalNet.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Coins
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Blackjacks</div>
                      <div className="text-xl font-mono font-bold text-[#ffd86b] mt-1">
                        {stats.regular.blackjacks + stats.tournament.blackjacks}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Natural 21s</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Best Single Win</div>
                      <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                        +{stats.bestSingleWin.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Highest Hand Net</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Won</div>
                      <div className="text-xl font-mono font-bold text-sky-300 mt-1">
                        {stats.sideBets.wins}
                        <span className="text-xs text-slate-400 font-normal">/{stats.sideBets.hands}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Pair: {stats.sideBets.pairWins} · 21+3: {stats.sideBets.plus3Wins}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Net</div>
                      <div className={cn(
                        'text-xl font-mono font-bold mt-1',
                        stats.sideBets.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {stats.sideBets.net >= 0 ? '+' : ''}{stats.sideBets.net.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Paid: +{stats.sideBets.grossWin.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'regular' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Regular Hands</div>
                      <div className="text-xl font-mono font-bold text-white mt-1">
                        {stats.regular.rounds}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                        {stats.regular.wins} wins ({stats.regular.winRate}%)
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Regular Net Won</div>
                      <div className={cn(
                        'text-xl font-mono font-bold mt-1',
                        stats.regular.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {stats.regular.net >= 0 ? '+' : ''}{stats.regular.net.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Coins</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Double Downs</div>
                      <div className="text-xl font-mono font-bold text-[#ffd86b] mt-1">
                        {stats.regular.doubles}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">2x Multipliers</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Natural BJ</div>
                      <div className="text-xl font-mono font-bold text-emerald-400 mt-1">
                        {stats.regular.blackjacks}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Pays 3:2</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Won</div>
                      <div className="text-xl font-mono font-bold text-sky-300 mt-1">
                        {stats.regular.sideBetWins}
                        <span className="text-xs text-slate-400 font-normal">/{stats.regular.sideBetHands}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Pair: {stats.regular.pairWins} · 21+3: {stats.regular.plus3Wins}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Net</div>
                      <div className={cn(
                        'text-xl font-mono font-bold mt-1',
                        stats.regular.sideBetNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {stats.regular.sideBetNet >= 0 ? '+' : ''}{stats.regular.sideBetNet.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Paid: +{stats.regular.sideBetGrossWin.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'tournament' && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Tournaments Entered</div>
                      <div className="text-xl font-mono font-bold text-white mt-1">
                        {stats.tournament.entered}
                      </div>
                      <div className="text-[10px] text-amber-300 font-mono mt-0.5">
                        {stats.tournament.topFinishes} 1st Place Wins
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Tournament Net</div>
                      <div className={cn(
                        'text-xl font-mono font-bold mt-1',
                        stats.tournament.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {stats.tournament.net >= 0 ? '+' : ''}{stats.tournament.net.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Prizes & Payouts</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Rounds Survived</div>
                      <div className="text-xl font-mono font-bold text-[#ffd86b] mt-1">
                        {stats.tournament.rounds}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                        {stats.tournament.wins} hands won
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Tournament Win Rate</div>
                      <div className="text-xl font-mono font-bold text-amber-400 mt-1">
                        {stats.tournament.winRate}%
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">Per-hand win rate</div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Won</div>
                      <div className="text-xl font-mono font-bold text-sky-300 mt-1">
                        {stats.tournament.sideBetWins}
                        <span className="text-xs text-slate-400 font-normal">/{stats.tournament.sideBetHands}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Pair: {stats.tournament.pairWins} · 21+3: {stats.tournament.plus3Wins}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Side Bets Net</div>
                      <div className={cn(
                        'text-xl font-mono font-bold mt-1',
                        stats.tournament.sideBetNet >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      )}>
                        {stats.tournament.sideBetNet >= 0 ? '+' : ''}{stats.tournament.sideBetNet.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        Paid: +{stats.tournament.sideBetGrossWin.toLocaleString()}
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. Recent Cross-Table Round History */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <History className="w-3.5 h-3.5 text-[#ffd86b]" />
                      Recent Game History
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {filteredRecords.length} records
                    </span>
                  </div>

                  <div className="space-y-2">
                    {filteredRecords.length === 0 ? (
                      <div className="p-6 rounded-xl bg-white/[0.02] border border-white/5 text-center text-xs text-slate-400 space-y-1">
                        <p className="font-semibold text-slate-300">No round history recorded yet.</p>
                        <p>Play hands at any table to build your cross-table stats.</p>
                      </div>
                    ) : (
                      filteredRecords.slice(0, 30).map((record) => {
                        const targetTable = tables[record.tableId];
                        const isTournament = targetTable?.settings.mode === 'tournament';
                        const mySeats = (record.seatResults || []).filter(sr => sr.userId === currentUser?.id);
                        const mySeat = mySeats[0];
                        const net = mySeats.length > 0
                          ? mySeats.reduce((sum, s) => sum + (s.net || 0), 0)
                          : (record.amountWon ?? 0);
                        const actionStr = (mySeat?.action || '').toLowerCase();
                        const isBJ = record.result === 'blackjack' || actionStr.includes('blackjack');
                        const isHandWon = actionStr.includes('won') || isBJ || (!mySeat && record.result === 'win');
                        const isPush = actionStr.includes('push') || (!mySeat && record.result === 'push');

                        // Build matched Side Bet badges across the player's seats in this round
                        const sideBetBadges: { label: string; won: boolean }[] = [];
                        let unmatchedSideLoss = 0;

                        for (const s of mySeats) {
                          const pBet = Number(s.pairBet || 0);
                          const pWin = Number(s.pairWin || 0);
                          const p3Bet = Number(s.plus3Bet || 0);
                          const p3Win = Number(s.plus3Win || 0);
                          const totalSb = Number(s.sideBet || 0);
                          const totalSbWin = Number(s.sideBetWin || 0);

                          if (pWin > 0) {
                            const mult = pBet > 0 ? Math.round(pWin / pBet) - 1 : 0;
                            const pairName =
                              mult >= 25
                                ? 'Perfect Pair 25:1'
                                : mult >= 12
                                ? 'Colored Pair 12:1'
                                : mult > 0
                                ? `Mixed Pair ${mult}:1`
                                : 'Pair Hit';
                            sideBetBadges.push({ label: `${pairName} (+${pWin})`, won: true });
                          } else if (pBet > 0) {
                            unmatchedSideLoss += pBet;
                          }

                          if (p3Win > 0) {
                            const mult = p3Bet > 0 ? Math.round(p3Win / p3Bet) - 1 : 0;
                            const plus3Name =
                              mult >= 100
                                ? '21+3 Suited Trips 100:1'
                                : mult >= 40
                                ? '21+3 Str. Flush 40:1'
                                : mult >= 30
                                ? '21+3 Trips 30:1'
                                : mult >= 10
                                ? '21+3 Straight 10:1'
                                : mult > 0
                                ? `21+3 Flush ${mult}:1`
                                : '21+3 Hit';
                            sideBetBadges.push({ label: `${plus3Name} (+${p3Win})`, won: true });
                          } else if (p3Bet > 0) {
                            unmatchedSideLoss += p3Bet;
                          }

                          // Fallback if legacy record only has aggregate sideBet / sideBetWin
                          if (pBet === 0 && p3Bet === 0 && pWin === 0 && p3Win === 0 && totalSb > 0) {
                            if (totalSbWin > 0) {
                              sideBetBadges.push({ label: `Side Hit (+${totalSbWin})`, won: true });
                            } else {
                              unmatchedSideLoss += totalSb;
                            }
                          }
                        }

                        if (unmatchedSideLoss > 0) {
                          sideBetBadges.push({ label: `Side -${unmatchedSideLoss}`, won: false });
                        }

                        return (
                          <div
                            key={record.id}
                            className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              {/* Table Badge with Click-to-Join */}
                              <div className="min-w-0 flex items-center gap-1.5">
                                <span className={cn(
                                  'px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider',
                                  isTournament
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                )}>
                                  {isTournament ? 'Tournament' : 'Regular'}
                                </span>

                                {targetTable ? (
                                  <button
                                    type="button"
                                    onClick={() => handleJoinTable(targetTable.id)}
                                    className="text-xs font-semibold text-slate-200 hover:text-[#ffd86b] truncate transition-colors flex items-center gap-0.5 cursor-pointer max-w-[130px]"
                                    title={`Join ${targetTable.name}`}
                                  >
                                    <span className="truncate">{targetTable.name}</span>
                                    <ChevronRight className="w-3 h-3 shrink-0 opacity-60" />
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400 truncate">
                                    Table #{record.tableId.substring(record.tableId.length - 4)}
                                  </span>
                                )}
                              </div>

                              {/* Result Badge */}
                              <span className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0',
                                isBJ
                                  ? 'bg-[#ffd86b]/20 text-[#ffd86b] border border-[#ffd86b]/40 font-extrabold'
                                  : isHandWon
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : isPush
                                  ? 'bg-slate-500/20 text-slate-300 border border-slate-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              )}>
                                {isBJ ? 'Blackjack 3:2' : isHandWon ? 'Won' : isPush ? 'Push' : 'Lost'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-300 pt-1 border-t border-white/5 gap-2">
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 flex-wrap">
                                <span>Score: {mySeat?.score ?? '-'}</span>
                                {record.dealerScore !== undefined && (
                                  <span>vs Dealer {record.dealerScore}</span>
                                )}
                                {sideBetBadges.map((badge, bIdx) => (
                                  <span
                                    key={bIdx}
                                    className={cn(
                                      'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border',
                                      badge.won
                                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40 shadow-[0_0_8px_rgba(16,185,129,0.2)]'
                                        : 'bg-white/5 text-slate-400 border-white/10'
                                    )}
                                  >
                                    {badge.label}
                                  </span>
                                ))}
                              </div>

                              <div className={cn(
                                'font-mono font-bold text-xs shrink-0',
                                net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-400'
                              )}>
                                {net > 0 ? '+' : ''}{net.toLocaleString()} Coins
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="p-3 bg-[#0c120e] border-t border-white/10 text-center shrink-0">
                <p className="text-[10px] text-slate-400 font-mono">
                  Personal records auto-synced across all regular & tournament tables
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
