import {
  mulberry32,
  PlatformClient,
  createAgentObservation,
  type AgentObservation,
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
} from "@randseed/server-sdk";
import {
  CardSuit,
  CardValue,
  PlayingCard,
  HandStatus,
  SideBets,
  TournamentSettings,
  TournamentRecord,
} from "../store/gameStore";
import { gameRules } from "../config/gameRules";
import {
  ROYAL_BLACKJACK_RULES_VERSION,
  projectBlackjackRoomState,
  SettlementUnitEnvelope,
  SettlementParticipantResult,
  LedgerTransferEntry,
  ParticipantOutcome,
} from "./platformContract";

export const DEFAULT_GAME_COINS = 5000;

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
 * 玩家操作输入类型（由前端 RoomClient.sendInput 发送）
 */
export type BlackjackPlayerInput =
  | { action: "join_seat"; seatIndex: number }
  | { action: "leave_seat"; seatIndex: number }
  | { action: "place_bet"; seatIndex: number; amount: number; sideBets?: SideBets }
  | { action: "hit"; seatIndex: number }
  | { action: "stand"; seatIndex: number }
  | { action: "double_down"; seatIndex: number }
  | { action: "split"; seatIndex: number }
  | { action: "buy_insurance"; seatIndex: number }
  | { action: "claim_refill" }
  | { action: "ready_next" };

/**
 * 平台或房主可信管理指令（POST /onCommand）
 */
export type BlackjackHostCommand =
  | { action: "force_deal" }
  | { action: "update_stakes"; minBet: number; maxBet: number }
  | { action: "close_table" };

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

/**
 * 跨局结转状态 (Carryover)：
 * 常驻牌桌在局与局之间保留玩家筹码、Gcoin钱包、锦标赛进度以及当前 6 副牌靴进度（直至达到 75% 切牌卡才重新洗牌）
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

/**
 * 按本局 `turnOrder` 查找下一个仍处于 `playing` 状态的座位索引
 */
function findNextPlayingSeatInTurnOrder(state: RoyalBlackjackRoomState, afterSeatIndex?: number): number {
  const order =
    state.turnOrder && state.turnOrder.length === state.seats.length
      ? state.turnOrder
      : state.seats.map((_, idx) => idx);

  let startPos = 0;
  if (typeof afterSeatIndex === "number" && afterSeatIndex >= 0) {
    const curPos = order.indexOf(afterSeatIndex);
    startPos = curPos >= 0 ? curPos + 1 : 0;
  }

  for (let p = startPos; p < order.length; p++) {
    const idx = order[p];
    const seat = state.seats[idx];
    if (seat && seat.playerId && seat.hand && seat.hand.status === "playing") {
      return idx;
    }
  }
  return -1;
}

function drawCardFromShoe(state: RoyalBlackjackRoomState): PlayingCard {
  if (state.deck.length === 0) {
    const { deck, prngCalls } = createDeterministicShoe(
      state.seed + state.roundsPlayed * 97 + state.prngCalls + 1,
      gameRules.deckCount
    );
    state.deck = deck;
    state.discardCount = 0;
    state.prngCalls += prngCalls;
  }
  state.discardCount += 1;
  return state.deck.pop()!;
}

function dealInitialCards(state: RoyalBlackjackRoomState, broadcasts: unknown[]): void {
  // 检查切牌卡渗透率（6 副牌 312 张，75% 渗透率即剩余不足 78 张时在新一局发牌前重洗）
  const totalShoeCards = gameRules.deckCount * 52;
  const minRemainingBeforeCutCard = Math.floor(totalShoeCards * (1 - gameRules.shufflePenetration));
  if (state.deck.length < minRemainingBeforeCutCard) {
    const { deck, prngCalls } = createDeterministicShoe(
      state.seed + state.roundsPlayed * 131 + 1,
      gameRules.deckCount
    );
    state.deck = deck;
    state.discardCount = 0;
    state.prngCalls += prngCalls;
  }

  // 锦标赛模式：对未下注的在座玩家自动下最低注（禁止跳过），并执行前注 (Forced Ante)
  if (state.mode === "tournament") {
    const minBetReq = Math.max(1, state.tournament?.minBetChips || state.minBet || 50);
    for (const seat of state.seats) {
      if (seat.playerId && (!seat.hand || seat.hand.bet <= 0)) {
        const pid = seat.playerId;
        const avail = state.balances[pid] || 0;
        const autoBet = Math.min(avail, minBetReq);
        if (autoBet > 0) {
          state.balances[pid] = avail - autoBet;
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

    if (state.tournament?.isForcedAnte) {
      const anteAmt = Math.max(
        1,
        Math.round(((state.tournament.startingChips || DEFAULT_GAME_COINS) * (state.tournament.antePct || 1)) / 100)
      );
      for (const seat of state.seats) {
        if (seat.playerId && seat.hand && seat.hand.bet > 0) {
          const pid = seat.playerId;
          const avail = state.balances[pid] || 0;
          const actualAnte = Math.min(avail, anteAmt);
          if (actualAnte > 0) {
            state.balances[pid] = avail - actualAnte;
            seat.hand.bet += actualAnte;
          }
        }
      }
    }
  }

  // 生成本局行动顺序（默认从右至左 seats.length-1 -> 0；若配置为 random 则使用确定性 PRNG 洗混座位顺序）
  const baseOrder = Array.from({ length: state.seats.length }, (_, i) => state.seats.length - 1 - i);
  if (state.order === "random") {
    const rand = mulberry32(state.seed + state.roundsPlayed * 31 + 7);
    for (let i = baseOrder.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = baseOrder[i];
      baseOrder[i] = baseOrder[j];
      baseOrder[j] = tmp;
    }
  }
  state.turnOrder = baseOrder;

  // 第一轮发牌：按行动顺序给每个已下注座位发第 1 张明牌
  for (const idx of state.turnOrder) {
    const seat = state.seats[idx];
    if (seat && seat.playerId && seat.hand && seat.hand.bet > 0) {
      seat.hand.cards.push(drawCardFromShoe(state));
    }
  }

  // 庄家第 1 张明牌
  const dealerUpCard = drawCardFromShoe(state);

  // 第二轮发牌：按行动顺序给每个已下注座位发第 2 张明牌，立即裁决边注与天牌 Natural Blackjack
  for (const idx of state.turnOrder) {
    const seat = state.seats[idx];
    if (seat && seat.playerId && seat.hand && seat.hand.bet > 0) {
      seat.hand.cards.push(drawCardFromShoe(state));
      seat.hand.score = calculateHandScore(seat.hand.cards);

      const sideResult = evaluateSideBets(
        seat.hand.cards[0],
        seat.hand.cards[1],
        dealerUpCard,
        seat.hand.sideBets
      );
      seat.hand.sideBetPairWon = sideResult.pairWin;
      seat.hand.sideBetPlus3Won = sideResult.plus3Win;

      if (sideResult.totalSideWin > 0) {
        state.balances[seat.playerId] = (state.balances[seat.playerId] || 0) + sideResult.totalSideWin;
        if (state.mode === "regular") {
          state.walletCoins[seat.playerId] = state.balances[seat.playerId];
        }
      }

      if (seat.hand.score === 21) {
        seat.hand.status = "blackjack";
      }
    }
  }

  // 庄家第 2 张暗牌
  const dealerHoleCard: PlayingCard = { ...drawCardFromShoe(state), isHidden: true };
  state.dealerHand = {
    cards: [dealerUpCard, dealerHoleCard],
    score: calculateHandScore([dealerUpCard, dealerHoleCard], false),
    status: "playing",
  };

  const firstSeat = findNextPlayingSeatInTurnOrder(state);
  if (firstSeat === -1) {
    runDealerAndSettle(state, broadcasts);
  } else {
    state.phase = "playing";
    state.currentTurnSeatIndex = firstSeat;
    state.phaseStartElapsedSec = state.elapsedSeconds;
  }

  broadcasts.push({
    type: "round:dealt",
    dealerUpCard,
    turnOrder: state.turnOrder,
    currentTurnSeatIndex: state.currentTurnSeatIndex,
  });
}

function buildSettlementUnit(
  state: RoyalBlackjackRoomState,
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
  const settlementUnitId = `${state.matchId}_seq_${state.matchSeq}_r_${state.roundsPlayed}`;

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
        ending_balance: Math.round(state.walletCoins[playerId] ?? state.balances[playerId] ?? 0),
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
    roomId: state.matchId,
    matchId: `${state.matchId}_${state.matchSeq}`,
    settlementUnitId,
    unitSeq: state.roundsPlayed,
    unitType: "hand",
    rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
    timestampMs: Math.round(state.elapsedSeconds * 1000),
    durationMs: Math.max(1000, Math.round((state.elapsedSeconds - state.phaseStartElapsedSec) * 1000)),
    participants,
    ledgerReceipt: {
      idempotencyKey: `idem_${settlementUnitId}`,
      settlementUnitId,
      entries: ledgerEntries,
    },
  };
}

function runDealerAndSettle(state: RoyalBlackjackRoomState, broadcasts: unknown[]): void {
  state.phase = "dealer_turn";
  if (!state.dealerHand) return;

  // 翻开庄家暗牌
  state.dealerHand.cards = state.dealerHand.cards.map((c) => ({ ...c, isHidden: false }));
  state.dealerHand.score = calculateHandScore(state.dealerHand.cards, true);

  // 仅当场上存在未爆牌（stood 或 blackjack）的玩家手牌时，庄家才按 16 必补、17 停牌规则抽牌
  const anyPlayerAlive = state.seats.some(
    (s) => s.hand && (s.hand.status === "stood" || s.hand.status === "blackjack")
  );

  while (anyPlayerAlive && state.dealerHand.score < 17) {
    const card = drawCardFromShoe(state);
    state.dealerHand.cards.push(card);
    state.dealerHand.score = calculateHandScore(state.dealerHand.cards, true);
  }

  const dScore = state.dealerHand.score;
  const dealerBlackjack = state.dealerHand.cards.length === 2 && dScore === 21;
  const dealerBusted = dScore > 21;
  state.dealerHand.status = dealerBusted ? "busted" : dealerBlackjack ? "blackjack" : "stood";

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

  for (const seat of state.seats) {
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
    let totalPayout = (h.sideBetPairWon || 0) + (h.sideBetPlus3Won || 0);

    // 保险结算：庄家 2 张牌 21 点时，保险按 2:1 赔付（返还本金 + 2倍赔付 = 3倍 insuranceBet）
    if (h.insuranceBet > 0 && dealerBlackjack) {
      const insWin = h.insuranceBet * (gameRules.insurancePayout + 1);
      state.balances[pid] = (state.balances[pid] || 0) + insWin;
      totalPayout += insWin;
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
        const bjWin = h.bet * (gameRules.blackjackPayout + 1); // 2.5x
        state.balances[pid] = (state.balances[pid] || 0) + bjWin;
        totalPayout += bjWin;
        pStat.handsWon += 1;
        pStat.blackjackCount += 1;
      } else if (dealerBlackjack && !playerBlackjack) {
        h.status = "lost";
        pStat.handsLost += 1;
      } else if (dealerBusted || h.score > dScore) {
        h.status = "won";
        const stdWin = h.bet * 2; // 2x (1:1 payout)
        state.balances[pid] = (state.balances[pid] || 0) + stdWin;
        totalPayout += stdWin;
        pStat.handsWon += 1;
      } else if (h.score === dScore) {
        if (state.winningRule === "dealer_wins_ties" && !playerBlackjack) {
          h.status = "lost";
          pStat.handsLost += 1;
        } else {
          h.status = "push";
          state.balances[pid] = (state.balances[pid] || 0) + h.bet;
          totalPayout += h.bet;
          pStat.handsPushed += 1;
        }
      } else {
        h.status = "lost";
        pStat.handsLost += 1;
      }
    }

    if (state.mode === "regular") {
      state.walletCoins[pid] = state.balances[pid];
    }

    pStat.handsPlayed += 1;
    pStat.grossWager += totalWager;
    pStat.grossPayout += totalPayout;
    pStat.netCoinsDelta += totalPayout - totalWager;
    perPlayerStats.set(pid, pStat);
  }

  // 清理分牌临时座位并恢复主座位状态
  state.seats = state.seats
    .filter((s) => !s.isSplitHand)
    .map((s, idx) => ({
      ...s,
      seatIndex: idx,
      originalSeatIndex: undefined,
      isReady: false,
    }));
  state.turnOrder = state.seats.map((_, i) => state.seats.length - 1 - i);

  state.roundsPlayed += 1;

  // 常规模式自动破产保护：局末若筹码输光（<= 0）自动补发 5,000 游戏币
  if (state.mode === "regular") {
    for (const pid of state.players) {
      if ((state.balances[pid] || 0) <= 0) {
        state.balances[pid] = DEFAULT_GAME_COINS;
        state.walletCoins[pid] = DEFAULT_GAME_COINS;
        broadcasts.push({
          type: "player:coins_refilled",
          playerId: pid,
          amount: DEFAULT_GAME_COINS,
        });
      }
    }
  }

  // 锦标赛模式：盲注递增、零筹码淘汰与获胜规则裁决
  if (state.mode === "tournament" && state.tournament) {
    const t = state.tournament;

    if (t.isScheduledEscalation && state.roundsPlayed % Math.max(1, t.escalationRounds || 5) === 0) {
      state.minBet *= 2;
      t.minBetChips = (t.minBetChips || 50) * 2;
    }

    for (const seat of state.seats) {
      if (seat.playerId && (state.balances[seat.playerId] || 0) <= 0) {
        seat.playerId = null;
        seat.hand = null;
        seat.isReady = false;
      }
    }

    const activeSurvivors = Array.from(
      new Set(
        state.seats
          .filter((s) => s.playerId !== null && (state.balances[s.playerId!] || 0) > 0)
          .map((s) => s.playerId as string)
      )
    );

    const targetSurvivors = Math.max(1, t.targetSurvivors || 1);
    const hitSurvivorCap = Boolean(t.isSurvivorCap && activeSurvivors.length <= targetSurvivors);
    const hitRoundCap = Boolean(t.isHardCapRounds && state.roundsPlayed >= (t.maxRounds || 20));

    if (hitSurvivorCap || hitRoundCap || activeSurvivors.length === 0) {
      const grossPool = state.prizePoolCoins;
      const feePct = (t.hostFeePct ?? 3) + (t.platformFeePct ?? 2);
      const netPrizePool = Math.max(0, Math.round(grossPool * (1 - feePct / 100)));

      const ranked = [...activeSurvivors].sort((a, b) => (state.balances[b] || 0) - (state.balances[a] || 0));
      const winners: { userId: string; name: string; chips: number; prizeCoins: number }[] = [];

      if (ranked.length > 0 && netPrizePool > 0) {
        if (t.prizeDistribution === "splitByChips" || !t.isSurvivorCap) {
          const totalChips = ranked.reduce((sum, id) => sum + Math.max(1, state.balances[id] || 1), 0);
          for (const uid of ranked) {
            const prizeCoins = Math.round((netPrizePool * Math.max(1, state.balances[uid] || 1)) / totalChips);
            state.walletCoins[uid] = (state.walletCoins[uid] || 0) + prizeCoins;
            winners.push({ userId: uid, name: uid, chips: state.balances[uid] || 0, prizeCoins });
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
            state.walletCoins[uid] = (state.walletCoins[uid] || 0) + prizeCoins;
            winners.push({ userId: uid, name: uid, chips: state.balances[uid] || 0, prizeCoins });
          });
        }
      }

      state.tournamentHistory.unshift({
        id: `T-${String(state.tournamentHistory.length + 1).padStart(4, "0")}`,
        timestamp: Math.round(state.elapsedSeconds * 1000),
        rounds: state.roundsPlayed,
        seatsFilled: state.players.length,
        maxSeats: state.seats.length,
        ticketPrice: t.ticketPrice || 100,
        prizePool: netPrizePool,
        reason: hitSurvivorCap ? "Survivor Cap Reached" : hitRoundCap ? "Round Cap Reached" : "Knockout Finish",
        winners,
      });

      state.prizePoolCoins = 0;
      state.roundsPlayed = 0;
      state.balances = {};
      state.seats = state.seats.map((s) => ({ ...s, playerId: null, hand: null, isReady: false }));
    }
  }

  state.phase = "settled";
  state.currentTurnSeatIndex = -1;
  state.phaseStartElapsedSec = state.elapsedSeconds;
  state.lastSettlementUnit = buildSettlementUnit(state, perPlayerStats);

  broadcasts.push({
    type: "round:settled",
    dealerScore: dScore,
    balances: state.balances,
    walletCoins: state.walletCoins,
    settlementUnit: state.lastSettlementUnit,
  });
}

function advanceTurnOrSettle(state: RoyalBlackjackRoomState, broadcasts: unknown[]): void {
  const nextSeat = findNextPlayingSeatInTurnOrder(state, state.currentTurnSeatIndex);
  if (nextSeat === -1) {
    runDealerAndSettle(state, broadcasts);
  } else {
    state.currentTurnSeatIndex = nextSeat;
    state.phaseStartElapsedSec = state.elapsedSeconds;
  }
}

/**
 * 服务端反向平台客户端 (@randseed/server-sdk PlatformClient)
 * 用于在 Room Durable Object 容器环境中向 http://platform.players、http://platform.db、http://platform.kv 发起反向调用
 */
export const randseedPlatformClient = new PlatformClient();

/**
 * 构建符合 @randseed/server-sdk 规范的单玩家受控观测视图 (createAgentObservation)
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
 * Royal BlackJack 标准 RandSeed 房间服务端实现（Node.js / TypeScript，严格遵循 @randseed/server-sdk 契约）
 */
export const royalBlackjackGameServer: GameServer<
  RoyalBlackjackRoomState,
  BlackjackPlayerInput,
  BlackjackHostCommand
> = {
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

  init(config: MatchConfig): InitResult<RoyalBlackjackRoomState> {
    const seed = Number(config.options.seed) || 1;
    const maxSeats = Math.min(7, Math.max(1, Number(config.options.maxSeats) || 5));
    const mode = config.options.mode === "tournament" ? "tournament" : "regular";
    const minBet = Math.max(1, Number(config.options.minBet) || 10);
    const maxBet = Math.max(minBet, Number(config.options.maxBet) || 500);
    const actionTimeLimitSec = Math.max(5, Number(config.options.actionTimeLimitSec) || 20);
    const winningRule =
      config.options.winningRule === "dealer_wins_ties" ? "dealer_wins_ties" : "standard";
    const order = config.options.order === "random" ? "random" : "sequential";

    const carryover = (config.carryover as BlackjackCarryover | null) || null;
    const tournamentOpts = (config.options.tournament as TournamentSettings | undefined) || undefined;

    const balances: Record<string, number> = { ...(carryover?.balances || {}) };
    const walletCoins: Record<string, number> = { ...(carryover?.walletCoins || {}) };

    for (const pid of config.players) {
      if (typeof walletCoins[pid] !== "number" || walletCoins[pid] <= 0) {
        walletCoins[pid] = DEFAULT_GAME_COINS;
      }
      if (mode === "regular" && (typeof balances[pid] !== "number" || balances[pid] <= 0)) {
        balances[pid] = walletCoins[pid];
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
      const fresh = createDeterministicShoe(seed + (carryover?.roundsPlayed || 0) * 131, gameRules.deckCount);
      deck = fresh.deck;
      discardCount = 0;
      prngCalls = fresh.prngCalls;
    }

    const seats: RoomSeatState[] = Array.from({ length: maxSeats }, (_, idx) => ({
      seatIndex: idx,
      playerId: mode === "regular" ? config.players[idx] || null : null,
      isReady: false,
      hand: null,
    }));

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
      balances,
      walletCoins,
      prizePoolCoins: carryover?.prizePoolCoins || 0,
      tournament: tournamentOpts,
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
      forceClose: false,
    };

    return {
      state,
      broadcasts: [
        {
          type: "match:initialized",
          matchId: config.matchId,
          matchSeq: config.matchSeq,
          projection: projectBlackjackRoomState(state).publicState,
        },
      ],
    };
  },

  tick(
    ctx: TickContext<BlackjackPlayerInput, BlackjackHostCommand>,
    prevState: RoyalBlackjackRoomState
  ): TickResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    state.elapsedSeconds = ctx.elapsedSeconds;
    const broadcasts: unknown[] = [];

    if (ctx.commands && ctx.commands.length > 0) {
      for (const cmd of ctx.commands) {
        if (cmd.data?.action === "close_table") {
          state.forceClose = true;
        } else if (cmd.data?.action === "force_deal" && state.phase === "betting") {
          dealInitialCards(state, broadcasts);
        }
      }
    }

    for (const input of ctx.inputs) {
      const { playerId, data } = input;
      if (!data || typeof data !== "object") continue;

      if (data.action === "claim_refill") {
        const currentCoins = state.walletCoins[playerId] ?? state.balances[playerId] ?? 0;
        if (currentCoins < state.minBet && state.phase === "betting") {
          state.walletCoins[playerId] = DEFAULT_GAME_COINS;
          state.balances[playerId] = DEFAULT_GAME_COINS;
          broadcasts.push({
            type: "player:coins_refilled",
            playerId,
            amount: DEFAULT_GAME_COINS,
          });
        }
      } else if (data.action === "join_seat") {
        const seat = state.seats[data.seatIndex];
        if (seat && !seat.playerId && state.phase === "betting") {
          if (state.mode === "tournament" && state.tournament) {
            // In tournament mode, each player purchases a ticket with Game Coins and receives an equal locked Tournament Allowance
            if (state.seats.some((s) => s.playerId === playerId)) continue;
            const ticketPriceCoins = Math.max(0, state.tournament.ticketPrice || 100);
            const lockedAllowance = Math.max(100, state.tournament.startingChips || DEFAULT_GAME_COINS);
            const playerWallet = state.walletCoins[playerId] ?? DEFAULT_GAME_COINS;
            if ((state.balances[playerId] || 0) <= 0) {
              if (playerWallet < ticketPriceCoins) continue;
              state.walletCoins[playerId] = playerWallet - ticketPriceCoins;
              state.prizePoolCoins += ticketPriceCoins;
              state.balances[playerId] = lockedAllowance;
            }
            seat.playerId = playerId;
          } else {
            seat.playerId = playerId;
            if (typeof state.balances[playerId] !== "number" || state.balances[playerId] <= 0) {
              state.balances[playerId] = state.walletCoins[playerId] || DEFAULT_GAME_COINS;
            }
          }
        }
      } else if (data.action === "leave_seat") {
        // For tournament mode, players cannot leave their seat once seated
        if (state.mode === "tournament") continue;
        const seat = state.seats[data.seatIndex];
        if (seat && seat.playerId === playerId && state.phase === "betting") {
          seat.playerId = null;
          seat.isReady = false;
          seat.hand = null;
        }
      } else if (data.action === "place_bet" && state.phase === "betting") {
        const seat = state.seats[data.seatIndex];
        if (!seat || seat.playerId !== playerId) continue;

        const betAmt = Math.max(state.minBet, Math.min(state.maxBet, Number(data.amount) || state.minBet));
        const sideBets: SideBets = {
          pair: Math.max(0, Number(data.sideBets?.pair) || 0),
          twentyOnePlusThree: Math.max(0, Number(data.sideBets?.twentyOnePlusThree) || 0),
        };
        const totalCost = betAmt + sideBets.pair + sideBets.twentyOnePlusThree;
        const playerBal = state.balances[playerId] || 0;

        if (playerBal >= totalCost) {
          state.balances[playerId] = playerBal - totalCost;
          if (state.mode === "regular") {
            state.walletCoins[playerId] = state.balances[playerId];
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

          const seatedCount = state.seats.filter((s) => s.playerId !== null).length;
          const readyCount = state.seats.filter((s) => s.playerId !== null && s.isReady).length;
          const minSeatsToStart =
            state.mode === "tournament" ? Math.max(2, state.tournament?.minSeats || 2) : 1;

          if (seatedCount >= minSeatsToStart && seatedCount === readyCount) {
            dealInitialCards(state, broadcasts);
          }
        }
      } else if (
        state.phase === "playing" &&
        "seatIndex" in data &&
        state.currentTurnSeatIndex === data.seatIndex
      ) {
        const seat = state.seats[data.seatIndex];
        if (!seat || seat.playerId !== playerId || !seat.hand) continue;

        if (data.action === "hit") {
          const card = drawCardFromShoe(state);
          seat.hand.cards.push(card);
          seat.hand.score = calculateHandScore(seat.hand.cards);
          state.phaseStartElapsedSec = ctx.elapsedSeconds;

          if (seat.hand.score > 21) {
            seat.hand.status = "busted";
            advanceTurnOrSettle(state, broadcasts);
          } else if (seat.hand.score === 21) {
            seat.hand.status = "stood";
            advanceTurnOrSettle(state, broadcasts);
          }
        } else if (data.action === "stand") {
          seat.hand.status = "stood";
          advanceTurnOrSettle(state, broadcasts);
        } else if (data.action === "double_down" && seat.hand.cards.length === 2) {
          const extraBet = seat.hand.bet;
          if ((state.balances[playerId] || 0) >= extraBet) {
            state.balances[playerId] -= extraBet;
            if (state.mode === "regular") {
              state.walletCoins[playerId] = state.balances[playerId];
            }
            seat.hand.bet += extraBet;
            const card = drawCardFromShoe(state);
            seat.hand.cards.push(card);
            seat.hand.score = calculateHandScore(seat.hand.cards);
            seat.hand.status = seat.hand.score > 21 ? "busted" : "stood";
            advanceTurnOrSettle(state, broadcasts);
          }
        } else if (
          data.action === "split" &&
          seat.hand.cards.length === 2 &&
          seat.hand.cards[0].value === seat.hand.cards[1].value
        ) {
          const splitBet = seat.hand.bet;
          const origIdx = seat.originalSeatIndex ?? seat.seatIndex;
          const currentSplitCount = state.seats.filter(
            (s) => (s.originalSeatIndex ?? s.seatIndex) === origIdx
          ).length;

          if ((state.balances[playerId] || 0) >= splitBet && currentSplitCount < 4) {
            state.balances[playerId] -= splitBet;
            if (state.mode === "regular") {
              state.walletCoins[playerId] = state.balances[playerId];
            }
            const [c1, c2] = seat.hand.cards;
            const isSplittingAces = c1.value === "A" && c2.value === "A";
            const newC1 = drawCardFromShoe(state);
            const newC2 = drawCardFromShoe(state);

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

            state.seats.splice(data.seatIndex + 1, 0, splitSeat);
            state.seats.forEach((s, idx) => {
              s.seatIndex = idx;
            });

            // 同步更新 turnOrder（将新分出的座位插入当前座位紧后方）
            state.turnOrder = state.turnOrder.map((idx) => (idx > data.seatIndex ? idx + 1 : idx));
            const curOrderPos = state.turnOrder.indexOf(data.seatIndex);
            if (curOrderPos >= 0) {
              state.turnOrder.splice(curOrderPos + 1, 0, data.seatIndex + 1);
            } else {
              state.turnOrder.push(data.seatIndex + 1);
            }

            if (seat.hand.status !== "playing") {
              advanceTurnOrSettle(state, broadcasts);
            }
          }
        } else if (
          data.action === "buy_insurance" &&
          state.dealerHand?.cards[0]?.value === "A" &&
          seat.hand.cards.length === 2 &&
          !seat.isSplitHand &&
          seat.hand.insuranceBet === 0
        ) {
          const insCost = seat.hand.bet / 2;
          if ((state.balances[playerId] || 0) >= insCost) {
            state.balances[playerId] -= insCost;
            if (state.mode === "regular") {
              state.walletCoins[playerId] = state.balances[playerId];
            }
            seat.hand.insuranceBet = insCost;
          }
        }
      }
    }

    // 确定性超时裁决（基于 ctx.elapsedSeconds）
    if (
      state.phase === "playing" &&
      ctx.elapsedSeconds - state.phaseStartElapsedSec >= state.actionTimeLimitSec
    ) {
      const activeSeat = state.seats[state.currentTurnSeatIndex];
      if (activeSeat?.hand && activeSeat.hand.status === "playing") {
        activeSeat.hand.status = "stood";
        advanceTurnOrSettle(state, broadcasts);
      }
    }

    return {
      state,
      broadcasts,
      persist: state.phase === "settled" || ctx.tick % 10 === 0,
    };
  },

  onPlayerJoin(playerId: string, prevState: RoyalBlackjackRoomState): PlayerEventResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    if (!state.players.includes(playerId)) {
      state.players.push(playerId);
    }
    if (typeof state.walletCoins[playerId] !== "number" || state.walletCoins[playerId] <= 0) {
      state.walletCoins[playerId] = DEFAULT_GAME_COINS;
    }
    if (state.mode === "regular" && (typeof state.balances[playerId] !== "number" || state.balances[playerId] <= 0)) {
      state.balances[playerId] = state.walletCoins[playerId];
    }
    return {
      state,
      broadcasts: [{ type: "player:joined", playerId }],
    };
  },

  onPlayerLeave(playerId: string, prevState: RoyalBlackjackRoomState): PlayerEventResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    state.players = state.players.filter((p) => p !== playerId);
    // In regular mode, leaving during betting vacates the seat so the player or others can sit/return while the room is live.
    // In tournament mode, players cannot leave their seat once seated; their seat remains reserved so they can return at any time.
    if (state.mode !== "tournament") {
      for (const seat of state.seats) {
        if (seat.playerId === playerId && state.phase === "betting") {
          seat.playerId = null;
          seat.isReady = false;
          seat.hand = null;
        }
      }
    }
    return {
      state,
      broadcasts: [{ type: "player:left", playerId }],
    };
  },

  isGameOver(state: RoyalBlackjackRoomState): GameResult {
    if (state.forceClose) {
      return {
        over: true,
        summary: {
          scores: state.balances,
          durationSeconds: state.elapsedSeconds,
        },
        nextMatchPolicy: {
          mode: "close_room",
          timeoutMs: 0,
        },
      };
    }

    if (state.phase === "settled") {
      const carryover: BlackjackCarryover = {
        balances: state.balances,
        walletCoins: state.walletCoins,
        roundsPlayed: state.roundsPlayed,
        prizePoolCoins: state.prizePoolCoins,
        tournamentHistory: state.tournamentHistory,
        deck: state.deck,
        discardCount: state.discardCount,
        prngCalls: state.prngCalls,
      };

      return {
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
          carryover,
        },
      };
    }

    return { over: false };
  },

  onCommand(
    cmd: GameCommand<BlackjackHostCommand>,
    prevState: RoyalBlackjackRoomState
  ): CommandResult<RoyalBlackjackRoomState> {
    const state: RoyalBlackjackRoomState = JSON.parse(JSON.stringify(prevState));
    const broadcasts: unknown[] = [];

    if (cmd.type === "close_table" || cmd.data?.action === "close_table") {
      state.forceClose = true;
    } else if (cmd.type === "force_deal" || cmd.data?.action === "force_deal") {
      if (state.phase === "betting") {
        dealInitialCards(state, broadcasts);
      }
    } else if (cmd.type === "update_stakes" && cmd.data?.action === "update_stakes") {
      state.minBet = Math.max(1, Number(cmd.data.minBet) || state.minBet);
      state.maxBet = Math.max(state.minBet, Number(cmd.data.maxBet) || state.maxBet);
    }

    return { state, broadcasts };
  },
};
