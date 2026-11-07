import { create } from 'zustand';

export type User = {
  id: string;
  name: string;
  avatar?: string;
  balance: number;
  bonusBalance?: number;
  role: 'player' | 'creator' | 'publisher';
  isCreator?: boolean;
};

export type CardSuit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type CardValue = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K' | 'A';

export interface PlayingCard {
  suit: CardSuit;
  value: CardValue;
  isHidden?: boolean;
}

export interface SideBets {
  pair: number;
  twentyOnePlusThree: number;
}

export type HandStatus = 'playing' | 'stood' | 'busted' | 'blackjack' | 'won' | 'lost' | 'push';

export interface Hand {
  cards: PlayingCard[];
  bet: number;
  insuranceBet?: number;
  sideBets?: SideBets;
  sideBetPairWon?: number;
  sideBetPlus3Won?: number;
  status: HandStatus;
  score: number;
}

export interface PlayerSeat {
  userId: string | null; // null if empty
  name?: string;
  avatar?: string;
  isReady: boolean;
  hand: Hand | null;
  isSplitHand?: boolean;
  originalSeatIndex?: number;
}

export type WinningRule = 'standard' | 'dealer_wins_ties';

export type TableMode = 'regular' | 'tournament';

export interface TournamentSettings {
  ticketPrice: number;
  startingChips: number;
  hostFeePct: number; // max 5, default 3
  platformFeePct: number; // fixed 2
  minBetChips: number; // default 50
  minSideBetChips?: number;
  isForcedAnte?: boolean;
  isScheduledEscalation?: boolean;
  antePct?: number; 
  escalationRounds?: number;
  isSurvivorCap?: boolean;
  targetSurvivors?: number;
  isHardCapRounds?: boolean;
  maxRounds?: number;
  prizeDistribution: 'survivorPaytable' | 'splitByChips';
  minSeats?: number;
  autoCloseAndRefundTimeHours?: number;
}

export interface TournamentRecord {
  id: string;
  timestamp: number;
  rounds: number;
  seatsFilled: number;
  maxSeats: number;
  ticketPrice: number;
  prizePool: number;
  reason: string;
  winners: {
    userId: string;
    name: string;
    chips: number;
    prizeCoins: number;
  }[];
}

export interface TableSettings {
  name?: string;
  description?: string;
  mode?: TableMode;
  tournament?: TournamentSettings;
  minBet: number;
  maxBet: number;
  minBuyIn: number;
  secretBets: boolean;
  actionTimeLimit: number;
  isPublic: boolean;
  tableCode?: string; // 4-digit PIN for private custom tables
  hasTableCode?: boolean;
  maxSeats: number;
  winningRule: WinningRule;
  order: 'seat' | 'random';
}

export interface Table {
  id: string;
  name: string;
  description?: string;
  houseId: string; // The user hosting the table (or "system" if auto)
  createdAt: number;
  visits: number;
  liquidity: number;
  initialLiquidity: number;
  safeAccountAddress: string;
  settings: TableSettings;
  seats: PlayerSeat[]; // array matching maxSeats
  userBalances: Record<string, { balance: number, initialBuyIn: number, currency?: 'Gcoin' | 'Bonus' }>;
  inviteLink: string;
  status: 'waiting' | 'playing' | 'paused' | 'closed' | 'closing'; // paused if lack of liquidity
  dealerHand: Hand | null;
  deck: PlayingCard[];
  discardCount: number;
  discardedCards: PlayingCard[];
  currentTurnIndex: number; // -1 for dealer, 0..maxSeats-1 for players
  roundsPlayed: number;
  tournamentHistory?: TournamentRecord[];
  emptySince?: number | null;
  maxHostingTimeMs?: number;
  expiresAt?: number | null;
  lastRoundSummary?: {
    roundId: string;
    timestamp: number;
    winnings: Record<string, number>;
    seatResults: SeatResult[];
    dealerScore: number;
  };
}

export interface SeatResult {
  seatIndex: number;
  userId?: string;
  bet: number;
  sideBet?: number;
  sideBetWin?: number;
  insuranceBet?: number;
  insuranceWin?: number;
  isSplit?: boolean;
  win?: number;
  net: number;
  action: string;
  score?: number;
}

export interface GameRecord {
  id: string;
  tableId: string;
  result: 'win' | 'lose' | 'push' | 'blackjack';
  amountWon: number;
  timestamp: number;
  seatResults: SeatResult[];
  dealerScore?: number;
  currency?: 'Gcoin' | 'Bonus';
}

interface GameStore {
  currentUser: User | null;
  tables: Record<string, Table>;
  activeTableId: string | null;
  gameRecords: GameRecord[];
  unlockedTableIds: Record<string, boolean>;
  
  // Actions (Pure Backend-Driven: Frontend only sends intent & renders response)
  login: (name: string, overrideUserId?: string, avatar?: string, isCreator?: boolean) => Promise<void>;
  syncStateFromServer: () => Promise<void>;
  setCreatorIdentity: (isCreator: boolean, creatorName?: string) => Promise<void>;
  verifyPublisher: () => Promise<boolean>;
  exitPublisherMode: () => void;
  createTable: (settings: TableSettings, liquidity: number) => Promise<string>;
  verifyTableCode: (tableId: string, tableCode: string) => Promise<boolean>;
  updateTableSettings: (tableId: string, settings: Partial<TableSettings>) => Promise<void>;
  depositLiquidity: (tableId: string, amount: number) => Promise<void>;
  pauseTable: (tableId: string) => Promise<void>;
  resumeTable: (tableId: string) => Promise<void>;
  withdrawLiquidity: (tableId: string, amount: number) => Promise<void>;
  joinTable: (tableId: string, seatIndex: number, currency?: 'Gcoin' | 'Bonus') => Promise<void>;
  observeTable: (tableId: string) => void;
  recordVisit: (tableId: string) => Promise<void>;
  leaveTable: (tableId: string, seatIndex?: number, isTimeout?: boolean) => Promise<void>;
  unlockTableBalance: (tableId: string) => Promise<void>;
  refillGameCoins: (tableId?: string) => Promise<void>;
  placeBet: (tableId: string, seatIndex: number, amount: number, sideBets?: SideBets) => Promise<void>;
  closeTable: (tableId: string) => Promise<void>;
  
  // Gameplay Actions (House & Players)
  startGame: (tableId: string) => Promise<void>;
  hit: (tableId: string, seatIndex: number) => Promise<void>;
  stand: (tableId: string, seatIndex: number) => Promise<void>;
  doubleDown: (tableId: string, seatIndex: number) => Promise<void>;
  split: (tableId: string, seatIndex: number) => Promise<void>;
  buyInsurance: (tableId: string, seatIndex: number) => Promise<void>;
  dealerPlay: (tableId: string) => Promise<void>;
  resolveGame: (tableId: string) => Promise<void>;
  addGameRecord: (record: GameRecord) => void;
}

async function postGameApi<T = any>(url: string, body: Record<string, any>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const useGameStore = create<GameStore>((set, get) => ({
  currentUser: null,
  tables: {},
  activeTableId: null,
  gameRecords: [],
  unlockedTableIds: {},

  login: async (name: string, overrideUserId?: string, avatar?: string, isCreator?: boolean) => {
    const effectiveName = name || 'Player';
    const effectiveAvatar = avatar || undefined;
    const urlCreatorFlag = Boolean(isCreator);
    const savedUserId = overrideUserId || `user_${Math.random().toString(36).slice(2, 11)}`;

    try {
      const data = await postGameApi<{ user: User; tables: Record<string, Table> }>('/api/game/session', {
        userId: savedUserId,
        name: effectiveName,
        avatar: effectiveAvatar,
        isCreator: urlCreatorFlag,
      });
      set({
        currentUser: data.user,
        tables: data.tables,
      });
    } catch (err) {
      console.error('Failed to initialize session from backend:', err);
    }
  },

  syncStateFromServer: async () => {
    const userId = get().currentUser?.id;
    try {
      const res = await fetch(`/api/game/state${userId ? `?userId=${encodeURIComponent(userId)}` : ''}`);
      if (!res.ok) return;
      const data = await res.json();
      const nextTables: Record<string, Table> = data.tables || get().tables;

      set((state) => {
        const user = data.user || state.currentUser;
        let updatedRecords = state.gameRecords;

        if (user) {
          for (const t of Object.values(nextTables)) {
            const summary = t.lastRoundSummary;
            if (summary && summary.roundId && !updatedRecords.some((r) => r.id === summary.roundId)) {
              const mySeatResults = (summary.seatResults || []).filter((sr) => sr.userId === user.id);
              if (mySeatResults.length > 0) {
                const amountWon = summary.winnings?.[user.id] || 0;
                const totalNet = mySeatResults.reduce((sum, sr) => sum + (sr.net || 0), 0);
                const hasBlackjack = mySeatResults.some((sr) => sr.action === 'blackjack');
                const resType: 'win' | 'lose' | 'push' | 'blackjack' = hasBlackjack
                  ? 'blackjack'
                  : totalNet > 0
                  ? 'win'
                  : totalNet < 0
                  ? 'lose'
                  : 'push';

                updatedRecords = [
                  {
                    id: summary.roundId,
                    tableId: t.id,
                    result: resType,
                    amountWon,
                    timestamp: summary.timestamp || Date.now(),
                    seatResults: mySeatResults,
                    dealerScore: summary.dealerScore,
                    currency: 'Gcoin' as const,
                  },
                  ...updatedRecords,
                ].slice(0, 50);
              }
            }
          }
        }

        return {
          currentUser: user,
          tables: nextTables,
          gameRecords: updatedRecords,
        };
      });
    } catch {
      // Ignore transient poll errors
    }
  },

  setCreatorIdentity: async (isCreator: boolean, creatorName?: string) => {
    const current = get().currentUser;
    const userId = current?.id || 'creator_user';
    if (isCreator) {
      try {
        const data = await postGameApi<{ user: User; tables: Record<string, Table> }>('/api/game/session', {
          userId,
          name: creatorName || current?.name || 'Creator',
          isCreator: true,
        });
        set({
          currentUser: { ...data.user, role: 'creator', isCreator: true },
          tables: data.tables,
        });
      } catch {
        set((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, role: 'creator', isCreator: true }
            : null,
        }));
      }
    } else {
      get().exitPublisherMode();
    }
  },

  verifyPublisher: async () => {
    try {
      const res = await fetch('/api/stats');
      if (!res.ok) return false;
      set((state) => ({
        currentUser: state.currentUser
          ? { ...state.currentUser, role: 'creator', isCreator: true }
          : null,
      }));
      return true;
    } catch {
      return false;
    }
  },

  exitPublisherMode: () => {
    set((state) => ({
      currentUser: state.currentUser
        ? { ...state.currentUser, role: 'player', isCreator: false }
        : null,
    }));
  },

  createTable: async (settings, liquidity) => {
    const user = get().currentUser;
    if (!user) return '';
    
    const data = await postGameApi<{ table: Table; tables: Record<string, Table>; user: User }>('/api/game/tables', {
      userId: user.id,
      userName: user.name,
      settings,
      liquidity,
    });
    
    const nextUnlocked = { ...get().unlockedTableIds, [data.table.id]: true };

    set({
      currentUser: data.user || user,
      tables: data.tables,
      activeTableId: data.table.id,
      unlockedTableIds: nextUnlocked,
    });
    return data.table.id;
  },

  verifyTableCode: async (tableId, tableCode) => {
    const user = get().currentUser;
    try {
      const data = await postGameApi<{ valid: boolean }>(`/api/game/tables/${tableId}/verify-code`, {
        userId: user?.id,
        tableCode: tableCode.trim(),
      });
      if (data.valid) {
        const nextUnlocked = { ...get().unlockedTableIds, [tableId]: true };
        set({ unlockedTableIds: nextUnlocked });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  updateTableSettings: async (tableId, settings) => {
    const user = get().currentUser;
    if (!user) return;
    const res = await fetch(`/api/game/tables/${tableId}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, settings }),
    });
    if (!res.ok) return;
    const data = await res.json();
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables || state.tables,
    }));
  },

  depositLiquidity: async (tableId, amount) => {
    const user = get().currentUser;
    if (!user) return;
    const data = await postGameApi<{ tables: Record<string, Table>; user: User }>(`/api/game/tables/${tableId}/deposit`, {
      userId: user.id,
      amount,
    });
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));
  },

  pauseTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    const data = await postGameApi<{ tables: Record<string, Table>; user: User }>(`/api/game/tables/${tableId}/pause`, {
      userId: user.id,
    });
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));
  },

  resumeTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    const data = await postGameApi<{ tables: Record<string, Table>; user: User }>(`/api/game/tables/${tableId}/resume`, {
      userId: user.id,
    });
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));
  },

  withdrawLiquidity: async (tableId, amount) => {
    const user = get().currentUser;
    if (!user || amount <= 0) return;
    const data = await postGameApi<{ tables: Record<string, Table>; user: User }>(`/api/game/tables/${tableId}/withdraw`, {
      userId: user.id,
      amount,
    });
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));
  },

  joinTable: async (tableId, seatIndex, currency = 'Gcoin') => {
    const user = get().currentUser;
    if (!user) return;
    
    const currentActiveId = get().activeTableId;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/join`,
      { userId: user.id, seatIndex, currency }
    );

    if (currentActiveId !== tableId) {
      get().recordVisit(tableId);
    }

    set({
      currentUser: data.user,
      tables: data.tables,
      activeTableId: tableId,
    });
  },

  observeTable: (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    const currentActiveId = get().activeTableId;
    if (currentActiveId !== tableId) {
      get().recordVisit(tableId);
    }
    set({ activeTableId: tableId });
  },

  recordVisit: async (tableId) => {
    const user = get().currentUser;
    try {
      const data = await postGameApi<{ tables: Record<string, Table>; user: User }>(
        `/api/game/tables/${tableId}/visit`,
        { userId: user?.id }
      );
      set((state) => ({
        tables: data.tables || state.tables,
      }));
    } catch {
      // Ignore visit telemetry error
    }
  },

  leaveTable: async (tableId, seatIndex, isTimeout) => {
    const user = get().currentUser;
    if (!user) return;
    
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/leave`,
      { userId: user.id, seatIndex, isTimeout }
    );

    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
      activeTableId: seatIndex === undefined ? null : state.activeTableId,
    }));

    if (data.table && data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  unlockTableBalance: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/unlock`,
      { userId: user.id }
    );

    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));

    if (data.table && data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  refillGameCoins: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;

    const targetTableId = tableId || get().activeTableId;
    const data = await postGameApi<{ user: User; table?: Table; tables: Record<string, Table> }>(
      '/api/game/refill',
      { userId: user.id, tableId: targetTableId }
    );

    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables || state.tables,
    }));
  },

  placeBet: async (tableId, seatIndex, amount, sideBets) => {
    const user = get().currentUser;
    if (!user) return;
    
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/bet`,
      { userId: user.id, seatIndex, amount, sideBets }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));
  },

  startGame: async (tableId) => {
    const user = get().currentUser;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/start`,
      { userId: user?.id }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));

    if (data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      const activeSeatsCount = data.table.seats.filter(s => s.isReady).length;
      setTimeout(() => {
        get().dealerPlay(tableId);
      }, (activeSeatsCount + 1) * 400 + 500);
    }
  },

  hit: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/hit`,
      { userId: user?.id, seatIndex }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));

    if (data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  stand: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/stand`,
      { userId: user?.id, seatIndex }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));

    if (data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  doubleDown: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/double`,
      { userId: user?.id, seatIndex }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));

    if (data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  split: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/split`,
      { userId: user?.id, seatIndex }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));

    if (data.table.currentTurnIndex === -1 && data.table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  buyInsurance: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/insurance`,
      { userId: user?.id, seatIndex }
    );
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
    }));
  },

  dealerPlay: async (tableId) => {
    const currentUser = get().currentUser;
    const data = await postGameApi<{
      user: User;
      table: Table;
      tables: Record<string, Table>;
      winnings: Record<string, number>;
      seatResults: SeatResult[];
      dealerScore: number;
    }>(`/api/game/tables/${tableId}/dealer-play`, {
      userId: currentUser?.id,
    });
    
    const { table, tables, winnings, seatResults, dealerScore } = data;

    set((state) => {
      const user = data.user || state.currentUser;
      const amountWon = user ? (winnings[user.id] || 0) : 0;
      
      let res: 'win' | 'lose' | 'push' | 'blackjack' = 'push';
      const mySeat = table.seats.find((s: any) => s.userId === user?.id);
      if (mySeat && mySeat.hand) {
         if (mySeat.hand.status === 'won') res = 'win';
         else if (mySeat.hand.status === 'lost') res = 'lose';
         else if (mySeat.hand.status === 'blackjack') res = 'blackjack';
         else res = 'push';
      }

      const mySeatResults = user ? seatResults.filter(sr => sr.userId === user.id) : [];
      const roundId = table.lastRoundSummary?.roundId || Math.random().toString(36).substr(2, 9);

      if (user && mySeatResults.length > 0 && !state.gameRecords.some(r => r.id === roundId)) {
        const record: typeof state.gameRecords[0] = {
          id: roundId,
          tableId,
          result: res,
          amountWon,
          timestamp: table.lastRoundSummary?.timestamp || Date.now(),
          seatResults: mySeatResults,
          dealerScore,
          currency: 'Gcoin'
        };
        const updatedRecords = [record, ...state.gameRecords].slice(0, 50);

        return {
          currentUser: user,
          tables,
          gameRecords: updatedRecords,
          activeTableId: state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId
        };
      }

      return {
        currentUser: user,
        tables,
        activeTableId: state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId
      };
    });
  },

  resolveGame: async (_tableId) => {
    // Handled inside backend dealerPlay
  },

  addGameRecord: (record) => {
    set((state) => ({ gameRecords: [record, ...state.gameRecords] }));
  },

  closeTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    
    const data = await postGameApi<{ user: User; table: Table; tables: Record<string, Table> }>(
      `/api/game/tables/${tableId}/close`,
      { userId: user.id }
    );
    
    set((state) => ({
      currentUser: data.user || state.currentUser,
      tables: data.tables,
      activeTableId: state.activeTableId === tableId && data.table.status === 'closed' ? null : state.activeTableId,
    }));
  }
}));

