import { create } from 'zustand';
import {
  tablesDb,
  usersDb,
  houseStats,
  getOrCreateUser,
  claimServerRefill,
  reconcileSystemTables,
  DEFAULT_GAME_COINS,
} from '../backend/db';
import { gameApi } from '../backend/gameApi';
import { hostTableApi } from '../backend/hostTableApi';
import {
  ROYAL_BLACKJACK_RULES_VERSION,
  sanitizeTablesMapForClient,
} from '../backend/platformContract';
import {
  RANDSEED_GAME_ID,
  GAME_SLUG,
  isRandseedRoomConnected,
  getRandseedRoomAllocation,
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
const MASKED_CARD: PlayingCard = { suit: 'spades', value: 'A', isHidden: true };

// Authoritative online room state cache from RandSeed RoomClient
let latestOnlineRoomState: Record<string, any> | null = null;
let latestOnlineRoomId: string = 'table_1';

/**
 * Unwraps a RandSeed RoomSnapshot.state payload regardless of whether the platform
 * sends an AgentPlayerView ({ publicState, self: { playerId, privateState } }),
 * a StateProjectionEnvelope ({ publicState, privateStates }), a nested { state },
 * or a direct RoyalBlackjackRoomState.
 */
function unwrapOnlineRoomState(raw: Record<string, any> | null | undefined): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  let base: Record<string, any> = raw;
  if (raw.publicState && typeof raw.publicState === 'object' && !Array.isArray(raw.publicState)) {
    base = { ...raw, ...(raw.publicState as Record<string, any>) };
  } else if (raw.state && typeof raw.state === 'object' && !Array.isArray(raw.state)) {
    return unwrapOnlineRoomState(raw.state as Record<string, any>);
  } else if (raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data) && Array.isArray((raw.data as any).seats)) {
    base = { ...raw, ...(raw.data as Record<string, any>) };
  }

  const selfObj = raw.self && typeof raw.self === 'object' ? (raw.self as Record<string, any>) : null;
  const selfPlayerId =
    (typeof selfObj?.playerId === 'string' && selfObj.playerId) ||
    (typeof raw.playerId === 'string' && raw.playerId) ||
    undefined;
  const privateState =
    (selfObj?.privateState && typeof selfObj.privateState === 'object'
      ? (selfObj.privateState as Record<string, any>)
      : null) ||
    (raw.privateState && typeof raw.privateState === 'object'
      ? (raw.privateState as Record<string, any>)
      : null) ||
    (selfPlayerId &&
    raw.privateStates &&
    typeof raw.privateStates === 'object' &&
    typeof (raw.privateStates as Record<string, any>)[selfPlayerId] === 'object'
      ? ((raw.privateStates as Record<string, any>)[selfPlayerId] as Record<string, any>)
      : null);

  if (privateState) {
    const pid =
      (typeof privateState.playerId === 'string' && privateState.playerId) || selfPlayerId;
    if (pid) {
      const nextBalances = {
        ...(base.balances && typeof base.balances === 'object' ? base.balances : {}),
      };
      const nextWalletCoins = {
        ...(base.walletCoins && typeof base.walletCoins === 'object' ? base.walletCoins : {}),
      };
      if (typeof privateState.balance === 'number') {
        nextBalances[pid] = privateState.balance;
      }
      if (typeof privateState.walletCoins === 'number') {
        nextWalletCoins[pid] = privateState.walletCoins;
      }
      base = {
        ...base,
        balances: nextBalances,
        walletCoins: nextWalletCoins,
      };
    }

    if (Array.isArray(privateState.mySeats) && Array.isArray(base.seats)) {
      const mySeatMap = new Map<number, any>();
      for (const ms of privateState.mySeats) {
        if (ms && typeof ms.seatIndex === 'number') {
          mySeatMap.set(ms.seatIndex, ms);
        }
      }
      if (mySeatMap.size > 0) {
        base = {
          ...base,
          seats: base.seats.map((s: any, idx: number) => {
            const seatIdx = typeof s?.seatIndex === 'number' ? s.seatIndex : idx;
            const mySeat = mySeatMap.get(seatIdx);
            if (!mySeat || !s?.hand) return s;
            return {
              ...s,
              hand: {
                ...s.hand,
                bet: typeof mySeat.actualBet === 'number' ? mySeat.actualBet : s.hand.bet,
                sideBets: mySeat.sideBets || s.hand.sideBets,
              },
            };
          }),
        };
      }
    }
  }

  return base;
}

function mapRoomStateToTable(
  rawRoomState: Record<string, any>,
  tableId: string,
  existing?: Table
): Table {
  const roomState = unwrapOnlineRoomState(rawRoomState);
  const mode: TableMode = roomState.mode === 'tournament' ? 'tournament' : 'regular';
  const minBet = Number(roomState.minBet) || existing?.settings?.minBet || 10;
  const maxBet = Number(roomState.maxBet) || existing?.settings?.maxBet || 500;
  const actionTimeLimit =
    Number(roomState.actionTimeLimitSec) || existing?.settings?.actionTimeLimit || 20;
  const winningRule: WinningRule =
    roomState.winningRule === 'dealer_wins_ties' ? 'dealer_wins_ties' : 'standard';
  const order: 'seat' | 'random' = roomState.order === 'random' ? 'random' : 'seat';

  const playerNames: Record<string, string> =
    roomState.playerNames && typeof roomState.playerNames === 'object'
      ? roomState.playerNames
      : {};
  const playerAvatars: Record<string, string> =
    roomState.playerAvatars && typeof roomState.playerAvatars === 'object'
      ? roomState.playerAvatars
      : {};
  const balances: Record<string, number> =
    roomState.balances && typeof roomState.balances === 'object'
      ? roomState.balances
      : {};

  const rawSeats: any[] = Array.isArray(roomState.seats) ? roomState.seats : [];
  const baseSeatCount = Math.max(
    1,
    rawSeats.filter((s) => !s?.isSplitHand).length ||
      Number(roomState.maxSeats) ||
      existing?.settings?.maxSeats ||
      7
  );

  let seats: PlayerSeat[];
  if (rawSeats.length > 0) {
    seats = rawSeats.map((s) => {
      const pid =
        typeof s?.playerId === 'string' && s.playerId
          ? s.playerId
          : typeof s?.userId === 'string' && s.userId
          ? s.userId
          : null;
      const resolvedName =
        s?.name ||
        (pid ? playerNames[pid] || usersDb[pid]?.name || pid : undefined);
      const resolvedAvatar =
        s?.avatar ||
        (pid ? playerAvatars[pid] || usersDb[pid]?.avatar : undefined);

      return {
        userId: pid,
        name: resolvedName,
        avatar: resolvedAvatar,
        isReady: Boolean(s?.isReady),
        isSplitHand: Boolean(s?.isSplitHand),
        originalSeatIndex:
          typeof s?.originalSeatIndex === 'number' ? s.originalSeatIndex : undefined,
        hand: s?.hand
          ? {
              cards: Array.isArray(s.hand.cards) ? s.hand.cards : [],
              bet: Number(s.hand.bet) || 0,
              insuranceBet: Number(s.hand.insuranceBet) || 0,
              sideBets: s.hand.sideBets || { pair: 0, twentyOnePlusThree: 0 },
              sideBetPairWon: Number(s.hand.sideBetPairWon) || 0,
              sideBetPlus3Won: Number(s.hand.sideBetPlus3Won) || 0,
              status: (s.hand.status as HandStatus) || 'playing',
              score: Number(s.hand.score) || 0,
            }
          : null,
      };
    });
    while (seats.length < baseSeatCount) {
      seats.push({
        userId: null,
        isReady: false,
        hand: null,
      });
    }
  } else if (existing?.seats && existing.seats.length >= baseSeatCount) {
    seats = existing.seats.map((s) => ({ ...s }));
  } else {
    seats = Array.from({ length: baseSeatCount }, () => ({
      userId: null,
      isReady: false,
      hand: null,
    }));
  }

  const userBalances: Record<
    string,
    { balance: number; initialBuyIn: number; currency?: 'Gcoin' | 'Bonus' }
  > = { ...(existing?.userBalances || {}) };

  for (const [pid, bal] of Object.entries(balances)) {
    userBalances[pid] = {
      balance: Number(bal) || 0,
      initialBuyIn: DEFAULT_GAME_COINS,
      currency: 'Gcoin',
    };
  }

  const deckCount =
    typeof roomState.deckRemainingCount === 'number'
      ? roomState.deckRemainingCount
      : Array.isArray(roomState.deck)
      ? roomState.deck.length
      : 312;

  const isPlayingPhase =
    roomState.phase === 'playing' || roomState.phase === 'dealer_turn';

  const dealerHand: Hand | null = roomState.dealerHand
    ? {
        cards: Array.isArray(roomState.dealerHand.cards)
          ? roomState.dealerHand.cards.map((c: PlayingCard) =>
              c.isHidden ? { ...MASKED_CARD } : c
            )
          : [],
        bet: 0,
        status: (roomState.dealerHand.status as HandStatus) || 'playing',
        score: Number(roomState.dealerHand.score) || 0,
      }
    : null;

  return {
    id: tableId,
    name: existing?.name || 'Table #1',
    description: existing?.description || '',
    houseId: existing?.houseId || 'system',
    createdAt: existing?.createdAt || sessionStartedAtMs,
    visits: existing?.visits || 1,
    liquidity: existing?.liquidity || 100000,
    initialLiquidity: existing?.initialLiquidity || 100000,
    safeAccountAddress: '',
    settings: {
      name: existing?.settings?.name || 'Table #1',
      description: existing?.settings?.description || '',
      mode,
      tournament: roomState.tournament || existing?.settings?.tournament,
      minBet,
      maxBet,
      minBuyIn: minBet * 5,
      secretBets: mode === 'tournament',
      actionTimeLimit,
      isPublic: true,
      maxSeats: baseSeatCount,
      winningRule,
      order,
    },
    seats,
    userBalances,
    inviteLink: `/t/${tableId}`,
    status: isPlayingPhase ? 'playing' : 'waiting',
    dealerHand,
    deck: Array.from({ length: Math.max(0, deckCount) }, () => ({ ...MASKED_CARD })),
    discardCount: Number(roomState.discardCount) || 0,
    discardedCards: existing?.discardedCards || [],
    currentTurnIndex:
      roomState.phase === 'playing'
        ? Number(roomState.currentTurnSeatIndex ?? -1)
        : -1,
    roundsPlayed: Number(roomState.roundsPlayed) || 0,
    tournamentHistory: Array.isArray(roomState.tournamentHistory)
      ? roomState.tournamentHistory
      : existing?.tournamentHistory || [],
    lastRoundSummary: roomState.lastRoundSummary || existing?.lastRoundSummary,
  };
}

function appendRoundRecordIfNew(
  currentRecords: GameRecord[],
  table: Table,
  userId?: string
): GameRecord[] {
  if (!userId) return currentRecords;
  const summary = table.lastRoundSummary;
  if (!summary || !summary.roundId) return currentRecords;
  if (currentRecords.some((r) => r.id === summary.roundId)) return currentRecords;

  const mySeatResults = (summary.seatResults || []).filter((sr) => sr.userId === userId);
  if (mySeatResults.length === 0) return currentRecords;

  const amountWon = summary.winnings?.[userId] || 0;
  const totalNet = mySeatResults.reduce((sum, sr) => sum + (sr.net || 0), 0);
  const hasBlackjack = mySeatResults.some((sr) => sr.action === 'blackjack');
  const resType: 'win' | 'lose' | 'push' | 'blackjack' = hasBlackjack
    ? 'blackjack'
    : totalNet > 0
    ? 'win'
    : totalNet < 0
    ? 'lose'
    : 'push';

  return [
    {
      id: summary.roundId,
      tableId: table.id,
      result: resType,
      amountWon,
      timestamp: summary.timestamp || Date.now(),
      seatResults: mySeatResults,
      dealerScore: summary.dealerScore,
      currency: 'Gcoin' as const,
    },
    ...currentRecords,
  ].slice(0, 50);
}

async function postBackendJson<T = any>(url: string, body: Record<string, any>): Promise<T | null> {
  if (typeof window === 'undefined') return null;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function getRuntimeGameStats() {
  reconcileSystemTables();
  const stateTables = useGameStore.getState().tables;
  const allTables =
    Object.keys(stateTables).length > 0 ? Object.values(stateTables) : Object.values(tablesDb);
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
    gameId: RANDSEED_GAME_ID,
    slug: GAME_SLUG,
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

const SESSION_STORAGE_USER_KEY = 'royal_blackjack_player_id';

function getOrPersistSessionUserId(overrideUserId?: string): string {
  if (overrideUserId && overrideUserId.trim()) return overrideUserId.trim();
  if (typeof window !== 'undefined') {
    try {
      const existing = window.sessionStorage.getItem(SESSION_STORAGE_USER_KEY);
      if (existing && existing.trim()) return existing.trim();
      const generated = `user_${Math.random().toString(36).slice(2, 11)}`;
      window.sessionStorage.setItem(SESSION_STORAGE_USER_KEY, generated);
      return generated;
    } catch {
      // Ignore storage access errors in restricted iframes
    }
  }
  return `user_${Math.random().toString(36).slice(2, 11)}`;
}

export const useGameStore = create<GameStore>((set, get) => {
  const applyOnlineRoomSnapshot = (
    rawRoomState: Record<string, any>,
    allocation?: { roomId: string; playerId: string }
  ) => {
    const roomState = unwrapOnlineRoomState(rawRoomState);
    latestOnlineRoomState = roomState;
    if (allocation?.roomId) {
      latestOnlineRoomId = allocation.roomId;
    }

    const current = get().currentUser;
    const resolvedId = allocation?.playerId || current?.id || getOrPersistSessionUserId();
    const resolvedName =
      roomState.playerNames?.[resolvedId] || current?.name || 'Player';
    const resolvedAvatar =
      roomState.playerAvatars?.[resolvedId] || current?.avatar;

    const syncedUser = getOrCreateUser(resolvedId, resolvedName, true, resolvedAvatar);
    const walletMap = (roomState.walletCoins || roomState.balances || {}) as Record<string, number>;
    const balMap = (roomState.balances || {}) as Record<string, number>;
    const effectiveBalance =
      typeof walletMap[resolvedId] === 'number'
        ? walletMap[resolvedId]
        : typeof balMap[resolvedId] === 'number'
        ? balMap[resolvedId]
        : syncedUser.balance;

    if (usersDb[resolvedId]) {
      usersDb[resolvedId].balance = effectiveBalance;
    }
    syncedUser.balance = effectiveBalance;

    const currentTables = { ...get().tables };
    // Ensure we never duplicate Table #1 under a second allocation.roomId key
    if (latestOnlineRoomId && latestOnlineRoomId !== 'table_1') {
      delete currentTables[latestOnlineRoomId];
      delete tablesDb[latestOnlineRoomId];
    }

    const mappedPrimary = mapRoomStateToTable(
      roomState,
      'table_1',
      currentTables['table_1'] || tablesDb['table_1']
    );
    currentTables['table_1'] = mappedPrimary;
    tablesDb['table_1'] = mappedPrimary;

    const updatedRecords = appendRoundRecordIfNew(
      get().gameRecords,
      mappedPrimary,
      resolvedId
    );

    set({
      currentUser: syncedUser,
      tables: currentTables,
      gameRecords: updatedRecords,
    });
  };

  const isPrimaryOnlineRoomTable = (tableId: string): boolean => {
    if (!isRandseedRoomConnected()) return false;
    return tableId === 'table_1' || tableId === latestOnlineRoomId;
  };

  return {
    currentUser: null,
    tables: sanitizeTablesMapForClient(reconcileSystemTables()),
    activeTableId: null,
    gameRecords: [],
    unlockedTableIds: {},

    login: async (name: string, overrideUserId?: string, avatar?: string, isCreator?: boolean) => {
      const effectiveName = name || 'Player';
      const effectiveAvatar = avatar || undefined;
      const urlCreatorFlag = Boolean(isCreator);
      const savedUserId = getOrPersistSessionUserId(overrideUserId);

      // 1. Initialize against backend HTTP session if available
      const sessionPayload = await postBackendJson<{
        user: User;
        tables: Record<string, Table>;
      }>('/api/game/session', {
        userId: savedUserId,
        name: effectiveName,
        avatar: effectiveAvatar,
        isCreator: urlCreatorFlag,
      });

      if (sessionPayload?.user && sessionPayload?.tables) {
        for (const [id, t] of Object.entries(sessionPayload.tables)) {
          tablesDb[id] = t;
        }
        usersDb[sessionPayload.user.id] = sessionPayload.user;
        set({
          currentUser: sessionPayload.user,
          tables: sessionPayload.tables,
        });
      } else {
        reconcileSystemTables();
        const user = getOrCreateUser(savedUserId, effectiveName, urlCreatorFlag, effectiveAvatar);
        set({
          currentUser: user,
          tables: sanitizeTablesMapForClient(tablesDb, user.id),
        });
      }

      // 2. Connect to authoritative RandSeed RoomClient (online multiplayer WebSocket/HTTP room)
      matchRandseedRoom((roomState, allocation) => {
        applyOnlineRoomSnapshot(roomState, allocation);
      })
        .then((res) => {
          if (res?.allocation) {
            sendRandseedRoomAction({
              action: 'sync_profile',
              name: get().currentUser?.name || effectiveName,
              ...(effectiveAvatar ? { avatar: effectiveAvatar } : {}),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    },

    syncStateFromServer: async () => {
      const userId = get().currentUser?.id;

      // Fetch multi-table state from backend server if available
      if (typeof window !== 'undefined' && userId) {
        try {
          const res = await fetch(`/api/game/state?userId=${encodeURIComponent(userId)}`, {
            credentials: 'same-origin',
            cache: 'no-store',
          });
          if (res.ok) {
            const payload = await res.json();
            if (payload?.tables && typeof payload.tables === 'object') {
              const nextTables: Record<string, Table> = { ...payload.tables };
              // Keep authoritative RoomClient snapshot on table_1 when RoomClient is connected
              if (isRandseedRoomConnected() && latestOnlineRoomState) {
                nextTables['table_1'] = mapRoomStateToTable(
                  latestOnlineRoomState,
                  'table_1',
                  nextTables['table_1'] || get().tables['table_1']
                );
              }
              for (const [id, t] of Object.entries(nextTables)) {
                tablesDb[id] = t;
              }
              set((state) => {
                let updatedRecords = state.gameRecords;
                for (const t of Object.values(nextTables)) {
                  updatedRecords = appendRoundRecordIfNew(updatedRecords, t, userId);
                }
                const nextUser =
                  isRandseedRoomConnected() && state.currentUser
                    ? state.currentUser
                    : payload.user || state.currentUser;
                return {
                  currentUser: nextUser,
                  tables: nextTables,
                  gameRecords: updatedRecords,
                };
              });
              return;
            }
          }
        } catch {
          // Ignore network error when running purely on RandSeed RoomClient without /api/game/state
        }
      }

      // If connected to RandSeed RoomClient without /api/game/state, re-apply authoritative room state
      if (isRandseedRoomConnected() && latestOnlineRoomState) {
        applyOnlineRoomSnapshot(latestOnlineRoomState, getRandseedRoomAllocation());
        return;
      }

      reconcileSystemTables();
      const nextTables = sanitizeTablesMapForClient(tablesDb, userId);

      set((state) => {
        const user = userId ? getOrCreateUser(userId) : state.currentUser;
        let updatedRecords = state.gameRecords;
        if (user) {
          for (const t of Object.values(nextTables)) {
            updatedRecords = appendRoundRecordIfNew(updatedRecords, t, user.id);
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
        const nextName = creatorName || current?.name || 'Creator';
        const user = getOrCreateUser(userId, nextName, true);
        sendRandseedRoomAction({ action: 'sync_profile', name: nextName }).catch(() => {});
        set((state) => ({
          currentUser: { ...user, balance: state.currentUser?.balance ?? user.balance, role: 'creator', isCreator: true },
        }));
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

      const remote = await postBackendJson<{
        user: User;
        table: Table;
        tables: Record<string, Table>;
      }>('/api/game/tables', {
        userId: user.id,
        userName: user.name,
        settings,
        liquidity,
      });

      if (remote?.table && remote?.tables) {
        for (const [id, t] of Object.entries(remote.tables)) {
          tablesDb[id] = t;
        }
        const nextUnlocked = { ...get().unlockedTableIds, [remote.table.id]: true };
        set({
          currentUser: remote.user || getOrCreateUser(user.id),
          tables: remote.tables,
          activeTableId: remote.table.id,
          unlockedTableIds: nextUnlocked,
        });
        return remote.table.id;
      }

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
      const remote = await postBackendJson<{ valid: boolean }>(
        `/api/game/tables/${encodeURIComponent(tableId)}/verify-code`,
        { userId: user?.id, tableCode }
      );
      if (remote && typeof remote.valid === 'boolean') {
        if (remote.valid) {
          set({ unlockedTableIds: { ...get().unlockedTableIds, [tableId]: true } });
          return true;
        }
        return false;
      }

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
      try {
        const res = await fetch(`/api/game/tables/${encodeURIComponent(tableId)}/settings`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: user.id, settings }),
        });
        if (res.ok) {
          const payload = await res.json();
          if (payload?.tables) {
            set({ currentUser: payload.user || user, tables: payload.tables });
            return;
          }
        }
      } catch {}

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
      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/deposit`, {
        userId: user.id,
        amount,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        return;
      }
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
      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/pause`, {
        userId: user.id,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        return;
      }
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
      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/resume`, {
        userId: user.id,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        return;
      }
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
      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/withdraw`, {
        userId: user.id,
        amount,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        return;
      }
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

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({
          action: 'join_seat',
          seatIndex,
          playerName: user.name,
          ...(user.avatar ? { playerAvatar: user.avatar } : {}),
        });
        set({ activeTableId: tableId });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/join`, {
        userId: user.id,
        seatIndex,
        currency,
      });
      if (remote?.tables) {
        set({
          currentUser: remote.user || user,
          tables: remote.tables,
          activeTableId: tableId,
        });
        return;
      }

      await gameApi.joinTable(tableId, user.id, seatIndex, 0, currency);
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
      if (isPrimaryOnlineRoomTable(tableId)) return;
      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/visit`, {
        userId: user?.id,
      });
      if (remote?.tables) {
        set({ tables: remote.tables });
        return;
      }
      await hostTableApi.recordVisit(tableId);
      set((state) => ({
        tables: sanitizeTablesMapForClient(tablesDb, user?.id) || state.tables,
      }));
    },

    leaveTable: async (tableId, seatIndex, isTimeout) => {
      const user = get().currentUser;
      if (!user) return;

      if (isPrimaryOnlineRoomTable(tableId)) {
        if (seatIndex !== undefined) {
          await sendRandseedRoomAction({ action: 'leave_seat', seatIndex });
        } else {
          const t = get().tables[tableId];
          const myIdxs =
            t?.seats
              .map((s, idx) => (s.userId === user.id ? idx : -1))
              .filter((idx) => idx >= 0) || [];
          for (const idx of myIdxs) {
            await sendRandseedRoomAction({ action: 'leave_seat', seatIndex: idx });
          }
          set({ activeTableId: null });
        }
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/leave`, {
        userId: user.id,
        seatIndex,
        isTimeout,
      });
      if (remote?.tables) {
        set((state) => ({
          currentUser: remote.user || user,
          tables: remote.tables,
          activeTableId: seatIndex === undefined ? null : state.activeTableId,
        }));
        const updatedTable = remote.tables[tableId];
        if (updatedTable && updatedTable.currentTurnIndex === -1 && updatedTable.status === 'playing') {
          get().dealerPlay(tableId);
        }
        return;
      }

      const { table } = await gameApi.leaveTable(tableId, user.id, seatIndex, isTimeout);

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

      if (isPrimaryOnlineRoomTable(tableId)) return;

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/unlock`, {
        userId: user.id,
      });
      if (remote?.tables) {
        set({
          currentUser: remote.user || user,
          tables: remote.tables,
        });
        return;
      }

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

      if (isRandseedRoomConnected()) {
        await sendRandseedRoomAction({ action: 'claim_refill' });
        return;
      }

      const remote = await postBackendJson('/api/game/refill', {
        userId: user.id,
        tableId: targetTableId,
      });
      if (remote?.user && remote?.tables) {
        set({
          currentUser: remote.user,
          tables: remote.tables,
        });
        return;
      }

      const { user: updatedUser } = claimServerRefill(user.id, targetTableId);
      set({
        currentUser: updatedUser,
        tables: sanitizeTablesMapForClient(tablesDb, user.id),
      });
    },

    placeBet: async (tableId, seatIndex, amount, sideBets) => {
      const user = get().currentUser;
      if (!user) return;

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({
          action: 'place_bet',
          seatIndex,
          amount,
          sideBets: {
            pair: sideBets?.pair || 0,
            twentyOnePlusThree: sideBets?.twentyOnePlusThree || 0,
          },
          pairBet: sideBets?.pair || 0,
          plus3Bet: sideBets?.twentyOnePlusThree || 0,
        });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/bet`, {
        userId: user.id,
        seatIndex,
        amount,
        sideBets,
      });
      if (remote?.tables) {
        set({
          currentUser: remote.user || user,
          tables: remote.tables,
        });
        return;
      }

      await gameApi.placeBet(tableId, seatIndex, user.id, amount, sideBets);
      set({
        currentUser: getOrCreateUser(user.id),
        tables: sanitizeTablesMapForClient(tablesDb, user.id),
      });
    },

    startGame: async (tableId) => {
      const user = get().currentUser;

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({ action: 'start_game' });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/start`, {
        userId: user?.id,
      });
      if (remote?.tables) {
        set({
          currentUser: remote.user || user,
          tables: remote.tables,
        });
        const updatedTable = remote.tables[tableId];
        if (updatedTable && updatedTable.currentTurnIndex === -1 && updatedTable.status === 'playing') {
          const activeSeatsCount = updatedTable.seats.filter((s: PlayerSeat) => s.isReady).length;
          setTimeout(() => {
            get().dealerPlay(tableId);
          }, (activeSeatsCount + 1) * 400 + 500);
        }
        return;
      }

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

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({ action: 'hit', seatIndex });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/hit`, {
        userId: user?.id,
        seatIndex,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        const updatedTable = remote.tables[tableId];
        if (updatedTable && updatedTable.currentTurnIndex === -1 && updatedTable.status === 'playing') {
          get().dealerPlay(tableId);
        }
        return;
      }

      const table = await gameApi.hit(tableId, seatIndex);
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

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({ action: 'stand', seatIndex });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/stand`, {
        userId: user?.id,
        seatIndex,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        const updatedTable = remote.tables[tableId];
        if (updatedTable && updatedTable.currentTurnIndex === -1 && updatedTable.status === 'playing') {
          get().dealerPlay(tableId);
        }
        return;
      }

      const table = await gameApi.stand(tableId, seatIndex);
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

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({ action: 'double_down', seatIndex });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/double`, {
        userId: user?.id,
        seatIndex,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        const updatedTable = remote.tables[tableId];
        if (updatedTable && updatedTable.currentTurnIndex === -1 && updatedTable.status === 'playing') {
          get().dealerPlay(tableId);
        }
        return;
      }

      const table = await gameApi.doubleDown(tableId, seatIndex);
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

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({ action: 'split', seatIndex });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/split`, {
        userId: user?.id,
        seatIndex,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        const updatedTable = remote.tables[tableId];
        if (updatedTable && updatedTable.currentTurnIndex === -1 && updatedTable.status === 'playing') {
          get().dealerPlay(tableId);
        }
        return;
      }

      const table = await gameApi.split(tableId, seatIndex);
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

      if (isPrimaryOnlineRoomTable(tableId)) {
        await sendRandseedRoomAction({ action: 'buy_insurance', seatIndex });
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/insurance`, {
        userId: user?.id,
        seatIndex,
      });
      if (remote?.tables) {
        set({ currentUser: remote.user || user, tables: remote.tables });
        return;
      }

      await gameApi.buyInsurance(tableId, seatIndex);
      set((state) => ({
        currentUser: user ? getOrCreateUser(user.id) : state.currentUser,
        tables: sanitizeTablesMapForClient(tablesDb, user?.id),
      }));
    },

    dealerPlay: async (tableId) => {
      const currentUser = get().currentUser;

      if (isPrimaryOnlineRoomTable(tableId)) {
        readyRandseedRoom().catch(() => {});
        return;
      }

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/dealer-play`, {
        userId: currentUser?.id,
      });
      if (remote?.tables && remote?.table) {
        set((state) => {
          const updatedRecords = appendRoundRecordIfNew(
            state.gameRecords,
            remote.table,
            currentUser?.id
          );
          return {
            currentUser: remote.user || state.currentUser,
            tables: remote.tables,
            gameRecords: updatedRecords,
            activeTableId:
              state.activeTableId === tableId && remote.table.status === 'closed'
                ? null
                : state.activeTableId,
          };
        });
        return;
      }

      const { table } = await gameApi.dealerPlayAndResolve(tableId);
      const sanitizedTables = sanitizeTablesMapForClient(tablesDb, currentUser?.id);

      set((state) => {
        const user = currentUser ? getOrCreateUser(currentUser.id) : state.currentUser;
        const updatedRecords = appendRoundRecordIfNew(
          state.gameRecords,
          table,
          user?.id
        );
        return {
          currentUser: user,
          tables: sanitizedTables,
          gameRecords: updatedRecords,
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

      const remote = await postBackendJson(`/api/game/tables/${encodeURIComponent(tableId)}/close`, {
        userId: user.id,
      });
      if (remote?.tables) {
        set((state) => ({
          currentUser: remote.user || user,
          tables: remote.tables,
          activeTableId:
            state.activeTableId === tableId && remote.table?.status === 'closed'
              ? null
              : state.activeTableId,
        }));
        return;
      }

      const { table } = await hostTableApi.closeTable(tableId, user.id);
      reconcileSystemTables();

      set((state) => ({
        currentUser: getOrCreateUser(user.id),
        tables: sanitizeTablesMapForClient(tablesDb, user.id),
        activeTableId:
          state.activeTableId === tableId && table.status === 'closed' ? null : state.activeTableId,
      }));
    },
  };
});
