import {
  ChaCha20Rng,
  deriveSeedHex,
  isValidSeedHex,
  SdkProtocolError,
  PlatformClient,
  createAgentObservation,
  type ChaCha20State,
  type AgentObservation,
  type AgentGameCapabilities,
  type AgentPlayerContract,
  type AgentPlayerViewProjection,
  type AgentPlayerViewRequest,
  type GameActionResult,
  type GameResultDefinition,
  type GameResultEvent,
  type GameServer,
  type GameManifest,
  type MatchConfig,
  type TickContext,
  type InitResult,
  type TickResult,
  type PlayerEventResult,
  type GameResult,
  type CommandResult,
  type GameCommand,
} from "./serverSdk/index";
import { createVrfShoe, shuffleShoeWithVrfRng } from "./gameRules";
import {
  CardSuit,
  CardValue,
  PlayingCard,
  HandStatus,
  SideBets,
  SeatResult,
  TableSettings,
  TournamentSettings,
  TournamentRecord,
} from "../store/gameStore";
import { gameRules } from "../config/gameRules";
import {
  ROYAL_BLACKJACK_RULES_VERSION,
  projectBlackjackRoomState,
  computeTableCodeHash,
  SettlementUnitEnvelope,
  SettlementParticipantResult,
  LedgerTransferEntry,
  ParticipantOutcome,
} from "./platformContract";

export { computeTableCodeHash };
export const DEFAULT_GAME_COINS = 5000;
export const DEFAULT_ROOM_MAX_PLAYERS = 50;
export const MAX_ACTIVE_CUSTOM_TABLES_PER_ROOM = 15;
export const MAX_ACTIVE_CUSTOM_TABLES_PER_HOST = 3;
export const DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS = 5 * 60 * 1000;
export const DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC = 10;

const DETERMINISTIC_EPOCH_BASE_MS = 1_700_000_000_000;

function deterministicTimestampMs(state: RoyalBlackjackRoomState, seqOffset = 0): number {
  const matchPart = Math.max(1, Math.trunc(Number(state.matchSeq) || 1)) * 10_000_000;
  const elapsedPart = Math.max(0, Math.round((Number(state.elapsedSeconds) || 0) * 1000));
  const roundPart = Math.max(0, Math.trunc(Number(state.roundsPlayed) || 0)) * 10;
  return DETERMINISTIC_EPOCH_BASE_MS + matchPart + elapsedPart + roundPart + seqOffset;
}

export function resolveRoomMaxPlayers(): number {
  const envMax = Number(process.env.RANDSEED_MAX_PLAYERS || process.env.MAX_PLAYERS);
  if (Number.isFinite(envMax) && envMax >= 1) {
    return Math.min(100, Math.trunc(envMax));
  }
  return DEFAULT_ROOM_MAX_PLAYERS;
}

function computeRoomJoinable(state: RoyalBlackjackRoomState): boolean {
  return !state.forceClose && (state.players?.length || 0) < resolveRoomMaxPlayers();
}

export function buildRoomPlayerViews(
  state: RoyalBlackjackRoomState
): Record<string, Record<string, unknown>> {
  const projection = projectBlackjackRoomState(state);
  const views: Record<string, Record<string, unknown>> = {};
  for (const pid of state.players || []) {
    if (!pid) continue;
    views[pid] = {
      ...(projection.publicState as Record<string, unknown>),
      self: {
        playerId: pid,
        privateState:
          projection.privateStates[pid] || {
            playerId: pid,
            balance: state.balances?.[pid] || 0,
            walletCoins: state.walletCoins?.[pid] || 0,
            mySeats: [],
            unlockedTableIds: state.unlockedTablesByPlayer?.[pid] || [],
            ownedTableCodes: {},
          },
      },
    };
  }
  return views;
}

/**
 * 权威边注计算（Perfect Pair 完美对子 + 21+3 三张扑克组合）
 * 严格基于发牌初始前两张牌与庄家明牌判定，分牌后不再重复触发
 */
export function evaluateSideBets(
  c1: PlayingCard,
  c2: PlayingCard,
  dealerUp: PlayingCard,
  sideBets: SideBets
): { pairWin: number; plus3Win: number; totalSideWin: number } {
  let pairMult = 0;
  if (c1.value === c2.value) {
    if (c1.suit === c2.suit) {
      pairMult = gameRules.sideBets.perfectPair.perfect;
    } else {
      const c1Red = c1.suit === "hearts" || c1.suit === "diamonds";
      const c2Red = c2.suit === "hearts" || c2.suit === "diamonds";
      pairMult =
        c1Red === c2Red
          ? gameRules.sideBets.perfectPair.colored
          : gameRules.sideBets.perfectPair.mixed;
    }
  }

  let plus3Mult = 0;
  const cards = [c1, c2, dealerUp];
  const suits = cards.map((c) => c.suit);
  const values = cards.map((c) => c.value);
  const isFlush = suits[0] === suits[1] && suits[1] === suits[2];
  const valueMap: Record<string, number> = {
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
    "6": 6,
    "7": 7,
    "8": 8,
    "9": 9,
    "10": 10,
    J: 11,
    Q: 12,
    K: 13,
    A: 14,
  };
  const sortedVals = values.map((v) => valueMap[v]).sort((a, b) => a - b);
  const isStraight =
    (sortedVals[0] + 1 === sortedVals[1] && sortedVals[1] + 1 === sortedVals[2]) ||
    (sortedVals[0] === 2 && sortedVals[1] === 3 && sortedVals[2] === 14);
  const isThreeOfAKind = values[0] === values[1] && values[1] === values[2];

  if (isThreeOfAKind && isFlush) {
    plus3Mult = gameRules.sideBets.twentyOnePlusThree.suitedThreeOfAKind;
  } else if (isStraight && isFlush) {
    plus3Mult = gameRules.sideBets.twentyOnePlusThree.straightFlush;
  } else if (isThreeOfAKind) {
    plus3Mult = gameRules.sideBets.twentyOnePlusThree.threeOfAKind;
  } else if (isStraight) {
    plus3Mult = gameRules.sideBets.twentyOnePlusThree.straight;
  } else if (isFlush) {
    plus3Mult = gameRules.sideBets.twentyOnePlusThree.flush;
  }

  const pairWin = pairMult > 0 ? sideBets.pair * (pairMult + 1) : 0;
  const plus3Win = plus3Mult > 0 ? sideBets.twentyOnePlusThree * (plus3Mult + 1) : 0;
  return { pairWin, plus3Win, totalSideWin: pairWin + plus3Win };
}

/**
 * 玩家操作输入类型（支持所有在线牌桌与自建桌，通过 tableId 路由到对应在线实例）
 */
export type BlackjackPlayerInput =
  | {
      action: "join_seat";
      tableId?: string;
      seatIndex: number;
      playerName?: string;
      playerAvatar?: string;
      tableCode?: string;
    }
  | { action: "leave_seat"; tableId?: string; seatIndex?: number }
  | {
      action: "place_bet";
      tableId?: string;
      seatIndex: number;
      amount: number;
      sideBets?: SideBets;
      pairBet?: number;
      plus3Bet?: number;
    }
  | { action: "start_game"; tableId?: string }
  | { action: "hit"; tableId?: string; seatIndex: number }
  | { action: "stand"; tableId?: string; seatIndex: number }
  | { action: "double_down"; tableId?: string; seatIndex: number }
  | { action: "split"; tableId?: string; seatIndex: number }
  | { action: "buy_insurance"; tableId?: string; seatIndex: number }
  | { action: "claim_refill"; tableId?: string }
  | { action: "ready_next"; tableId?: string }
  | { action: "sync_profile"; name?: string; avatar?: string }
  | {
      action: "create_table";
      tableId?: string;
      settings: TableSettings;
      liquidity: number;
      playerName?: string;
      playerAvatar?: string;
    }
  | { action: "verify_table_code"; tableId: string; tableCode: string }
  | { action: "update_table_settings"; tableId: string; settings: Partial<TableSettings> }
  | { action: "deposit_liquidity"; tableId: string; amount: number }
  | { action: "withdraw_liquidity"; tableId: string; amount: number }
  | { action: "pause_table"; tableId: string }
  | { action: "resume_table"; tableId: string }
  | { action: "close_table"; tableId: string }
  | { action: "unlock_table_balance"; tableId: string }
  | { action: "record_visit"; tableId: string };

/**
 * 平台或房主可信管理指令（POST /onCommand）
 */
export type BlackjackHostCommand =
  | { action: "force_deal"; tableId?: string }
  | { action: "update_stakes"; tableId?: string; minBet: number; maxBet: number }
  | { action: "close_table"; tableId?: string };

export interface RoomHandState {
  cards: PlayingCard[];
  bet: number;
  insuranceBet: number;
  sideBets: SideBets;
  sideBetPairWon: number;
  sideBetPlus3Won: number;
  isDoubled?: boolean;
  status: HandStatus;
  score: number;
}

export interface RoomSeatState {
  seatIndex: number;
  playerId: string | null;
  isReady: boolean;
  hand: RoomHandState | null;
  isSplitHand?: boolean;
  originalSeatIndex?: number;
}

export interface RoomRoundSummary {
  roundId: string;
  timestamp: number;
  winnings: Record<string, number>;
  seatResults: SeatResult[];
  dealerScore: number;
}

/**
 * 联机子房间实例状态（包括玩家创建的 Custom Table 与自动扩容的系统桌）
 */
export interface ArchivedRoundPayload {
  roundId: string;
  tableId: string;
  tableName: string;
  tableMode: "regular" | "tournament";
  tableMinBet: number;
  timestamp: number;
  dealerScore: number;
  winnings: Record<string, number>;
  seatResults: Array<SeatResult & { isDouble?: boolean }>;
  settlementUnit?: SettlementUnitEnvelope | null;
}

export interface ArchivedTournamentPayload {
  tableId: string;
  tableName: string;
  record: TournamentRecord;
  participantIds: string[];
}

export interface OnlineSubTableState {
  id: string;
  name: string;
  description?: string;
  houseId: string;
  houseName?: string;
  houseAvatar?: string;
  createdAt: number;
  visits: number;
  liquidity: number;
  initialLiquidity: number;
  stakedFromWallet?: number;
  status: "waiting" | "playing" | "paused" | "closed" | "closing";
  tableCode?: string;
  hasTableCode?: boolean;
  isPublic: boolean;
  emptySince?: number | null;
  maxHostingTimeMs?: number;
  expiresAt?: number | null;
  rngState: ChaCha20State;
  mode: "regular" | "tournament";
  winningRule: "standard" | "dealer_wins_ties";
  order: "sequential" | "random";
  minBet: number;
  maxBet: number;
  actionTimeLimitSec: number;
  phase: "betting" | "playing" | "dealer_turn" | "settled";
  balances: Record<string, number>;
  prizePoolCoins: number;
  tournament?: TournamentSettings;
  tournamentParticipants?: string[];
  tournamentHistory: TournamentRecord[];
  seats: RoomSeatState[];
  dealerHand: {
    cards: PlayingCard[];
    score: number;
    status: HandStatus;
  } | null;
  deck: PlayingCard[];
  discardCount: number;
  turnOrder: number[];
  currentTurnSeatIndex: number;
  phaseStartElapsedSec: number;
  roundsPlayed: number;
  lastSettlementUnit: SettlementUnitEnvelope | null;
  lastRoundSummary?: RoomRoundSummary | null;
  roundHistory?: RoomRoundSummary[];
}

/**
 * 跨局结转状态 (Carryover)：
 * 常驻牌桌在局与局之间保留玩家筹码、Gcoin钱包、在座座位、所有联机自建桌与扩容桌、锦标赛进度以及当前 6 副牌靴进度
 */
export interface BlackjackCarryover {
  balances: Record<string, number>;
  walletCoins: Record<string, number>;
  roundsPlayed: number;
  prizePoolCoins: number;
  tournamentHistory: TournamentRecord[];
  deck: PlayingCard[];
  discardCount: number;
  seatedPlayers?: Array<string | null>;
  playerNames?: Record<string, string>;
  playerAvatars?: Record<string, string>;
  lastRoundSummary?: RoomRoundSummary | null;
  roundHistory?: RoomRoundSummary[];
  customTables?: Record<string, OnlineSubTableState>;
  unlockedTablesByPlayer?: Record<string, string[]>;
  visits?: number;
  totalTokensIssued?: number;
  totalTokensPaidOut?: number;
  totalRefillsCount?: number;
  settledPhase?: "betting" | "settled";
  settledDealerHand?: {
    cards: PlayingCard[];
    score: number;
    status: HandStatus;
  } | null;
  settledSeats?: RoomSeatState[];
}

/**
 * 权威房间状态机（纯 JSON 可序列化，不含任何非确定性字段）
 */
export interface RoyalBlackjackRoomState {
  matchId: string;
  matchSeq: number;
  randomSeed: string;
  randomSeedIndex?: number;
  rngState: ChaCha20State;
  mode: "regular" | "tournament";
  winningRule: "standard" | "dealer_wins_ties";
  order: "sequential" | "random";
  minBet: number;
  maxBet: number;
  actionTimeLimitSec: number;
  disconnectGraceSec?: number;
  lagGraceSec?: number;
  disconnectedAtElapsedSec?: Record<string, number>;
  phase: "betting" | "playing" | "dealer_turn" | "settled";
  players: string[];
  playerNames?: Record<string, string>;
  playerAvatars?: Record<string, string>;
  balances: Record<string, number>;
  walletCoins: Record<string, number>;
  prizePoolCoins: number;
  tournament?: TournamentSettings;
  tournamentParticipants?: string[];
  tournamentHistory: TournamentRecord[];
  seats: RoomSeatState[];
  dealerHand: {
    cards: PlayingCard[];
    score: number;
    status: HandStatus;
  } | null;
  deck: PlayingCard[];
  discardCount: number;
  /** 本局座位行动顺序（支持顺序行动与每局确定性随机行动顺序） */
  turnOrder: number[];
  currentTurnSeatIndex: number;
  phaseStartElapsedSec: number;
  elapsedSeconds: number;
  roundsPlayed: number;
  lastSettlementUnit: SettlementUnitEnvelope | null;
  lastRoundSummary?: RoomRoundSummary | null;
  roundHistory?: RoomRoundSummary[];
  matchSettledRounds?: ArchivedRoundPayload[];
  matchTournamentResults?: ArchivedTournamentPayload[];
  customTables?: Record<string, OnlineSubTableState>;
  unlockedTablesByPlayer?: Record<string, string[]>;
  visits?: number;
  totalTokensIssued?: number;
  totalTokensPaidOut?: number;
  totalRefillsCount?: number;
  forceClose: boolean;
}

const LEGACY_FALLBACK_ROOT_SEED_HEX = "0".repeat(64);

export { createVrfShoe, shuffleShoeWithVrfRng };

function resolveStateRootSeed(state: RoyalBlackjackRoomState): string {
  if (isValidSeedHex(state.randomSeed)) {
    return state.randomSeed;
  }
  return deriveSeedHex(
    LEGACY_FALLBACK_ROOT_SEED_HEX,
    "state-fallback-root",
    state.matchId || "match",
    String(state.matchSeq || 1)
  );
}

function restoreTargetRng(
  target: TableExecutionTarget,
  fallbackRootSeedHex?: string
): ChaCha20Rng {
  if (
    target.rngState &&
    isValidSeedHex(target.rngState.seedHex) &&
    Number.isSafeInteger(target.rngState.stream) &&
    target.rngState.stream >= 0 &&
    Number.isSafeInteger(target.rngState.wordPos) &&
    target.rngState.wordPos >= 0
  ) {
    return ChaCha20Rng.fromState(target.rngState);
  }
  const rootHex =
    fallbackRootSeedHex && isValidSeedHex(fallbackRootSeedHex)
      ? fallbackRootSeedHex
      : !isSubTable(target) && isValidSeedHex(target.randomSeed)
      ? target.randomSeed
      : LEGACY_FALLBACK_ROOT_SEED_HEX;
  const tableId = isSubTable(target) ? target.id : "table_1";
  return ChaCha20Rng.fromDerived(
    rootHex,
    "table_fallback_rng",
    tableId,
    String(target.roundsPlayed || 0)
  );
}

function reshuffleTargetShoeWithVrf(
  target: TableExecutionTarget,
  fallbackRootSeedHex?: string
): void {
  const rng = restoreTargetRng(target, fallbackRootSeedHex);
  target.deck = shuffleShoeWithVrfRng(rng, gameRules.deckCount);
  target.discardCount = 0;
  target.rngState = rng.getState();
}

/**
 * 权威手牌点数计算（A 软硬点自动降级：<=21 时尽量取 11，爆牌前自动降为 1）
 */
export function calculateHandScore(cards: PlayingCard[], includeHidden = false): number {
  let score = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.isHidden && !includeHidden) continue;
    if (c.value === "A") {
      aces += 1;
      score += 11;
    } else if (["J", "Q", "K"].includes(c.value)) {
      score += 10;
    } else {
      score += parseInt(c.value, 10);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces -= 1;
  }
  return score;
}

type TableExecutionTarget = RoyalBlackjackRoomState | OnlineSubTableState;

function isSubTable(target: TableExecutionTarget): target is OnlineSubTableState {
  return "id" in target && typeof (target as OnlineSubTableState).id === "string";
}

function getTargetTableId(target: TableExecutionTarget): string {
  return isSubTable(target) ? target.id : "table_1";
}

function resolveTableTarget(
  state: RoyalBlackjackRoomState,
  tableId?: string
): TableExecutionTarget | null {
  if (!tableId || tableId === "table_1" || tableId === state.matchId) {
    return state;
  }
  if (!state.customTables) {
    state.customTables = {};
  }
  return state.customTables[tableId] || null;
}

function syncPlayerRegularBalanceAcrossTables(
  state: RoyalBlackjackRoomState,
  playerId: string,
  newBalance: number
): void {
  const clamped = Math.max(0, Math.round(newBalance * 100) / 100);
  state.walletCoins[playerId] = clamped;
  if (state.mode === "regular") {
    state.balances[playerId] = clamped;
  }
  if (state.customTables) {
    for (const ct of Object.values(state.customTables)) {
      if (ct.mode === "regular") {
        ct.balances[playerId] = clamped;
      }
    }
  }
}

/**
 * 按本局 `turnOrder` 查找下一个仍处于 `playing` 状态的座位索引
 */
function findNextPlayingSeatInTurnOrder(
  target: TableExecutionTarget,
  afterSeatIndex?: number
): number {
  const order =
    target.turnOrder && target.turnOrder.length === target.seats.length
      ? target.turnOrder
      : target.seats.map((_, idx) => idx);

  let startPos = 0;
  if (typeof afterSeatIndex === "number" && afterSeatIndex >= 0) {
    const curPos = order.indexOf(afterSeatIndex);
    startPos = curPos >= 0 ? curPos + 1 : 0;
  }

  for (let p = startPos; p < order.length; p++) {
    const idx = order[p];
    const seat = target.seats[idx];
    if (seat && seat.playerId && seat.hand && seat.hand.status === "playing") {
      return idx;
    }
  }
  return -1;
}

function drawCardFromShoe(target: TableExecutionTarget, fallbackRootSeedHex?: string): PlayingCard {
  if (target.deck.length === 0) {
    reshuffleTargetShoeWithVrf(target, fallbackRootSeedHex);
  }
  target.discardCount += 1;
  return target.deck.pop()!;
}

function dealInitialCards(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget,
  broadcasts: unknown[]
): void {
  const rootSeedHex = resolveStateRootSeed(rootState);
  // 检查切牌卡渗透率（6 副牌 312 张，75% 渗透率即剩余不足 78 张时在新一局发牌前使用 VRF ChaCha20Rng 重洗）
  const totalShoeCards = gameRules.deckCount * 52;
  const minRemainingBeforeCutCard = Math.floor(totalShoeCards * (1 - gameRules.shufflePenetration));
  if (target.deck.length < minRemainingBeforeCutCard) {
    reshuffleTargetShoeWithVrf(target, rootSeedHex);
  }

  // 锦标赛模式：对未下注的在座玩家自动下最低注（禁止跳过），并执行前注 (Forced Ante)
  if (target.mode === "tournament") {
    const minBetReq = Math.max(1, target.tournament?.minBetChips || target.minBet || 50);
    for (const seat of target.seats) {
      if (seat.playerId && (!seat.hand || seat.hand.bet <= 0)) {
        const pid = seat.playerId;
        const avail = target.balances[pid] || 0;
        const autoBet = Math.min(avail, minBetReq);
        if (autoBet > 0) {
          target.balances[pid] = avail - autoBet;
          seat.isReady = true;
          seat.hand = {
            cards: [],
            bet: autoBet,
            insuranceBet: 0,
            sideBets: { pair: 0, twentyOnePlusThree: 0 },
            sideBetPairWon: 0,
            sideBetPlus3Won: 0,
            status: "playing",
            score: 0,
          };
        }
      }
    }

    if (target.tournament?.isForcedAnte) {
      const anteAmt = Math.max(
        1,
        Math.round(
          ((target.tournament.startingChips || DEFAULT_GAME_COINS) *
            (target.tournament.antePct || 1)) /
            100
        )
      );
      for (const seat of target.seats) {
        if (seat.playerId && seat.hand && seat.hand.bet > 0) {
          const pid = seat.playerId;
          const avail = target.balances[pid] || 0;
          const actualAnte = Math.min(avail, anteAmt);
          if (actualAnte > 0) {
            target.balances[pid] = avail - actualAnte;
            seat.hand.bet += actualAnte;
          }
        }
      }
    }
  }

  // 生成本局行动顺序（默认从右至左 seats.length-1 -> 0；若配置为 random 则使用 VRF ChaCha20Rng 无偏洗混座位顺序）
  const baseOrder = Array.from({ length: target.seats.length }, (_, i) => target.seats.length - 1 - i);
  if (target.order === "random") {
    const orderRng = restoreTargetRng(target, rootSeedHex);
    orderRng.shuffle(baseOrder);
    target.rngState = orderRng.getState();
  }
  target.turnOrder = baseOrder;

  // 第一轮发牌：按行动顺序给每个已下注座位发第 1 张明牌
  for (const idx of target.turnOrder) {
    const seat = target.seats[idx];
    if (seat && seat.playerId && seat.hand && seat.hand.bet > 0) {
      seat.hand.cards.push(drawCardFromShoe(target));
    }
  }

  // 庄家第 1 张明牌
  const dealerUpCard = drawCardFromShoe(target);

  // 第二轮发牌：按行动顺序给每个已下注座位发第 2 张明牌，立即裁决边注与天牌 Natural Blackjack
  for (const idx of target.turnOrder) {
    const seat = target.seats[idx];
    if (seat && seat.playerId && seat.hand && seat.hand.bet > 0) {
      seat.hand.cards.push(drawCardFromShoe(target));
      seat.hand.score = calculateHandScore(seat.hand.cards);

      const sideResult = evaluateSideBets(
        seat.hand.cards[0],
        seat.hand.cards[1],
        dealerUpCard,
        seat.hand.sideBets
      );
      seat.hand.sideBetPairWon = sideResult.pairWin;
      seat.hand.sideBetPlus3Won = sideResult.plus3Win;

      if (seat.hand.score === 21) {
        seat.hand.status = "blackjack";
      }
    }
  }

  // 庄家第 2 张暗牌
  const dealerHoleCard: PlayingCard = { ...drawCardFromShoe(target), isHidden: true };
  target.dealerHand = {
    cards: [dealerUpCard, dealerHoleCard],
    score: calculateHandScore([dealerUpCard, dealerHoleCard], false),
    status: "playing",
  };

  if (isSubTable(target) && target.status !== "closing") {
    target.status = "playing";
  }

  const firstSeat = findNextPlayingSeatInTurnOrder(target);
  if (firstSeat === -1) {
    runDealerAndSettle(rootState, target, broadcasts);
  } else {
    target.phase = "playing";
    target.currentTurnSeatIndex = firstSeat;
    target.phaseStartElapsedSec = rootState.elapsedSeconds;
  }

  broadcasts.push({
    type: "round:dealt",
    tableId: getTargetTableId(target),
    dealerUpCard,
    turnOrder: target.turnOrder,
    currentTurnSeatIndex: target.currentTurnSeatIndex,
  });
}

interface PerPlayerRoundStat {
  handsPlayed: number;
  handsWon: number;
  handsLost: number;
  handsPushed: number;
  blackjackCount: number;
  doubleCount: number;
  splitCount: number;
  sideBetHands: number;
  sideBetWins: number;
  sideBetNet: number;
  sideBetGrossWin: number;
  pairWins: number;
  plus3Wins: number;
  bestSingleWin: number;
  netCoinsDelta: number;
  grossWager: number;
  grossPayout: number;
}

function buildSettlementUnit(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget,
  perPlayerStats: Map<string, PerPlayerRoundStat>
): SettlementUnitEnvelope {
  const participants: SettlementParticipantResult[] = [];
  const ledgerEntries: LedgerTransferEntry[] = [];
  const assetCode = "GAME_COIN";
  const tableId = getTargetTableId(target);
  const settlementUnitId = `${rootState.matchId}_${tableId}_seq_${rootState.matchSeq}_r_${target.roundsPlayed}`;

  for (const [playerId, st] of perPlayerStats.entries()) {
    const outcome: ParticipantOutcome =
      st.handsWon > st.handsLost ? "win" : st.handsLost > st.handsWon ? "loss" : "push";

    participants.push({
      playerId,
      outcome,
      metrics: {
        hands_played: st.handsPlayed,
        hands_won: st.handsWon,
        hands_lost: st.handsLost,
        hands_pushed: st.handsPushed,
        blackjack_count: st.blackjackCount,
        double_count: st.doubleCount,
        split_count: st.splitCount,
        side_bet_hands: st.sideBetHands,
        side_bet_wins: st.sideBetWins,
        side_bet_net: Math.round(st.sideBetNet),
        side_bet_gross_win: Math.round(st.sideBetGrossWin),
        pair_wins: st.pairWins,
        plus3_wins: st.plus3Wins,
        best_single_win: Math.round(st.bestSingleWin),
        net_coins_delta: Math.round(st.netCoinsDelta),
        ending_balance: Math.round(
          target.mode === "tournament"
            ? target.balances[playerId] ?? 0
            : rootState.walletCoins[playerId] ?? target.balances[playerId] ?? 0
        ),
      },
    });

    if (st.grossWager > 0) {
      ledgerEntries.push({
        playerId,
        assetCode,
        direction: "DEBIT",
        amountMinor: String(Math.round(st.grossWager)),
        reason: "bet_wager",
      });
    }
    if (st.grossPayout > 0) {
      ledgerEntries.push({
        playerId,
        assetCode,
        direction: "CREDIT",
        amountMinor: String(Math.round(st.grossPayout)),
        reason: st.blackjackCount > 0 ? "blackjack_payout" : "hand_payout",
      });
    }
  }

  return {
    gameId: "royal-blackjack",
    roomId: tableId,
    matchId: `${rootState.matchId}_${rootState.matchSeq}`,
    settlementUnitId,
    unitSeq: target.roundsPlayed,
    unitType: "hand",
    rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
    timestampMs: deterministicTimestampMs(rootState),
    durationMs: Math.max(1000, Math.round((rootState.elapsedSeconds - target.phaseStartElapsedSec) * 1000)),
    participants,
    ledgerReceipt: {
      idempotencyKey: `idem_${settlementUnitId}`,
      settlementUnitId,
      entries: ledgerEntries,
    },
  };
}

function runDealerAndSettle(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget,
  broadcasts: unknown[]
): void {
  target.phase = "dealer_turn";
  if (!target.dealerHand) return;

  // 翻开庄家暗牌
  target.dealerHand.cards = target.dealerHand.cards.map((c) => ({ ...c, isHidden: false }));
  target.dealerHand.score = calculateHandScore(target.dealerHand.cards, true);

  // 仅当场上存在未爆牌（stood 或 blackjack）的玩家手牌时，庄家才按 16 必补、17 停牌规则抽牌
  const anyPlayerAlive = target.seats.some(
    (s) => s.hand && (s.hand.status === "stood" || s.hand.status === "blackjack")
  );

  while (anyPlayerAlive && target.dealerHand.score < 17) {
    const card = drawCardFromShoe(target);
    target.dealerHand.cards.push(card);
    target.dealerHand.score = calculateHandScore(target.dealerHand.cards, true);
  }

  const dScore = target.dealerHand.score;
  const dealerBlackjack = target.dealerHand.cards.length === 2 && dScore === 21;
  const dealerBusted = dScore > 21;
  target.dealerHand.status = dealerBusted ? "busted" : dealerBlackjack ? "blackjack" : "stood";

  const perPlayerStats = new Map<string, PerPlayerRoundStat>();

  const winnings: Record<string, number> = {};
  const seatResults: Array<SeatResult & { isDouble?: boolean }> = [];
  const isCustomRegularHouse =
    isSubTable(target) && target.houseId !== "system" && target.mode === "regular";

  for (const seat of target.seats) {
    if (!seat.playerId || !seat.hand) continue;
    const h = seat.hand;
    const pid = seat.playerId;

    const pStat = perPlayerStats.get(pid) || {
      handsPlayed: 0,
      handsWon: 0,
      handsLost: 0,
      handsPushed: 0,
      blackjackCount: 0,
      doubleCount: 0,
      splitCount: 0,
      sideBetHands: 0,
      sideBetWins: 0,
      sideBetNet: 0,
      sideBetGrossWin: 0,
      pairWins: 0,
      plus3Wins: 0,
      bestSingleWin: 0,
      netCoinsDelta: 0,
      grossWager: 0,
      grossPayout: 0,
    };

    const sideWager = (h.sideBets?.pair || 0) + (h.sideBets?.twentyOnePlusThree || 0);
    const totalWager = h.bet + sideWager + (h.insuranceBet || 0);
    const sideBetWin = (h.sideBetPairWon || 0) + (h.sideBetPlus3Won || 0);
    if (sideBetWin > 0) {
      target.balances[pid] = (target.balances[pid] || 0) + sideBetWin;
    }
    let totalPayout = sideBetWin;
    let insuranceWin = 0;
    let mainHandWin = 0;

    // 保险结算：庄家 2 张牌 21 点时，保险按 2:1 赔付（返还本金 + 2倍赔付 = 3倍 insuranceBet）
    if (h.insuranceBet > 0 && dealerBlackjack) {
      insuranceWin = h.insuranceBet * (gameRules.insurancePayout + 1);
      target.balances[pid] = (target.balances[pid] || 0) + insuranceWin;
      totalPayout += insuranceWin;
    }

    if (h.status === "busted") {
      h.status = "lost";
      pStat.handsLost += 1;
    } else {
      // 只有未分牌的初始两张 21 点才算 Natural Blackjack (3:2)
      const isSplit = Boolean(seat.isSplitHand || seat.originalSeatIndex !== undefined);
      const playerBlackjack = h.status === "blackjack" && h.cards.length === 2 && !isSplit;

      if (playerBlackjack && !dealerBlackjack) {
        h.status = "blackjack";
        mainHandWin = h.bet * (gameRules.blackjackPayout + 1); // 2.5x
        target.balances[pid] = (target.balances[pid] || 0) + mainHandWin;
        totalPayout += mainHandWin;
        pStat.handsWon += 1;
        pStat.blackjackCount += 1;
      } else if (dealerBlackjack && !playerBlackjack) {
        h.status = "lost";
        pStat.handsLost += 1;
      } else if (dealerBusted || h.score > dScore) {
        h.status = "won";
        mainHandWin = h.bet * 2; // 2x (1:1 payout)
        target.balances[pid] = (target.balances[pid] || 0) + mainHandWin;
        totalPayout += mainHandWin;
        pStat.handsWon += 1;
      } else if (h.score === dScore) {
        if (target.winningRule === "dealer_wins_ties" && !playerBlackjack) {
          h.status = "lost";
          pStat.handsLost += 1;
        } else {
          h.status = "push";
          mainHandWin = h.bet;
          target.balances[pid] = (target.balances[pid] || 0) + mainHandWin;
          totalPayout += mainHandWin;
          pStat.handsPushed += 1;
        }
      } else {
        h.status = "lost";
        pStat.handsLost += 1;
      }
    }

    if (isCustomRegularHouse && totalPayout > 0) {
      target.liquidity = Math.max(0, target.liquidity - totalPayout);
    }

    if (target.mode === "regular") {
      syncPlayerRegularBalanceAcrossTables(rootState, pid, target.balances[pid]);
      if (totalPayout > totalWager) {
        rootState.totalTokensPaidOut =
          (rootState.totalTokensPaidOut || 0) + (totalPayout - totalWager);
      }
    }

    const netDelta = totalPayout - totalWager;
    const isSplitHand = Boolean(seat.isSplitHand || seat.originalSeatIndex !== undefined);
    const isDoubleHand = Boolean(h.isDoubled);
    winnings[pid] = (winnings[pid] || 0) + totalPayout;
    seatResults.push({
      seatIndex: seat.originalSeatIndex ?? seat.seatIndex,
      userId: pid,
      playerName: rootState.playerNames?.[pid] || pid,
      playerAvatar: rootState.playerAvatars?.[pid],
      bet: h.bet,
      sideBet: sideWager,
      sideBetWin,
      pairBet: h.sideBets?.pair || 0,
      pairWin: h.sideBetPairWon || 0,
      plus3Bet: h.sideBets?.twentyOnePlusThree || 0,
      plus3Win: h.sideBetPlus3Won || 0,
      insuranceBet: h.insuranceBet || 0,
      insuranceWin,
      isSplit: isSplitHand,
      isDouble: isDoubleHand,
      win: totalPayout,
      net: netDelta,
      action: h.status,
      score: h.score,
    });

    pStat.handsPlayed += 1;
    if (isDoubleHand) pStat.doubleCount += 1;
    if (isSplitHand) pStat.splitCount += 1;
    if (sideWager > 0 || sideBetWin > 0) {
      pStat.sideBetHands += 1;
      if (sideBetWin > 0) pStat.sideBetWins += 1;
      pStat.sideBetGrossWin += sideBetWin;
      pStat.sideBetNet += sideBetWin - sideWager;
    }
    if ((h.sideBetPairWon || 0) > 0) pStat.pairWins += 1;
    if ((h.sideBetPlus3Won || 0) > 0) pStat.plus3Wins += 1;
    if (netDelta > pStat.bestSingleWin) pStat.bestSingleWin = netDelta;
    pStat.grossWager += totalWager;
    pStat.grossPayout += totalPayout;
    pStat.netCoinsDelta += netDelta;
    perPlayerStats.set(pid, pStat);
  }

  // 清理分牌临时座位并恢复主座位状态
  target.seats = target.seats
    .filter((s) => !s.isSplitHand)
    .map((s, idx) => {
      const nextSeat: RoomSeatState = {
        ...s,
        seatIndex: idx,
        isReady: false,
      };
      delete nextSeat.originalSeatIndex;
      delete nextSeat.isSplitHand;
      return nextSeat;
    });
  target.turnOrder = target.seats.map((_, i) => target.seats.length - 1 - i);

  target.roundsPlayed += 1;

  // 常规模式自动破产保护：局末若筹码输光（<= 0）自动补发 5,000 游戏币
  if (target.mode === "regular") {
    for (const pid of rootState.players) {
      if ((rootState.walletCoins[pid] ?? target.balances[pid] ?? 0) <= 0) {
        syncPlayerRegularBalanceAcrossTables(rootState, pid, DEFAULT_GAME_COINS);
        rootState.totalTokensIssued = (rootState.totalTokensIssued || 0) + DEFAULT_GAME_COINS;
        rootState.totalRefillsCount = (rootState.totalRefillsCount || 0) + 1;
        broadcasts.push({
          type: "player:coins_refilled",
          playerId: pid,
          amount: DEFAULT_GAME_COINS,
        });
      }
    }
  }

  // 锦标赛模式：盲注递增、零筹码淘汰与获胜规则裁决
  if (target.mode === "tournament" && target.tournament) {
    const t = target.tournament;

    if (
      t.isScheduledEscalation &&
      target.roundsPlayed % Math.max(1, t.escalationRounds || 5) === 0
    ) {
      target.minBet *= 2;
      t.minBetChips = (t.minBetChips || 50) * 2;
    }

    for (const seat of target.seats) {
      if (seat.playerId && (target.balances[seat.playerId] || 0) <= 0) {
        seat.playerId = null;
        seat.hand = null;
        seat.isReady = false;
      }
    }

    const activeSurvivors = Array.from(
      new Set(
        target.seats
          .filter((s) => s.playerId !== null && (target.balances[s.playerId!] || 0) > 0)
          .map((s) => s.playerId as string)
      )
    );

    const targetSurvivors = Math.max(1, t.targetSurvivors || 1);
    const hitSurvivorCap = Boolean(t.isSurvivorCap && activeSurvivors.length <= targetSurvivors);
    const hitRoundCap = Boolean(t.isHardCapRounds && target.roundsPlayed >= (t.maxRounds || 20));

    if (hitSurvivorCap || hitRoundCap || activeSurvivors.length === 0) {
      const grossPool = target.prizePoolCoins;
      const hostFeePct = Math.max(0, t.hostFeePct ?? 3);
      const platformFeePct = Math.max(0, t.platformFeePct ?? 2);
      const feePct = hostFeePct + platformFeePct;
      const netPrizePool = Math.max(0, Math.round(grossPool * (1 - feePct / 100)));
      const hostReward = Math.max(0, Math.round((grossPool * hostFeePct) / 100));

      if (isSubTable(target) && target.houseId !== "system" && hostReward > 0) {
        const nextHostCoins = (rootState.walletCoins[target.houseId] || 0) + hostReward;
        syncPlayerRegularBalanceAcrossTables(rootState, target.houseId, nextHostCoins);
      }

      const ranked = [...activeSurvivors].sort(
        (a, b) => (target.balances[b] || 0) - (target.balances[a] || 0)
      );
      const winners: { userId: string; name: string; chips: number; prizeCoins: number }[] = [];

      if (ranked.length > 0 && netPrizePool > 0) {
        if (t.prizeDistribution === "splitByChips" || !t.isSurvivorCap) {
          const totalChips = ranked.reduce(
            (sum, id) => sum + Math.max(1, target.balances[id] || 1),
            0
          );
          for (const uid of ranked) {
            const prizeCoins = Math.round(
              (netPrizePool * Math.max(1, target.balances[uid] || 1)) / totalChips
            );
            const nextWinnerCoins = (rootState.walletCoins[uid] || 0) + prizeCoins;
            syncPlayerRegularBalanceAcrossTables(rootState, uid, nextWinnerCoins);
            winners.push({
              userId: uid,
              name: rootState.playerNames?.[uid] || uid,
              chips: target.balances[uid] || 0,
              prizeCoins,
            });
          }
        } else {
          const topWinners = ranked.slice(0, Math.min(ranked.length, targetSurvivors));
          const paytableMap: Record<number, number[]> = {
            1: [1.0],
            2: [0.7, 0.3],
            3: [0.5, 0.3, 0.2],
            4: [0.4, 0.3, 0.2, 0.1],
            5: [0.35, 0.25, 0.2, 0.15, 0.05],
          };
          const weights = paytableMap[topWinners.length] || paytableMap[5];
          const weightSum = weights.slice(0, topWinners.length).reduce((a, b) => a + b, 0) || 1;
          topWinners.forEach((uid, idx) => {
            const prizeCoins = Math.round((netPrizePool * (weights[idx] || 0)) / weightSum);
            const nextWinnerCoins = (rootState.walletCoins[uid] || 0) + prizeCoins;
            syncPlayerRegularBalanceAcrossTables(rootState, uid, nextWinnerCoins);
            winners.push({
              userId: uid,
              name: rootState.playerNames?.[uid] || uid,
              chips: target.balances[uid] || 0,
              prizeCoins,
            });
          });
        }
      }

      const tournamentRecord: TournamentRecord = {
        id: `T-${String(target.tournamentHistory.length + 1).padStart(4, "0")}`,
        timestamp: deterministicTimestampMs(rootState, 1),
        rounds: target.roundsPlayed,
        seatsFilled: Math.max(winners.length, activeSurvivors.length),
        maxSeats: target.seats.length,
        ticketPrice: t.ticketPrice || 100,
        prizePool: netPrizePool,
        reason: hitSurvivorCap
          ? "Survivor Cap Reached"
          : hitRoundCap
          ? "Round Cap Reached"
          : "Knockout Finish",
        winners,
      };
      target.tournamentHistory.unshift(tournamentRecord);

      const participantSet = new Set<string>([
        ...(target.tournamentParticipants || []),
        ...Object.keys(target.balances || {}),
        ...winners.map((w) => w.userId),
      ]);
      if (!Array.isArray(rootState.matchTournamentResults)) {
        rootState.matchTournamentResults = [];
      }
      rootState.matchTournamentResults.push({
        tableId: getTargetTableId(target),
        tableName: isSubTable(target) ? target.name : "Table #1",
        record: tournamentRecord,
        participantIds: Array.from(participantSet),
      });

      target.tournamentParticipants = [];
      target.prizePoolCoins = 0;
      target.roundsPlayed = 0;
      target.balances = {};
      target.seats = target.seats.map((s) => ({
        ...s,
        playerId: null,
        hand: null,
        isReady: false,
      }));
    }
  }

  target.phase = "settled";
  target.currentTurnSeatIndex = -1;
  target.phaseStartElapsedSec = rootState.elapsedSeconds;
  target.lastSettlementUnit = buildSettlementUnit(rootState, target, perPlayerStats);
  const nowTimestamp = deterministicTimestampMs(rootState);
  const summaryObj: RoomRoundSummary = {
    roundId: target.lastSettlementUnit.settlementUnitId,
    timestamp: nowTimestamp,
    winnings,
    seatResults,
    dealerScore: dScore,
  };
  target.lastRoundSummary = summaryObj;
  target.roundHistory = [summaryObj, ...(target.roundHistory || [])].slice(0, 20);

  if (!Array.isArray(rootState.matchSettledRounds)) {
    rootState.matchSettledRounds = [];
  }
  const compactSeatResults = seatResults.map(({ playerAvatar: _avatar, ...rest }) => rest);
  rootState.matchSettledRounds = [
    ...rootState.matchSettledRounds,
    {
      roundId: summaryObj.roundId,
      tableId: getTargetTableId(target),
      tableName: isSubTable(target) ? target.name : "Table #1",
      tableMode: target.mode,
      tableMinBet: target.minBet,
      timestamp: nowTimestamp,
      dealerScore: dScore,
      winnings,
      seatResults: compactSeatResults,
      settlementUnit: target.lastSettlementUnit,
    },
  ].slice(-30);

  if (isSubTable(target)) {
    if (target.status === "closing") {
      if (target.houseId !== "system" && target.liquidity > 0) {
        const unbackedBase = Math.max(0, target.initialLiquidity - (target.stakedFromWallet || 0));
        const redeemable = Math.max(0, target.liquidity - unbackedBase);
        target.liquidity = 0;
        target.stakedFromWallet = 0;
        if (redeemable > 0) {
          syncPlayerRegularBalanceAcrossTables(
            rootState,
            target.houseId,
            (rootState.walletCoins[target.houseId] || 0) + redeemable
          );
        }
      }
      target.seats = target.seats.map((s) => ({
        ...s,
        playerId: null,
        hand: null,
        isReady: false,
      }));
      target.status = "closed";
    } else if (target.houseId !== "system" && target.mode === "regular" && target.liquidity <= 0) {
      target.status = "paused";
    } else {
      target.status = "waiting";
    }
  }

  broadcasts.push({
    type: "round:settled",
    tableId: getTargetTableId(target),
    dealerScore: dScore,
    balances: target.balances,
    walletCoins: rootState.walletCoins,
    settlementUnit: target.lastSettlementUnit,
    lastRoundSummary: target.lastRoundSummary,
  });
}

function sanitizeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function sanitizeAvatarForState(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 4096 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function prepareNextBettingPhaseIfSettled(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget
): void {
  if (target.phase !== "settled") return;
  target.phase = "betting";
  target.dealerHand = null;
  target.currentTurnSeatIndex = -1;
  target.phaseStartElapsedSec = rootState.elapsedSeconds;
  for (const seat of target.seats) {
    seat.isReady = false;
    seat.hand = null;
    delete seat.isSplitHand;
    delete seat.originalSeatIndex;
  }
}

export const ROYAL_BLACKJACK_RESULT_DEFINITION: GameResultDefinition = {
  version: "1.1.0",
  unitTypes: ["hand"],
  metrics: [
    { id: "hands_played", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "hands_won", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "hands_lost", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "hands_pushed", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "blackjack_count", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "double_count", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "split_count", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "side_bet_hands", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "side_bet_wins", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "side_bet_net", scope: "participant", unit: "coins", unitTypes: ["hand"], aggregation: "sum" },
    { id: "side_bet_gross_win", scope: "participant", unit: "coins", unitTypes: ["hand"], aggregation: "sum" },
    { id: "pair_wins", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "plus3_wins", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "best_single_win", scope: "participant", unit: "coins", unitTypes: ["hand"], aggregation: "max" },
    { id: "net_coins_delta", scope: "participant", unit: "coins", unitTypes: ["hand"], aggregation: "sum" },
    { id: "ending_balance", scope: "participant", unit: "coins", unitTypes: ["hand"], aggregation: "max" },
  ],
};

function buildResultUnitEventsFromSettlement(target: TableExecutionTarget, matchId: string): GameResultEvent[] {
  const unit = target.lastSettlementUnit;
  if (!unit || !Array.isArray(unit.participants) || unit.participants.length === 0) {
    return [];
  }
  return [
    {
      schemaVersion: 1,
      eventId: `evt_${unit.settlementUnitId}`,
      matchId,
      unitId: unit.settlementUnitId,
      unitType: "hand",
      rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
      definitionVersion: ROYAL_BLACKJACK_RESULT_DEFINITION.version,
      occurredAt: Math.max(0, unit.timestampMs || 0),
      participants: unit.participants.map((p) => ({
        playerId: p.playerId,
        outcome: p.outcome === "win" || p.outcome === "loss" || p.outcome === "push" ? p.outcome : "push",
        metrics: {
          hands_played: Number(p.metrics.hands_played) || 0,
          hands_won: Number(p.metrics.hands_won) || 0,
          hands_lost: Number(p.metrics.hands_lost) || 0,
          hands_pushed: Number(p.metrics.hands_pushed) || 0,
          blackjack_count: Number(p.metrics.blackjack_count) || 0,
          double_count: Number(p.metrics.double_count) || 0,
          split_count: Number(p.metrics.split_count) || 0,
          side_bet_hands: Number(p.metrics.side_bet_hands) || 0,
          side_bet_wins: Number(p.metrics.side_bet_wins) || 0,
          side_bet_net: Number(p.metrics.side_bet_net) || 0,
          side_bet_gross_win: Number(p.metrics.side_bet_gross_win) || 0,
          pair_wins: Number(p.metrics.pair_wins) || 0,
          plus3_wins: Number(p.metrics.plus3_wins) || 0,
          best_single_win: Number(p.metrics.best_single_win) || 0,
          net_coins_delta: Number(p.metrics.net_coins_delta) || 0,
          ending_balance: Number(p.metrics.ending_balance) || 0,
        },
      })),
    },
  ];
}

function advanceTurnOrSettle(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget,
  broadcasts: unknown[]
): void {
  const nextSeat = findNextPlayingSeatInTurnOrder(target, target.currentTurnSeatIndex);
  if (nextSeat === -1) {
    runDealerAndSettle(rootState, target, broadcasts);
  } else {
    target.currentTurnSeatIndex = nextSeat;
    target.phaseStartElapsedSec = rootState.elapsedSeconds;
  }
}

/**
 * 联机房间生命周期调谐：
 * 1. 当所有系统桌满座时自动扩容新系统桌（table_2, table_3...），并在多余系统桌空闲时回收
 * 2. 自建桌在无人落座达到 maxHostingTimeMs 后自动关闭并退还流动性或未开赛门票
 */
function reconcileOnlineRoomTables(state: RoyalBlackjackRoomState): void {
  if (!state.customTables) {
    state.customTables = {};
  }
  const nowMs = Math.max(1000, Math.round(state.elapsedSeconds * 1000));

  for (const ct of Object.values(state.customTables)) {
    if (ct.houseId === "system" || ct.status === "closed") continue;
    const hasSeatedPlayer = ct.seats.some((s) => s.playerId !== null);
    const maxHostingMs = ct.maxHostingTimeMs || DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS;
    ct.maxHostingTimeMs = maxHostingMs;

    if (hasSeatedPlayer || ct.phase === "playing" || ct.phase === "dealer_turn") {
      ct.emptySince = null;
      ct.expiresAt = null;
    } else {
      if (ct.emptySince === null || ct.emptySince === undefined) {
        ct.emptySince = nowMs;
      }
      ct.expiresAt = ct.emptySince + maxHostingMs;
      if (nowMs >= ct.expiresAt && ct.emptySince > 0 && nowMs > ct.emptySince) {
        if (ct.mode === "tournament" && ct.roundsPlayed === 0 && ct.prizePoolCoins > 0) {
          for (const [uid] of Object.entries(ct.balances)) {
            const refund = ct.tournament?.ticketPrice || 0;
            if (refund > 0) {
              syncPlayerRegularBalanceAcrossTables(
                state,
                uid,
                (state.walletCoins[uid] || 0) + refund
              );
            }
          }
          ct.balances = {};
          ct.prizePoolCoins = 0;
        }
        if (ct.liquidity > 0 && ct.houseId !== "system") {
          const unbackedBase = Math.max(0, ct.initialLiquidity - (ct.stakedFromWallet || 0));
          const redeemable = Math.max(0, ct.liquidity - unbackedBase);
          ct.liquidity = 0;
          ct.stakedFromWallet = 0;
          if (redeemable > 0) {
            syncPlayerRegularBalanceAcrossTables(
              state,
              ct.houseId,
              (state.walletCoins[ct.houseId] || 0) + redeemable
            );
          }
        }
        ct.seats = ct.seats.map((s) => ({ ...s, playerId: null, hand: null, isReady: false }));
        ct.deck = [];
        ct.roundHistory = [];
        ct.status = "closed";
      }
    }
  }

  // 系统桌自动扩容与回收
  const extraSysTables = Object.values(state.customTables)
    .filter((ct) => ct.houseId === "system" && ct.status !== "closed")
    .sort((a, b) => a.createdAt - b.createdAt);

  const primaryHasOpenSeat = state.seats.some((s) => !s.playerId);
  const extraHasOpenSeat = extraSysTables.some((ct) => ct.seats.some((s) => !s.playerId));

  if (!primaryHasOpenSeat && !extraHasOpenSeat) {
    let nextNum = 2;
    while (state.customTables[`table_${nextNum}`]) {
      nextNum++;
    }
    const newId = `table_${nextNum}`;
    const subRng = ChaCha20Rng.fromDerived(
      resolveStateRootSeed(state),
      "overflow_system_table",
      newId,
      String(state.roundsPlayed || 0),
      String(nowMs)
    );
    const shoeDeck = shuffleShoeWithVrfRng(subRng, gameRules.deckCount);
    state.customTables[newId] = {
      id: newId,
      name: `Table #${nextNum}`,
      description: "",
      houseId: "system",
      createdAt: nowMs,
      visits: 0,
      liquidity: 100000,
      initialLiquidity: 100000,
      status: "waiting",
      isPublic: true,
      rngState: subRng.getState(),
      mode: "regular",
      winningRule: "standard",
      order: "sequential",
      minBet: 10,
      maxBet: 500,
      actionTimeLimitSec: state.actionTimeLimitSec || 20,
      phase: "betting",
      balances: { ...state.walletCoins },
      prizePoolCoins: 0,
      tournamentHistory: [],
      seats: Array.from({ length: 7 }, (_, idx) => ({
        seatIndex: idx,
        playerId: null,
        isReady: false,
        hand: null,
      })),
      dealerHand: null,
      deck: shoeDeck,
      discardCount: 0,
      turnOrder: Array.from({ length: 7 }, (_, i) => 6 - i),
      currentTurnSeatIndex: -1,
      phaseStartElapsedSec: state.elapsedSeconds,
      roundsPlayed: 0,
      lastSettlementUnit: null,
      lastRoundSummary: null,
      roundHistory: [],
    };
  } else if (extraSysTables.length > 0) {
    const emptyExtraSys = extraSysTables.filter(
      (ct) =>
        (ct.phase === "betting" || ct.phase === "settled") &&
        ct.seats.every((s) => !s.playerId)
    );
    const nonEmptyCount =
      (primaryHasOpenSeat ? 1 : 0) + (extraSysTables.length - emptyExtraSys.length);
    const removable = nonEmptyCount >= 1 ? emptyExtraSys : emptyExtraSys.slice(1);
    for (const rem of removable) {
      delete state.customTables[rem.id];
    }
  }
}

/**
 * 服务端反向平台客户端 (RandSeed Server SDK PlatformClient)
 * 用于在 Room Durable Object 容器环境中向 http://platform.players、http://platform.db、http://platform.kv 发起反向调用
 */
export const randseedPlatformClient = new PlatformClient();

export interface AgentLegalActionDescriptor {
  action:
    | "join_seat"
    | "place_bet"
    | "start_game"
    | "hit"
    | "stand"
    | "double_down"
    | "split"
    | "buy_insurance"
    | "claim_refill";
  tableId: string;
  seatIndex?: number;
  minAmount?: number;
  maxAmount?: number;
}

function utf8ByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function compactCommittedEventsForAgent(events: unknown[]): Array<Record<string, unknown>> {
  if (!Array.isArray(events) || events.length === 0) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const raw of events.slice(-3)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const ev = raw as Record<string, unknown>;
    const summary: Record<string, unknown> = {
      type: typeof ev.type === "string" ? ev.type : "event",
    };
    if (typeof ev.tableId === "string") summary.tableId = ev.tableId;
    if (typeof ev.playerId === "string") summary.playerId = ev.playerId;
    if (typeof ev.dealerScore === "number" && Number.isFinite(ev.dealerScore)) {
      summary.dealerScore = ev.dealerScore;
    }
    if (typeof ev.currentTurnSeatIndex === "number" && Number.isFinite(ev.currentTurnSeatIndex)) {
      summary.currentTurnSeatIndex = ev.currentTurnSeatIndex;
    }
    out.push(summary);
  }
  return out;
}

function computeAgentLegalActionsAndFocus(
  state: RoyalBlackjackRoomState,
  playerId: string
): {
  focusTableId: string;
  legalActions: AgentLegalActionDescriptor[];
  deadlineAt: number | null;
} {
  const lagGraceSec =
    typeof state.lagGraceSec === "number"
      ? state.lagGraceSec
      : DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC;
  const walletBal = state.walletCoins?.[playerId] ?? state.balances?.[playerId] ?? DEFAULT_GAME_COINS;
  const unlockedSet = new Set<string>(state.unlockedTablesByPlayer?.[playerId] || []);

  const allOpenTargets: Array<{ tid: string; target: TableExecutionTarget }> = [
    { tid: "table_1", target: state },
  ];
  for (const [tid, ct] of Object.entries(state.customTables || {})) {
    if (!ct || ct.status === "closed" || ct.status === "paused") continue;
    allOpenTargets.push({ tid, target: ct });
  }

  let focusTableId = "table_1";
  let foundSeatedTable = false;
  let foundTurnTable = false;
  let earliestDeadlineMs: number | null = null;
  const legalActions: AgentLegalActionDescriptor[] = [];

  for (const { tid, target } of allOpenTargets) {
    const seats = Array.isArray(target.seats) ? target.seats : [];
    const mySeats = seats.filter((s) => s && s.playerId === playerId);
    if (mySeats.length > 0 && !foundSeatedTable && !foundTurnTable) {
      focusTableId = tid;
      foundSeatedTable = true;
    }

    if (target.phase === "playing" && target.currentTurnSeatIndex >= 0) {
      const turnSeat = seats[target.currentTurnSeatIndex];
      if (turnSeat && turnSeat.playerId === playerId && turnSeat.hand) {
        if (!foundTurnTable) {
          focusTableId = tid;
          foundTurnTable = true;
        }
        const turnDeadlineMs = Math.max(
          0,
          Math.round(
            ((target.phaseStartElapsedSec || 0) +
              (target.actionTimeLimitSec || 20) +
              lagGraceSec) *
              1000
          )
        );
        if (earliestDeadlineMs === null || turnDeadlineMs < earliestDeadlineMs) {
          earliestDeadlineMs = turnDeadlineMs;
        }

        const curBal =
          target.mode === "regular"
            ? state.walletCoins?.[playerId] ?? target.balances?.[playerId] ?? 0
            : target.balances?.[playerId] ?? 0;

        legalActions.push(
          { action: "hit", tableId: tid, seatIndex: turnSeat.seatIndex },
          { action: "stand", tableId: tid, seatIndex: turnSeat.seatIndex }
        );

        if (turnSeat.hand.cards.length === 2 && curBal >= turnSeat.hand.bet) {
          legalActions.push({
            action: "double_down",
            tableId: tid,
            seatIndex: turnSeat.seatIndex,
          });
        }

        const origIdx = turnSeat.originalSeatIndex ?? turnSeat.seatIndex;
        const currentSplitCount = seats.filter(
          (s) => (s.originalSeatIndex ?? s.seatIndex) === origIdx
        ).length;
        if (
          turnSeat.hand.cards.length === 2 &&
          turnSeat.hand.cards[0]?.value === turnSeat.hand.cards[1]?.value &&
          currentSplitCount < 4 &&
          curBal >= turnSeat.hand.bet
        ) {
          legalActions.push({
            action: "split",
            tableId: tid,
            seatIndex: turnSeat.seatIndex,
          });
        }

        if (
          target.dealerHand?.cards?.[0]?.value === "A" &&
          turnSeat.hand.cards.length === 2 &&
          !turnSeat.isSplitHand &&
          turnSeat.hand.insuranceBet === 0 &&
          curBal >= turnSeat.hand.bet / 2
        ) {
          legalActions.push({
            action: "buy_insurance",
            tableId: tid,
            seatIndex: turnSeat.seatIndex,
          });
        }
      }
    } else if ((target.phase === "betting" || target.phase === "settled") && mySeats.length > 0) {
      const availBal =
        target.mode === "regular"
          ? state.walletCoins?.[playerId] ?? target.balances?.[playerId] ?? 0
          : target.balances?.[playerId] ?? 0;

      for (const ms of mySeats) {
        if (!ms.isReady || target.phase === "settled") {
          if (availBal >= target.minBet) {
            legalActions.push({
              action: "place_bet",
              tableId: tid,
              seatIndex: ms.seatIndex,
              minAmount: target.minBet,
              maxAmount: Math.min(target.maxBet, Math.floor(availBal)),
            });
          } else if (target.mode === "regular") {
            legalActions.push({
              action: "claim_refill",
              tableId: tid,
            });
          }
        }
      }

      const readyCount =
        target.phase === "betting" ? seats.filter((s) => s.playerId && s.isReady).length : 0;
      const minSeatsToStart =
        target.mode === "tournament" ? Math.max(2, target.tournament?.minSeats || 2) : 1;
      if (readyCount >= minSeatsToStart) {
        legalActions.push({
          action: "start_game",
          tableId: tid,
        });
      }
    }
  }

  // If the Agent is not yet seated at any table, expose joinable seats across open tables
  if (!foundSeatedTable && !foundTurnTable) {
    if (walletBal < (state.minBet || 10)) {
      legalActions.push({ action: "claim_refill", tableId: "table_1" });
    }
    let joinSuggestions = 0;
    for (const { tid, target } of allOpenTargets) {
      if (joinSuggestions >= 4) break;
      if (target.phase !== "betting" && target.phase !== "settled") continue;
      if (isSubTable(target) && target.tableCode && target.houseId !== playerId) {
        if (!unlockedSet.has(tid)) continue;
      }
      const entryReq =
        target.mode === "tournament"
          ? Math.max(0, target.tournament?.ticketPrice || 100)
          : target.minBet || 10;
      if (walletBal < entryReq) continue;
      const firstOpenSeat = (target.seats || []).find((s) => !s.playerId);
      if (firstOpenSeat) {
        if (joinSuggestions === 0) {
          focusTableId = tid;
        }
        legalActions.push({
          action: "join_seat",
          tableId: tid,
          seatIndex: firstOpenSeat.seatIndex,
        });
        joinSuggestions++;
      }
    }
  }

  return {
    focusTableId,
    legalActions,
    deadlineAt: earliestDeadlineMs,
  };
}

type InputApplyOutcome =
  | { status: "applied" }
  | { status: "rejected"; code: string };

function countActiveCustomTables(
  state: RoyalBlackjackRoomState,
  hostPlayerId?: string
): number {
  let count = 0;
  for (const ct of Object.values(state.customTables || {})) {
    if (!ct || ct.houseId === "system" || ct.status === "closed") continue;
    if (hostPlayerId && ct.houseId !== hostPlayerId) continue;
    count++;
  }
  return count;
}

function applyAuthoritativePlayerInput(
  state: RoyalBlackjackRoomState,
  ctx: TickContext<BlackjackPlayerInput, BlackjackHostCommand>,
  playerId: string,
  data: BlackjackPlayerInput,
  broadcasts: unknown[]
): InputApplyOutcome {
  if (!data || typeof data !== "object" || typeof data.action !== "string") {
    return { status: "rejected", code: "INVALID_INPUT" };
  }

  if (state.disconnectedAtElapsedSec![playerId] !== undefined) {
    delete state.disconnectedAtElapsedSec![playerId];
  }
  if (!state.players.includes(playerId)) {
    state.players.push(playerId);
  }
  if (typeof state.walletCoins[playerId] !== "number") {
    state.walletCoins[playerId] = DEFAULT_GAME_COINS;
    state.totalTokensIssued = (state.totalTokensIssued || 0) + DEFAULT_GAME_COINS;
  }
  if (state.mode === "regular" && typeof state.balances[playerId] !== "number") {
    state.balances[playerId] = state.walletCoins[playerId];
  }

  if (data.action === "sync_profile") {
    if (typeof data.name === "string" && data.name.trim()) {
      state.playerNames![playerId] = data.name.trim().slice(0, 120);
    }
    const cleanAvatar = sanitizeAvatarForState(data.avatar);
    if (cleanAvatar) {
      state.playerAvatars![playerId] = cleanAvatar;
    }
    for (const ct of Object.values(state.customTables!)) {
      if (ct.houseId === playerId) {
        if (state.playerNames![playerId]) ct.houseName = state.playerNames![playerId];
        if (state.playerAvatars![playerId]) ct.houseAvatar = state.playerAvatars![playerId];
      }
    }
    return { status: "applied" };
  }

  if (data.action === "create_table") {
    if (typeof data.playerName === "string" && data.playerName.trim()) {
      state.playerNames![playerId] = data.playerName.trim().slice(0, 120);
    }
    const cleanAvatar = sanitizeAvatarForState(data.playerAvatar);
    if (cleanAvatar) {
      state.playerAvatars![playerId] = cleanAvatar;
    }

    const requestedTableId = typeof data.tableId === "string" ? data.tableId.trim() : "";
    if (
      requestedTableId &&
      requestedTableId !== "table_1" &&
      state.customTables![requestedTableId] &&
      state.customTables![requestedTableId].houseId === playerId &&
      state.customTables![requestedTableId].status !== "closed"
    ) {
      if (!state.unlockedTablesByPlayer![playerId]) {
        state.unlockedTablesByPlayer![playerId] = [];
      }
      if (!state.unlockedTablesByPlayer![playerId].includes(requestedTableId)) {
        state.unlockedTablesByPlayer![playerId].push(requestedTableId);
      }
      broadcasts.push({
        type: "table:created",
        tableId: requestedTableId,
        houseId: playerId,
      });
      return { status: "applied" };
    }

    if (countActiveCustomTables(state) >= MAX_ACTIVE_CUSTOM_TABLES_PER_ROOM) {
      return { status: "rejected", code: "ROOM_TABLE_LIMIT_REACHED" };
    }
    if (countActiveCustomTables(state, playerId) >= MAX_ACTIVE_CUSTOM_TABLES_PER_HOST) {
      return { status: "rejected", code: "HOST_TABLE_LIMIT_REACHED" };
    }

    const s = data.settings || ({} as TableSettings);
    const rawCode = typeof s.tableCode === "string" ? s.tableCode.trim() : "";
    if (rawCode.length > 0 && !/^\d{4}$/.test(rawCode)) {
      return { status: "rejected", code: "INVALID_TABLE_CODE" };
    }

    const trimmedName =
      (typeof s.name === "string" && s.name.trim().slice(0, 60)) ||
      `${state.playerNames![playerId] || "Creator"}'s Table`;
    const hasCode = /^\d{4}$/.test(rawCode);
    const mode = s.mode === "tournament" ? "tournament" : "regular";
    const maxSeats = Math.min(mode === "tournament" ? 15 : 7, Math.max(1, Number(s.maxSeats) || 5));
    const minBet = Math.max(
      1,
      Number(mode === "tournament" ? s.tournament?.minBetChips || s.minBet : s.minBet) || 10
    );
    const maxBet = Math.max(
      minBet,
      Number(mode === "tournament" ? s.tournament?.startingChips || s.maxBet : s.maxBet) || 200
    );
    const actionTimeLimitSec = Math.max(5, Number(s.actionTimeLimit) || 20);
    const winningRule = s.winningRule === "dealer_wins_ties" ? "dealer_wins_ties" : "standard";
    const order = s.order === "random" ? "random" : "sequential";
    const requestedLiq = mode === "tournament" ? 0 : Math.max(0, Number(data.liquidity) || 0);

    const customTableRng = ChaCha20Rng.fromDerived(
      resolveStateRootSeed(state),
      "custom_table",
      playerId,
      String(Object.keys(state.customTables!).length),
      String(ctx.tick)
    );
    let newTableId =
      requestedTableId &&
      requestedTableId !== "table_1" &&
      !state.customTables![requestedTableId]
        ? requestedTableId
        : `table_${customTableRng.nextU32().toString(36)}${customTableRng.nextBounded(1296).toString(36)}`;
    while (state.customTables![newTableId]) {
      newTableId = `table_${customTableRng.nextU32().toString(36)}${customTableRng.nextBounded(1296).toString(36)}`;
    }

    const shoeDeck = shuffleShoeWithVrfRng(customTableRng, gameRules.deckCount);
    const nowMs = Math.max(1000, Math.round(state.elapsedSeconds * 1000));

    const subTable: OnlineSubTableState = {
      id: newTableId,
      name: trimmedName,
      description: typeof s.description === "string" ? s.description.slice(0, 240) : "",
      houseId: playerId,
      houseName: state.playerNames![playerId] || playerId,
      houseAvatar: sanitizeAvatarForState(state.playerAvatars![playerId]),
      createdAt: nowMs,
      visits: 1,
      liquidity: requestedLiq,
      initialLiquidity: requestedLiq,
      stakedFromWallet: 0,
      status: "waiting",
      tableCode: hasCode ? rawCode : undefined,
      hasTableCode: hasCode,
      isPublic: hasCode ? false : Boolean(s.isPublic ?? true),
      emptySince: nowMs,
      maxHostingTimeMs: DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS,
      expiresAt: nowMs + DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS,
      rngState: customTableRng.getState(),
      mode,
      winningRule,
      order,
      minBet,
      maxBet,
      actionTimeLimitSec,
      phase: "betting",
      balances:
        mode === "regular"
          ? { [playerId]: state.walletCoins[playerId] || DEFAULT_GAME_COINS }
          : {},
      prizePoolCoins: 0,
      ...(s.tournament ? { tournament: s.tournament } : {}),
      tournamentHistory: [],
      seats: Array.from({ length: maxSeats }, (_, idx) => ({
        seatIndex: idx,
        playerId: null,
        isReady: false,
        hand: null,
      })),
      dealerHand: null,
      deck: shoeDeck,
      discardCount: 0,
      turnOrder: Array.from({ length: maxSeats }, (_, i) => maxSeats - 1 - i),
      currentTurnSeatIndex: -1,
      phaseStartElapsedSec: state.elapsedSeconds,
      roundsPlayed: 0,
      lastSettlementUnit: null,
      lastRoundSummary: null,
      roundHistory: [],
    };

    state.customTables![newTableId] = subTable;
    if (!state.unlockedTablesByPlayer![playerId]) {
      state.unlockedTablesByPlayer![playerId] = [];
    }
    if (!state.unlockedTablesByPlayer![playerId].includes(newTableId)) {
      state.unlockedTablesByPlayer![playerId].push(newTableId);
    }

    broadcasts.push({
      type: "table:created",
      tableId: newTableId,
      houseId: playerId,
    });
    return { status: "applied" };
  }

  if (data.action === "verify_table_code") {
    const ct = state.customTables![data.tableId];
    if (!ct || ct.status === "closed") {
      return { status: "rejected", code: "TABLE_NOT_FOUND" };
    }
    const submitted = typeof data.tableCode === "string" ? data.tableCode.trim() : "";
    if (!ct.tableCode || ct.houseId === playerId || submitted === ct.tableCode.trim()) {
      if (!state.unlockedTablesByPlayer![playerId]) {
        state.unlockedTablesByPlayer![playerId] = [];
      }
      if (!state.unlockedTablesByPlayer![playerId].includes(ct.id)) {
        state.unlockedTablesByPlayer![playerId].push(ct.id);
      }
      return { status: "applied" };
    }
    return { status: "rejected", code: "INVALID_TABLE_CODE" };
  }

  if (data.action === "update_table_settings") {
    const ct = state.customTables![data.tableId];
    if (!ct || ct.status === "closed") {
      return { status: "rejected", code: "TABLE_NOT_FOUND" };
    }
    if (ct.houseId !== playerId) {
      return { status: "rejected", code: "UNAUTHORIZED" };
    }
    const s = data.settings || {};
    if (typeof s.tableCode === "string") {
      const rawCode = s.tableCode.trim();
      if (rawCode.length > 0 && !/^\d{4}$/.test(rawCode)) {
        return { status: "rejected", code: "INVALID_TABLE_CODE" };
      }
      if (/^\d{4}$/.test(rawCode)) {
        ct.tableCode = rawCode;
        ct.hasTableCode = true;
        ct.isPublic = false;
      } else {
        delete ct.tableCode;
        ct.hasTableCode = false;
        ct.isPublic = true;
      }
    }
    if (typeof s.name === "string" && s.name.trim()) ct.name = s.name.trim().slice(0, 60);
    if (typeof s.description === "string") ct.description = s.description.slice(0, 240);
    if (typeof s.minBet === "number" && s.minBet >= 1) ct.minBet = s.minBet;
    if (typeof s.maxBet === "number" && s.maxBet >= ct.minBet) ct.maxBet = s.maxBet;
    if (typeof s.actionTimeLimit === "number" && s.actionTimeLimit >= 5) {
      ct.actionTimeLimitSec = s.actionTimeLimit;
    }
    if (s.winningRule === "dealer_wins_ties" || s.winningRule === "standard") {
      ct.winningRule = s.winningRule;
    }
    if (s.order === "random") ct.order = "random";
    else if (s.order === "seat") ct.order = "sequential";
    if (s.tournament) ct.tournament = { ...ct.tournament, ...s.tournament };
    return { status: "applied" };
  }

  if (data.action === "deposit_liquidity") {
    const ct = state.customTables![data.tableId];
    if (!ct) return { status: "rejected", code: "TABLE_NOT_FOUND" };
    if (ct.houseId !== playerId) return { status: "rejected", code: "UNAUTHORIZED" };
    const amt = Math.max(0, Number(data.amount) || 0);
    if (amt <= 0) return { status: "rejected", code: "INVALID_AMOUNT" };
    const availWallet = state.walletCoins[playerId] || 0;
    const walletDeducted = Math.min(availWallet, amt);
    if (walletDeducted > 0) {
      syncPlayerRegularBalanceAcrossTables(state, playerId, availWallet - walletDeducted);
      ct.stakedFromWallet = (ct.stakedFromWallet || 0) + walletDeducted;
    } else {
      ct.initialLiquidity += amt;
    }
    ct.liquidity += amt;
    const req = ct.maxBet * ct.seats.length;
    if (ct.liquidity >= req && (ct.status === "paused" || ct.status === "closed")) {
      if (!Array.isArray(ct.deck) || ct.deck.length === 0) {
        reshuffleTargetShoeWithVrf(ct, resolveStateRootSeed(state));
      }
      ct.status = "waiting";
    }
    return { status: "applied" };
  }

  if (data.action === "withdraw_liquidity") {
    const ct = state.customTables![data.tableId];
    if (!ct || ct.status === "closed") return { status: "rejected", code: "TABLE_NOT_FOUND" };
    if (ct.houseId !== playerId) return { status: "rejected", code: "UNAUTHORIZED" };
    const amt = Math.max(0, Number(data.amount) || 0);
    if (amt <= 0 || amt > ct.liquidity) {
      return { status: "rejected", code: "INSUFFICIENT_LIQUIDITY" };
    }
    const unbackedBase = Math.max(0, ct.initialLiquidity - (ct.stakedFromWallet || 0));
    const maxRedeemableToWallet = Math.max(0, ct.liquidity - unbackedBase);
    const walletCredit = Math.min(amt, maxRedeemableToWallet);
    ct.liquidity -= amt;
    if (walletCredit > 0) {
      ct.stakedFromWallet = Math.max(0, (ct.stakedFromWallet || 0) - walletCredit);
      syncPlayerRegularBalanceAcrossTables(
        state,
        playerId,
        (state.walletCoins[playerId] || 0) + walletCredit
      );
    }
    const unbackedReduction = amt - walletCredit;
    if (unbackedReduction > 0) {
      ct.initialLiquidity = Math.max(0, ct.initialLiquidity - unbackedReduction);
    }
    if (ct.liquidity <= 0 && ct.mode === "regular") {
      ct.status = "paused";
    }
    return { status: "applied" };
  }

  if (data.action === "pause_table") {
    const ct = state.customTables![data.tableId];
    if (!ct || ct.status === "closed") return { status: "rejected", code: "TABLE_NOT_FOUND" };
    if (ct.houseId !== playerId) return { status: "rejected", code: "UNAUTHORIZED" };
    ct.status = "paused";
    return { status: "applied" };
  }

  if (data.action === "resume_table") {
    const ct = state.customTables![data.tableId];
    if (!ct || ct.status === "closed") return { status: "rejected", code: "TABLE_NOT_FOUND" };
    if (ct.houseId !== playerId) return { status: "rejected", code: "UNAUTHORIZED" };
    if (ct.status === "paused") {
      ct.status = "waiting";
    }
    return { status: "applied" };
  }

  if (data.action === "close_table") {
    const ct = state.customTables![data.tableId];
    if (!ct || ct.status === "closed") return { status: "rejected", code: "TABLE_NOT_FOUND" };
    if (ct.houseId !== playerId) return { status: "rejected", code: "UNAUTHORIZED" };
    if (ct.phase === "playing" || ct.phase === "dealer_turn") {
      ct.status = "closing";
    } else {
      if (ct.mode === "tournament" && ct.roundsPlayed === 0) {
        for (const [uid] of Object.entries(ct.balances)) {
          const refund = ct.tournament?.ticketPrice || 0;
          if (refund > 0) {
            syncPlayerRegularBalanceAcrossTables(
              state,
              uid,
              (state.walletCoins[uid] || 0) + refund
            );
          }
        }
        ct.balances = {};
        ct.prizePoolCoins = 0;
      }
      if (ct.liquidity > 0) {
        const unbackedBase = Math.max(0, ct.initialLiquidity - (ct.stakedFromWallet || 0));
        const redeemable = Math.max(0, ct.liquidity - unbackedBase);
        ct.liquidity = 0;
        ct.stakedFromWallet = 0;
        if (redeemable > 0) {
          syncPlayerRegularBalanceAcrossTables(
            state,
            playerId,
            (state.walletCoins[playerId] || 0) + redeemable
          );
        }
      }
      ct.seats = ct.seats.map((s) => ({
        ...s,
        playerId: null,
        hand: null,
        isReady: false,
      }));
      ct.deck = [];
      ct.roundHistory = [];
      ct.status = "closed";
    }
    return { status: "applied" };
  }

  if (data.action === "record_visit") {
    const target = resolveTableTarget(state, data.tableId);
    if (!target) return { status: "rejected", code: "TABLE_NOT_FOUND" };
    if (isSubTable(target)) {
      target.visits = (target.visits || 0) + 1;
    } else {
      state.visits = (state.visits || 0) + 1;
    }
    return { status: "applied" };
  }

  const target = resolveTableTarget(state, "tableId" in data ? data.tableId : undefined);
  if (!target) {
    return { status: "rejected", code: "TABLE_NOT_FOUND" };
  }
  if (isSubTable(target) && (target.status === "closed" || target.status === "paused")) {
    return { status: "rejected", code: "TABLE_UNAVAILABLE" };
  }

  if (data.action === "ready_next" || data.action === "unlock_table_balance") {
    prepareNextBettingPhaseIfSettled(state, target);
    return { status: "applied" };
  }

  if (data.action === "claim_refill") {
    prepareNextBettingPhaseIfSettled(state, target);
    const currentCoins = state.walletCoins[playerId] ?? state.balances[playerId] ?? 0;
    const threshold =
      target.mode === "tournament"
        ? target.tournament?.ticketPrice || 100
        : target.minBet;
    if (currentCoins < threshold && target.phase === "betting") {
      syncPlayerRegularBalanceAcrossTables(state, playerId, DEFAULT_GAME_COINS);
      state.totalTokensIssued = (state.totalTokensIssued || 0) + DEFAULT_GAME_COINS;
      state.totalRefillsCount = (state.totalRefillsCount || 0) + 1;
      broadcasts.push({
        type: "player:coins_refilled",
        playerId,
        amount: DEFAULT_GAME_COINS,
      });
      return { status: "applied" };
    }
    return { status: "rejected", code: "REFILL_NOT_ELIGIBLE" };
  }

  if (data.action === "join_seat") {
    prepareNextBettingPhaseIfSettled(state, target);
    if (typeof data.playerName === "string" && data.playerName.trim()) {
      state.playerNames![playerId] = data.playerName.trim().slice(0, 120);
    }
    const cleanAvatar = sanitizeAvatarForState(data.playerAvatar);
    if (cleanAvatar) {
      state.playerAvatars![playerId] = cleanAvatar;
    }
    if (isSubTable(target) && target.tableCode && target.houseId !== playerId) {
      const isUnlocked = state.unlockedTablesByPlayer![playerId]?.includes(target.id);
      const submitted = typeof data.tableCode === "string" ? data.tableCode.trim() : "";
      if (!isUnlocked && submitted !== target.tableCode.trim()) {
        return { status: "rejected", code: "INVALID_TABLE_CODE" };
      }
      if (!isUnlocked) {
        if (!state.unlockedTablesByPlayer![playerId]) {
          state.unlockedTablesByPlayer![playerId] = [];
        }
        state.unlockedTablesByPlayer![playerId].push(target.id);
      }
    }
    if (target.phase !== "betting") {
      return { status: "rejected", code: "INVALID_PHASE" };
    }
    const seat = target.seats[data.seatIndex];
    if (!seat) {
      return { status: "rejected", code: "INVALID_SEAT" };
    }
    if (seat.playerId === playerId) {
      return { status: "applied" };
    }
    if (seat.playerId !== null) {
      return { status: "rejected", code: "SEAT_TAKEN" };
    }

    if (target.mode === "tournament" && target.tournament) {
      if (target.seats.some((s) => s.playerId === playerId)) {
        return { status: "rejected", code: "ALREADY_SEATED" };
      }
      const ticketPriceCoins = Math.max(0, target.tournament.ticketPrice || 100);
      const lockedAllowance = Math.max(
        100,
        target.tournament.startingChips || DEFAULT_GAME_COINS
      );
      const playerWallet = state.walletCoins[playerId] ?? DEFAULT_GAME_COINS;
      if ((target.balances[playerId] || 0) <= 0) {
        if (playerWallet < ticketPriceCoins) {
          return { status: "rejected", code: "INSUFFICIENT_FUNDS" };
        }
        syncPlayerRegularBalanceAcrossTables(
          state,
          playerId,
          playerWallet - ticketPriceCoins
        );
        target.prizePoolCoins += ticketPriceCoins;
        target.balances[playerId] = lockedAllowance;
      }
      if (!Array.isArray(target.tournamentParticipants)) {
        target.tournamentParticipants = [];
      }
      if (!target.tournamentParticipants.includes(playerId)) {
        target.tournamentParticipants.push(playerId);
      }
      seat.playerId = playerId;
    } else {
      seat.playerId = playerId;
      if (typeof target.balances[playerId] !== "number" || target.balances[playerId] <= 0) {
        target.balances[playerId] = state.walletCoins[playerId] || DEFAULT_GAME_COINS;
      }
    }
    return { status: "applied" };
  }

  if (data.action === "leave_seat") {
    prepareNextBettingPhaseIfSettled(state, target);
    if (target.mode === "tournament") {
      return { status: "rejected", code: "TOURNAMENT_LOCKED" };
    }
    if (target.phase !== "betting") {
      return { status: "rejected", code: "INVALID_PHASE" };
    }
    const indicesToLeave =
      typeof data.seatIndex === "number"
        ? [data.seatIndex]
        : target.seats
            .map((s, idx) => (s.playerId === playerId ? idx : -1))
            .filter((idx) => idx >= 0);

    let leftAny = false;
    for (const sIdx of indicesToLeave) {
      const seat = target.seats[sIdx];
      if (seat && seat.playerId === playerId) {
        if (seat.hand && seat.hand.bet > 0) {
          const refund =
            seat.hand.bet +
            (seat.hand.sideBets?.pair || 0) +
            (seat.hand.sideBets?.twentyOnePlusThree || 0);
          target.balances[playerId] = (target.balances[playerId] || 0) + refund;
          if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
            target.liquidity = Math.max(0, target.liquidity - refund);
          }
          if (target.mode === "regular") {
            syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
          }
        }
        seat.playerId = null;
        seat.isReady = false;
        seat.hand = null;
        leftAny = true;
      }
    }
    return leftAny ? { status: "applied" } : { status: "rejected", code: "NOT_SEATED" };
  }

  if (data.action === "place_bet") {
    prepareNextBettingPhaseIfSettled(state, target);
    if (target.phase !== "betting") {
      return { status: "rejected", code: "INVALID_PHASE" };
    }
    const seat = target.seats[data.seatIndex];
    if (!seat) {
      return { status: "rejected", code: "INVALID_SEAT" };
    }
    if (seat.playerId && seat.playerId !== playerId) {
      return { status: "rejected", code: "SEAT_TAKEN" };
    }
    if (!seat.playerId && target.mode !== "regular") {
      return { status: "rejected", code: "NOT_SEATED" };
    }

    const prevCost =
      seat.playerId === playerId && seat.hand && seat.hand.bet > 0
        ? seat.hand.bet +
          (seat.hand.sideBets?.pair || 0) +
          (seat.hand.sideBets?.twentyOnePlusThree || 0)
        : 0;

    const betAmt = Math.max(
      target.minBet,
      Math.min(target.maxBet, Number(data.amount) || target.minBet)
    );
    const pairAmt = Math.max(0, Number(data.sideBets?.pair ?? data.pairBet) || 0);
    const plus3Amt = Math.max(
      0,
      Number(data.sideBets?.twentyOnePlusThree ?? data.plus3Bet) || 0
    );
    const sideBets: SideBets = {
      pair: pairAmt,
      twentyOnePlusThree: plus3Amt,
    };
    const totalCost = betAmt + sideBets.pair + sideBets.twentyOnePlusThree;

    if (target.mode === "regular") {
      target.balances[playerId] =
        state.walletCoins[playerId] ?? target.balances[playerId] ?? DEFAULT_GAME_COINS;
    }
    const baseBal = target.balances[playerId] || 0;
    const effectiveAvail = baseBal + prevCost;
    if (effectiveAvail < totalCost) {
      return { status: "rejected", code: "INSUFFICIENT_FUNDS" };
    }

    if (!seat.playerId && target.mode === "regular") {
      seat.playerId = playerId;
    }

    if (prevCost > 0 && isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
      target.liquidity = Math.max(0, target.liquidity - prevCost);
    }

    target.balances[playerId] = effectiveAvail - totalCost;
    if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
      target.liquidity += totalCost;
    }
    if (target.mode === "regular") {
      syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
    }
    seat.isReady = true;
    seat.hand = {
      cards: [],
      bet: betAmt,
      insuranceBet: 0,
      sideBets,
      sideBetPairWon: 0,
      sideBetPlus3Won: 0,
      status: "playing",
      score: 0,
    };

    const seatedCount = target.seats.filter((s) => s.playerId !== null).length;
    const readyCount = target.seats.filter((s) => s.playerId !== null && s.isReady).length;
    const minSeatsToStart =
      target.mode === "tournament" ? Math.max(2, target.tournament?.minSeats || 2) : 1;

    if (seatedCount >= minSeatsToStart && seatedCount === readyCount) {
      dealInitialCards(state, target, broadcasts);
    }
    return { status: "applied" };
  }

  if (data.action === "start_game") {
    if (target.phase === "playing") {
      return { status: "applied" };
    }
    prepareNextBettingPhaseIfSettled(state, target);
    if (target.phase !== "betting") {
      return { status: "rejected", code: "INVALID_PHASE" };
    }
    const readyCount = target.seats.filter((s) => s.playerId !== null && s.isReady).length;
    const minSeatsToStart =
      target.mode === "tournament" ? Math.max(2, target.tournament?.minSeats || 2) : 1;
    if (readyCount < minSeatsToStart) {
      return { status: "rejected", code: "NO_READY_PLAYERS" };
    }
    if (target.mode === "regular") {
      for (const seat of target.seats) {
        if (seat.playerId && !seat.isReady) {
          seat.playerId = null;
          seat.hand = null;
        }
      }
    }
    dealInitialCards(state, target, broadcasts);
    return { status: "applied" };
  }

  if (
    data.action === "hit" ||
    data.action === "stand" ||
    data.action === "double_down" ||
    data.action === "split" ||
    data.action === "buy_insurance"
  ) {
    if (target.phase !== "playing") {
      return { status: "rejected", code: "INVALID_PHASE" };
    }
    if (target.currentTurnSeatIndex !== data.seatIndex) {
      return { status: "rejected", code: "NOT_YOUR_TURN" };
    }
    const seat = target.seats[data.seatIndex];
    if (!seat || seat.playerId !== playerId || !seat.hand) {
      return { status: "rejected", code: "NOT_YOUR_TURN" };
    }

    if (data.action === "hit") {
      const card = drawCardFromShoe(target);
      seat.hand.cards.push(card);
      seat.hand.score = calculateHandScore(seat.hand.cards);
      target.phaseStartElapsedSec = ctx.elapsedSeconds;

      if (seat.hand.score > 21) {
        seat.hand.status = "busted";
        advanceTurnOrSettle(state, target, broadcasts);
      } else if (seat.hand.score === 21) {
        seat.hand.status = "stood";
        advanceTurnOrSettle(state, target, broadcasts);
      }
      return { status: "applied" };
    }

    if (data.action === "stand") {
      seat.hand.status = "stood";
      advanceTurnOrSettle(state, target, broadcasts);
      return { status: "applied" };
    }

    if (data.action === "double_down") {
      if (seat.hand.cards.length !== 2) {
        return { status: "rejected", code: "CANNOT_DOUBLE" };
      }
      const extraBet = seat.hand.bet;
      if ((target.balances[playerId] || 0) < extraBet) {
        return { status: "rejected", code: "INSUFFICIENT_FUNDS" };
      }
      target.balances[playerId] -= extraBet;
      if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
        target.liquidity += extraBet;
      }
      if (target.mode === "regular") {
        syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
      }
      seat.hand.bet += extraBet;
      seat.hand.isDoubled = true;
      const card = drawCardFromShoe(target);
      seat.hand.cards.push(card);
      seat.hand.score = calculateHandScore(seat.hand.cards);
      seat.hand.status = seat.hand.score > 21 ? "busted" : "stood";
      advanceTurnOrSettle(state, target, broadcasts);
      return { status: "applied" };
    }

    if (data.action === "split") {
      if (
        seat.hand.cards.length !== 2 ||
        seat.hand.cards[0].value !== seat.hand.cards[1].value
      ) {
        return { status: "rejected", code: "CANNOT_SPLIT" };
      }
      const splitBet = seat.hand.bet;
      const origIdx = seat.originalSeatIndex ?? seat.seatIndex;
      const currentSplitCount = target.seats.filter(
        (s) => (s.originalSeatIndex ?? s.seatIndex) === origIdx
      ).length;
      if (currentSplitCount >= 4) {
        return { status: "rejected", code: "CANNOT_SPLIT" };
      }
      if ((target.balances[playerId] || 0) < splitBet) {
        return { status: "rejected", code: "INSUFFICIENT_FUNDS" };
      }

      target.balances[playerId] -= splitBet;
      if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
        target.liquidity += splitBet;
      }
      if (target.mode === "regular") {
        syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
      }
      const [c1, c2] = seat.hand.cards;
      const isSplittingAces = c1.value === "A" && c2.value === "A";
      const newC1 = drawCardFromShoe(target);
      const newC2 = drawCardFromShoe(target);

      seat.originalSeatIndex = origIdx;
      seat.hand.cards = [c1, newC1];
      seat.hand.score = calculateHandScore(seat.hand.cards);
      if (isSplittingAces || seat.hand.score === 21) {
        seat.hand.status = "stood";
      }

      const splitScore = calculateHandScore([c2, newC2]);
      const splitSeat: RoomSeatState = {
        seatIndex: data.seatIndex + 1,
        playerId,
        isReady: true,
        isSplitHand: true,
        originalSeatIndex: origIdx,
        hand: {
          cards: [c2, newC2],
          bet: splitBet,
          insuranceBet: 0,
          sideBets: { pair: 0, twentyOnePlusThree: 0 },
          sideBetPairWon: 0,
          sideBetPlus3Won: 0,
          score: splitScore,
          status: isSplittingAces || splitScore === 21 ? "stood" : "playing",
        },
      };

      target.seats.splice(data.seatIndex + 1, 0, splitSeat);
      target.seats.forEach((s, idx) => {
        s.seatIndex = idx;
      });

      target.turnOrder = target.turnOrder.map((idx) => (idx > data.seatIndex ? idx + 1 : idx));
      const curOrderPos = target.turnOrder.indexOf(data.seatIndex);
      if (curOrderPos >= 0) {
        target.turnOrder.splice(curOrderPos + 1, 0, data.seatIndex + 1);
      } else {
        target.turnOrder.push(data.seatIndex + 1);
      }

      if (seat.hand.status !== "playing") {
        advanceTurnOrSettle(state, target, broadcasts);
      }
      return { status: "applied" };
    }

    if (data.action === "buy_insurance") {
      if (
        target.dealerHand?.cards[0]?.value !== "A" ||
        seat.hand.cards.length !== 2 ||
        seat.isSplitHand ||
        seat.hand.insuranceBet !== 0
      ) {
        return { status: "rejected", code: "CANNOT_INSURE" };
      }
      const insCost = seat.hand.bet / 2;
      if ((target.balances[playerId] || 0) < insCost) {
        return { status: "rejected", code: "INSUFFICIENT_FUNDS" };
      }
      target.balances[playerId] -= insCost;
      if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
        target.liquidity += insCost;
      }
      if (target.mode === "regular") {
        syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
      }
      seat.hand.insuranceBet = insCost;
      return { status: "applied" };
    }
  }

  return { status: "rejected", code: "UNKNOWN_ACTION" };
}

/**
 * 构建符合 RandSeed Server SDK 规范的单玩家受控观测视图 (createAgentObservation)
 * 自动剥离未翻开暗牌、完整牌靴与他人的私有余额/暗注
 */
export function buildBlackjackAgentObservation(
  state: RoyalBlackjackRoomState,
  playerId: string,
  tick: number
): AgentObservation {
  const projection = projectBlackjackRoomState(state);
  const privateMap = new Map<string, any>();
  for (const [pid, priv] of Object.entries(projection.privateStates)) {
    privateMap.set(pid, priv as any);
  }
  if (!privateMap.has(playerId)) {
    privateMap.set(playerId, {
      playerId,
      balance: state.balances[playerId] || 0,
      walletCoins: state.walletCoins[playerId] || 0,
      mySeats: [],
      unlockedTableIds: state.unlockedTablesByPlayer?.[playerId] || [],
      ownedTableCodes: {},
    });
  }
  return createAgentObservation(
    {
      matchId: state.matchId,
      sequence: state.matchSeq,
      tick,
      playerId,
    },
    projection.publicState as any,
    privateMap
  );
}

export const projectAgentPlayerView = buildBlackjackAgentObservation;

/**
 * Royal BlackJack 标准 RandSeed 房间服务端实现（Node.js / TypeScript，严格遵循 RandSeed Server SDK 契约）
 */
export const royalBlackjackGameServer: GameServer<
  RoyalBlackjackRoomState,
  BlackjackPlayerInput,
  BlackjackHostCommand
> = {
  durability: "checkpoint",

  agentCapabilities(): AgentGameCapabilities {
    return {
      observationProtocolVersion: 1,
      actionProtocolVersion: 1,
      modes: ["copilot", "autoplay", "follow"],
      maxDecisionHz: 2,
      backgroundAutoplay: true,
    };
  },

  agentPlayerContract(): AgentPlayerContract {
    return {
      playerViewProtocolVersion: 1,
      actionProtocolVersion: 1,
      playerViewSchemaId: "royal-blackjack.player-view.v1",
      actionSchemaId: "royal-blackjack.action.v1",
      modes: ["follow", "autoplay"],
      maxDecisionHz: 2,
      independentSeats: true,
      backgroundAutoplay: true,
    };
  },

  projectAgentPlayerView(request: AgentPlayerViewRequest): AgentPlayerViewProjection {
    const rawState = request.state as unknown as RoyalBlackjackRoomState;
    const projection = projectBlackjackRoomState(rawState);
    const playerId = request.context.playerId;

    const { focusTableId, legalActions, deadlineAt } = computeAgentLegalActionsAndFocus(
      rawState,
      playerId
    );

    const basePublic = projection.publicState as Record<string, any>;
    const publicCustomMap = (basePublic.customTables || {}) as Record<string, Record<string, any>>;

    const focusSource: Record<string, any> =
      focusTableId !== "table_1" && publicCustomMap[focusTableId]
        ? publicCustomMap[focusTableId]
        : basePublic;

    const compactSeats = Array.isArray(focusSource.seats)
      ? focusSource.seats.map((s: any) => ({
          seatIndex: s.seatIndex,
          playerId: s.playerId,
          isReady: Boolean(s.isReady),
          hand: s.hand
            ? {
                cards: s.hand.cards,
                bet: s.hand.bet,
                status: s.hand.status,
                score: s.hand.score,
              }
            : null,
        }))
      : [];

    const tableDirectory: Array<Record<string, unknown>> = [
      {
        id: "table_1",
        mode: basePublic.mode,
        status: basePublic.phase === "playing" || basePublic.phase === "dealer_turn" ? "playing" : "waiting",
        phase: basePublic.phase,
        minBet: basePublic.minBet,
        maxBet: basePublic.maxBet,
        openSeats: Array.isArray(basePublic.seats)
          ? basePublic.seats.filter((s: any) => !s?.playerId).length
          : 0,
        hasPin: false,
      },
    ];

    for (const [tid, ct] of Object.entries(publicCustomMap)) {
      if (!ct || typeof ct !== "object") continue;
      if (tableDirectory.length >= 9) break;
      tableDirectory.push({
        id: tid,
        mode: ct.mode,
        status: ct.status,
        phase: ct.phase,
        minBet: ct.minBet,
        maxBet: ct.maxBet,
        openSeats: Array.isArray(ct.seats)
          ? ct.seats.filter((s: any) => !s?.playerId).length
          : 0,
        hasPin: Boolean(ct.hasTableCode),
      });
    }

    const basePriv = (projection.privateStates[playerId] as Record<string, any>) || {
      playerId,
      balance: rawState.balances?.[playerId] || 0,
      walletCoins: rawState.walletCoins?.[playerId] || 0,
      mySeats: [],
      unlockedTableIds: rawState.unlockedTablesByPlayer?.[playerId] || [],
      ownedTableCodes: {},
    };

    const focusBalance =
      focusTableId !== "table_1" && rawState.customTables?.[focusTableId]
        ? rawState.customTables[focusTableId].mode === "regular"
          ? rawState.walletCoins?.[playerId] ??
            rawState.customTables[focusTableId].balances?.[playerId] ??
            0
          : rawState.customTables[focusTableId].balances?.[playerId] ?? 0
        : rawState.walletCoins?.[playerId] ?? rawState.balances?.[playerId] ?? 0;

    const compactPublicState: Record<string, unknown> = {
      matchId: basePublic.matchId,
      matchSeq: basePublic.matchSeq,
      focusTableId,
      mode: focusSource.mode,
      winningRule: focusSource.winningRule,
      minBet: focusSource.minBet,
      maxBet: focusSource.maxBet,
      actionTimeLimitSec: focusSource.actionTimeLimitSec,
      phase: focusSource.phase,
      currentTurnSeatIndex: focusSource.currentTurnSeatIndex,
      roundsPlayed: focusSource.roundsPlayed,
      deckRemainingCount: focusSource.deckRemainingCount,
      dealerHand: focusSource.dealerHand,
      seats: compactSeats,
      tableDirectory,
      onlinePlayerCount: Array.isArray(basePublic.players) ? basePublic.players.length : 0,
    };

    const compactPrivateState: Record<string, unknown> = {
      playerId,
      walletCoins: basePriv.walletCoins ?? 0,
      balance: focusBalance,
      mySeats: Array.isArray(basePriv.mySeats) ? basePriv.mySeats.slice(0, 8) : [],
      unlockedTableIds: Array.isArray(basePriv.unlockedTableIds)
        ? basePriv.unlockedTableIds.slice(0, 8)
        : [],
      ownedTableCodes: basePriv.ownedTableCodes || {},
      legalActions: legalActions.slice(0, 12),
    };

    let visibleEvents = compactCommittedEventsForAgent(request.committedEvents);
    const decision = {
      canAct: legalActions.length > 0,
      deadlineAt,
    };

    // Enforce strict < 6,000-byte AgentPlayerView envelope limit (keep projection <= 4,800 bytes)
    const MAX_PROJECTION_BUDGET_BYTES = 4_800;
    let candidate = {
      publicState: compactPublicState,
      privateState: compactPrivateState,
      visibleEvents,
      decision,
    };

    if (utf8ByteLength(candidate) > MAX_PROJECTION_BUDGET_BYTES) {
      compactPublicState.tableDirectory = tableDirectory.slice(0, 3);
      visibleEvents = visibleEvents.slice(-1);
      candidate = {
        publicState: compactPublicState,
        privateState: compactPrivateState,
        visibleEvents,
        decision,
      };
    }

    if (utf8ByteLength(candidate) > MAX_PROJECTION_BUDGET_BYTES) {
      delete compactPublicState.tableDirectory;
      compactPrivateState.unlockedTableIds = [];
      compactPrivateState.ownedTableCodes = {};
      compactPrivateState.legalActions = legalActions.slice(0, 6);
      visibleEvents = [];
      candidate = {
        publicState: compactPublicState,
        privateState: compactPrivateState,
        visibleEvents,
        decision,
      };
    }

    return sanitizeJson(candidate as unknown as AgentPlayerViewProjection);
  },

  manifest(): GameManifest {
    const maxPlayers = resolveRoomMaxPlayers();
    return {
      title: "Royal BlackJack",
      version: ROYAL_BLACKJACK_RULES_VERSION,
      minPlayers: 1,
      maxPlayers,
      tickRateHz: 5,
      persistentTable: true,
      playerViewMode: "private",
      resultDefinition: ROYAL_BLACKJACK_RESULT_DEFINITION,
      optionsSchema: {
        type: "object",
        properties: {
          randomSeed: { type: "string", pattern: "^[0-9a-f]{64}$" },
          randomSeedIndex: { type: "integer", minimum: 0 },
          seed: { type: "number" },
          mode: { type: "string", enum: ["regular", "tournament"] },
          minBet: { type: "number" },
          maxBet: { type: "number" },
          maxSeats: { type: "number" },
          actionTimeLimitSec: { type: "number" },
          disconnectGraceSec: { type: "number" },
          lagGraceSec: { type: "number" },
          winningRule: { type: "string", enum: ["standard", "dealer_wins_ties"] },
          order: { type: "string", enum: ["sequential", "random"] },
          initialWalletCoins: { type: "object" },
        },
      },
    };
  },

  init(config: MatchConfig): InitResult<RoyalBlackjackRoomState> {
    if (
      config.options !== undefined &&
      (typeof config.options !== "object" || config.options === null || Array.isArray(config.options))
    ) {
      throw new SdkProtocolError("INVALID_OPTIONS", "options must be a JSON object.");
    }
    const opts = config.options || {};
    if (Object.hasOwn(opts, "randomSeed") && !isValidSeedHex(opts.randomSeed)) {
      throw new SdkProtocolError(
        "INVALID_OPTIONS",
        "options.randomSeed must be a 64-character lowercase hex string."
      );
    }
    if (
      Object.hasOwn(opts, "randomSeedIndex") &&
      (typeof opts.randomSeedIndex !== "number" ||
        !Number.isSafeInteger(opts.randomSeedIndex) ||
        opts.randomSeedIndex < 0)
    ) {
      throw new SdkProtocolError(
        "INVALID_OPTIONS",
        "options.randomSeedIndex must be a non-negative safe integer."
      );
    }
    if (
      Object.hasOwn(opts, "seed") &&
      (typeof opts.seed !== "number" || !Number.isFinite(opts.seed))
    ) {
      throw new SdkProtocolError("INVALID_OPTIONS", "options.seed must be a finite number.");
    }

    const randomSeed = isValidSeedHex(opts.randomSeed)
      ? opts.randomSeed
      : deriveSeedHex(
          LEGACY_FALLBACK_ROOT_SEED_HEX,
          "legacy-options-seed",
          config.gameId || "royal-blackjack",
          config.matchId,
          String(config.matchSeq),
          String(typeof opts.seed === "number" ? opts.seed : 1)
        );
    const randomSeedIndex =
      typeof opts.randomSeedIndex === "number" &&
      Number.isSafeInteger(opts.randomSeedIndex) &&
      opts.randomSeedIndex >= 0
        ? opts.randomSeedIndex
        : undefined;

    const maxSeats = Math.min(7, Math.max(1, Number(opts.maxSeats) || 7));
    const mode = opts.mode === "tournament" ? "tournament" : "regular";
    const minBet = Math.max(1, Number(opts.minBet) || 10);
    const maxBet = Math.max(minBet, Number(opts.maxBet) || 500);
    const actionTimeLimitSec = Math.max(5, Number(opts.actionTimeLimitSec) || 20);
    const disconnectGraceSec = Math.max(
      0,
      Number(opts.disconnectGraceSec ?? DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC)
    );
    const lagGraceSec = Math.max(
      0,
      Number(opts.lagGraceSec ?? DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC)
    );
    const winningRule =
      opts.winningRule === "dealer_wins_ties" ? "dealer_wins_ties" : "standard";
    const order = opts.order === "random" ? "random" : "sequential";

    const carryover = (config.carryover as unknown as BlackjackCarryover | null) || null;
    const tournamentOpts = (opts.tournament as TournamentSettings | undefined) || undefined;
    const initialWallets =
      opts.initialWalletCoins && typeof opts.initialWalletCoins === "object"
        ? (opts.initialWalletCoins as Record<string, number>)
        : {};

    const balances: Record<string, number> = { ...(carryover?.balances || {}) };
    const walletCoins: Record<string, number> = {
      ...initialWallets,
      ...(carryover?.walletCoins || {}),
    };
    const playerNames: Record<string, string> = { ...(carryover?.playerNames || {}) };
    const playerAvatars: Record<string, string> = { ...(carryover?.playerAvatars || {}) };
    let totalTokensIssued = carryover?.totalTokensIssued || 0;

    for (const pid of config.players) {
      if (typeof walletCoins[pid] !== "number" || walletCoins[pid] <= 0) {
        walletCoins[pid] = DEFAULT_GAME_COINS;
        totalTokensIssued += DEFAULT_GAME_COINS;
      }
      if (mode === "regular" && (typeof balances[pid] !== "number" || balances[pid] <= 0)) {
        balances[pid] = walletCoins[pid];
      }
      if (!playerNames[pid]) {
        playerNames[pid] = pid;
      }
    }

    // 使用新 Match 注入的 VRF randomSeed 初始化主桌 ChaCha20Rng：
    // 若 Carryover 中已有未打穿 75% 切牌卡的牌靴，保留剩余牌张集合并用新 VRF 种子重新洗混剩余牌序（防止上一局链上公开的 randomSeed 推演剩余牌序）
    const totalShoeCards = gameRules.deckCount * 52;
    const minRemainingBeforeCutCard = Math.floor(totalShoeCards * (1 - gameRules.shufflePenetration));
    const primaryRng = ChaCha20Rng.fromDerived(randomSeed, "table_1", String(config.matchSeq));
    let deck: PlayingCard[];
    let discardCount: number;

    if (carryover?.deck && carryover.deck.length >= minRemainingBeforeCutCard) {
      deck = carryover.deck.map((c) => ({ suit: c.suit, value: c.value }));
      primaryRng.shuffle(deck);
      discardCount = carryover.discardCount || totalShoeCards - deck.length;
    } else {
      deck = shuffleShoeWithVrfRng(primaryRng, gameRules.deckCount);
      discardCount = 0;
    }
    const rngState = primaryRng.getState();

    const restoreSettled =
      carryover?.settledPhase === "settled" && Array.isArray(carryover.settledSeats);

    const seats: RoomSeatState[] = restoreSettled
      ? JSON.parse(JSON.stringify(carryover!.settledSeats))
      : Array.from({ length: maxSeats }, (_, idx) => {
          const carriedPlayer =
            carryover?.seatedPlayers && idx < carryover.seatedPlayers.length
              ? carryover.seatedPlayers[idx]
              : null;
          return {
            seatIndex: idx,
            playerId: carriedPlayer,
            isReady: false,
            hand: null,
          };
        });

    const state: RoyalBlackjackRoomState = {
      matchId: config.matchId,
      matchSeq: config.matchSeq,
      randomSeed,
      ...(randomSeedIndex !== undefined ? { randomSeedIndex } : {}),
      rngState,
      mode,
      winningRule,
      order,
      minBet,
      maxBet,
      actionTimeLimitSec,
      disconnectGraceSec,
      lagGraceSec,
      disconnectedAtElapsedSec: {},
      phase: restoreSettled ? "settled" : "betting",
      players: [...config.players],
      playerNames,
      playerAvatars,
      balances,
      walletCoins,
      prizePoolCoins: carryover?.prizePoolCoins || 0,
      ...(tournamentOpts ? { tournament: tournamentOpts } : {}),
      tournamentHistory: carryover?.tournamentHistory || [],
      seats,
      dealerHand: restoreSettled
        ? carryover?.settledDealerHand
          ? JSON.parse(JSON.stringify(carryover.settledDealerHand))
          : null
        : null,
      deck,
      discardCount,
      turnOrder: Array.from({ length: maxSeats }, (_, i) => maxSeats - 1 - i),
      currentTurnSeatIndex: -1,
      phaseStartElapsedSec: 0,
      elapsedSeconds: 0,
      roundsPlayed: carryover?.roundsPlayed || 0,
      lastSettlementUnit: null,
      lastRoundSummary: carryover?.lastRoundSummary || null,
      roundHistory: Array.isArray(carryover?.roundHistory) ? carryover.roundHistory.slice(0, 20) : [],
      matchSettledRounds: [],
      matchTournamentResults: [],
      customTables: (() => {
        if (!carryover?.customTables) return {};
        const next: Record<string, OnlineSubTableState> = {};
        for (const [tid, ct] of Object.entries(carryover.customTables)) {
          if (!ct || ct.status === "closed") continue;
          const clonedCt = JSON.parse(JSON.stringify(ct)) as OnlineSubTableState & {
            seed?: unknown;
            prngCalls?: unknown;
          };
          delete clonedCt.seed;
          delete clonedCt.prngCalls;
          const subRng = ChaCha20Rng.fromDerived(
            randomSeed,
            "custom_table_match",
            tid,
            String(config.matchSeq)
          );
          if (Array.isArray(clonedCt.deck) && clonedCt.deck.length > 1) {
            clonedCt.deck = clonedCt.deck.map((c) => ({ suit: c.suit, value: c.value }));
            subRng.shuffle(clonedCt.deck);
          } else if (!Array.isArray(clonedCt.deck) || clonedCt.deck.length === 0) {
            clonedCt.deck = shuffleShoeWithVrfRng(subRng, gameRules.deckCount);
            clonedCt.discardCount = 0;
          }
          clonedCt.rngState = subRng.getState();
          next[tid] = clonedCt;
        }
        return next;
      })(),
      unlockedTablesByPlayer: carryover?.unlockedTablesByPlayer
        ? JSON.parse(JSON.stringify(carryover.unlockedTablesByPlayer))
        : {},
      visits: carryover?.visits ?? 1,
      totalTokensIssued,
      totalTokensPaidOut: carryover?.totalTokensPaidOut || 0,
      totalRefillsCount: carryover?.totalRefillsCount || 0,
      forceClose: false,
    };

    return sanitizeJson({
      state,
      joinable: computeRoomJoinable(state),
      playerViews: buildRoomPlayerViews(state) as any,
      broadcasts: [
        {
          type: "match:initialized",
          matchId: config.matchId,
          matchSeq: config.matchSeq,
        },
      ],
    });
  },

  tick(
    ctx: TickContext<BlackjackPlayerInput, BlackjackHostCommand>,
    prevState: RoyalBlackjackRoomState
  ): TickResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    state.elapsedSeconds = ctx.elapsedSeconds;
    if (!state.playerNames) state.playerNames = {};
    if (!state.playerAvatars) state.playerAvatars = {};
    if (!state.customTables) state.customTables = {};
    if (!state.unlockedTablesByPlayer) state.unlockedTablesByPlayer = {};
    if (!state.disconnectedAtElapsedSec) state.disconnectedAtElapsedSec = {};
    if (typeof state.disconnectGraceSec !== "number") {
      state.disconnectGraceSec = DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC;
    }
    if (typeof state.lagGraceSec !== "number") {
      state.lagGraceSec = DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC;
    }
    const broadcasts: unknown[] = [];
    const actionResults: GameActionResult[] = [];

    const prevSettlementIdByTable = new Map<string, string>();
    prevSettlementIdByTable.set("table_1", state.lastSettlementUnit?.settlementUnitId || "");
    for (const [tid, ct] of Object.entries(state.customTables)) {
      prevSettlementIdByTable.set(tid, ct.lastSettlementUnit?.settlementUnitId || "");
    }

    if (ctx.commands && ctx.commands.length > 0) {
      for (const cmd of ctx.commands) {
        const target = resolveTableTarget(state, cmd.data?.tableId);
        if (cmd.data?.action === "close_table") {
          if (target && isSubTable(target)) {
            target.status = "closed";
          } else {
            state.forceClose = true;
          }
        } else if (cmd.data?.action === "force_deal" && target) {
          prepareNextBettingPhaseIfSettled(state, target);
          if (target.phase === "betting") {
            dealInitialCards(state, target, broadcasts);
          }
        }
      }
    }

    for (const input of ctx.inputs) {
      const outcome = applyAuthoritativePlayerInput(
        state,
        ctx,
        input.playerId,
        input.data,
        broadcasts
      );
      if (typeof input.actionId === "string" && input.actionId.trim().length > 0) {
        actionResults.push(
          outcome.status === "applied"
            ? { actionId: input.actionId, status: "applied" }
            : { actionId: input.actionId, status: "rejected", code: outcome.code }
        );
      }
    }

    const disconnectGraceSec =
      typeof state.disconnectGraceSec === "number"
        ? state.disconnectGraceSec
        : DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC;
    const lagGraceSec =
      typeof state.lagGraceSec === "number"
        ? state.lagGraceSec
        : DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC;

    // 1. 统计已超过默认 10s 等待期的断线玩家（10s 内服务端不做任何清理处理）
    const expiredDisconnectedPlayers: string[] = [];
    for (const [pid, disconnectedAt] of Object.entries(state.disconnectedAtElapsedSec)) {
      if (ctx.elapsedSeconds - disconnectedAt > disconnectGraceSec) {
        expiredDisconnectedPlayers.push(pid);
      }
    }

    // 2. 确定性超时裁决（遍历主桌及所有在线自建桌/扩容桌）
    const allTargets: TableExecutionTarget[] = [
      state,
      ...Object.values(state.customTables).filter((ct) => ct.status !== "closed"),
    ];
    for (const target of allTargets) {
      let safetyGuard = 0;
      while (target.phase === "playing" && safetyGuard < target.seats.length + 2) {
        safetyGuard++;
        const activeSeat = target.seats[target.currentTurnSeatIndex];
        if (!activeSeat || !activeSeat.hand || activeSeat.hand.status !== "playing") {
          break;
        }
        const activePid = activeSeat.playerId;
        if (!activePid || activePid.startsWith("bot_")) {
          break;
        }

        const disconnectedAt = state.disconnectedAtElapsedSec[activePid];
        const turnElapsed = ctx.elapsedSeconds - target.phaseStartElapsedSec;
        const alreadyEvicted =
          !state.players.includes(activePid) && disconnectedAt === undefined;

        let shouldProcessTimeout = false;
        if (alreadyEvicted) {
          shouldProcessTimeout = true;
        } else if (disconnectedAt !== undefined) {
          if (ctx.elapsedSeconds - disconnectedAt > disconnectGraceSec) {
            shouldProcessTimeout = true;
          }
        } else if (turnElapsed > target.actionTimeLimitSec + lagGraceSec) {
          shouldProcessTimeout = true;
        }

        if (!shouldProcessTimeout) {
          break;
        }

        activeSeat.hand.status = "stood";
        advanceTurnOrSettle(state, target, broadcasts);
      }
    }

    // 3. 超过 10s 的断线玩家按正常离线规则处理
    for (const pid of expiredDisconnectedPlayers) {
      delete state.disconnectedAtElapsedSec[pid];
      state.players = state.players.filter((p) => p !== pid);

      if (state.mode !== "tournament" && state.phase === "betting") {
        for (const seat of state.seats) {
          if (seat.playerId === pid) {
            if (seat.hand && seat.hand.bet > 0) {
              const refund =
                seat.hand.bet +
                (seat.hand.sideBets?.pair || 0) +
                (seat.hand.sideBets?.twentyOnePlusThree || 0);
              state.balances[pid] = (state.balances[pid] || 0) + refund;
              syncPlayerRegularBalanceAcrossTables(state, pid, state.balances[pid]);
            }
            seat.playerId = null;
            seat.isReady = false;
            seat.hand = null;
          }
        }
      }

      if (state.customTables) {
        for (const ct of Object.values(state.customTables)) {
          if (ct.mode !== "tournament" && ct.phase === "betting") {
            for (const seat of ct.seats) {
              if (seat.playerId === pid) {
                if (seat.hand && seat.hand.bet > 0) {
                  const refund =
                    seat.hand.bet +
                    (seat.hand.sideBets?.pair || 0) +
                    (seat.hand.sideBets?.twentyOnePlusThree || 0);
                  ct.balances[pid] = (ct.balances[pid] || 0) + refund;
                  if (ct.houseId !== "system") {
                    ct.liquidity = Math.max(0, ct.liquidity - refund);
                  }
                  syncPlayerRegularBalanceAcrossTables(state, pid, ct.balances[pid]);
                }
                seat.playerId = null;
                seat.isReady = false;
                seat.hand = null;
              }
            }
          }
        }
      }

      broadcasts.push({ type: "player:left", playerId: pid, reason: "disconnect_timeout" });
    }

    reconcileOnlineRoomTables(state);

    const resultUnits: GameResultEvent[] = [];
    const curPrimaryUnitId = state.lastSettlementUnit?.settlementUnitId || "";
    if (
      curPrimaryUnitId &&
      curPrimaryUnitId !== (prevSettlementIdByTable.get("table_1") ?? "")
    ) {
      resultUnits.push(...buildResultUnitEventsFromSettlement(state, state.matchId));
    }
    for (const [tid, ct] of Object.entries(state.customTables)) {
      const curSubUnitId = ct.lastSettlementUnit?.settlementUnitId || "";
      if (curSubUnitId && curSubUnitId !== (prevSettlementIdByTable.get(tid) ?? "")) {
        resultUnits.push(...buildResultUnitEventsFromSettlement(ct, state.matchId));
      }
    }

    return sanitizeJson({
      state,
      joinable: computeRoomJoinable(state),
      playerViews: buildRoomPlayerViews(state) as any,
      broadcasts,
      persist:
        ctx.inputs.length > 0 ||
        (ctx.commands?.length ?? 0) > 0 ||
        broadcasts.length > 0 ||
        resultUnits.length > 0 ||
        ctx.tick % 10 === 0,
      ...(resultUnits.length > 0 ? { resultUnits } : {}),
      ...(actionResults.length > 0 ? { actionResults } : {}),
    });
  },

  onPlayerJoin(
    playerId: string,
    prevState: RoyalBlackjackRoomState
  ): PlayerEventResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    if (state.disconnectedAtElapsedSec?.[playerId] !== undefined) {
      delete state.disconnectedAtElapsedSec[playerId];
    }
    if (!state.players.includes(playerId)) {
      state.players.push(playerId);
    }
    if (!state.playerNames) state.playerNames = {};
    if (!state.playerAvatars) state.playerAvatars = {};
    if (!state.playerNames[playerId]) {
      state.playerNames[playerId] = playerId;
    }
    if (typeof state.walletCoins[playerId] !== "number" || state.walletCoins[playerId] <= 0) {
      state.walletCoins[playerId] = DEFAULT_GAME_COINS;
      state.totalTokensIssued = (state.totalTokensIssued || 0) + DEFAULT_GAME_COINS;
    }
    if (
      state.mode === "regular" &&
      (typeof state.balances[playerId] !== "number" || state.balances[playerId] <= 0)
    ) {
      state.balances[playerId] = state.walletCoins[playerId];
    }
    return sanitizeJson({
      state,
      joinable: computeRoomJoinable(state),
      playerViews: buildRoomPlayerViews(state) as any,
      broadcasts: [{ type: "player:joined", playerId }],
    });
  },

  onPlayerLeave(
    playerId: string,
    prevState: RoyalBlackjackRoomState
  ): PlayerEventResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    if (!state.disconnectedAtElapsedSec) {
      state.disconnectedAtElapsedSec = {};
    }
    // 默认等待 10s：将玩家从在线活跃名单中移除以匹配平台连接 Roster，但在 10s 宽限期内保留所有在座位置与牌局手牌
    state.players = (state.players || []).filter((p) => p !== playerId);
    if (state.disconnectedAtElapsedSec[playerId] === undefined) {
      state.disconnectedAtElapsedSec[playerId] = state.elapsedSeconds;
    }
    return sanitizeJson({
      state,
      joinable: computeRoomJoinable(state),
      playerViews: buildRoomPlayerViews(state) as any,
      broadcasts: [
        {
          type: "player:disconnected_wait",
          playerId,
          waitSeconds:
            typeof state.disconnectGraceSec === "number"
              ? state.disconnectGraceSec
              : DEFAULT_PLAYER_LAG_DISCONNECT_WAIT_SEC,
        },
      ],
    });
  },

  isGameOver(state: RoyalBlackjackRoomState): GameResult {
    const settledRounds = Array.isArray(state.matchSettledRounds) ? state.matchSettledRounds : [];
    const tournamentResults = Array.isArray(state.matchTournamentResults)
      ? state.matchTournamentResults
      : [];

    const matchNetByPlayer: Record<string, number> = {};
    for (const r of settledRounds) {
      for (const sr of r.seatResults || []) {
        if (!sr.userId) continue;
        matchNetByPlayer[sr.userId] = (matchNetByPlayer[sr.userId] || 0) + (sr.net || 0);
      }
    }
    let winnerPlayerId: string | undefined;
    let bestMatchNet = 0;
    for (const [pid, net] of Object.entries(matchNetByPlayer)) {
      if (net > bestMatchNet) {
        bestMatchNet = net;
        winnerPlayerId = pid;
      }
    }

    if (state.forceClose) {
      return sanitizeJson({
        over: true,
        summary: {
          ...(winnerPlayerId ? { winnerPlayerId } : {}),
          scores: state.balances,
          durationSeconds: state.elapsedSeconds,
          customMetrics: {
            roundsPlayed: state.roundsPlayed,
            ...(typeof state.randomSeedIndex === "number"
              ? { randomSeedIndex: state.randomSeedIndex }
              : {}),
            settlementUnit: state.lastSettlementUnit,
            settledRounds,
            tournamentResults,
          },
        },
        nextMatchPolicy: {
          mode: "close_room",
          timeoutMs: 0,
        },
      });
    }

    const activeCustomTables = Object.values(state.customTables || {}).filter(
      (ct) => ct && ct.status !== "closed"
    );
    const anyTableActiveHand =
      state.phase === "playing" ||
      state.phase === "dealer_turn" ||
      activeCustomTables.some((ct) => ct.phase === "playing" || ct.phase === "dealer_turn");

    const anyTablePendingBet =
      (state.phase === "betting" && state.seats.some((s) => s.isReady || s.hand !== null)) ||
      activeCustomTables.some(
        (ct) => ct.phase === "betting" && ct.seats.some((s) => s.isReady || s.hand !== null)
      );

    const hasPendingArchive = settledRounds.length > 0 || tournamentResults.length > 0;

    if (!anyTableActiveHand && !anyTablePendingBet && hasPendingArchive) {
      const carryover: BlackjackCarryover = {
        balances: state.balances,
        walletCoins: state.walletCoins,
        roundsPlayed: state.roundsPlayed,
        prizePoolCoins: state.prizePoolCoins,
        tournamentHistory: state.tournamentHistory,
        deck: state.deck,
        discardCount: state.discardCount,
        seatedPlayers: state.seats.map((s) => s.playerId),
        playerNames: state.playerNames || {},
        playerAvatars: state.playerAvatars || {},
        lastRoundSummary: state.lastRoundSummary || null,
        roundHistory: state.roundHistory || [],
        customTables: state.customTables || {},
        unlockedTablesByPlayer: state.unlockedTablesByPlayer || {},
        visits: state.visits ?? 1,
        totalTokensIssued: state.totalTokensIssued || 0,
        totalTokensPaidOut: state.totalTokensPaidOut || 0,
        totalRefillsCount: state.totalRefillsCount || 0,
        settledPhase: state.phase === "settled" ? "settled" : "betting",
        settledDealerHand: state.phase === "settled" ? state.dealerHand : null,
        settledSeats: state.phase === "settled" ? state.seats : undefined,
      };

      return sanitizeJson({
        over: true,
        summary: {
          ...(winnerPlayerId ? { winnerPlayerId } : {}),
          scores: state.balances,
          durationSeconds: state.elapsedSeconds,
          customMetrics: {
            roundsPlayed: state.roundsPlayed,
            ...(typeof state.randomSeedIndex === "number"
              ? { randomSeedIndex: state.randomSeedIndex }
              : {}),
            settlementUnit: state.lastSettlementUnit,
            settledRounds,
            tournamentResults,
          },
        },
        nextMatchPolicy: {
          mode: "auto_next_match",
          timeoutMs: 0,
          carryover: carryover as any,
        },
      });
    }

    return { over: false };
  },

  onCommand(
    cmd: GameCommand<BlackjackHostCommand>,
    prevState: RoyalBlackjackRoomState
  ): CommandResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    const broadcasts: unknown[] = [];
    const target = resolveTableTarget(state, cmd.data?.tableId);

    if (cmd.type === "close_table" || cmd.data?.action === "close_table") {
      if (target && isSubTable(target)) {
        target.status = "closed";
      } else {
        state.forceClose = true;
      }
    } else if ((cmd.type === "force_deal" || cmd.data?.action === "force_deal") && target) {
      prepareNextBettingPhaseIfSettled(state, target);
      if (target.phase === "betting") {
        dealInitialCards(state, target, broadcasts);
      }
    } else if (cmd.type === "update_stakes" && cmd.data?.action === "update_stakes" && target) {
      target.minBet = Math.max(1, Number(cmd.data.minBet) || target.minBet);
      target.maxBet = Math.max(target.minBet, Number(cmd.data.maxBet) || target.maxBet);
    }

    return sanitizeJson({
      state,
      joinable: computeRoomJoinable(state),
      playerViews: buildRoomPlayerViews(state) as any,
      broadcasts,
    });
  },
};
