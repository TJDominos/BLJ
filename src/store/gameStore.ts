import { create } from 'zustand';
import { ROYAL_BLACKJACK_RULES_VERSION } from '../backend/platformContract';
import {
  RANDSEED_GAME_ID,
  GAME_SLUG,
  initRandseedRuntime,
  getRandseedPlayerProfile,
  onRandseedProfileUpdate,
  onRandseedRoomStatusChange,
  getRandseedOnlinePlayers,
  isRandseedRoomConnected,
  getRandseedRoomStatus,
  getRandseedRoomError,
  getRandseedRoomAllocation,
  getRandseedRoomSnapshot,
  matchRandseedRoom,
  sendRandseedRoomAction,
  readyRandseedRoom,
  type RoomConnectionStatus,
  type RoomPlayer,
} from '../lib/randseedRuntime';

export const DEFAULT_GAME_COINS = 5000;

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
  tableCodeHash?: string;
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
  houseName?: string;
  houseAvatar?: string;
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
  roundHistory?: Array<{
    roundId: string;
    timestamp: number;
    winnings: Record<string, number>;
    seatResults: SeatResult[];
    dealerScore: number;
  }>;
}

export interface SeatResult {
  seatIndex: number;
  userId?: string;
  playerName?: string;
  playerAvatar?: string;
  bet: number;
  sideBet?: number;
  sideBetWin?: number;
  pairBet?: number;
  pairWin?: number;
  plus3Bet?: number;
  plus3Win?: number;
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

export interface OnlinePlayerEntry {
  userId: string;
  name: string;
  avatar?: string;
  joinedAt?: number;
  tableId?: string;
  tableName?: string;
  isPlaying?: boolean;
}

const sessionStartedAtMs = Date.now();
const MASKED_CARD: PlayingCard = { suit: 'spades', value: 'A', isHidden: true };

// Authoritative online room state cache from RandSeed RoomClient
let latestOnlineRoomState: Record<string, any> | null = null;
let latestOnlineRoomId: string | null = null;
let roomListenersRegistered = false;
let loginInFlight: Promise<void> | null = null;

function computeClientTableCodeHash(tableId: string, code: string): string {
  const input = `${tableId}:${code.trim()}:royal_bj_pin`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

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
  } else if (
    raw.data &&
    typeof raw.data === 'object' &&
    !Array.isArray(raw.data) &&
    Array.isArray((raw.data as any).seats)
  ) {
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
        _privateState: privateState,
      };
    }

    if (Array.isArray(privateState.mySeats)) {
      const primarySeatMap = new Map<number, any>();
      const customSeatMap = new Map<string, Map<number, any>>();
      for (const ms of privateState.mySeats) {
        if (!ms || typeof ms.seatIndex !== 'number') continue;
        const tid = typeof ms.tableId === 'string' && ms.tableId ? ms.tableId : 'table_1';
        if (tid === 'table_1') {
          primarySeatMap.set(ms.seatIndex, ms);
        } else {
          if (!customSeatMap.has(tid)) customSeatMap.set(tid, new Map());
          customSeatMap.get(tid)!.set(ms.seatIndex, ms);
        }
      }

      if (primarySeatMap.size > 0 && Array.isArray(base.seats)) {
        base = {
          ...base,
          seats: base.seats.map((s: any, idx: number) => {
            const seatIdx = typeof s?.seatIndex === 'number' ? s.seatIndex : idx;
            const mySeat = primarySeatMap.get(seatIdx);
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

      if (customSeatMap.size > 0 && base.customTables && typeof base.customTables === 'object') {
        const nextCustomTables = { ...base.customTables };
        for (const [tid, seatMap] of customSeatMap.entries()) {
          const ct = nextCustomTables[tid];
          if (!ct || !Array.isArray(ct.seats)) continue;
          nextCustomTables[tid] = {
            ...ct,
            seats: ct.seats.map((s: any, idx: number) => {
              const seatIdx = typeof s?.seatIndex === 'number' ? s.seatIndex : idx;
              const mySeat = seatMap.get(seatIdx);
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
        base = {
          ...base,
          customTables: nextCustomTables,
        };
      }
    }
  }

  return base;
}

function mapRoomStateToTable(
  rawRoomState: Record<string, any>,
  tableId: string,
  existing?: Table,
  ownedCodeOverride?: string
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
        s?.name || (pid ? playerNames[pid] || pid : undefined);
      const resolvedAvatar =
        s?.avatar || (pid ? playerAvatars[pid] : undefined);

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

  const startingBuyIn =
    mode === 'tournament'
      ? Number(roomState.tournament?.startingChips) || DEFAULT_GAME_COINS
      : DEFAULT_GAME_COINS;

  for (const [pid, bal] of Object.entries(balances)) {
    userBalances[pid] = {
      balance: Number(bal) || 0,
      initialBuyIn: userBalances[pid]?.initialBuyIn || startingBuyIn,
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

  const resolvedStatus: Table['status'] =
    roomState.status === 'closed' ||
    roomState.status === 'closing' ||
    roomState.status === 'paused'
      ? roomState.status
      : isPlayingPhase
      ? 'playing'
      : 'waiting';

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

  const tableName =
    (typeof roomState.name === 'string' && roomState.name.trim()) ||
    existing?.name ||
    (tableId === 'table_1' ? 'Table #1' : tableId);
  const tableDesc =
    typeof roomState.description === 'string'
      ? roomState.description
      : existing?.description || '';
  const houseId =
    (typeof roomState.houseId === 'string' && roomState.houseId) ||
    existing?.houseId ||
    'system';
  const houseName =
    roomState.houseName ||
    (houseId !== 'system' ? playerNames[houseId] || existing?.houseName || houseId : undefined);
  const houseAvatar =
    roomState.houseAvatar ||
    (houseId !== 'system' ? playerAvatars[houseId] || existing?.houseAvatar : undefined);
  const hasTableCode = Boolean(roomState.hasTableCode ?? existing?.settings?.hasTableCode);
  const tableCode =
    ownedCodeOverride ||
    (typeof roomState.tableCode === 'string' ? roomState.tableCode : existing?.settings?.tableCode);
  const tableCodeHash =
    typeof roomState.tableCodeHash === 'string'
      ? roomState.tableCodeHash
      : existing?.settings?.tableCodeHash;
  const isPublic = hasTableCode ? false : Boolean(roomState.isPublic ?? existing?.settings?.isPublic ?? true);

  return {
    id: tableId,
    name: tableName,
    description: tableDesc,
    houseId,
    houseName,
    houseAvatar,
    createdAt: Number(roomState.createdAt) || existing?.createdAt || sessionStartedAtMs,
    visits: Number(roomState.visits ?? existing?.visits ?? 1),
    liquidity: Number(roomState.liquidity ?? existing?.liquidity ?? 100000),
    initialLiquidity: Number(roomState.initialLiquidity ?? existing?.initialLiquidity ?? 100000),
    safeAccountAddress: '',
    settings: {
      name: tableName,
      description: tableDesc,
      mode,
      tournament: roomState.tournament || existing?.settings?.tournament,
      minBet,
      maxBet,
      minBuyIn: mode === 'tournament' ? Number(roomState.tournament?.ticketPrice) || 100 : minBet * 5,
      secretBets: mode === 'tournament',
      actionTimeLimit,
      isPublic,
      hasTableCode,
      tableCode,
      tableCodeHash,
      maxSeats: baseSeatCount,
      winningRule,
      order,
    },
    seats,
    userBalances,
    inviteLink: `/t/${tableId}`,
    status: resolvedStatus,
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
    emptySince: roomState.emptySince ?? existing?.emptySince ?? null,
    maxHostingTimeMs: roomState.maxHostingTimeMs ?? existing?.maxHostingTimeMs,
    expiresAt: roomState.expiresAt ?? existing?.expiresAt ?? null,
    lastRoundSummary: roomState.lastRoundSummary || existing?.lastRoundSummary,
    roundHistory: Array.isArray(roomState.roundHistory)
      ? roomState.roundHistory
      : existing?.roundHistory || [],
  };
}

function mapAllRoomTablesFromSnapshot(
  roomState: Record<string, any>,
  existingTables: Record<string, Table>
): Record<string, Table> {
  if (!roomState || !Array.isArray(roomState.seats)) {
    return {};
  }

  const ownedTableCodes: Record<string, string> =
    roomState._privateState?.ownedTableCodes &&
    typeof roomState._privateState.ownedTableCodes === 'object'
      ? roomState._privateState.ownedTableCodes
      : {};

  const nextTables: Record<string, Table> = {};
  nextTables['table_1'] = mapRoomStateToTable(
    roomState,
    'table_1',
    existingTables['table_1']
  );

  if (roomState.customTables && typeof roomState.customTables === 'object') {
    for (const [tid, rawSub] of Object.entries(roomState.customTables)) {
      if (!rawSub || typeof rawSub !== 'object') continue;
      const subObj = rawSub as Record<string, any>;
      if (subObj.status === 'closed') continue;
      nextTables[tid] = mapRoomStateToTable(
        {
          ...subObj,
          playerNames: roomState.playerNames,
          playerAvatars: roomState.playerAvatars,
          walletCoins: roomState.walletCoins,
        },
        tid,
        existingTables[tid],
        ownedTableCodes[tid]
      );
    }
  }

  return nextTables;
}

function appendRoundRecordIfNew(
  currentRecords: GameRecord[],
  table: Table,
  userId?: string
): GameRecord[] {
  const summariesToProcess: Array<NonNullable<Table['lastRoundSummary']>> = [];
  if (Array.isArray(table.roundHistory) && table.roundHistory.length > 0) {
    // Process oldest to newest so unshifting keeps newest first
    for (let i = table.roundHistory.length - 1; i >= 0; i--) {
      const s = table.roundHistory[i];
      if (s && s.roundId) summariesToProcess.push(s);
    }
  } else if (table.lastRoundSummary && table.lastRoundSummary.roundId) {
    summariesToProcess.push(table.lastRoundSummary);
  }

  if (summariesToProcess.length === 0) return currentRecords;

  let nextRecords = currentRecords;
  const existingIds = new Set(currentRecords.map((r) => r.id));

  for (const summary of summariesToProcess) {
    if (!summary?.roundId || existingIds.has(summary.roundId)) continue;
    const allSeatResults = summary.seatResults || [];
    if (allSeatResults.length === 0) continue;

    const mySeatResults = userId
      ? allSeatResults.filter((sr) => sr.userId === userId)
      : allSeatResults;
    const amountWon = userId ? summary.winnings?.[userId] || 0 : 0;
    const totalNet = mySeatResults.reduce((sum, sr) => sum + (sr.net || 0), 0);
    const hasBlackjack = mySeatResults.some((sr) => sr.action === 'blackjack');
    const resType: 'win' | 'lose' | 'push' | 'blackjack' = hasBlackjack
      ? 'blackjack'
      : totalNet > 0
      ? 'win'
      : totalNet < 0
      ? 'lose'
      : 'push';

    existingIds.add(summary.roundId);
    nextRecords = [
      {
        id: summary.roundId,
        tableId: table.id,
        result: resType,
        amountWon,
        timestamp: summary.timestamp || Date.now(),
        seatResults: allSeatResults,
        dealerScore: summary.dealerScore,
        currency: 'Gcoin' as const,
      },
      ...nextRecords,
    ];
  }

  return nextRecords.slice(0, 100);
}

function buildOnlinePlayersList(
  tables: Record<string, Table>,
  currentUser: User | null,
  roomPlayers?: RoomPlayer[],
  roomState?: Record<string, any> | null
): OnlinePlayerEntry[] {
  const map = new Map<string, OnlinePlayerEntry>();
  const sdkPlayers = roomPlayers ?? getRandseedOnlinePlayers();
  const stateNames: Record<string, string> =
    roomState?.playerNames && typeof roomState.playerNames === 'object'
      ? roomState.playerNames
      : {};
  const stateAvatars: Record<string, string> =
    roomState?.playerAvatars && typeof roomState.playerAvatars === 'object'
      ? roomState.playerAvatars
      : {};

  const findPlayerTableInfo = (uid: string) => {
    for (const t of Object.values(tables)) {
      if (t.status === 'closed' || t.status === 'closing') continue;
      const seat = t.seats.find((s) => s.userId === uid);
      if (seat) {
        return {
          tableId: t.id,
          tableName: t.name,
          isPlaying: Boolean(seat.hand && t.status === 'playing'),
          seatName: seat.name,
          seatAvatar: seat.avatar,
        };
      }
    }
    return null;
  };

  for (const rp of sdkPlayers) {
    if (!rp || typeof rp.playerId !== 'string') continue;
    const uid = rp.playerId.trim();
    if (!uid || uid.startsWith('bot_')) continue;
    const isMe = currentUser?.id === uid;
    const tableInfo = findPlayerTableInfo(uid);
    const resolvedName =
      (typeof rp.displayName === 'string' && rp.displayName.trim()) ||
      (isMe && currentUser?.name && currentUser.name !== 'Player' ? currentUser.name : '') ||
      stateNames[uid] ||
      tableInfo?.seatName ||
      (isMe ? currentUser?.name : '') ||
      uid;
    const resolvedAvatar =
      (typeof rp.avatarUrl === 'string' && rp.avatarUrl.trim()) ||
      (isMe ? currentUser?.avatar : undefined) ||
      stateAvatars[uid] ||
      tableInfo?.seatAvatar ||
      undefined;

    map.set(uid, {
      userId: uid,
      name: resolvedName,
      avatar: resolvedAvatar,
      joinedAt: rp.joinedAt,
      tableId: tableInfo?.tableId,
      tableName: tableInfo?.tableName,
      isPlaying: tableInfo?.isPlaying ?? false,
    });
  }

  const statePlayerIds: string[] = Array.isArray(roomState?.players) ? roomState.players : [];
  for (const rawId of statePlayerIds) {
    if (typeof rawId !== 'string') continue;
    const uid = rawId.trim();
    if (!uid || uid.startsWith('bot_') || map.has(uid)) continue;
    const isMe = currentUser?.id === uid;
    const tableInfo = findPlayerTableInfo(uid);
    const resolvedName =
      (isMe && currentUser?.name && currentUser.name !== 'Player' ? currentUser.name : '') ||
      stateNames[uid] ||
      tableInfo?.seatName ||
      (isMe ? currentUser?.name : '') ||
      uid;
    const resolvedAvatar =
      (isMe ? currentUser?.avatar : undefined) ||
      stateAvatars[uid] ||
      tableInfo?.seatAvatar ||
      undefined;

    map.set(uid, {
      userId: uid,
      name: resolvedName,
      avatar: resolvedAvatar,
      tableId: tableInfo?.tableId,
      tableName: tableInfo?.tableName,
      isPlaying: tableInfo?.isPlaying ?? false,
    });
  }

  for (const t of Object.values(tables)) {
    if (t.status === 'closed' || t.status === 'closing') continue;
    for (const s of t.seats) {
      if (!s.userId || s.userId.startsWith('bot_')) continue;
      const uid = s.userId;
      if (map.has(uid)) {
        const existing = map.get(uid)!;
        if (!existing.tableId) {
          existing.tableId = t.id;
          existing.tableName = t.name;
          existing.isPlaying = Boolean(s.hand && t.status === 'playing');
        }
        continue;
      }
      const isMe = currentUser?.id === uid;
      const resolvedName =
        (isMe && currentUser?.name && currentUser.name !== 'Player' ? currentUser.name : '') ||
        s.name ||
        stateNames[uid] ||
        (isMe ? currentUser?.name : '') ||
        uid;
      const resolvedAvatar =
        (isMe ? currentUser?.avatar : undefined) ||
        s.avatar ||
        stateAvatars[uid] ||
        undefined;

      map.set(uid, {
        userId: uid,
        name: resolvedName,
        avatar: resolvedAvatar,
        tableId: t.id,
        tableName: t.name,
        isPlaying: Boolean(s.hand && t.status === 'playing'),
      });
    }
  }

  if (currentUser?.id && !map.has(currentUser.id)) {
    const tableInfo = findPlayerTableInfo(currentUser.id);
    map.set(currentUser.id, {
      userId: currentUser.id,
      name: currentUser.name || 'Player',
      avatar: currentUser.avatar,
      tableId: tableInfo?.tableId,
      tableName: tableInfo?.tableName,
      isPlaying: tableInfo?.isPlaying ?? false,
    });
  }

  return Array.from(map.values());
}

export function getRuntimeGameStats() {
  const storeState = useGameStore.getState();
  const allTables = Object.values(storeState.tables);
  const activeRooms = allTables.filter((t) => t.status !== 'closed');
  const totalRoundsPlayed = allTables.reduce((sum, t) => sum + (t.roundsPlayed || 0), 0);
  const totalVisits = allTables.reduce((sum, t) => sum + (t.visits || 0), 0);
  const seatedPlayers = activeRooms.reduce(
    (sum, t) => sum + t.seats.filter((s) => s.userId !== null).length,
    0
  );

  const onlinePlayersCount = storeState.onlinePlayers.length;
  const tokensIssued =
    Number(latestOnlineRoomState?.totalTokensIssued) || onlinePlayersCount * DEFAULT_GAME_COINS;
  const tokensPaidOut = Number(latestOnlineRoomState?.totalTokensPaidOut) || 0;
  const totalRefillsCount = Number(latestOnlineRoomState?.totalRefillsCount) || 0;
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
    totalUsersCount: onlinePlayersCount,
    houseDistributedTokens,
    tokensIssued,
    tokensPaidOut,
    totalRefillsCount,
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
  onlinePlayers: OnlinePlayerEntry[];
  unlockedTableIds: Record<string, boolean>;
  roomStatus: RoomConnectionStatus;
  roomError: string | null;

  login: (name: string, overrideUserId?: string, avatar?: string, isCreator?: boolean) => Promise<void>;
  reconnectRoom: () => Promise<void>;
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

export const useGameStore = create<GameStore>((set, get) => {
  const applyOnlineRoomSnapshot = (
    rawRoomState: Record<string, any>,
    allocation?: { roomId: string; playerId: string },
    roomPlayers?: RoomPlayer[]
  ) => {
    const roomState = unwrapOnlineRoomState(rawRoomState);
    if (!roomState || !Array.isArray(roomState.seats)) {
      return;
    }

    const sdkProfile = getRandseedPlayerProfile();
    const sdkPlayers = roomPlayers ?? getRandseedOnlinePlayers();

    if (!roomState.playerNames || typeof roomState.playerNames !== 'object') {
      roomState.playerNames = {};
    }
    if (!roomState.playerAvatars || typeof roomState.playerAvatars !== 'object') {
      roomState.playerAvatars = {};
    }
    for (const rp of sdkPlayers) {
      if (!rp?.playerId) continue;
      if (rp.displayName) {
        roomState.playerNames[rp.playerId] = rp.displayName;
      }
      if (rp.avatarUrl) {
        roomState.playerAvatars[rp.playerId] = rp.avatarUrl;
      }
    }

    latestOnlineRoomState = roomState;
    if (allocation?.roomId) {
      latestOnlineRoomId = allocation.roomId;
    }

    const current = get().currentUser;
    const resolvedId =
      allocation?.playerId ||
      (typeof roomState._privateState?.playerId === 'string' && roomState._privateState.playerId) ||
      current?.id ||
      '';

    if (!resolvedId) {
      return;
    }

    const myRoomPlayer = sdkPlayers.find((p) => p.playerId === resolvedId);

    const resolvedName =
      sdkProfile?.displayName ||
      myRoomPlayer?.displayName ||
      (roomState.playerNames?.[resolvedId] && roomState.playerNames[resolvedId] !== resolvedId
        ? roomState.playerNames[resolvedId]
        : '') ||
      (current?.name && current.name !== 'Player' ? current.name : '') ||
      roomState.playerNames?.[resolvedId] ||
      'Player';

    const resolvedAvatar =
      sdkProfile?.avatarUrl ||
      myRoomPlayer?.avatarUrl ||
      roomState.playerAvatars?.[resolvedId] ||
      current?.avatar ||
      undefined;

    roomState.playerNames[resolvedId] = resolvedName;
    if (resolvedAvatar) {
      roomState.playerAvatars[resolvedId] = resolvedAvatar;
    }

    const walletMap = (roomState.walletCoins || roomState.balances || {}) as Record<string, number>;
    const balMap = (roomState.balances || {}) as Record<string, number>;
    const effectiveBalance =
      typeof walletMap[resolvedId] === 'number'
        ? walletMap[resolvedId]
        : typeof balMap[resolvedId] === 'number'
        ? balMap[resolvedId]
        : current?.balance ?? DEFAULT_GAME_COINS;

    const syncedUser: User = {
      id: resolvedId,
      name: resolvedName,
      avatar: resolvedAvatar,
      balance: effectiveBalance,
      bonusBalance: current?.bonusBalance ?? 0,
      role: current?.role || 'creator',
      isCreator: current?.isCreator ?? true,
    };

    const nextTables = mapAllRoomTablesFromSnapshot(roomState, get().tables);

    let updatedRecords = get().gameRecords;
    for (const t of Object.values(nextTables)) {
      updatedRecords = appendRoundRecordIfNew(updatedRecords, t, resolvedId);
    }

    const nextUnlocked = { ...get().unlockedTableIds };
    const serverUnlocked: string[] = Array.isArray(roomState._privateState?.unlockedTableIds)
      ? roomState._privateState.unlockedTableIds
      : [];
    for (const tid of serverUnlocked) {
      nextUnlocked[tid] = true;
    }
    for (const t of Object.values(nextTables)) {
      if (t.houseId === resolvedId) {
        nextUnlocked[t.id] = true;
      }
    }

    const onlinePlayers = buildOnlinePlayersList(
      nextTables,
      syncedUser,
      sdkPlayers,
      roomState
    );

    const curActive = get().activeTableId;
    const nextActiveId =
      curActive && (!nextTables[curActive] || nextTables[curActive].status === 'closed')
        ? null
        : curActive;

    set({
      currentUser: syncedUser,
      tables: nextTables,
      gameRecords: updatedRecords,
      onlinePlayers,
      unlockedTableIds: nextUnlocked,
      activeTableId: nextActiveId,
      roomStatus: 'connected',
      roomError: null,
    });
  };

  /**
   * Sends an authoritative player action exclusively through @randseed/game-sdk RoomClient.
   */
  const dispatchOnlineAction = async (actionData: Record<string, any>): Promise<boolean> => {
    if (!isRandseedRoomConnected()) {
      return false;
    }
    return sendRandseedRoomAction(actionData);
  };

  const connectAndSyncRoom = async (fallbackName = 'Player', fallbackAvatar?: string) => {
    const res = await matchRandseedRoom(
      (roomState, allocation, _snapshot, players) => {
        applyOnlineRoomSnapshot(roomState, allocation, players);
      },
      (players) => {
        set((state) => ({
          onlinePlayers: buildOnlinePlayersList(
            state.tables,
            state.currentUser,
            players,
            latestOnlineRoomState
          ),
        }));
      }
    );

    if (res?.allocation) {
      const latestProfile = getRandseedPlayerProfile();
      const syncName =
        latestProfile?.displayName ||
        get().currentUser?.name ||
        fallbackName;
      const syncAvatar =
        latestProfile?.avatarUrl ||
        get().currentUser?.avatar ||
        fallbackAvatar;
      if (syncName && syncName !== 'Player') {
        sendRandseedRoomAction({
          action: 'sync_profile',
          name: syncName,
          ...(syncAvatar ? { avatar: syncAvatar } : {}),
        }).catch(() => {});
      }
    }
  };

  return {
    currentUser: null,
    tables: {},
    activeTableId: null,
    gameRecords: [],
    onlinePlayers: [],
    unlockedTableIds: {},
    roomStatus: getRandseedRoomStatus(),
    roomError: getRandseedRoomError(),

    login: async (name: string, _overrideUserId?: string, avatar?: string, _isCreator?: boolean) => {
      if (loginInFlight) {
        return loginInFlight;
      }

      loginInFlight = (async () => {
        if (!roomListenersRegistered) {
          roomListenersRegistered = true;

          onRandseedRoomStatusChange((status, error) => {
            set({ roomStatus: status, roomError: error });
          });

          onRandseedProfileUpdate((profile) => {
            const cur = get().currentUser;
            const nextName = profile.displayName || cur?.name || 'Player';
            const nextAvatar = profile.avatarUrl || cur?.avatar;
            if (isRandseedRoomConnected()) {
              sendRandseedRoomAction({
                action: 'sync_profile',
                name: nextName,
                ...(nextAvatar ? { avatar: nextAvatar } : {}),
              }).catch(() => {});
            }
            if (!cur) return;
            if (nextName === cur.name && nextAvatar === cur.avatar) return;
            const updatedUser: User = {
              ...cur,
              name: nextName,
              avatar: nextAvatar,
            };
            set((state) => ({
              currentUser: updatedUser,
              onlinePlayers: buildOnlinePlayersList(
                state.tables,
                updatedUser,
                undefined,
                latestOnlineRoomState
              ),
            }));
          });
        }

        await initRandseedRuntime().catch(() => null);
        const sdkProfile = getRandseedPlayerProfile();
        const effectiveName =
          sdkProfile?.displayName ||
          (name && name !== 'Player' ? name : '') ||
          'Player';
        const effectiveAvatar =
          sdkProfile?.avatarUrl ||
          avatar ||
          undefined;

        await connectAndSyncRoom(effectiveName, effectiveAvatar);
      })().finally(() => {
        loginInFlight = null;
      });

      return loginInFlight;
    },

    reconnectRoom: async () => {
      const sdkProfile = getRandseedPlayerProfile();
      const cur = get().currentUser;
      await connectAndSyncRoom(
        sdkProfile?.displayName || cur?.name || 'Player',
        sdkProfile?.avatarUrl || cur?.avatar
      );
    },

    syncStateFromServer: async () => {
      const status = getRandseedRoomStatus();
      const error = getRandseedRoomError();
      const allocation = getRandseedRoomAllocation();
      const snapshot = getRandseedRoomSnapshot();

      if (status !== get().roomStatus || error !== get().roomError) {
        set({ roomStatus: status, roomError: error });
      }

      if (
        !isRandseedRoomConnected() ||
        !allocation?.roomId ||
        !allocation?.playerId ||
        !snapshot?.state ||
        typeof snapshot.state !== 'object' ||
        Array.isArray(snapshot.state)
      ) {
        return;
      }

      const players = getRandseedOnlinePlayers();
      applyOnlineRoomSnapshot(
        snapshot.state as Record<string, any>,
        allocation,
        players
      );
    },

    setCreatorIdentity: async (isCreator: boolean, creatorName?: string) => {
      const current = get().currentUser;
      if (!current) return;
      if (isCreator) {
        const nextName = creatorName || current.name || 'Creator';
        await dispatchOnlineAction({
          action: 'sync_profile',
          name: nextName,
          ...(current.avatar ? { avatar: current.avatar } : {}),
        });
        set((state) => ({
          currentUser: state.currentUser
            ? { ...state.currentUser, name: nextName, role: 'creator', isCreator: true }
            : null,
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

      const newTableId = `table_${Math.random().toString(36).slice(2, 11)}`;
      await dispatchOnlineAction({
        action: 'create_table',
        tableId: newTableId,
        settings: JSON.parse(JSON.stringify(settings)),
        liquidity,
        playerName: user.name,
        ...(user.avatar ? { playerAvatar: user.avatar } : {}),
      });

      // Wait briefly for the authoritative room snapshot containing the new online table
      const waitStart = Date.now();
      while (Date.now() - waitStart < 1200) {
        if (get().tables[newTableId]) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      set((state) => ({
        activeTableId: newTableId,
        unlockedTableIds: { ...state.unlockedTableIds, [newTableId]: true },
      }));
      return newTableId;
    },

    verifyTableCode: async (tableId, tableCode) => {
      const user = get().currentUser;
      const table = get().tables[tableId];
      if (!table || table.status === 'closed') return false;

      const submitted = tableCode.trim();
      const expectedHash = table.settings.tableCodeHash;
      const isOwner = Boolean(user && user.id === table.houseId);
      const matchesHash = expectedHash
        ? computeClientTableCodeHash(tableId, submitted) === expectedHash
        : true;

      if (!isOwner && !matchesHash) {
        return false;
      }

      await dispatchOnlineAction({
        action: 'verify_table_code',
        tableId,
        tableCode: submitted,
      });

      set((state) => ({
        unlockedTableIds: { ...state.unlockedTableIds, [tableId]: true },
      }));
      return true;
    },

    updateTableSettings: async (tableId, settings) => {
      await dispatchOnlineAction({
        action: 'update_table_settings',
        tableId,
        settings: JSON.parse(JSON.stringify(settings)),
      });
    },

    depositLiquidity: async (tableId, amount) => {
      await dispatchOnlineAction({
        action: 'deposit_liquidity',
        tableId,
        amount,
      });
    },

    pauseTable: async (tableId) => {
      await dispatchOnlineAction({
        action: 'pause_table',
        tableId,
      });
    },

    resumeTable: async (tableId) => {
      await dispatchOnlineAction({
        action: 'resume_table',
        tableId,
      });
    },

    withdrawLiquidity: async (tableId, amount) => {
      if (amount <= 0) return;
      await dispatchOnlineAction({
        action: 'withdraw_liquidity',
        tableId,
        amount,
      });
    },

    joinTable: async (tableId, seatIndex, _currency = 'Gcoin') => {
      const user = get().currentUser;
      if (!user) return;

      const currentActiveId = get().activeTableId;
      await dispatchOnlineAction({
        action: 'join_seat',
        tableId,
        seatIndex,
        playerName: user.name,
        ...(user.avatar ? { playerAvatar: user.avatar } : {}),
      });

      if (currentActiveId !== tableId) {
        get().recordVisit(tableId).catch(() => {});
      }
      set({ activeTableId: tableId });
    },

    observeTable: (tableId) => {
      const user = get().currentUser;
      if (!user) return;
      const currentActiveId = get().activeTableId;
      if (currentActiveId !== tableId) {
        get().recordVisit(tableId).catch(() => {});
      }
      set({ activeTableId: tableId });
    },

    recordVisit: async (tableId) => {
      await dispatchOnlineAction({
        action: 'record_visit',
        tableId,
      });
    },

    leaveTable: async (tableId, seatIndex) => {
      const user = get().currentUser;
      if (!user) return;

      if (seatIndex !== undefined) {
        await dispatchOnlineAction({
          action: 'leave_seat',
          tableId,
          seatIndex,
        });
      } else {
        await dispatchOnlineAction({
          action: 'leave_seat',
          tableId,
        });
        set({ activeTableId: null });
      }
    },

    unlockTableBalance: async (tableId) => {
      await dispatchOnlineAction({
        action: 'unlock_table_balance',
        tableId,
      });
    },

    refillGameCoins: async (tableId) => {
      const targetTableId = tableId || get().activeTableId || Object.keys(get().tables)[0];
      await dispatchOnlineAction({
        action: 'claim_refill',
        ...(targetTableId ? { tableId: targetTableId } : {}),
      });
    },

    placeBet: async (tableId, seatIndex, amount, sideBets) => {
      await dispatchOnlineAction({
        action: 'place_bet',
        tableId,
        seatIndex,
        amount,
        sideBets: {
          pair: sideBets?.pair || 0,
          twentyOnePlusThree: sideBets?.twentyOnePlusThree || 0,
        },
        pairBet: sideBets?.pair || 0,
        plus3Bet: sideBets?.twentyOnePlusThree || 0,
      });
    },

    startGame: async (tableId) => {
      await dispatchOnlineAction({
        action: 'start_game',
        tableId,
      });
    },

    hit: async (tableId, seatIndex) => {
      await dispatchOnlineAction({
        action: 'hit',
        tableId,
        seatIndex,
      });
    },

    stand: async (tableId, seatIndex) => {
      await dispatchOnlineAction({
        action: 'stand',
        tableId,
        seatIndex,
      });
    },

    doubleDown: async (tableId, seatIndex) => {
      await dispatchOnlineAction({
        action: 'double_down',
        tableId,
        seatIndex,
      });
    },

    split: async (tableId, seatIndex) => {
      await dispatchOnlineAction({
        action: 'split',
        tableId,
        seatIndex,
      });
    },

    buyInsurance: async (tableId, seatIndex) => {
      await dispatchOnlineAction({
        action: 'buy_insurance',
        tableId,
        seatIndex,
      });
    },

    dealerPlay: async (tableId) => {
      if (tableId === 'table_1') {
        readyRandseedRoom().catch(() => {});
      }
      await dispatchOnlineAction({
        action: 'ready_next',
        tableId,
      });
    },

    resolveGame: async (_tableId) => {
      // Handled authoritatively on the online room server
    },

    addGameRecord: (record) => {
      set((state) => ({ gameRecords: [record, ...state.gameRecords] }));
    },

    closeTable: async (tableId) => {
      await dispatchOnlineAction({
        action: 'close_table',
        tableId,
      });
      set((state) => ({
        activeTableId: state.activeTableId === tableId ? null : state.activeTableId,
      }));
    },
  };
});
