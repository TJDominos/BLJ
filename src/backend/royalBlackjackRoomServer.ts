import {
  mulberry32,
  PlatformClient,
  createAgentObservation,
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
export const DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS = 5 * 60 * 1000;

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
  status: "waiting" | "playing" | "paused" | "closed" | "closing";
  tableCode?: string;
  hasTableCode?: boolean;
  isPublic: boolean;
  emptySince?: number | null;
  maxHostingTimeMs?: number;
  expiresAt?: number | null;
  seed: number;
  prngCalls: number;
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
  prngCalls: number;
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
}

/**
 * 权威房间状态机（纯 JSON 可序列化，不含任何非确定性字段）
 */
export interface RoyalBlackjackRoomState {
  matchId: string;
  matchSeq: number;
  seed: number;
  prngCalls: number;
  mode: "regular" | "tournament";
  winningRule: "standard" | "dealer_wins_ties";
  order: "sequential" | "random";
  minBet: number;
  maxBet: number;
  actionTimeLimitSec: number;
  phase: "betting" | "playing" | "dealer_turn" | "settled";
  players: string[];
  playerNames?: Record<string, string>;
  playerAvatars?: Record<string, string>;
  balances: Record<string, number>;
  walletCoins: Record<string, number>;
  prizePoolCoins: number;
  tournament?: TournamentSettings;
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
  customTables?: Record<string, OnlineSubTableState>;
  unlockedTablesByPlayer?: Record<string, string[]>;
  visits?: number;
  totalTokensIssued?: number;
  totalTokensPaidOut?: number;
  totalRefillsCount?: number;
  forceClose: boolean;
}

const SUITS: CardSuit[] = ["hearts", "diamonds", "clubs", "spades"];
const VALUES: CardValue[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/**
 * 使用 @randseed/server-sdk 的 Mulberry32 确定性 PRNG 生成并 Fisher-Yates 洗混 6 副牌靴 (312 张牌)
 */
export function createDeterministicShoe(
  seed: number,
  numDecks = gameRules.deckCount
): { deck: PlayingCard[]; prngCalls: number } {
  const rand = mulberry32(seed);
  let prngCalls = 0;
  const deck: PlayingCard[] = [];

  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({ suit, value });
      }
    }
  }

  for (let i = deck.length - 1; i > 0; i--) {
    const r = rand();
    prngCalls++;
    const j = Math.floor(r * (i + 1));
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return { deck, prngCalls };
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

function drawCardFromShoe(target: TableExecutionTarget): PlayingCard {
  if (target.deck.length === 0) {
    const { deck, prngCalls } = createDeterministicShoe(
      target.seed + target.roundsPlayed * 97 + target.prngCalls + 1,
      gameRules.deckCount
    );
    target.deck = deck;
    target.discardCount = 0;
    target.prngCalls += prngCalls;
  }
  target.discardCount += 1;
  return target.deck.pop()!;
}

function dealInitialCards(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget,
  broadcasts: unknown[]
): void {
  // 检查切牌卡渗透率（6 副牌 312 张，75% 渗透率即剩余不足 78 张时在新一局发牌前重洗）
  const totalShoeCards = gameRules.deckCount * 52;
  const minRemainingBeforeCutCard = Math.floor(totalShoeCards * (1 - gameRules.shufflePenetration));
  if (target.deck.length < minRemainingBeforeCutCard) {
    const { deck, prngCalls } = createDeterministicShoe(
      target.seed + target.roundsPlayed * 131 + 1,
      gameRules.deckCount
    );
    target.deck = deck;
    target.discardCount = 0;
    target.prngCalls += prngCalls;
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

  // 生成本局行动顺序（默认从右至左 seats.length-1 -> 0；若配置为 random 则使用确定性 PRNG 洗混座位顺序）
  const baseOrder = Array.from({ length: target.seats.length }, (_, i) => target.seats.length - 1 - i);
  if (target.order === "random") {
    const rand = mulberry32(target.seed + target.roundsPlayed * 31 + 7);
    for (let i = baseOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = baseOrder[i];
      baseOrder[i] = baseOrder[j];
      baseOrder[j] = tmp;
    }
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

function buildSettlementUnit(
  rootState: RoyalBlackjackRoomState,
  target: TableExecutionTarget,
  perPlayerStats: Map<
    string,
    {
      handsPlayed: number;
      handsWon: number;
      handsLost: number;
      handsPushed: number;
      blackjackCount: number;
      netCoinsDelta: number;
      grossWager: number;
      grossPayout: number;
    }
  >
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
    timestampMs: Math.max(1000, Math.round(rootState.elapsedSeconds * 1000)),
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

  const perPlayerStats = new Map<
    string,
    {
      handsPlayed: number;
      handsWon: number;
      handsLost: number;
      handsPushed: number;
      blackjackCount: number;
      netCoinsDelta: number;
      grossWager: number;
      grossPayout: number;
    }
  >();

  const winnings: Record<string, number> = {};
  const seatResults: SeatResult[] = [];
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
      isSplit: Boolean(seat.isSplitHand || seat.originalSeatIndex !== undefined),
      win: totalPayout,
      net: netDelta,
      action: h.status,
      score: h.score,
    });

    pStat.handsPlayed += 1;
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

      target.tournamentHistory.unshift({
        id: `T-${String(target.tournamentHistory.length + 1).padStart(4, "0")}`,
        timestamp: Math.max(1000, Math.round(rootState.elapsedSeconds * 1000)),
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
      });

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
  const summaryObj: RoomRoundSummary = {
    roundId: target.lastSettlementUnit.settlementUnitId,
    timestamp: Math.max(1000, Math.round(rootState.elapsedSeconds * 1000)),
    winnings,
    seatResults,
    dealerScore: dScore,
  };
  target.lastRoundSummary = summaryObj;
  target.roundHistory = [summaryObj, ...(target.roundHistory || [])].slice(0, 100);

  if (isSubTable(target)) {
    if (target.status === "closing") {
      if (target.houseId !== "system" && target.liquidity > 0) {
        const returned = target.liquidity;
        target.liquidity = 0;
        syncPlayerRegularBalanceAcrossTables(
          rootState,
          target.houseId,
          (rootState.walletCoins[target.houseId] || 0) + returned
        );
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
  version: "1.0.0",
  unitTypes: ["hand"],
  metrics: [
    { id: "hands_played", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "hands_won", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "hands_lost", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "hands_pushed", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
    { id: "blackjack_count", scope: "participant", unit: "count", unitTypes: ["hand"], aggregation: "sum" },
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
          const returned = ct.liquidity;
          ct.liquidity = 0;
          syncPlayerRegularBalanceAcrossTables(
            state,
            ct.houseId,
            (state.walletCoins[ct.houseId] || 0) + returned
          );
        }
        ct.seats = ct.seats.map((s) => ({ ...s, playerId: null, hand: null, isReady: false }));
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
    const tableSeed = state.seed + nextNum * 7919;
    const shoe = createDeterministicShoe(tableSeed, gameRules.deckCount);
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
      seed: tableSeed,
      prngCalls: shoe.prngCalls,
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
      deck: shoe.deck,
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

async function syncPlatformPlayersToState(state: RoyalBlackjackRoomState): Promise<void> {
  if (typeof window !== "undefined") return;
  try {
    const players = await Promise.race([
      randseedPlatformClient.getPlayers(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
    ]);
    if (!Array.isArray(players)) return;
    if (!state.playerNames) state.playerNames = {};
    if (!state.playerAvatars) state.playerAvatars = {};
    for (const p of players) {
      if (!p || typeof p.playerId !== "string") continue;
      const pid = p.playerId.trim();
      if (!pid) continue;
      if (!state.players.includes(pid)) {
        state.players.push(pid);
      }
      if (typeof p.displayName === "string" && p.displayName.trim()) {
        state.playerNames[pid] = p.displayName.trim();
      }
      if (typeof p.avatarUrl === "string" && p.avatarUrl.trim()) {
        state.playerAvatars[pid] = p.avatarUrl.trim();
      }
    }
  } catch {
    // Platform vhost not reachable outside container environment
  }
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
    const priv = (projection.privateStates[playerId] as any) || {
      playerId,
      balance: rawState.balances?.[playerId] || 0,
      walletCoins: rawState.walletCoins?.[playerId] || 0,
      mySeats: [],
      unlockedTableIds: rawState.unlockedTablesByPlayer?.[playerId] || [],
      ownedTableCodes: {},
    };
    const isMyTurn =
      rawState.phase === "playing" &&
      rawState.currentTurnSeatIndex >= 0 &&
      rawState.seats?.[rawState.currentTurnSeatIndex]?.playerId === playerId;
    const canBet =
      (rawState.phase === "betting" || rawState.phase === "settled") &&
      Boolean(rawState.seats?.some((s) => s.playerId === playerId && !s.isReady));

    const compactAvatars: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawState.playerAvatars || {})) {
      if (typeof v === "string" && v.length <= 256) {
        compactAvatars[k] = v;
      }
    }

    const compactPublicState = {
      ...(projection.publicState as Record<string, unknown>),
      tournamentHistory: Array.isArray(rawState.tournamentHistory)
        ? rawState.tournamentHistory.slice(0, 3)
        : [],
      playerAvatars: compactAvatars,
    };

    return sanitizeJson({
      publicState: compactPublicState as any,
      privateState: priv,
      visibleEvents: request.committedEvents.slice(-5),
      decision: {
        canAct: Boolean(isMyTurn || canBet),
        deadlineAt: null,
      },
    });
  },

  manifest(): GameManifest {
    const envMax = Number(process.env.RANDSEED_MAX_PLAYERS || process.env.MAX_PLAYERS);
    const maxPlayers = envMax && envMax >= 1 ? Math.min(7, envMax) : 7;
    return {
      title: "Royal BlackJack",
      version: ROYAL_BLACKJACK_RULES_VERSION,
      minPlayers: 1,
      maxPlayers,
      tickRateHz: 5,
      persistentTable: true,
      resultDefinition: ROYAL_BLACKJACK_RESULT_DEFINITION,
      optionsSchema: {
        type: "object",
        properties: {
          seed: { type: "number" },
          mode: { type: "string", enum: ["regular", "tournament"] },
          minBet: { type: "number" },
          maxBet: { type: "number" },
          maxSeats: { type: "number" },
          actionTimeLimitSec: { type: "number" },
          winningRule: { type: "string", enum: ["standard", "dealer_wins_ties"] },
          order: { type: "string", enum: ["sequential", "random"] },
        },
        required: ["seed"],
      },
    };
  },

  async init(config: MatchConfig): Promise<InitResult<RoyalBlackjackRoomState>> {
    const opts = config.options || {};
    const seed = Number(opts.seed) || 1;
    const maxSeats = Math.min(7, Math.max(1, Number(opts.maxSeats) || 7));
    const mode = opts.mode === "tournament" ? "tournament" : "regular";
    const minBet = Math.max(1, Number(opts.minBet) || 10);
    const maxBet = Math.max(minBet, Number(opts.maxBet) || 500);
    const actionTimeLimitSec = Math.max(5, Number(opts.actionTimeLimitSec) || 20);
    const winningRule =
      opts.winningRule === "dealer_wins_ties" ? "dealer_wins_ties" : "standard";
    const order = opts.order === "random" ? "random" : "sequential";

    const carryover = (config.carryover as unknown as BlackjackCarryover | null) || null;
    const tournamentOpts = (opts.tournament as TournamentSettings | undefined) || undefined;

    const balances: Record<string, number> = { ...(carryover?.balances || {}) };
    const walletCoins: Record<string, number> = { ...(carryover?.walletCoins || {}) };
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

    // 若 Carryover 中已有未打穿 75% 切牌卡的牌靴则继续沿用，否则生成新的 6 副确定性牌靴
    const totalShoeCards = gameRules.deckCount * 52;
    const minRemainingBeforeCutCard = Math.floor(totalShoeCards * (1 - gameRules.shufflePenetration));
    let deck: PlayingCard[];
    let discardCount: number;
    let prngCalls: number;

    if (carryover?.deck && carryover.deck.length >= minRemainingBeforeCutCard) {
      deck = [...carryover.deck];
      discardCount = carryover.discardCount || totalShoeCards - deck.length;
      prngCalls = carryover.prngCalls || 0;
    } else {
      const fresh = createDeterministicShoe(
        seed + (carryover?.roundsPlayed || 0) * 131,
        gameRules.deckCount
      );
      deck = fresh.deck;
      discardCount = 0;
      prngCalls = fresh.prngCalls;
    }

    const seats: RoomSeatState[] = Array.from({ length: maxSeats }, (_, idx) => {
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
      seed,
      prngCalls,
      mode,
      winningRule,
      order,
      minBet,
      maxBet,
      actionTimeLimitSec,
      phase: "betting",
      players: [...config.players],
      playerNames,
      playerAvatars,
      balances,
      walletCoins,
      prizePoolCoins: carryover?.prizePoolCoins || 0,
      ...(tournamentOpts ? { tournament: tournamentOpts } : {}),
      tournamentHistory: carryover?.tournamentHistory || [],
      seats,
      dealerHand: null,
      deck,
      discardCount,
      turnOrder: Array.from({ length: maxSeats }, (_, i) => maxSeats - 1 - i),
      currentTurnSeatIndex: -1,
      phaseStartElapsedSec: 0,
      elapsedSeconds: 0,
      roundsPlayed: carryover?.roundsPlayed || 0,
      lastSettlementUnit: null,
      lastRoundSummary: carryover?.lastRoundSummary || null,
      roundHistory: carryover?.roundHistory || [],
      customTables: carryover?.customTables ? JSON.parse(JSON.stringify(carryover.customTables)) : {},
      unlockedTablesByPlayer: carryover?.unlockedTablesByPlayer
        ? JSON.parse(JSON.stringify(carryover.unlockedTablesByPlayer))
        : {},
      visits: carryover?.visits ?? 1,
      totalTokensIssued,
      totalTokensPaidOut: carryover?.totalTokensPaidOut || 0,
      totalRefillsCount: carryover?.totalRefillsCount || 0,
      forceClose: false,
    };

    await syncPlatformPlayersToState(state);

    return sanitizeJson({
      state,
      broadcasts: [
        {
          type: "match:initialized",
          matchId: config.matchId,
          matchSeq: config.matchSeq,
          projection: projectBlackjackRoomState(state).publicState,
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
    const broadcasts: unknown[] = [];
    const actionResults: GameActionResult[] = [];

    const prevRoundsByTable = new Map<string, number>();
    prevRoundsByTable.set("table_1", state.roundsPlayed);
    for (const [tid, ct] of Object.entries(state.customTables)) {
      prevRoundsByTable.set(tid, ct.roundsPlayed);
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
      const { playerId, data } = input;
      if (typeof input.actionId === "string" && input.actionId.trim().length > 0) {
        actionResults.push({
          actionId: input.actionId,
          status: "applied",
        });
      }
      if (!data || typeof data !== "object") continue;

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
          state.playerNames[playerId] = data.name.trim();
        }
        if (typeof data.avatar === "string" && data.avatar.trim()) {
          state.playerAvatars[playerId] = data.avatar.trim();
        }
        for (const ct of Object.values(state.customTables)) {
          if (ct.houseId === playerId) {
            if (state.playerNames[playerId]) ct.houseName = state.playerNames[playerId];
            if (state.playerAvatars[playerId]) ct.houseAvatar = state.playerAvatars[playerId];
          }
        }
        continue;
      }

      if (data.action === "create_table") {
        if (typeof data.playerName === "string" && data.playerName.trim()) {
          state.playerNames[playerId] = data.playerName.trim();
        }
        if (typeof data.playerAvatar === "string" && data.playerAvatar.trim()) {
          state.playerAvatars[playerId] = data.playerAvatar.trim();
        }
        const s = data.settings || ({} as TableSettings);
        const trimmedName =
          (typeof s.name === "string" && s.name.trim()) ||
          `${state.playerNames[playerId] || "Creator"}'s Table`;
        const rawCode = typeof s.tableCode === "string" ? s.tableCode.trim() : "";
        const hasCode = /^\d{4}$/.test(rawCode);
        const mode = s.mode === "tournament" ? "tournament" : "regular";
        const maxSeats = Math.min(7, Math.max(1, Number(s.maxSeats) || 5));
        const minBet = Math.max(
          1,
          Number(mode === "tournament" ? s.tournament?.minBetChips || s.minBet : s.minBet) || 10
        );
        const maxBet = Math.max(
          minBet,
          Number(mode === "tournament" ? s.tournament?.startingChips || s.maxBet : s.maxBet) || 200
        );
        const actionTimeLimitSec = Math.max(5, Number(s.actionTimeLimit) || 20);
        const winningRule =
          s.winningRule === "dealer_wins_ties" ? "dealer_wins_ties" : "standard";
        const order = s.order === "random" ? "random" : "sequential";
        const requestedLiq = mode === "tournament" ? 0 : Math.max(0, Number(data.liquidity) || 0);

        const newTableId =
          typeof data.tableId === "string" &&
          data.tableId.trim() &&
          data.tableId !== "table_1" &&
          !state.customTables[data.tableId.trim()]
            ? data.tableId.trim()
            : `table_${Math.floor(
                mulberry32(
                  state.seed + Object.keys(state.customTables).length * 997 + ctx.tick + 13
                )() * 1e9
              ).toString(36)}`;

        const tableSeed =
          state.seed + (Object.keys(state.customTables).length + 1) * 4099 + ctx.tick;
        const shoe = createDeterministicShoe(tableSeed, gameRules.deckCount);
        const nowMs = Math.max(1000, Math.round(state.elapsedSeconds * 1000));

        const subTable: OnlineSubTableState = {
          id: newTableId,
          name: trimmedName,
          description: typeof s.description === "string" ? s.description : "",
          houseId: playerId,
          houseName: state.playerNames[playerId] || playerId,
          houseAvatar: state.playerAvatars[playerId],
          createdAt: nowMs,
          visits: 1,
          liquidity: requestedLiq,
          initialLiquidity: requestedLiq,
          status: "waiting",
          tableCode: hasCode ? rawCode : undefined,
          hasTableCode: hasCode,
          isPublic: hasCode ? false : Boolean(s.isPublic ?? true),
          emptySince: nowMs,
          maxHostingTimeMs: DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS,
          expiresAt: nowMs + DEFAULT_CUSTOM_TABLE_MAX_HOSTING_TIME_MS,
          seed: tableSeed,
          prngCalls: shoe.prngCalls,
          mode,
          winningRule,
          order,
          minBet,
          maxBet,
          actionTimeLimitSec,
          phase: "betting",
          balances: mode === "regular" ? { [playerId]: state.walletCoins[playerId] || DEFAULT_GAME_COINS } : {},
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
          deck: shoe.deck,
          discardCount: 0,
          turnOrder: Array.from({ length: maxSeats }, (_, i) => maxSeats - 1 - i),
          currentTurnSeatIndex: -1,
          phaseStartElapsedSec: state.elapsedSeconds,
          roundsPlayed: 0,
          lastSettlementUnit: null,
          lastRoundSummary: null,
          roundHistory: [],
        };

        state.customTables[newTableId] = subTable;
        if (!state.unlockedTablesByPlayer[playerId]) {
          state.unlockedTablesByPlayer[playerId] = [];
        }
        if (!state.unlockedTablesByPlayer[playerId].includes(newTableId)) {
          state.unlockedTablesByPlayer[playerId].push(newTableId);
        }

        broadcasts.push({
          type: "table:created",
          tableId: newTableId,
          houseId: playerId,
        });
        continue;
      }

      if (data.action === "verify_table_code") {
        const ct = state.customTables[data.tableId];
        if (ct && ct.status !== "closed") {
          const submitted = typeof data.tableCode === "string" ? data.tableCode.trim() : "";
          if (!ct.tableCode || ct.houseId === playerId || submitted === ct.tableCode.trim()) {
            if (!state.unlockedTablesByPlayer[playerId]) {
              state.unlockedTablesByPlayer[playerId] = [];
            }
            if (!state.unlockedTablesByPlayer[playerId].includes(ct.id)) {
              state.unlockedTablesByPlayer[playerId].push(ct.id);
            }
          }
        }
        continue;
      }

      if (data.action === "update_table_settings") {
        const ct = state.customTables[data.tableId];
        if (ct && ct.houseId === playerId && ct.status !== "closed") {
          const s = data.settings || {};
          if (typeof s.name === "string" && s.name.trim()) ct.name = s.name.trim();
          if (typeof s.description === "string") ct.description = s.description;
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
          if (typeof s.tableCode === "string") {
            const rawCode = s.tableCode.trim();
            if (/^\d{4}$/.test(rawCode)) {
              ct.tableCode = rawCode;
              ct.hasTableCode = true;
              ct.isPublic = false;
            } else if (rawCode === "") {
              delete ct.tableCode;
              ct.hasTableCode = false;
              ct.isPublic = true;
            }
          }
        }
        continue;
      }

      if (data.action === "deposit_liquidity") {
        const ct = state.customTables[data.tableId];
        const amt = Math.max(0, Number(data.amount) || 0);
        if (ct && ct.houseId === playerId && amt > 0) {
          ct.liquidity += amt;
          const req = ct.maxBet * ct.seats.length;
          if (ct.liquidity >= req && (ct.status === "paused" || ct.status === "closed")) {
            ct.status = "waiting";
          }
        }
        continue;
      }

      if (data.action === "withdraw_liquidity") {
        const ct = state.customTables[data.tableId];
        const amt = Math.max(0, Number(data.amount) || 0);
        if (ct && ct.houseId === playerId && amt > 0 && amt <= ct.liquidity) {
          ct.liquidity -= amt;
          syncPlayerRegularBalanceAcrossTables(
            state,
            playerId,
            (state.walletCoins[playerId] || 0) + amt
          );
          if (ct.liquidity <= 0 && ct.mode === "regular") {
            ct.status = "paused";
          }
        }
        continue;
      }

      if (data.action === "pause_table") {
        const ct = state.customTables[data.tableId];
        if (ct && ct.houseId === playerId && ct.status !== "closed") {
          ct.status = "paused";
        }
        continue;
      }

      if (data.action === "resume_table") {
        const ct = state.customTables[data.tableId];
        if (ct && ct.houseId === playerId && ct.status === "paused") {
          ct.status = "waiting";
        }
        continue;
      }

      if (data.action === "close_table") {
        const ct = state.customTables[data.tableId];
        if (ct && ct.houseId === playerId && ct.status !== "closed") {
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
              const returned = ct.liquidity;
              ct.liquidity = 0;
              syncPlayerRegularBalanceAcrossTables(
                state,
                playerId,
                (state.walletCoins[playerId] || 0) + returned
              );
            }
            ct.seats = ct.seats.map((s) => ({
              ...s,
              playerId: null,
              hand: null,
              isReady: false,
            }));
            ct.status = "closed";
          }
        }
        continue;
      }

      if (data.action === "record_visit") {
        const target = resolveTableTarget(state, data.tableId);
        if (target) {
          if (isSubTable(target)) {
            target.visits = (target.visits || 0) + 1;
          } else {
            state.visits = (state.visits || 0) + 1;
          }
        }
        continue;
      }

      const target = resolveTableTarget(state, "tableId" in data ? data.tableId : undefined);
      if (!target) continue;
      if (isSubTable(target) && (target.status === "closed" || target.status === "paused")) {
        continue;
      }

      if (data.action === "ready_next" || data.action === "unlock_table_balance") {
        prepareNextBettingPhaseIfSettled(state, target);
      } else if (data.action === "claim_refill") {
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
        }
      } else if (data.action === "join_seat") {
        prepareNextBettingPhaseIfSettled(state, target);
        if (typeof data.playerName === "string" && data.playerName.trim()) {
          state.playerNames[playerId] = data.playerName.trim();
        }
        if (typeof data.playerAvatar === "string" && data.playerAvatar.trim()) {
          state.playerAvatars[playerId] = data.playerAvatar.trim();
        }
        if (isSubTable(target) && target.tableCode && target.houseId !== playerId) {
          const isUnlocked = state.unlockedTablesByPlayer[playerId]?.includes(target.id);
          const submitted = typeof data.tableCode === "string" ? data.tableCode.trim() : "";
          if (!isUnlocked && submitted !== target.tableCode.trim()) {
            continue;
          }
          if (!isUnlocked) {
            if (!state.unlockedTablesByPlayer[playerId]) {
              state.unlockedTablesByPlayer[playerId] = [];
            }
            state.unlockedTablesByPlayer[playerId].push(target.id);
          }
        }
        const seat = target.seats[data.seatIndex];
        if (seat && !seat.playerId && target.phase === "betting") {
          if (target.mode === "tournament" && target.tournament) {
            if (target.seats.some((s) => s.playerId === playerId)) continue;
            const ticketPriceCoins = Math.max(0, target.tournament.ticketPrice || 100);
            const lockedAllowance = Math.max(
              100,
              target.tournament.startingChips || DEFAULT_GAME_COINS
            );
            const playerWallet = state.walletCoins[playerId] ?? DEFAULT_GAME_COINS;
            if ((target.balances[playerId] || 0) <= 0) {
              if (playerWallet < ticketPriceCoins) continue;
              syncPlayerRegularBalanceAcrossTables(
                state,
                playerId,
                playerWallet - ticketPriceCoins
              );
              target.prizePoolCoins += ticketPriceCoins;
              target.balances[playerId] = lockedAllowance;
            }
            seat.playerId = playerId;
          } else {
            seat.playerId = playerId;
            if (typeof target.balances[playerId] !== "number" || target.balances[playerId] <= 0) {
              target.balances[playerId] = state.walletCoins[playerId] || DEFAULT_GAME_COINS;
            }
          }
        }
      } else if (data.action === "leave_seat") {
        prepareNextBettingPhaseIfSettled(state, target);
        if (target.mode === "tournament") continue;
        const indicesToLeave =
          typeof data.seatIndex === "number"
            ? [data.seatIndex]
            : target.seats
                .map((s, idx) => (s.playerId === playerId ? idx : -1))
                .filter((idx) => idx >= 0);

        for (const sIdx of indicesToLeave) {
          const seat = target.seats[sIdx];
          if (seat && seat.playerId === playerId && target.phase === "betting") {
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
          }
        }
      } else if (data.action === "place_bet") {
        prepareNextBettingPhaseIfSettled(state, target);
        if (target.phase !== "betting") continue;
        const seat = target.seats[data.seatIndex];
        if (!seat) continue;
        if (!seat.playerId && target.mode === "regular") {
          seat.playerId = playerId;
          if (typeof target.balances[playerId] !== "number" || target.balances[playerId] <= 0) {
            target.balances[playerId] = state.walletCoins[playerId] || DEFAULT_GAME_COINS;
          }
        }
        if (seat.playerId !== playerId) continue;

        // If seat already placed a bet in this betting phase, refund previous bet before replacing
        if (seat.hand && seat.hand.bet > 0) {
          const prevCost =
            seat.hand.bet +
            (seat.hand.sideBets?.pair || 0) +
            (seat.hand.sideBets?.twentyOnePlusThree || 0);
          target.balances[playerId] = (target.balances[playerId] || 0) + prevCost;
          if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
            target.liquidity = Math.max(0, target.liquidity - prevCost);
          }
        }

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
          target.balances[playerId] = state.walletCoins[playerId] ?? target.balances[playerId] ?? 0;
        }
        const playerBal = target.balances[playerId] || 0;

        if (playerBal >= totalCost) {
          target.balances[playerId] = playerBal - totalCost;
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
        }
      } else if (data.action === "start_game") {
        prepareNextBettingPhaseIfSettled(state, target);
        if (target.phase === "betting") {
          const readyCount = target.seats.filter((s) => s.playerId !== null && s.isReady).length;
          if (readyCount > 0) {
            if (target.mode === "regular") {
              for (const seat of target.seats) {
                if (seat.playerId && !seat.isReady) {
                  seat.playerId = null;
                  seat.hand = null;
                }
              }
            }
            dealInitialCards(state, target, broadcasts);
          }
        }
      } else if (
        target.phase === "playing" &&
        "seatIndex" in data &&
        target.currentTurnSeatIndex === data.seatIndex
      ) {
        const seat = target.seats[data.seatIndex];
        if (!seat || seat.playerId !== playerId || !seat.hand) continue;

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
        } else if (data.action === "stand") {
          seat.hand.status = "stood";
          advanceTurnOrSettle(state, target, broadcasts);
        } else if (data.action === "double_down" && seat.hand.cards.length === 2) {
          const extraBet = seat.hand.bet;
          if ((target.balances[playerId] || 0) >= extraBet) {
            target.balances[playerId] -= extraBet;
            if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
              target.liquidity += extraBet;
            }
            if (target.mode === "regular") {
              syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
            }
            seat.hand.bet += extraBet;
            const card = drawCardFromShoe(target);
            seat.hand.cards.push(card);
            seat.hand.score = calculateHandScore(seat.hand.cards);
            seat.hand.status = seat.hand.score > 21 ? "busted" : "stood";
            advanceTurnOrSettle(state, target, broadcasts);
          }
        } else if (
          data.action === "split" &&
          seat.hand.cards.length === 2 &&
          seat.hand.cards[0].value === seat.hand.cards[1].value
        ) {
          const splitBet = seat.hand.bet;
          const origIdx = seat.originalSeatIndex ?? seat.seatIndex;
          const currentSplitCount = target.seats.filter(
            (s) => (s.originalSeatIndex ?? s.seatIndex) === origIdx
          ).length;

          if ((target.balances[playerId] || 0) >= splitBet && currentSplitCount < 4) {
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
            // 分 A 规则：每手只发 1 张牌且自动停牌；分牌后拿到 21 点计为普通 21 点 (stood, 1:1)，不算 Natural Blackjack (3:2)
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

            // 同步更新 turnOrder（将新分出的座位插入当前座位紧后方）
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
          }
        } else if (
          data.action === "buy_insurance" &&
          target.dealerHand?.cards[0]?.value === "A" &&
          seat.hand.cards.length === 2 &&
          !seat.isSplitHand &&
          seat.hand.insuranceBet === 0
        ) {
          const insCost = seat.hand.bet / 2;
          if ((target.balances[playerId] || 0) >= insCost) {
            target.balances[playerId] -= insCost;
            if (isSubTable(target) && target.houseId !== "system" && target.mode === "regular") {
              target.liquidity += insCost;
            }
            if (target.mode === "regular") {
              syncPlayerRegularBalanceAcrossTables(state, playerId, target.balances[playerId]);
            }
            seat.hand.insuranceBet = insCost;
          }
        }
      }
    }

    // 确定性超时裁决（遍历主桌及所有在线自建桌/扩容桌）
    const allTargets: TableExecutionTarget[] = [
      state,
      ...Object.values(state.customTables).filter((ct) => ct.status !== "closed"),
    ];
    for (const target of allTargets) {
      if (
        target.phase === "playing" &&
        ctx.elapsedSeconds - target.phaseStartElapsedSec >= target.actionTimeLimitSec
      ) {
        const activeSeat = target.seats[target.currentTurnSeatIndex];
        if (activeSeat?.hand && activeSeat.hand.status === "playing") {
          activeSeat.hand.status = "stood";
          advanceTurnOrSettle(state, target, broadcasts);
        }
      }
    }

    reconcileOnlineRoomTables(state);

    const resultUnits: GameResultEvent[] = [];
    if (
      state.phase === "settled" &&
      state.roundsPlayed > (prevRoundsByTable.get("table_1") ?? 0)
    ) {
      resultUnits.push(...buildResultUnitEventsFromSettlement(state, state.matchId));
    }
    for (const [tid, ct] of Object.entries(state.customTables)) {
      if (ct.phase === "settled" && ct.roundsPlayed > (prevRoundsByTable.get(tid) ?? 0)) {
        resultUnits.push(...buildResultUnitEventsFromSettlement(ct, state.matchId));
      }
    }

    return sanitizeJson({
      state,
      broadcasts,
      persist: resultUnits.length > 0 || ctx.tick % 10 === 0,
      ...(resultUnits.length > 0 ? { resultUnits } : {}),
      ...(actionResults.length > 0 ? { actionResults } : {}),
    });
  },

  async onPlayerJoin(
    playerId: string,
    prevState: RoyalBlackjackRoomState
  ): Promise<PlayerEventResult<RoyalBlackjackRoomState>> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    if (!state.players.includes(playerId)) {
      state.players.push(playerId);
    }
    if (!state.playerNames) state.playerNames = {};
    if (!state.playerAvatars) state.playerAvatars = {};
    await syncPlatformPlayersToState(state);
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
      broadcasts: [{ type: "player:joined", playerId }],
    });
  },

  onPlayerLeave(
    playerId: string,
    prevState: RoyalBlackjackRoomState
  ): PlayerEventResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    state.players = state.players.filter((p) => p !== playerId);
    if (state.mode !== "tournament") {
      for (const seat of state.seats) {
        if (seat.playerId === playerId && state.phase === "betting") {
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
            if (seat.playerId === playerId) {
              seat.playerId = null;
              seat.isReady = false;
              seat.hand = null;
            }
          }
        }
      }
    }
    return sanitizeJson({
      state,
      broadcasts: [{ type: "player:left", playerId }],
    });
  },

  isGameOver(state: RoyalBlackjackRoomState): GameResult {
    if (state.forceClose) {
      return sanitizeJson({
        over: true,
        summary: {
          scores: state.balances,
          durationSeconds: state.elapsedSeconds,
        },
        nextMatchPolicy: {
          mode: "close_room",
          timeoutMs: 0,
        },
      });
    }

    const anySubTablePlaying = Object.values(state.customTables || {}).some(
      (ct) => ct.phase === "playing" || ct.phase === "dealer_turn"
    );

    if (state.phase === "settled" && !anySubTablePlaying) {
      const carryover: BlackjackCarryover = {
        balances: state.balances,
        walletCoins: state.walletCoins,
        roundsPlayed: state.roundsPlayed,
        prizePoolCoins: state.prizePoolCoins,
        tournamentHistory: state.tournamentHistory,
        deck: state.deck,
        discardCount: state.discardCount,
        prngCalls: state.prngCalls,
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
      };

      return sanitizeJson({
        over: true,
        summary: {
          scores: state.balances,
          durationSeconds: state.elapsedSeconds,
          customMetrics: {
            roundsPlayed: state.roundsPlayed,
            settlementUnit: state.lastSettlementUnit,
          },
        },
        nextMatchPolicy: {
          mode: "auto_next_match",
          timeoutMs: 3000,
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

    return sanitizeJson({ state, broadcasts });
  },
};
