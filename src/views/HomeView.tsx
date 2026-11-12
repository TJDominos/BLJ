import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Crown,
  Trophy,
  Plus,
  Users,
  Lock,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Settings,
  Volume2,
  VolumeX,
  BarChart3,
  RefreshCw,
  KeyRound,
  LogOut,
  User,
  Zap,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { useGameStore, getRuntimeGameStats, TableSettings, TournamentSettings } from '@/store/gameStore';
import { useUIStore, selectIsMuted } from '@/store/uiStore';
import { systemConfig } from '@/config/systemConfig';
import { calculateBaseRTP } from '@/backend/gameRules';
import { CurrencyIcon } from '@/components/CurrencyIcon';
import { RankWidget } from '@/components/blackjack/RankWidget';
import { RoyalBlackjackLogo } from '@/components/blackjack/DealerAreaUI';
import { soundManager } from '@/lib/sounds';
import { setRandseedMuted } from '@/lib/randseedRuntime';
import { cn } from '@/lib/utils';

interface HomeViewProps {
  onSelectTable: (tableId: string) => void;
  onNavigate: (view: 'lobby' | 'table' | 'host_table' | 'manage_tables', tableId?: string) => void;
}

type RoomFilter = 'regular' | 'tournament';

export function HomeView({ onSelectTable, onNavigate }: HomeViewProps) {
  const {
    tables,
    currentUser,
    onlinePlayers,
    createTable,
    gameRecords,
    setCreatorIdentity,
    verifyPublisher,
    exitPublisherMode,
    refillGameCoins,
    roomStatus,
    roomError,
    reconnectRoom
  } = useGameStore();
  const isMuted = useUIStore(selectIsMuted);
  const setIsMuted = useUIStore(state => state.setIsMuted);

  const [roomFilter, setRoomFilter] = useState<RoomFilter>('regular');
  const [activeRulesTab, setActiveRulesTab] = useState<'online' | 'core' | 'sidebets' | 'modes'>('online');
  const [isMobileOnlineExpanded, setIsMobileOnlineExpanded] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showMyStatsModal, setShowMyStatsModal] = useState(false);

  const userHostedTables = useMemo(
    () => Object.values(tables).filter(t => t.houseId === currentUser?.id && t.status !== 'closed'),
    [tables, currentUser?.id]
  );

  // Real online players list enriched with current table info
  const realOnlineList = useMemo(() => {
    const map = new Map<
      string,
      {
        userId: string;
        name: string;
        avatar?: string;
        tableId?: string;
        tableName?: string;
        isPlaying?: boolean;
      }
    >();

    for (const p of onlinePlayers) {
      if (!p.userId) continue;
      map.set(p.userId, {
        userId: p.userId,
        name: p.userId === currentUser?.id ? (currentUser.name || p.name) : p.name,
        avatar: p.userId === currentUser?.id ? (currentUser.avatar || p.avatar) : p.avatar,
        tableId: p.tableId,
        tableName: p.tableName,
        isPlaying: p.isPlaying,
      });
    }

    // Also ensure any seated player on active tables is represented with their real seat data
    for (const t of Object.values(tables)) {
      if (t.status === 'closed' || t.status === 'closing') continue;
      for (const s of t.seats) {
        if (!s.userId) continue;
        const existing = map.get(s.userId);
        const isMe = s.userId === currentUser?.id;
        map.set(s.userId, {
          userId: s.userId,
          name: isMe ? (currentUser?.name || s.name || 'Player') : (existing?.name || s.name || s.userId.substring(0, 12)),
          avatar: isMe ? (currentUser?.avatar || s.avatar) : (existing?.avatar || s.avatar),
          tableId: t.id,
          tableName: t.name,
          isPlaying: Boolean(s.hand) || t.status === 'playing',
        });
      }
    }

    if (currentUser && !map.has(currentUser.id)) {
      map.set(currentUser.id, {
        userId: currentUser.id,
        name: currentUser.name,
        avatar: currentUser.avatar,
        isPlaying: false,
      });
    }

    return Array.from(map.values());
  }, [onlinePlayers, tables, currentUser]);

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
    <div className="w-full h-full max-w-[1280px] mx-auto flex flex-col bg-[#070b09] text-slate-100 select-none overflow-hidden relative">
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
        <header className="w-full h-14 sm:h-16 shrink-0 bg-[#111613]/95 border-b border-[#c6a364]/20 px-2.5 sm:px-4 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand Title */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0">
            <RoyalBlackjackLogo className="w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-md shrink-0" />
            <span className="text-sm sm:text-lg md:text-2xl font-bold tracking-wider text-[#f5e6c8] whitespace-nowrap truncate">
              <span className="hidden xs:inline">ROYAL </span>BLACKJACK
            </span>
          </div>

          {/* Right Controls: Game Coins Balance + My Stats + Game Stats */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {currentUser && (
              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm bg-black/45 border border-white/10 rounded-full px-2.5 sm:px-4 py-1.5 sm:py-2 tabular-nums">
                <CurrencyIcon currency="Chip" className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="text-slate-300 hidden md:inline">Coins</span>
                <span className="text-xs sm:text-base font-mono font-bold text-[#ffc53d]">
                  {currentUser.balance.toLocaleString()}
                </span>
                {currentUser.balance <= 0 && (
                  <button
                    onClick={() => {
                      soundManager.playChip();
                      refillGameCoins();
                    }}
                    className="ml-1 sm:ml-2 px-2 sm:px-3 py-0.5 sm:py-1 rounded-full bg-gradient-to-r from-[#ffd86b] to-[#eaaa08] text-[#090d0b] text-[10px] sm:text-xs font-extrabold tracking-tight hover:brightness-110 transition-all cursor-pointer whitespace-nowrap"
                    title="Claim free 5,000 Game Coins refill"
                  >
                    +5K
                  </button>
                )}
              </div>
            )}

            {/* My Stats & Game Stats Entries */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setShowMyStatsModal(true)}
                title="My Stats (Personal Cross-Table Records)"
                className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-[#ffd86b] bg-[#d4af37]/15 hover:bg-[#d4af37]/25 border border-[#d4af37]/40 transition-colors whitespace-nowrap cursor-pointer"
              >
                <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ffd86b] shrink-0" />
                <span className="hidden xs:inline">My </span>
                <span>Stats</span>
              </button>

              {isCreator && (
                <button
                  onClick={handleOpenStats}
                  title="Creator Report"
                  className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors whitespace-nowrap cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 shrink-0" />
                  <span>Report</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Main Workspace: Global padding 16px (p-4), stacked flex on mobile to prevent overlap, 12-col grid on desktop */}
        <style>{`.hide-scrollbar-custom::-webkit-scrollbar { display: none; } .hide-scrollbar-custom { -ms-overflow-style: none; scrollbar-width: none; }`}</style>
        <main className="flex-1 min-h-0 w-full p-3 sm:p-4 flex flex-col lg:grid lg:grid-cols-12 gap-3.5 sm:gap-4 overflow-y-auto lg:overflow-hidden hide-scrollbar-custom">
          {/* LEFT COLUMN (5 Cols): Blackjack Felt Visual + Collapsible Online Players / Game Rules */}
          <div className="w-full lg:col-span-5 flex flex-col gap-3.5 sm:gap-4 shrink-0 lg:shrink lg:min-h-0">
            {/* 1. Blackjack Poker Felt Showcase */}
            <div className="shrink-0 relative rounded-2xl bg-gradient-to-b from-[#164e2e] via-[#113d23] to-[#0b2616] border-2 border-[#6b4c2a] shadow-[inset_0_0_42px_rgba(0,0,0,0.75)] p-4 sm:p-5 flex flex-col justify-center overflow-hidden">
              <div className="absolute inset-x-3 top-3 bottom-3 rounded-2xl border border-[#d4af37]/20 pointer-events-none" />

              {/* Cards Showcase: Dealer vs Player 21 */}
              <div className="relative z-10 my-1 flex items-center justify-around gap-4 py-1">
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
                      <div className="text-xs font-black leading-none">7♣</div>
                      <div className="self-center text-xl leading-none">♣</div>
                      <div className="text-xs font-black leading-none self-end rotate-180">7</div>
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

            {/* 2. Online Players & Game Rules Card (Collapsible on Mobile, Collapsed by Default) */}
            <div className="lg:flex-1 lg:min-h-0 rounded-2xl bg-[#111714]/95 border border-white/10 p-3.5 sm:p-5 flex flex-col overflow-hidden shrink-0">
              <div
                className={cn(
                  'flex flex-wrap items-center justify-between gap-2 shrink-0',
                  isMobileOnlineExpanded ? 'pb-3 border-b border-white/10' : 'lg:pb-3 lg:border-b lg:border-white/10'
                )}
              >
                <button
                  type="button"
                  onClick={() => setIsMobileOnlineExpanded(prev => !prev)}
                  className="flex items-center gap-2 text-left cursor-pointer lg:cursor-default"
                >
                  <h2 className="text-sm sm:text-lg font-bold text-white tracking-wide whitespace-nowrap flex items-center gap-2">
                    {activeRulesTab === 'online' ? (
                      <>
                        <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Online Players</span>
                        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
                          {realOnlineList.length}
                        </span>
                      </>
                    ) : (
                      <span>Game Rules & Payouts</span>
                    )}
                  </h2>
                  <span className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded-lg">
                    {isMobileOnlineExpanded ? (
                      <>
                        <span>Hide</span>
                        <ChevronUp className="w-3.5 h-3.5" />
                      </>
                    ) : (
                      <>
                        <span>Show</span>
                        <ChevronDown className="w-3.5 h-3.5" />
                      </>
                    )}
                  </span>
                </button>

                <div
                  className={cn(
                    'items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10 text-xs shrink-0',
                    isMobileOnlineExpanded ? 'flex' : 'hidden lg:flex'
                  )}
                >
                  <button
                    onClick={() => {
                      setActiveRulesTab('online');
                      setIsMobileOnlineExpanded(true);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1',
                      activeRulesTab === 'online' ? 'bg-emerald-500 text-[#090d0b] font-bold' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    <span>Online ({realOnlineList.length})</span>
                  </button>
                  <button
                    onClick={() => {
                      setActiveRulesTab('core');
                      setIsMobileOnlineExpanded(true);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer',
                      activeRulesTab === 'core' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Core
                  </button>
                  <button
                    onClick={() => {
                      setActiveRulesTab('sidebets');
                      setIsMobileOnlineExpanded(true);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer',
                      activeRulesTab === 'sidebets' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Side Bets
                  </button>
                  <button
                    onClick={() => {
                      setActiveRulesTab('modes');
                      setIsMobileOnlineExpanded(true);
                    }}
                    className={cn(
                      'px-2.5 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer',
                      activeRulesTab === 'modes' ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                    )}
                  >
                    Actions
                  </button>
                </div>
              </div>

              <div
                className={cn(
                  'lg:flex-1 lg:min-h-0 overflow-y-auto pt-3 pr-1 space-y-2 text-xs sm:text-sm hide-scrollbar-custom',
                  isMobileOnlineExpanded ? 'block max-h-[260px] lg:max-h-none' : 'hidden lg:block'
                )}
              >
                {activeRulesTab === 'online' && (
                  <div className="space-y-2">
                    {realOnlineList.length === 0 ? (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        No online players found.
                      </div>
                    ) : (
                      realOnlineList.map((player) => {
                        const isMe = player.userId === currentUser?.id;
                        return (
                          <div
                            key={player.userId}
                            className="flex items-center justify-between gap-3 py-2.5 px-3.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 transition-colors"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="relative shrink-0">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#126b6f] to-[#0a3e40] border border-[#d4af37]/40 overflow-hidden flex items-center justify-center text-white font-bold text-xs select-none">
                                  {player.avatar ? (
                                    <img
                                      src={player.avatar}
                                      alt={player.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    (player.name || 'P').charAt(0).toUpperCase()
                                  )}
                                </div>
                                <span
                                  className={cn(
                                    'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#111714]',
                                    player.tableId
                                      ? 'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                                      : 'bg-sky-400'
                                  )}
                                  title={player.tableId ? 'At Table' : 'In Lobby'}
                                />
                              </div>

                              <div className="min-w-0">
                                <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                  <span className="truncate">{player.name}</span>
                                  {isMe && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono shrink-0">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {player.tableId ? 'Playing at Table' : 'In Lobby'}
                                </div>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {player.tableId && player.tableName ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectTable(player.tableId!)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 hover:text-white transition-all cursor-pointer max-w-[160px]"
                                  title={`Join ${player.tableName}`}
                                >
                                  <span className="truncate">{player.tableName}</span>
                                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                                </button>
                              ) : (
                                <span className="px-2.5 py-1 rounded-lg text-xs font-mono bg-white/5 border border-white/10 text-slate-400">
                                  Lobby
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {activeRulesTab === 'core' && (
                  <div className="grid grid-cols-2 gap-2">
                    {/* 1. Blackjack 3:2 Visual Tile */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="flex items-center -space-x-1.5 shrink-0">
                          <div className="w-5 h-7 rounded bg-white text-slate-950 border border-[#d4af37] shadow flex items-center justify-center text-[9px] font-black -rotate-6">
                            A♠
                          </div>
                          <div className="w-5 h-7 rounded bg-white text-red-600 border border-[#d4af37] shadow flex items-center justify-center text-[9px] font-black rotate-6">
                            K♦
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">Blackjack</div>
                          <div className="text-[10px] text-slate-400 truncate">A + 10/J/Q/K</div>
                        </div>
                      </div>
                      <span className="font-mono font-black text-xs sm:text-sm text-[#f5d97e] bg-[#d4af37]/15 border border-[#d4af37]/30 px-2 py-0.5 rounded-md shrink-0">
                        3:2
                      </span>
                    </div>

                    {/* 2. Standard Win 1:1 Visual Tile */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                          <Trophy className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">Win Hand</div>
                          <div className="text-[10px] text-slate-400 truncate">Beat Dealer</div>
                        </div>
                      </div>
                      <span className="font-mono font-black text-xs sm:text-sm text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md shrink-0">
                        1:1
                      </span>
                    </div>

                    {/* 3. Insurance 2:1 Visual Tile */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-400/30 flex flex-col items-center justify-center shrink-0 leading-none">
                          <span className="text-[9px] font-black text-sky-300">A</span>
                          <span className="text-[7px] font-bold text-sky-400 uppercase">Ins</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">Insurance</div>
                          <div className="text-[10px] text-slate-400 truncate">vs Dealer A</div>
                        </div>
                      </div>
                      <span className="font-mono font-black text-xs sm:text-sm text-sky-300 bg-sky-500/15 border border-sky-400/30 px-2 py-0.5 rounded-md shrink-0">
                        2:1
                      </span>
                    </div>

                    {/* 4. Dealer Rule Visual Tile */}
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center font-mono font-black text-xs text-amber-300 shrink-0">
                          17
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">Dealer</div>
                          <div className="text-[10px] text-slate-400 truncate">Hit ≤16</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[11px] sm:text-xs text-slate-100 bg-white/10 border border-white/15 px-2 py-0.5 rounded-md shrink-0">
                        Stand 17
                      </span>
                    </div>

                    {/* 5. Last Rule: 6-Deck Shoe Visual Tile */}
                    <div className="col-span-2 flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white/[0.03] border border-white/5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-8 h-7 flex items-center justify-center shrink-0">
                          <div className="w-5 h-6 rounded bg-emerald-900 border border-white/30 absolute left-0.5 top-0.5 shadow" />
                          <div className="w-5 h-6 rounded bg-red-600 border border-red-300 absolute left-1.5 top-0.5 shadow flex items-center justify-center text-[7px] font-black text-white">
                            75%
                          </div>
                          <div className="w-5 h-6 rounded bg-[#18452B] border border-[#d4af37]/70 absolute left-2.5 top-0.5 shadow" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">6-Deck Shoe</div>
                          <div className="text-[10px] text-slate-400 truncate">Reshuffled at 75% cut card</div>
                        </div>
                      </div>
                      <span className="font-mono font-bold text-[11px] sm:text-xs text-[#ffc53d] bg-[#ffc53d]/10 border border-[#ffc53d]/30 px-2 py-0.5 rounded-md shrink-0">
                        6 Decks · 75%
                      </span>
                    </div>
                  </div>
                )}

                {activeRulesTab === 'sidebets' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Perfect Pair Visual Graphics */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5 space-y-2 text-xs">
                      <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                        <span className="text-xs font-bold text-[#f5d97e]">Perfect Pair</span>
                        <span className="text-[10px] text-slate-400 font-mono">1st 2 Cards</span>
                      </div>

                      {/* Perfect Pair 25:1 */}
                      <div className="flex items-center justify-between gap-2 bg-black/25 px-2 py-1.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-5 h-6 rounded bg-white text-slate-950 border border-[#d4af37] shadow flex items-center justify-center text-[9px] font-black -rotate-6">Q♠</span>
                            <span className="w-5 h-6 rounded bg-white text-slate-950 border border-[#d4af37] shadow flex items-center justify-center text-[9px] font-black rotate-6">Q♠</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-200 truncate">Same Suit</span>
                        </div>
                        <span className="font-mono font-black text-xs text-[#f5d97e] bg-[#d4af37]/15 border border-[#d4af37]/30 px-1.5 py-0.5 rounded shrink-0">25:1</span>
                      </div>

                      {/* Colored Pair 12:1 */}
                      <div className="flex items-center justify-between gap-2 bg-black/25 px-2 py-1.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-5 h-6 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[9px] font-black -rotate-6">Q♥</span>
                            <span className="w-5 h-6 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[9px] font-black rotate-6">Q♦</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-200 truncate">Same Color</span>
                        </div>
                        <span className="font-mono font-black text-xs text-white bg-white/10 border border-white/15 px-1.5 py-0.5 rounded shrink-0">12:1</span>
                      </div>

                      {/* Mixed Pair 6:1 */}
                      <div className="flex items-center justify-between gap-2 bg-black/25 px-2 py-1.5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-5 h-6 rounded bg-white text-slate-950 border border-slate-300 shadow flex items-center justify-center text-[9px] font-black -rotate-6">Q♠</span>
                            <span className="w-5 h-6 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[9px] font-black rotate-6">Q♥</span>
                          </div>
                          <span className="text-[11px] font-semibold text-slate-200 truncate">Mixed</span>
                        </div>
                        <span className="font-mono font-black text-xs text-slate-200 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded shrink-0">6:1</span>
                      </div>
                    </div>

                    {/* 21 + 3 Poker Visual Graphics */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-2.5 space-y-1.5 text-xs">
                      <div className="flex items-center justify-between border-b border-white/5 pb-1.5">
                        <span className="text-xs font-bold text-emerald-400">21 + 3 Poker</span>
                        <span className="text-[10px] text-slate-400 font-mono">Your 2 + Dealer 1</span>
                      </div>

                      {/* Suited Trips 100:1 */}
                      <div className="flex items-center justify-between gap-1.5 bg-black/25 px-2 py-1 rounded-lg border border-white/5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-4.5 h-5.5 rounded bg-white text-slate-950 border border-[#d4af37] shadow flex items-center justify-center text-[8px] font-black">K♠</span>
                            <span className="w-4.5 h-5.5 rounded bg-white text-slate-950 border border-[#d4af37] shadow flex items-center justify-center text-[8px] font-black">K♠</span>
                            <span className="w-4.5 h-5.5 rounded bg-white text-slate-950 border border-[#d4af37] shadow flex items-center justify-center text-[8px] font-black">K♠</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-200 truncate">Suited 3</span>
                        </div>
                        <span className="font-mono font-black text-[11px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded shrink-0">100:1</span>
                      </div>

                      {/* Straight Flush 40:1 */}
                      <div className="flex items-center justify-between gap-1.5 bg-black/25 px-2 py-1 rounded-lg border border-white/5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-4.5 h-5.5 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[8px] font-black">9♥</span>
                            <span className="w-4.5 h-5.5 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[8px] font-black">10♥</span>
                            <span className="w-4.5 h-5.5 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[8px] font-black">J♥</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-200 truncate">Str. Flush</span>
                        </div>
                        <span className="font-mono font-black text-[11px] text-[#f5d97e] bg-[#d4af37]/15 border border-[#d4af37]/30 px-1.5 py-0.5 rounded shrink-0">40:1</span>
                      </div>

                      {/* Three of a Kind 30:1 */}
                      <div className="flex items-center justify-between gap-1.5 bg-black/25 px-2 py-1 rounded-lg border border-white/5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-4.5 h-5.5 rounded bg-white text-slate-950 border border-slate-300 shadow flex items-center justify-center text-[8px] font-black">8♠</span>
                            <span className="w-4.5 h-5.5 rounded bg-white text-red-600 border border-slate-300 shadow flex items-center justify-center text-[8px] font-black">8♥</span>
                            <span className="w-4.5 h-5.5 rounded bg-white text-slate-950 border border-slate-300 shadow flex items-center justify-center text-[8px] font-black">8♣</span>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-200 truncate">3 of Kind</span>
                        </div>
                        <span className="font-mono font-black text-[11px] text-white bg-white/10 border border-white/15 px-1.5 py-0.5 rounded shrink-0">30:1</span>
                      </div>

                      {/* Straight 10:1 & Flush 5:1 */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="flex items-center justify-between gap-1 bg-black/25 px-1.5 py-1 rounded-lg border border-white/5">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-4 h-5 rounded bg-white text-slate-950 border border-slate-300 flex items-center justify-center text-[7px] font-black">5♠</span>
                            <span className="w-4 h-5 rounded bg-white text-red-600 border border-slate-300 flex items-center justify-center text-[7px] font-black">6♦</span>
                            <span className="w-4 h-5 rounded bg-white text-slate-950 border border-slate-300 flex items-center justify-center text-[7px] font-black">7♣</span>
                          </div>
                          <span className="font-mono font-bold text-[10px] text-slate-200">10:1</span>
                        </div>
                        <div className="flex items-center justify-between gap-1 bg-black/25 px-1.5 py-1 rounded-lg border border-white/5">
                          <div className="flex items-center -space-x-1 shrink-0">
                            <span className="w-4 h-5 rounded bg-white text-red-600 border border-slate-300 flex items-center justify-center text-[7px] font-black">2♦</span>
                            <span className="w-4 h-5 rounded bg-white text-red-600 border border-slate-300 flex items-center justify-center text-[7px] font-black">7♦</span>
                            <span className="w-4 h-5 rounded bg-white text-red-600 border border-slate-300 flex items-center justify-center text-[7px] font-black">K♦</span>
                          </div>
                          <span className="font-mono font-bold text-[10px] text-slate-200">5:1</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeRulesTab === 'modes' && (
                  <div className="space-y-2 text-xs sm:text-sm text-slate-200 leading-snug">
                    <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="font-bold text-white">Double & Split: </span>
                      Double on any first 2 cards; split matching ranks up to 4 hands (split Aces receive 1 card each and stand).
                    </div>
                    <div className="p-2.5 sm:p-3 rounded-xl bg-white/[0.03] border border-white/5">
                      <span className="font-bold text-[#f5d97e]">Tournament Ticket & Allowance: </span>
                      Buy a ticket with Game Coins for an equal locked Allowance. Prize pool is awarded in Game Coins per Survivor Cap or Round Cap rules.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (7 Cols): Filter Bar + Create Custom Table + Tables List */}
          <div className="w-full lg:col-span-7 rounded-2xl bg-[#111714]/95 border border-white/10 p-3.5 sm:p-5 flex flex-col shrink-0 lg:shrink lg:min-h-0 lg:overflow-hidden">
            {/* Top Bar: Regular & Tournament Tabs + Custom Table Button on the same row */}
            <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 pb-3 sm:pb-4 mb-3 sm:mb-4 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-1.5 sm:gap-2.5 flex-nowrap max-w-full overflow-x-auto hide-scrollbar-custom">
                <div className="flex items-center gap-1 sm:gap-1.5 bg-black/40 p-1 sm:p-1.5 rounded-xl border border-white/10 text-xs sm:text-sm shrink-0">
                  {(
                    [
                      { id: 'regular', label: 'Regular' },
                      { id: 'tournament', label: 'Tournament' }
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setRoomFilter(tab.id)}
                      className={cn(
                        'px-2.5 sm:px-4 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap',
                        roomFilter === tab.id ? 'bg-[#d4af37] text-[#090d0b]' : 'text-slate-300 hover:text-white'
                      )}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setShowCreateModal(true)}
                  disabled={roomStatus !== 'connected'}
                  className="px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold text-[#04120b] bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 disabled:opacity-45 disabled:pointer-events-none border border-emerald-300/40 shadow-[0_4px_14px_rgba(16,185,129,0.28)] transition-all flex items-center gap-1 sm:gap-1.5 whitespace-nowrap cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
                  <span>Custom Table</span>
                </button>
              </div>

              {userHostedTables.length > 0 && (
                <button
                  onClick={() => onNavigate('manage_tables')}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors flex items-center gap-1.5 sm:gap-2 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#d4af37]" />
                  <span>My Tables ({userHostedTables.length})</span>
                </button>
              )}
            </div>

            {/* Tables List (Scrollbars hidden) */}
            <div className="lg:flex-1 lg:min-h-0 lg:overflow-y-auto space-y-3 sm:space-y-4 hide-scrollbar-custom">
              {roomStatus === 'error' || roomStatus === 'closed' ? (
                <div className="rounded-2xl p-6 sm:p-8 border border-rose-500/35 bg-[#141b17] text-center space-y-4">
                  <div className="w-11 h-11 rounded-full bg-rose-500/15 border border-rose-500/30 flex items-center justify-center mx-auto">
                    <AlertCircle className="w-5 h-5 text-rose-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base sm:text-lg font-bold text-white">Room Connection Failed</h3>
                    <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto">
                      {roomError || 'Disconnected from the online multiplayer room server.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => reconnectRoom()}
                    className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-[#090d0b] bg-[#e5c158] hover:bg-[#f5d97e] transition-colors inline-flex items-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retry Room Connection</span>
                  </button>
                </div>
              ) : roomStatus !== 'connected' || Object.keys(tables).length === 0 ? (
                <div className="rounded-2xl p-6 sm:p-8 border border-[#c6a364]/30 bg-[#141b17] text-center space-y-3">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-400 mx-auto" />
                  <h3 className="text-base sm:text-lg font-bold text-white">
                    {roomStatus === 'reconnecting'
                      ? 'Reconnecting to Online Room...'
                      : roomStatus === 'matching'
                      ? 'Matching Online Room...'
                      : 'Connecting to Online Room...'}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Waiting for authoritative RoomClient match & snapshot...
                  </p>
                </div>
              ) : filteredRooms.length === 0 ? (
                <div className="rounded-2xl p-6 sm:p-8 border border-white/10 bg-[#141b17] text-center space-y-2">
                  <h3 className="text-base font-bold text-white">
                    No Active {roomFilter === 'tournament' ? 'Tournament' : 'Regular'} Tables
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Click &ldquo;+ Custom Table&rdquo; above to host a new online table.
                  </p>
                </div>
              ) : (
                filteredRooms.map((room) => {
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
                      'group relative rounded-2xl p-4 sm:p-5 md:p-6 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 cursor-pointer',
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
                      className="w-full sm:w-auto px-4 sm:px-5 py-2.5 sm:py-3 rounded-xl text-sm sm:text-base font-bold text-[#090d0b] bg-[#e5c158] group-hover:bg-[#f5d97e] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <span>Enter Table</span>
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                );
              }))}
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

      {/* MY STATS SLIDE-OVER PANEL ON HOME VIEW */}
      <RankWidget
        externalOpen={showMyStatsModal}
        onExternalClose={() => setShowMyStatsModal(false)}
        hideFloatingTrigger
      />
    </div>
  );
}
