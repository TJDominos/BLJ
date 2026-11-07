import { create } from 'zustand';
import {
  tablesDb,
  usersDb,
  houseStats,
  getOrCreateUser,
  claimServerRefill,
  reconcileSystemTables,
} from '../backend/db';
import { gameApi } from '../backend/gameApi';
import { hostTableApi } from '../backend/hostTableApi';
import {
  ROYAL_BLACKJACK_RULES_VERSION,
  sanitizeTablesMapForClient,
} from '../backend/platformContract';
import {
  matchRandseedRoom,
  sendRandseedRoomAction,
  readyRandseedRoom,
} from '../lib/randseedRuntime';

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
  userBalances: Record<string, { balance: number; initialBuyIn: number; currency?: 'Gcoin' | 'Bonus' }>;
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

const sessionStartedAtMs = Date.now();

export function getRuntimeGameStats() {
  reconcileSystemTables();
  const allTables = Object.values(tablesDb);
  const activeRooms = allTables.filter((t) => t.status !== 'closed');
  const totalRoundsPlayed = allTables.reduce((sum, t) => sum + (t.roundsPlayed || 0), 0);
  const totalVisits = allTables.reduce((sum, t) => sum + (t.visits || 0), 0);
  const seatedPlayers = activeRooms.reduce(
    (sum, t) => sum + t.seats.filter((s) => s.userId !== null).length,
    0
  );

  const totalUsersCount = Object.keys(usersDb).length;
  const tokensIssued = houseStats.totalTokensIssuedByHouse;
  const tokensPaidOut = houseStats.totalTokensPaidOutToPlayers;
  const houseDistributedTokens = tokensIssued + tokensPaidOut;

  return {
    gameId: 'royal-blackjack',
    rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
    uptimeSeconds: Math.max(1, Math.floor((Date.now() - sessionStartedAtMs) / 1000)),
    activeRoomsCount: activeRooms.length,
    seatedPlayersCount: seatedPlayers,
    totalRoundsPlayed,
    totalVisits,
    totalUsersCount,
    houseDistributedTokens,
    tokensIssued,
    tokensPaidOut,
    totalRefillsCount: houseStats.totalRefillsCount,
    isCreator: true,
    rooms: activeRooms.map((r) => ({
      id: r.id,
      name: r.name,
      mode: r.settings.mode || 'regular',
      status: r.status,
      roundsPlayed: r.roundsPlayed,
      visits: r.visits,
      seatedPlayers: r.seats.filter((s) => s.userId !== null).length,
      maxSeats: r.settings.maxSeats,
    })),
  };
}

interface GameStore {
  currentUser: User | null;
  tables: Record<string, Table>;
  activeTableId: string | null;
  gameRecords: GameRecord[];
  unlockedTableIds: Record<string, boolean>;

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

    reconcileSystemTables();
    const user = getOrCreateUser(savedUserId, effectiveName, urlCreatorFlag, effectiveAvatar);
    set({
      currentUser: user,
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });

    // Connect to RandSeed RoomClient if running inside the platform Room gateway
    matchRandseedRoom((roomState, allocation) => {
      const activeUser = get().currentUser;
      const resolvedId = allocation?.playerId || activeUser?.id || savedUserId;
      const syncedUser = getOrCreateUser(resolvedId, activeUser?.name || effectiveName, true, effectiveAvatar);
      if (roomState && typeof roomState.balances === 'object' && roomState.balances !== null) {
        const balMap = roomState.balances as Record<string, number>;
        if (typeof balMap[resolvedId] === 'number' && usersDb[resolvedId]) {
          usersDb[resolvedId].balance = balMap[resolvedId];
          syncedUser.balance = balMap[resolvedId];
        }
      }
      set({
        currentUser: syncedUser,
        tables: sanitizeTablesMapForClient(tablesDb, syncedUser.id),
      });
    }).catch(() => {});
  },

  syncStateFromServer: async () => {
    const userId = get().currentUser?.id;
    reconcileSystemTables();
    const nextTables = sanitizeTablesMapForClient(tablesDb, userId);

    set((state) => {
      const user = userId ? getOrCreateUser(userId) : state.currentUser;
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
  },

  setCreatorIdentity: async (isCreator: boolean, creatorName?: string) => {
    const current = get().currentUser;
    const userId = current?.id || 'creator_user';
    if (isCreator) {
      const user = getOrCreateUser(userId, creatorName || current?.name || 'Creator', true);
      reconcileSystemTables();
      set({
        currentUser: { ...user, role: 'creator', isCreator: true },
        tables: sanitizeTablesMapForClient(tablesDb, userId),
      });
    } else {
      get().exitPublisherMode();
    }
  },

  verifyPublisher: async () => {
    set((state) => ({
      currentUser: state.currentUser
        ? { ...state.currentUser, role: 'creator', isCreator: true }
        : null,
    }));
    return true;
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

    const table = await hostTableApi.createTable(user.id, user.name, settings, liquidity);
    reconcileSystemTables();
    const nextUnlocked = { ...get().unlockedTableIds, [table.id]: true };

    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
      activeTableId: table.id,
      unlockedTableIds: nextUnlocked,
    });
    return table.id;
  },

  verifyTableCode: async (tableId, tableCode) => {
    const user = get().currentUser;
    const table = tablesDb[tableId];
    if (!table || table.status === 'closed') return false;
    const expectedCode = table.settings?.tableCode;
    const isValid =
      !expectedCode ||
      (user && user.id === table.houseId) ||
      tableCode.trim() === String(expectedCode).trim();
    if (isValid) {
      const nextUnlocked = { ...get().unlockedTableIds, [tableId]: true };
      set({ unlockedTableIds: nextUnlocked });
      return true;
    }
    return false;
  },

  updateTableSettings: async (tableId, settings) => {
    const user = get().currentUser;
    if (!user) return;
    await hostTableApi.updateTableSettings(tableId, user.id, settings);
    reconcileSystemTables();
    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  depositLiquidity: async (tableId, amount) => {
    const user = get().currentUser;
    if (!user) return;
    await hostTableApi.depositLiquidity(tableId, user.id, amount);
    reconcileSystemTables();
    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  pauseTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    await hostTableApi.pauseTable(tableId, user.id);
    reconcileSystemTables();
    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  resumeTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;
    await hostTableApi.resumeTable(tableId, user.id);
    reconcileSystemTables();
    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  withdrawLiquidity: async (tableId, amount) => {
    const user = get().currentUser;
    if (!user || amount <= 0) return;
    await hostTableApi.withdrawLiquidity(tableId, user.id, amount);
    reconcileSystemTables();
    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  joinTable: async (tableId, seatIndex, currency = 'Gcoin') => {
    const user = get().currentUser;
    if (!user) return;

    const currentActiveId = get().activeTableId;
    await gameApi.joinTable(tableId, user.id, seatIndex, 0, currency);
    sendRandseedRoomAction({ action: 'join_seat', seatIndex }).catch(() => {});

    if (currentActiveId !== tableId) {
      get().recordVisit(tableId);
    }

    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
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
    await hostTableApi.recordVisit(tableId);
    set((state) => ({
      tables: sanitizeTablesMapForClient(tablesDb, user?.id) || state.tables,
    }));
  },

  leaveTable: async (tableId, seatIndex, isTimeout) => {
    const user = get().currentUser;
    if (!user) return;

    const { table } = await gameApi.leaveTable(tableId, user.id, seatIndex, isTimeout);
    if (seatIndex !== undefined) {
      sendRandseedRoomAction({ action: 'leave_seat', seatIndex }).catch(() => {});
    }

    set((state) => ({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
      activeTableId: seatIndex === undefined ? null : state.activeTableId,
    }));

    if (table && table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  unlockTableBalance: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;

    const { table } = await gameApi.unlockTableBalance(tableId, user.id);

    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });

    if (table && table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  refillGameCoins: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;

    const targetTableId = tableId || get().activeTableId || undefined;
    const { user: updatedUser } = claimServerRefill(user.id, targetTableId);
    sendRandseedRoomAction({ action: 'claim_refill' }).catch(() => {});

    set({
      currentUser: updatedUser,
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  placeBet: async (tableId, seatIndex, amount, sideBets) => {
    const user = get().currentUser;
    if (!user) return;

    await gameApi.placeBet(tableId, seatIndex, user.id, amount, sideBets);
    sendRandseedRoomAction({
      action: 'place_bet',
      seatIndex,
      amount,
      pairBet: sideBets?.pair || 0,
      plus3Bet: sideBets?.twentyOnePlusThree || 0,
    }).catch(() => {});

    set({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
    });
  },

  startGame: async (tableId) => {
    const user = get().currentUser;
    const table = await gameApi.startGame(tableId);

    set((state) => ({
      currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
      tables: sanitizeTablesMapForClient(tablesDb, user?.id),
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      const activeSeatsCount = table.seats.filter((s) => s.isReady).length;
      setTimeout(() => {
        get().dealerPlay(tableId);
      }, (activeSeatsCount + 1) * 400 + 500);
    }
  },

  hit: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const table = await gameApi.hit(tableId, seatIndex);
    sendRandseedRoomAction({ action: 'hit', seatIndex }).catch(() => {});

    set((state) => ({
      currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
      tables: sanitizeTablesMapForClient(tablesDb, user?.id),
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  stand: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const table = await gameApi.stand(tableId, seatIndex);
    sendRandseedRoomAction({ action: 'stand', seatIndex }).catch(() => {});

    set((state) => ({
      currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
      tables: sanitizeTablesMapForClient(tablesDb, user?.id),
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  doubleDown: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const table = await gameApi.doubleDown(tableId, seatIndex);
    sendRandseedRoomAction({ action: 'double_down', seatIndex }).catch(() => {});

    set((state) => ({
      currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
      tables: sanitizeTablesMapForClient(tablesDb, user?.id),
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  split: async (tableId, seatIndex) => {
    const user = get().currentUser;
    const table = await gameApi.split(tableId, seatIndex);
    sendRandseedRoomAction({ action: 'split', seatIndex }).catch(() => {});

    set((state) => ({
      currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
      tables: sanitizeTablesMapForClient(tablesDb, user?.id),
    }));

    if (table.currentTurnIndex === -1 && table.status === 'playing') {
      get().dealerPlay(tableId);
    }
  },

  buyInsurance: async (tableId, seatIndex) => {
    const user = get().currentUser;
    await gameApi.buyInsurance(tableId, seatIndex);
    sendRandseedRoomAction({ action: 'buy_insurance', seatIndex }).catch(() => {});

    set((state) => ({
      currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
      tables: sanitizeTablesMapForClient(tablesDb, user?.id),
    }));
  },

  dealerPlay: async (tableId) => {
    const currentUser = get().currentUser;
    const { table, winnings, seatResults, dealerScore } = await gameApi.dealerPlayAndResolve(tableId);
    readyRandseedRoom().catch(() => {});
    const sanitizedTables = sanitizeTablesMapForClient(tablesDb, currentUser?.id);

    set((state) => {
      const user = currentUser ? getOrCreateUser(currentUser.id) : state.currentUser;
      const amountWon = user ? winnings[user.id] || 0 : 0;

      let res: 'win' | 'lose' | 'push' | 'blackjack' = 'push';
      const mySeat = table.seats.find((s: any) => s.userId === user?.id);
      if (mySeat && mySeat.hand) {
        if (mySeat.hand.status === 'won') res = 'win';
        else if (mySeat.hand.status === 'lost') res = 'lose';
        else if (mySeat.hand.status === 'blackjack') res = 'blackjack';
        else res = 'push';
      }

      const mySeatResults = user ? seatResults.filter((sr) => sr.userId === user.id) : [];
      const roundId = table.lastRoundSummary?.roundId || Math.random().toString(36).substr(2, 9);

      if (user && mySeatResults.length > 0 && !state.gameRecords.some((r) => r.id === roundId)) {
        const record: (typeof state.gameRecords)[0] = {
          id: roundId,
          tableId,
          result: res,
          amountWon,
          timestamp: table.lastRoundSummary?.timestamp || Date.now(),
          seatResults: mySeatResults,
          dealerScore,
          currency: 'Gcoin',
        };
        const updatedRecords = [record, ...state.gameRecords].slice(0, 50);

        return {
          currentUser: user,
          tables: sanitizedTables,
          gameRecords: updatedRecords,
          activeTableId:
            state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId,
        };
      }

      return {
        currentUser: user,
        tables: sanitizedTables,
        activeTableId:
          state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId,
      };
    });
  },

  resolveGame: async (_tableId) => {
    // Handled inside dealerPlay
  },

  addGameRecord: (record) => {
    set((state) => ({ gameRecords: [record, ...state.gameRecords] }));
  },

  closeTable: async (tableId) => {
    const user = get().currentUser;
    if (!user) return;

    const { table } = await hostTableApi.closeTable(tableId, user.id);
    reconcileSystemTables();

    set((state) => ({
      currentUser: getOrCreateUser(user.id),
      tables: sanitizeTablesMapForClient(tablesDb, user.id),
      activeTableId:
        state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId,
    }));
  },
}));
