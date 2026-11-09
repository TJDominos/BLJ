import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  Trophy,
  Plus,
  Users,
  Lock,
  ChevronRight,
  X,
  Settings,
  Volume2,
  VolumeX,
  BarChart3,
  RefreshCw,
  KeyRound,
  LogOut
} from 'lucide-react';
import { useGameStore, getRuntimeGameStats, TableSettings, TournamentSettings } from '@/store/gameStore';
import { useUIStore, selectIsMuted } from '@/store/uiStore';
import { systemConfig } from '@/config/systemConfig';
import { calculateBaseRTP } from '@/backend/gameRules';
import { CurrencyIcon } from '@/components/CurrencyIcon';
import { soundManager } from '@/lib/sounds';
import { setRandseedMuted } from '@/lib/randseedRuntime';
import { cn } from '@/lib/utils';

interface HomeViewProps {
  onSelectTable: (tableId: string) => void;
  onNavigate: (view: 'lobby' | 'table' | 'host_table' | 'manage_tables', tableId?: string) => void;
}

type RoomFilter = 'all' | 'regular' | 'tournament';

export function HomeView({ onSelectTable, onNavigate }: HomeViewProps) {
  const {
    tables,
    currentUser,
    createTable,
    gameRecords,
    setCreatorIdentity,
    verifyPublisher,
    exitPublisherMode,
    refillGameCoins
  } = useGameStore();
  const isMuted = useUIStore(selectIsMuted);
  const setIsMuted = useUIStore(state => state.setIsMuted);

  const [roomFilter, setRoomFilter] = useState<RoomFilter>('all');
  const [activeRulesTab, setActiveRulesTab] = useState<'core' | 'sidebets' | 'modes'>('core');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const userHostedTables = useMemo(
    () => Object.values(tables).filter(t => t.houseId === currentUser?.id && t.status !== 'closed'),
    [tables, currentUser?.id]
  );

  // Creator perspective is enabled by default (Platform SDK also provides creator identity)
  const isCreator = true;

  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showCreatorAuthModal, setShowCreatorAuthModal] = useState(false);
  const [creatorAuthError, setCreatorAuthError] = useState<string | null>(null);
  const [serverStats, setServerStats] = useState<any>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Creator Custom Room state
  const [roomName, setRoomName] = useState('');
  const [roomDesc, setRoomDesc] = useState('');
  const [roomMode, setRoomMode] = useState<'regular' | 'tournament'>('regular');
  const [minBet, setMinBet] = useState(10);
  const [maxBet, setMaxBet] = useState(200);
  const [ticketPrice, setTicketPrice] = useState(100);
  const [startingChips, setStartingChips] = useState(5000);
  const [minBetChips, setMinBetChips] = useState(50);
  const [minSeats, setMinSeats] = useState(3);
  const [hostFeePct, setHostFeePct] = useState(3);
  const [isSurvivorCap, setIsSurvivorCap] = useState(true);
  const [targetSurvivors, setTargetSurvivors] = useState(1);
  const [isHardCapRounds, setIsHardCapRounds] = useState(true);
  const [maxRounds, setMaxRounds] = useState(20);
  const [isForcedAnte, setIsForcedAnte] = useState(false);
  const [antePct, setAntePct] = useState(1);
  const [isScheduledEscalation, setIsScheduledEscalation] = useState(true);
  const [escalationRounds, setEscalationRounds] = useState(5);
  const [prizeDistribution, setPrizeDistribution] = useState<'survivorPaytable' | 'splitByChips'>('survivorPaytable');
  const [maxSeats, setMaxSeats] = useState(5);
  const [actionTimeLimit, setActionTimeLimit] = useState(systemConfig.actionTimeLimit.normal);
  const [winningRule, setWinningRule] = useState<'standard' | 'dealer_wins_ties'>('standard');
  const [tableCode, setTableCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const filteredRooms = useMemo(() => {
    let list = Object.values(tables).filter(t => t.status !== 'closed' && t.status !== 'closing');

    if (roomFilter === 'regular') {
      list = list.filter(t => t.settings.mode !== 'tournament');
    } else if (roomFilter === 'tournament') {
      list = list.filter(t => t.settings.mode === 'tournament');
    }

    list.sort((a, b) => {
      if (a.houseId === 'system' && b.houseId !== 'system') return -1;
      if (b.houseId === 'system' && a.houseId !== 'system') return 1;
      return (a.createdAt || 0) - (b.createdAt || 0);
    });

    return list;
  }, [tables, roomFilter]);

  const loadRuntimeStats = async () => {
    setIsLoadingStats(true);
    setStatsError(null);
    try {
      const statsData = getRuntimeGameStats();
      setServerStats(statsData);
    } catch (err: any) {
      setStatsError(err?.message || 'Failed to load game statistics');
    } finally {
      setIsLoadingStats(false);
    }
  };

  const handleOpenStats = () => {
    setShowStatsModal(true);
    loadRuntimeStats();
  };

  const handleCreatorLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatorAuthError(null);
    const ok = await verifyPublisher();
    if (ok) {
      setShowCreatorAuthModal(false);
    } else {
      setCreatorAuthError('Unable to activate creator mode.');
    }
  };

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    soundManager.setMuted(next);
    setRandseedMuted(next).catch(() => {});
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = roomName.trim() || `${currentUser?.name || 'Creator'}'s Table`;
    const trimmedCode = tableCode.trim();
    if (trimmedCode.length > 0 && !/^\d{4}$/.test(trimmedCode)) {
      setCreateError('Table Code must be exactly 4 digits (0-9), or leave blank for a public table.');
      return;
    }
    if (roomMode === 'regular' && maxBet < minBet) {
      setCreateError('Max bet must be greater than or equal to min bet.');
      return;
    }
    if (roomMode === 'tournament' && !isSurvivorCap && !isHardCapRounds) {
      setCreateError('Tournament requires at least one Winning Rule (Survivor Cap or Round Cap).');
      return;
    }
    setCreateError(null);
    setIsCreating(true);

    const hasTableCode = /^\d{4}$/.test(trimmedCode);
    const safeMinSeats = Math.max(2, Math.min(minSeats, maxSeats));
    const safeTargetSurvivors = Math.max(1, Math.min(targetSurvivors, safeMinSeats - 1));

    const defaultTournament: TournamentSettings = {
      ticketPrice: Math.max(1, ticketPrice),
      startingChips: Math.max(100, startingChips),
      hostFeePct: Math.max(0, Math.min(20, hostFeePct)),
      platformFeePct: 2,
      minBetChips: Math.max(1, minBetChips),
      isForcedAnte,
      antePct: Math.max(1, Math.min(5, antePct)),
      isScheduledEscalation,
      escalationRounds: Math.max(2, Math.min(30, escalationRounds)),
      isSurvivorCap,
      targetSurvivors: safeTargetSurvivors,
      isHardCapRounds,
      maxRounds: Math.max(3, Math.min(1000, maxRounds)),
      prizeDistribution,
      minSeats: safeMinSeats,
      autoCloseAndRefundTimeHours: 1
    };

    const newSettings: TableSettings = {
      name: trimmedName,
      description: roomDesc.trim() || (roomMode === 'tournament' ? 'Knockout Tournament Table' : 'Custom Blackjack Table'),
      mode: roomMode,
      minBet: roomMode === 'regular' ? minBet : defaultTournament.minBetChips,
      maxBet: roomMode === 'regular' ? maxBet : defaultTournament.startingChips,
      minBuyIn: roomMode === 'regular' ? minBet * 5 : defaultTournament.ticketPrice,
      secretBets: roomMode === 'tournament',
      actionTimeLimit,
      isPublic: !hasTableCode,
      tableCode: hasTableCode ? trimmedCode : undefined,
      hasTableCode,
      maxSeats,
      winningRule,
      order: 'seat',
      tournament: defaultTournament
    };

    try {
      const requiredLiquidity = roomMode === 'tournament' ? 0 : maxBet * maxSeats * 2;
      const newId = await createTable(newSettings, requiredLiquidity);
      setIsCreating(false);
      setShowCreateModal(false);
      setTableCode('');
      if (newId) {
        onSelectTable(newId);
      }
    } catch (err: any) {
      setIsCreating(false);
      setCreateError(err?.message || 'Failed to create custom table.');
    }
  };

  return (
    <div className="w-full h-full max-w-[1280px] max-h-[720px] mx-auto flex flex-col bg-[#070b09] text-slate-100 select-none overflow-hidden relative">
      {/* Ambient Felt Radial Lighting */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(circle at 22% 20%, rgba(16, 78, 48, 0.38) 0%, transparent 55%), radial-gradient(circle at 80% 15%, rgba(198, 163, 100, 0.14) 0%, transparent 50%)'
        }}
      />

      {/* Iframe Max-Size Container (1280x720) */}
      <div className="relative z-10 w-full h-full flex flex-col overflow-hidden">
        {/* Top Header Bar: Global left/right padding 16px (px-4) */}
        <header className="w-full h-16 shrink-0 bg-[#111613]/95 border-b border-[#c6a364]/20 px-4 flex items-center justify-between gap-4">
          {/* Brand Title */}
          <div className="flex items-center gap-3 shrink-0">
            <Crown className="w-6 h-6 text-[#d4af37] shrink-0" />
            <span className="text-xl sm:text-2xl font-bold tracking-wider text-[#f5e6c8] whitespace-nowrap">
              ROYAL BLACKJACK
            </span>
          </div>

          {/* Right Controls: Game Coins Balance + Creator Game Stats */}
          <div className="flex items-center gap-2.5 shrink-0">
            {currentUser && (
              <div className="flex items-center gap-2 text-sm bg-black/45 border border-white/10 rounded-full px-4 py-2 tabular-nums">
                <CurrencyIcon currency="Chip" className="w-4 h-4" />
                <span className="text-slate-300 hidden sm:inline">Game Coins</span>
                <span className="text-base font-mono font-bold text-[#ffc53d]">
                  {currentUser.balance.toLocaleString()}
                </span>
                {currentUser.balance <= 0 && (
                  <button
                    onClick={() => {
                      soundManager.playChip();
                      refillGameCoins();
                    }}
                    className="ml-2 px-3 py-1 rounded-full bg-gradient-to-r from-[#ffd86b] to-[#eaaa08] text-[#090d0b] text-xs font-extrabold tracking-tight hover:brightness-110 transition-all cursor-pointer"
                    title="Claim free 5,000 Game Coins refill"
                  >
                    +5,000 Free
                  </button>
                )}
              </div>
            )}

            {/* Game Stats Entry */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenStats}
                title="Game Runtime Statistics"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors whitespace-nowrap cursor-pointer"
              >
                <BarChart3 className="w-4 h-4 text-emerald-400" />
                <span>Game Stats</span>
              </button>
            </div>
          </div>
        </header>

        {/* Main Workspace: Global padding 16px (p-4), grid spacing (gap-4) fitted to 1280x720 */}
        <main className="flex-1 min-h-0 w-full p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 overflow-y-auto lg:overflow-hidden">
          {/* LEFT COLUMN (5 Cols): Blackjack Felt Visual + Full-Size Game Rules */}
          <div className="lg:col-span-5 flex flex-col gap-4 min-h-0">
            {/* 1. Blackjack Poker Felt Showcase */}
            <div className="shrink-0 relative rounded-2xl bg-gradient-to-b from-[#164e2e] via-[#113d23] to-[#0b2616] border-2 border-[#6b4c2a] shadow-[inset_0_0_42px_rgba(0,0,0,0.75)] p-5 flex flex-col justify-between overflow-hidden">
              <div className="absolute inset-x-3 top-3 bottom-3 rounded-2xl border border-[#d4af37]/20 pointer-events-none" />

              {/* Top Felt Banner */}
              <div className="relative z-10 flex items-center justify-between gap-2 text-base sm:text-lg font-mono font-bold tracking-wider text-[#f0d078] uppercase">
                <span>♠ ♥ BLACKJACK PAYS 3 TO 2 ♣ ♦</span>
                <span className="text-xs sm:text-sm px-2.5 py-0.5 rounded-md bg-black/35 border border-[#d4af37]/30 text-[#f5e6c8]">
                  RTP {calculateBaseRTP('standard')}%
                </span>
              </div>

              {/* Cards Showcase: Dealer vs Player 21 */}
              <div className="relative z-10 mt-4 mb-1 flex items-center justify-around gap-4 py-1">
                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs sm:text-sm uppercase tracking-wider text-emerald-200 font-semibold">
                    Dealer · 17 Stands
                  </span>
                  <div className="flex items-center -space-x-3">
                    <div className="w-14 h-20 rounded-lg overflow-hidden border border-[#d4af37]/70 shadow-xl flex items-center justify-center -rotate-6 bg-[#18452B] shrink-0">
                      <img
                        src="/card-back.png"
                        alt="Dealer Hole Card"
                        className="w-full h-full object-cover rounded-md"
                      />
                    </div>
                    <div className="w-14 h-20 rounded-lg bg-white text-slate-900 border border-slate-200 shadow-lg p-2 flex flex-col justify-between rotate-6">
                      <div className="text-xs font-black leading-none">Q♣</div>
                      <div className="self-center text-xl leading-none">♣</div>
                      <div className="text-xs font-black leading-none self-end rotate-180">Q</div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <span className="text-base font-mono font-bold text-[#f5d97e] tracking-widest">VS</span>
                  <span className="text-xs text-emerald-200/75">Live Table</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                  <span className="text-xs sm:text-sm uppercase tracking-wider text-[#f5d97e] font-bold">
                    Natural 21 · 3:2
                  </span>
                  <div className="flex items-center -space-x-3">
                    <div className="w-14 h-20 rounded-lg bg-white text-slate-950 border-2 border-[#d4af37] shadow-xl p-2 flex flex-col justify-between -rotate-6">
                      <div className="text-xs font-black leading-none">A♠</div>
                      <div className="self-center text-xl leading-none">♠</div>
                      <div className="text-xs font-black leading-none self-end rotate-180">A</div>
                    </div>
                    <div className="w-14 h-20 rounded-lg bg-white text-[#dc2626] border-2 border-[#d4af37] shadow-xl p-2 flex flex-col justify-between rotate-6">
                      <div className="text-xs font-black leading-none">K♦</div>
                      <div className="self-center text-xl leading-none">♦</div>
                      <div className="text-xs font-black leading-none self-end rotate-180">K</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Game Rules & Payouts Card */}
            <div className="flex-1 min-h-0 rounded-2xl bg-[#111714]/95 border border-white/10 p-5 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-white/10 shrink-0">
                <h2 className="text-lg font-bold text-white tracking-wide whitespace-nowrap">Game Rules & Payouts</h2>

                <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs sm:text-sm shrink-0">
                  <button
                    onClick={() => setActiveRulesTab('core')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer',
                      activeRulesTab === 'core' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Core
                  </button>
                  <button
                    onClick={() => setActiveRulesTab('sidebets')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer',
                      activeRulesTab === 'sidebets' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Side Bets
                  </button>
                  <button
                    onClick={() => setActiveRulesTab('modes')}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer',
                      activeRulesTab === 'modes' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Actions
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pt-3 pr-1 space-y-2.5 text-sm sm:text-base">
                {activeRulesTab === 'core' && (
                  <>
                    <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="text-slate-200 font-medium">Natural Blackjack (A + 10/J/Q/K)</span>
                      <span className="font-mono font-bold text-[#f5d97e]">Pays 3 : 2</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="text-slate-200 font-medium">Standard Winning Hand</span>
                      <span className="font-mono font-bold text-emerald-400">Pays 1 : 1</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="text-slate-200 font-medium">Insurance (When Dealer shows Ace)</span>
                      <span className="font-mono font-bold text-sky-400">Pays 2 : 1</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5 px-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="text-slate-200 font-medium">Dealer Drawing Rule</span>
                      <span className="font-mono font-semibold text-slate-100">Hits ≤ 16 · Stands on all 17</span>
                    </div>
                  </>
                )}

                {activeRulesTab === 'sidebets' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5 space-y-2 text-sm">
                      <div className="text-base font-bold text-[#f5d97e]">Perfect Pair</div>
                      <div className="flex justify-between text-slate-200">
                        <span>Perfect Pair</span>
                        <span className="font-mono font-bold text-white">25:1</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Colored Pair</span>
                        <span className="font-mono font-bold text-white">12:1</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Mixed Pair</span>
                        <span className="font-mono font-bold text-white">6:1</span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3.5 space-y-2 text-sm">
                      <div className="text-base font-bold text-emerald-400">21 + 3 Poker</div>
                      <div className="flex justify-between text-slate-200">
                        <span>Suited Trips</span>
                        <span className="font-mono font-bold text-white">100:1</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Straight Flush</span>
                        <span className="font-mono font-bold text-white">40:1</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Three of a Kind</span>
                        <span className="font-mono font-bold text-white">30:1</span>
                      </div>
                      <div className="flex justify-between text-slate-200">
                        <span>Straight / Flush</span>
                        <span className="font-mono font-bold text-white">10:1 / 5:1</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeRulesTab === 'modes' && (
                  <div className="space-y-2.5 text-sm sm:text-base text-slate-200 leading-relaxed">
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="font-bold text-white">Double Down & Split: </span>
                      Double on any first 2 cards; split matching ranks up to 4 hands (split Aces receive 1 card each and stand).
                    </div>
                    <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="font-bold text-[#f5d97e]">Tournament Ticket & Allowance: </span>
                      Players purchase a tournament ticket using Game Coins, and every player receives an equal locked Tournament Allowance. Prize pool is awarded in Game Coins per Survivor Cap or Round Cap rules.
                    </div>
                  </div>
                )}
              </div>

              {/* Creator Identity Status Footer */}
              <div className="pt-2.5 mt-2 border-t border-white/10 flex items-center justify-between text-xs text-slate-400 shrink-0">
                <span>6 Decks · 75% Penetration · Deterministic Shoe</span>
                {!isCreator ? (
                  <button
                    onClick={() => setCreatorIdentity(true)}
                    className="flex items-center gap-1.5 text-slate-400 hover:text-[#f5d97e] transition-colors cursor-pointer"
                    title="Switch to Creator View (Platform SDK provides identity)"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>Creator View</span>
                  </button>
                ) : (
                  <span className="text-emerald-400 font-semibold">Creator Identity Active</span>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 Cols): Filter Bar + Create Custom Table + Tables List */}
          <div className="lg:col-span-7 rounded-2xl bg-[#111714]/95 border border-white/10 p-5 flex flex-col min-h-0 overflow-hidden">
            {/* Top Bar: Filter Tabs on Left + Create Custom Table Button on Right */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-1.5 bg-black/40 p-1.5 rounded-xl border border-white/10 text-sm">
                {(
                  [
                    { id: 'all', label: 'All Tables' },
                    { id: 'regular', label: 'Regular' },
                    { id: 'tournament', label: 'Tournament' }
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setRoomFilter(tab.id)}
                    className={cn(
                      'px-4 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer',
                      roomFilter === tab.id ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-3">
                {userHostedTables.length > 0 && (
                  <button
                    onClick={() => onNavigate('manage_tables')}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <Settings className="w-4 h-4 text-[#d4af37]" />
                    <span>My Tables ({userHostedTables.length})</span>
                  </button>
                )}

                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-5 py-2 rounded-xl text-sm sm:text-base font-bold text-[#04120b] bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 border border-emerald-300/40 shadow-[0_4px_14px_rgba(16,185,129,0.28)] transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span>Create Custom Table</span>
                </button>
              </div>
            </div>

            {/* Tables List */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-4">
              {filteredRooms.map((room) => {
                const isTournament = room.settings.mode === 'tournament';
                const isSystemTable = room.houseId === 'system';
                const occupiedSeats = room.seats.filter(s => s.userId !== null).length;
                const totalSeats = room.settings.maxSeats;
                const isFull = occupiedSeats >= totalSeats;
                const trn = room.settings.tournament;

                return (
                  <div
                    key={room.id}
                    onClick={() => onSelectTable(room.id)}
                    className={cn(
                      'group relative rounded-2xl p-5 sm:p-6 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer',
                      isSystemTable
                        ? 'bg-gradient-to-r from-[#14241b] to-[#0f1814] border-[#c6a364]/40 hover:border-[#d4af37]'
                        : 'bg-[#141b17] border-white/10 hover:border-[#c6a364]/50'
                    )}
                  >
                    {/* Left: Table Info & Visual Seat Occupancy */}
                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        {isTournament ? (
                          <span className="px-2.5 py-1 rounded-md bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Trophy className="w-3.5 h-3.5" /> Tournament
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider">
                            {isSystemTable ? 'Standard Table' : 'Creator Custom Room'}
                          </span>
                        )}

                        <h3 className="text-lg sm:text-xl font-bold text-white truncate group-hover:text-[#f5d97e] transition-colors flex items-center gap-2">
                          {(!room.settings.isPublic || room.settings.hasTableCode) && (
                            <Lock className="w-4 h-4 text-amber-400 shrink-0" title="Private Table (4-Digit Code)" />
                          )}
                          <span className="truncate">{room.name}</span>
                        </h3>

                        {(!room.settings.isPublic || room.settings.hasTableCode) && (
                          <span className="px-2.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-400/35 text-amber-300 text-xs font-semibold flex items-center gap-1.5 shrink-0">
                            <Lock className="w-3 h-3" />
                            <span>
                              Private
                              {room.houseId === currentUser?.id &&
                              room.settings.tableCode &&
                              room.settings.tableCode !== '****'
                                ? ` · ${room.settings.tableCode}`
                                : ''}
                            </span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-6 text-sm sm:text-base text-slate-200">
                        {isTournament && trn ? (
                          <>
                            <div className="flex items-center gap-2">
                              <CurrencyIcon currency="Chip" className="w-4 h-4" />
                              <span className="text-slate-400">Ticket:</span>
                              <span className="font-mono font-bold text-[#ffc53d]">
                                {trn.ticketPrice} Game Coins
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">Allowance:</span>
                              <span className="font-mono font-bold text-emerald-300">
                                {(trn.startingChips || 5000).toLocaleString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400">Win Rule:</span>
                              <span className="font-mono font-semibold text-amber-200">
                                {trn.isSurvivorCap ? `Top ${trn.targetSurvivors}` : ''}
                                {trn.isSurvivorCap && trn.isHardCapRounds ? ' · ' : ''}
                                {trn.isHardCapRounds ? `${trn.maxRounds} Rds` : ''}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <CurrencyIcon currency="Chip" className="w-4 h-4" />
                            <span className="text-slate-400">Bet Limits:</span>
                            <span className="font-mono font-bold text-white">
                              {room.settings.minBet} – {room.settings.maxBet}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-slate-400" />
                          <span className={cn('font-mono font-bold', isFull ? 'text-amber-400' : 'text-emerald-400')}>
                            {occupiedSeats}/{totalSeats} Seats
                          </span>
                        </div>

                        {/* Seat Dots */}
                        <div className="flex items-center gap-1.5">
                          {Array.from({ length: totalSeats }).map((_, idx) => {
                            const taken = Boolean(room.seats[idx]?.userId);
                            return (
                              <span
                                key={idx}
                                className={cn(
                                  'w-2.5 h-2.5 rounded-full transition-colors',
                                  taken ? 'bg-[#d4af37]' : 'bg-white/20'
                                )}
                              />
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Right: Single Enter Table Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectTable(room.id);
                      }}
                      className="px-5 py-3 rounded-xl text-sm sm:text-base font-bold text-[#090d0b] bg-[#e5c158] group-hover:bg-[#f5d97e] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Enter Table</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* CREATOR CUSTOM ROOM MODAL */}
      <AnimatePresence>
        {showCreateModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreateModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-xl rounded-2xl bg-[#121915] border border-[#c6a364]/35 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
                <div className="flex items-center gap-2.5">
                  <Crown className="w-5 h-5 text-[#d4af37]" />
                  <h3 className="text-lg font-bold text-white">Create Custom Table</h3>
                </div>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateRoom} className="p-6 overflow-y-auto space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-black/40 rounded-xl border border-white/10">
                  <button
                    type="button"
                    onClick={() => setRoomMode('regular')}
                    className={cn(
                      'py-2.5 px-4 rounded-lg text-sm font-bold transition-colors cursor-pointer',
                      roomMode === 'regular' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Regular Table
                  </button>
                  <button
                    type="button"
                    onClick={() => setRoomMode('tournament')}
                    className={cn(
                      'py-2.5 px-4 rounded-lg text-sm font-bold transition-colors cursor-pointer',
                      roomMode === 'tournament' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Tournament
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                      Table Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Table #VIP"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white text-sm focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-sm font-semibold text-slate-300 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                        <span>Code</span>
                      </label>
                      <span
                        className={cn(
                          'text-xs font-bold px-2 py-0.5 rounded-md',
                          tableCode.trim().length > 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        )}
                      >
                        {tableCode.trim().length > 0 ? 'Private' : 'Public'}
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="4 digits (e.g. 1234)"
                        value={tableCode}
                        onChange={(e) => setTableCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        className="w-full px-3.5 py-2.5 pr-16 rounded-xl bg-black/40 border border-white/15 text-amber-300 font-mono font-bold tracking-widest text-sm focus:outline-none focus:border-[#d4af37]"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tableCode) {
                            setTableCode('');
                          } else {
                            const randomPin = String(Math.floor(1000 + Math.random() * 9000));
                            setTableCode(randomPin);
                          }
                        }}
                        className="absolute right-2 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-slate-200 transition-colors cursor-pointer"
                      >
                        {tableCode ? 'Clear' : 'Random'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1.5">Max Seats ({maxSeats})</label>
                    <div className="flex items-center gap-2">
                      {[3, 5, 7].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => {
                            setMaxSeats(num);
                            if (minSeats > num) setMinSeats(num);
                            if (targetSurvivors >= num) setTargetSurvivors(Math.max(1, num - 1));
                          }}
                          className={cn(
                            'flex-1 py-2 rounded-xl text-sm font-mono font-bold border transition-colors cursor-pointer',
                            maxSeats === num
                              ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#f5d97e]'
                              : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                          )}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-300 mb-1.5">Turn Timer</label>
                    <div className="flex items-center gap-2">
                      {[
                        { label: '10s', val: 10 },
                        { label: '20s', val: 20 },
                        { label: '30s', val: 30 }
                      ].map((t) => (
                        <button
                          key={t.val}
                          type="button"
                          onClick={() => setActionTimeLimit(t.val)}
                          className={cn(
                            'flex-1 py-2 rounded-xl text-sm font-mono font-bold border transition-colors cursor-pointer',
                            actionTimeLimit === t.val
                              ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#f5d97e]'
                              : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {roomMode === 'regular' ? (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                        Min Bet (Game Coins) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={minBet}
                        onChange={(e) => setMinBet(Math.max(1, Number(e.target.value)))}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-300 mb-1.5">
                        Max Bet (Game Coins) <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="number"
                        min={minBet}
                        value={maxBet}
                        onChange={(e) => setMaxBet(Math.max(1, Number(e.target.value)))}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-black/40 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-xl bg-black/30 border border-[#d4af37]/25 p-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                      <span className="text-sm font-bold text-[#f5d97e] flex items-center gap-2">
                        <Trophy className="w-4 h-4" /> Tournament Ticket & Equal Locked Allowance
                      </span>
                      <span className="text-xs text-slate-300">
                        Est. Pool: {Math.round(ticketPrice * maxSeats * (1 - (hostFeePct + 2) / 100))} Game Coins
                      </span>
                    </div>

                    {/* Ticket Price (Game Coins), Equal Locked Tournament Allowance, Min Bet, Min Seats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-amber-300 mb-1">
                          Ticket Price (Coins) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={ticketPrice}
                          onChange={(e) => setTicketPrice(Math.max(1, Number(e.target.value)))}
                          className="w-full px-3 py-2 rounded-lg bg-black/50 border border-amber-400/30 text-[#ffc53d] font-mono font-bold text-sm focus:outline-none focus:border-[#d4af37]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-emerald-300 mb-1">
                          Locked Allowance <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min={100}
                          step={100}
                          value={startingChips}
                          onChange={(e) => setStartingChips(Math.max(100, Number(e.target.value)))}
                          className="w-full px-3 py-2 rounded-lg bg-black/50 border border-emerald-400/30 text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:border-[#d4af37]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Min Bet <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={minBetChips}
                          onChange={(e) => setMinBetChips(Math.max(1, Number(e.target.value)))}
                          className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#d4af37]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Min Seats (2–{maxSeats}) <span className="text-rose-400">*</span>
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={maxSeats}
                          value={minSeats}
                          onChange={(e) => {
                            const val = Math.max(2, Math.min(maxSeats, Number(e.target.value)));
                            setMinSeats(val);
                            if (targetSurvivors >= val) setTargetSurvivors(Math.max(1, val - 1));
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#d4af37]"
                        />
                      </div>
                    </div>

                    {/* Win Conditions: Survivor Cap & Round Cap */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div
                        className={cn(
                          'p-3 rounded-xl border transition-colors',
                          isSurvivorCap ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black/20 border-white/10 opacity-60'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-2 font-semibold text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSurvivorCap}
                              onChange={(e) => setIsSurvivorCap(e.target.checked)}
                              className="rounded accent-emerald-500"
                            />
                            <span>Survivor Cap</span>
                          </label>
                          <span className="text-xs text-emerald-300 font-mono">Knockout</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                          <span>End at Top N Survivors:</span>
                          <input
                            type="number"
                            disabled={!isSurvivorCap}
                            min={1}
                            max={Math.max(1, minSeats - 1)}
                            value={targetSurvivors}
                            onChange={(e) =>
                              setTargetSurvivors(Math.max(1, Math.min(Math.max(1, minSeats - 1), Number(e.target.value))))
                            }
                            className="w-16 px-2 py-1 rounded bg-black/50 border border-white/15 text-white font-mono text-center text-sm"
                          />
                        </div>
                      </div>

                      <div
                        className={cn(
                          'p-3 rounded-xl border transition-colors',
                          isHardCapRounds ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-black/20 border-white/10 opacity-60'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <label className="flex items-center gap-2 font-semibold text-white cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isHardCapRounds}
                              onChange={(e) => setIsHardCapRounds(e.target.checked)}
                              className="rounded accent-emerald-500"
                            />
                            <span>Round Cap</span>
                          </label>
                          <span className="text-xs text-emerald-300 font-mono">Max Hands</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
                          <span>Max Rounds:</span>
                          <input
                            type="number"
                            disabled={!isHardCapRounds}
                            min={3}
                            max={1000}
                            value={maxRounds}
                            onChange={(e) => setMaxRounds(Math.max(3, Math.min(1000, Number(e.target.value))))}
                            className="w-16 px-2 py-1 rounded bg-black/50 border border-white/15 text-white font-mono text-center text-sm"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Escalation Rules: Forced Ante & Double Blinds */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-2.5 rounded-xl bg-black/25 border border-white/10 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isForcedAnte}
                            onChange={(e) => setIsForcedAnte(e.target.checked)}
                            className="rounded accent-[#d4af37]"
                          />
                          <span>Forced Ante (%)</span>
                        </label>
                        <input
                          type="number"
                          disabled={!isForcedAnte}
                          min={1}
                          max={5}
                          value={antePct}
                          onChange={(e) => setAntePct(Math.max(1, Math.min(5, Number(e.target.value))))}
                          className="w-14 px-2 py-1 rounded bg-black/50 border border-white/15 text-white font-mono text-center text-xs"
                        />
                      </div>

                      <div className="p-2.5 rounded-xl bg-black/25 border border-white/10 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isScheduledEscalation}
                            onChange={(e) => setIsScheduledEscalation(e.target.checked)}
                            className="rounded accent-[#d4af37]"
                          />
                          <span>2x Blind Every Rds</span>
                        </label>
                        <input
                          type="number"
                          disabled={!isScheduledEscalation}
                          min={2}
                          max={30}
                          value={escalationRounds}
                          onChange={(e) => setEscalationRounds(Math.max(2, Math.min(30, Number(e.target.value))))}
                          className="w-14 px-2 py-1 rounded bg-black/50 border border-white/15 text-white font-mono text-center text-xs"
                        />
                      </div>
                    </div>

                    {/* Prize Distribution Mode & Host Fee */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Prize Pool Payout Rule
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPrizeDistribution('survivorPaytable')}
                            className={cn(
                              'py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer',
                              prizeDistribution === 'survivorPaytable'
                                ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#f5d97e]'
                                : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                            )}
                          >
                            Rank Paytable (1st/2nd/3rd)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrizeDistribution('splitByChips')}
                            className={cn(
                              'py-2 px-3 rounded-lg text-xs font-semibold border transition-colors cursor-pointer',
                              prizeDistribution === 'splitByChips'
                                ? 'bg-[#d4af37]/20 border-[#d4af37] text-[#f5d97e]'
                                : 'bg-black/30 border-white/10 text-slate-400 hover:text-white'
                            )}
                          >
                            Proportional by Allowance
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Host Fee (%)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={20}
                          value={hostFeePct}
                          onChange={(e) => setHostFeePct(Math.max(0, Math.min(20, Number(e.target.value))))}
                          className="w-full px-3 py-2 rounded-lg bg-black/50 border border-white/15 text-white font-mono text-sm focus:outline-none focus:border-[#d4af37]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {createError && (
                  <div className="text-sm text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-xl px-4 py-2.5">
                    {createError}
                  </div>
                )}

                <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating}
                    className="px-6 py-2.5 rounded-xl text-sm font-bold text-[#090d0b] bg-gradient-to-b from-[#f5d97e] to-[#c69c3a] hover:from-[#fae396] hover:to-[#d4ab46] transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isCreating ? 'Creating...' : 'Create & Enter'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATOR VERIFICATION MODAL */}
      <AnimatePresence>
        {showCreatorAuthModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowCreatorAuthModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-md rounded-2xl bg-[#121915] border border-[#c6a364]/35 shadow-2xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
                <div className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#d4af37]" />
                  <h3 className="text-base font-bold text-white">Creator Identity Verification</h3>
                </div>
                <button
                  onClick={() => setShowCreatorAuthModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatorLogin} className="p-5 space-y-4 text-sm">
                <p className="text-slate-300 leading-relaxed">
                  Switch to Creator perspective to view runtime statistics and table management.
                </p>
                {creatorAuthError && (
                  <div className="text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                    {creatorAuthError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreatorAuthModal(false)}
                    className="px-4 py-2 rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl font-bold text-[#090d0b] bg-[#d4af37] hover:bg-[#f5d97e] cursor-pointer"
                  >
                    Enable Creator View
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GAME RUNTIME STATISTICS MODAL */}
      <AnimatePresence>
        {showStatsModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowStatsModal(false);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.15 }}
              className="w-full max-w-2xl rounded-2xl bg-[#121915] border border-[#c6a364]/35 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-black/30">
                <div className="flex items-center gap-2.5">
                  <BarChart3 className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-bold text-white">Game Statistics Overview</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadRuntimeStats}
                    disabled={isLoadingStats}
                    className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={cn('w-4 h-4', isLoadingStats && 'animate-spin')} />
                    <span>Refresh</span>
                  </button>
                  <button
                    onClick={() => setShowStatsModal(false)}
                    className="text-slate-400 hover:text-white p-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-y-auto space-y-5 text-sm">
                {statsError ? (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300">
                    {statsError}
                  </div>
                ) : (
                  <>
                    {/* Primary Highlight: House Tokens Distributed & Total Users */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="rounded-xl bg-gradient-to-br from-[#1a2d21] to-[#111e16] border border-emerald-500/40 p-4 shadow-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                            <CurrencyIcon currency="Chip" className="w-4 h-4" />
                            House Distributed Tokens
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-500/30 font-medium">
                            Cumulative
                          </span>
                        </div>
                        <div className="text-2xl font-mono font-extrabold text-[#f5d97e] mt-2 flex items-baseline gap-2">
                          <span>{(serverStats?.houseDistributedTokens ?? 103400).toLocaleString()}</span>
                          <span className="text-xs font-sans text-slate-400 font-normal">Game Coins</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/10 text-xs text-slate-300 flex justify-between">
                          <span>Grants & Refills: {(serverStats?.tokensIssued ?? 65000).toLocaleString()}</span>
                          <span>Dealer Payouts: {(serverStats?.tokensPaidOut ?? 38400).toLocaleString()}</span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-gradient-to-br from-[#242116] to-[#17150e] border border-amber-500/40 p-4 shadow-lg">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            Total Registered Users
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/30 font-medium">
                            Platform
                          </span>
                        </div>
                        <div className="text-2xl font-mono font-extrabold text-white mt-2 flex items-baseline gap-2">
                          <span>{serverStats?.totalUsersCount ?? 13}</span>
                          <span className="text-xs font-sans text-slate-400 font-normal">Players</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-white/10 text-xs text-slate-300 flex justify-between">
                          <span>Active Seated: {serverStats?.seatedPlayersCount ?? 0}</span>
                          <span>Refills Claimed: {serverStats?.totalRefillsCount ?? 6}</span>
                        </div>
                      </div>
                    </div>

                    {/* Room & Platform Statistics */}
                    <div className="rounded-xl bg-black/35 border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold uppercase tracking-wider text-emerald-400">
                          1. Live Room Runtime Statistics
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          Uptime: {serverStats?.uptimeSeconds ?? 0}s
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                          <div className="text-xs text-slate-400">Active Tables</div>
                          <div className="text-lg font-mono font-bold text-white mt-1">
                            {serverStats?.activeRoomsCount ?? Object.values(tables).filter(t => t.status !== 'closed').length}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                          <div className="text-xs text-slate-400">Seated Players</div>
                          <div className="text-lg font-mono font-bold text-emerald-400 mt-1">
                            {serverStats?.seatedPlayersCount ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                          <div className="text-xs text-slate-400">Total Rounds</div>
                          <div className="text-lg font-mono font-bold text-[#ffc53d] mt-1">
                            {serverStats?.totalRoundsPlayed ?? 0}
                          </div>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3 border border-white/5">
                          <div className="text-xs text-slate-400">Table Visits</div>
                          <div className="text-lg font-mono font-bold text-sky-400 mt-1">
                            {serverStats?.totalVisits ?? 0}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-black/35 border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold uppercase tracking-wider text-[#f5d97e]">
                          2. Active Rooms Breakdown (@randseed/server-sdk)
                        </span>
                        <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-white/5 text-slate-300">
                          Rules: {serverStats?.rulesVersion || 'blackjack-v1.2.0'}
                        </span>
                      </div>

                      <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                        {(serverStats?.rooms || []).map((room: any) => (
                          <div
                            key={room.id}
                            className="flex items-center justify-between rounded-xl bg-white/5 px-3.5 py-2.5 border border-white/5 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">{room.name}</span>
                              <span
                                className={cn(
                                  'px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase',
                                  room.mode === 'tournament'
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                )}
                              >
                                {room.mode}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 font-mono text-slate-300">
                              <span>
                                Seats: <strong className="text-white">{room.seatedPlayers}/{room.maxSeats}</strong>
                              </span>
                              <span>
                                Rounds: <strong className="text-[#ffc53d]">{room.roundsPlayed}</strong>
                              </span>
                              <span>
                                Visits: <strong className="text-sky-400">{room.visits}</strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
