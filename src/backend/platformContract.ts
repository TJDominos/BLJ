import type { Table, SeatResult, PlayingCard } from '../store/gameStore';
import type {
  RoyalBlackjackRoomState,
  RoomSeatState,
  OnlineSubTableState,
} from './royalBlackjackRoomServer';

/**
 * 计算 4 位密码桌的确定性校验摘要，避免在公共状态中明文暴露密码
 */
export function computeTableCodeHash(tableId: string, code: string): string {
  const input = `${tableId}:${code.trim()}:royal_bj_pin`;
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ============================================================================
// 1. 游戏对外输出的单局结算单元契约 (SettlementUnitEnvelope)
//    游戏后端仅负责每局规则计算与产出此结算快照，不负责平台侧跨房间统计聚合。
// ============================================================================

export type ParticipantOutcome = 'win' | 'loss' | 'push' | 'ranked' | 'completed' | 'eliminated';

export interface SettlementParticipantResult {
  playerId: string;
  outcome: ParticipantOutcome;
  rank?: number;
  metrics: Record<string, number>;
}

export interface LedgerTransferEntry {
  playerId: string;
  assetCode: 'GAME_COIN' | 'GCOIN' | 'TOURNAMENT_CHIP';
  direction: 'DEBIT' | 'CREDIT' | 'LOCK' | 'UNLOCK';
  amountMinor: string;
  reason:
    | 'bet_wager'
    | 'hand_payout'
    | 'blackjack_payout'
    | 'insurance_payout'
    | 'sidebet_payout'
    | 'tournament_ticket'
    | 'tournament_prize'
    | 'system_refill';
}

export interface LedgerSettlementReceipt {
  idempotencyKey: string;
  settlementUnitId: string;
  entries: LedgerTransferEntry[];
}

export interface SettlementUnitEnvelope {
  gameId: string;
  roomId: string;
  matchId: string;
  settlementUnitId: string;
  unitSeq: number;
  unitType: 'hand' | 'round' | 'tournament_final';
  rulesVersion: string;
  timestampMs: number;
  durationMs: number;
  participants: SettlementParticipantResult[];
  ledgerReceipt?: LedgerSettlementReceipt;
}

export const ROYAL_BLACKJACK_RULES_VERSION = 'blackjack-v1.2.0';

// ============================================================================
// 2. 公共状态与玩家专属私有投影 / 客户端脱敏边界 (State Sanitization)
//    严禁向前端下发牌靴明文序列或未翻开的庄家暗牌，防止客户端作弊透视。
// ============================================================================

export interface StateProjectionEnvelope<TPublic = unknown, TPrivate = unknown> {
  publicState: TPublic;
  privateStates: Record<string, TPrivate>;
}

const MASKED_CARD: PlayingCard = { suit: 'spades', value: 'A', isHidden: true };

/**
 * 对 REST 牌桌对象进行脱敏后再下发给前端：
 * - 将 `table.deck` 中的真实牌面替换为等长的掩码占位符（保留 `deck.length` 供牌靴进度条渲染，但绝不泄露下一张牌）
 * - 在 `status === 'playing'` 阶段，强制将庄家暗牌 (`isHidden: true`) 替换为掩码牌面
 */
export function sanitizeTableForClient(table: Table, viewerUserId?: string): Table {
  const cloned: Table = JSON.parse(JSON.stringify(table));

  // 掩码牌靴明文，仅保留张数
  if (Array.isArray(cloned.deck)) {
    cloned.deck = cloned.deck.map(() => ({ ...MASKED_CARD }));
  }

  // 掩码庄家未翻开的暗牌
  if (cloned.dealerHand && Array.isArray(cloned.dealerHand.cards)) {
    cloned.dealerHand.cards = cloned.dealerHand.cards.map((c) =>
      c.isHidden ? { ...MASKED_CARD } : c
    );
  }

  // 4位数字 Table Code 私有桌处理：标记 hasTableCode，且对非创建者隐藏真实 4 位密码
  if (cloned.settings && cloned.settings.tableCode && /^\d{4}$/.test(String(cloned.settings.tableCode))) {
    cloned.settings.hasTableCode = true;
    cloned.settings.isPublic = false;
    if (!viewerUserId || viewerUserId !== cloned.houseId) {
      cloned.settings.tableCode = '****';
    }
  }

  return cloned;
}

export function sanitizeTablesMapForClient(
  tables: Record<string, Table>,
  viewerUserId?: string
): Record<string, Table> {
  const result: Record<string, Table> = {};
  for (const [id, t] of Object.entries(tables)) {
    result[id] = sanitizeTableForClient(t, viewerUserId);
  }
  return result;
}

function projectSingleSubTablePublic(
  ct: OnlineSubTableState,
  playerNames: Record<string, string>,
  playerAvatars: Record<string, string>
) {
  const sanitizedDealer = ct.dealerHand
    ? {
        score: ct.dealerHand.score,
        status: ct.dealerHand.status,
        cards: ct.dealerHand.cards.map((c) => (c.isHidden ? { ...MASKED_CARD } : c)),
      }
    : null;

  const hideSecretBets = ct.mode === 'tournament' && ct.phase === 'betting';

  const publicSeats = ct.seats.map((s: RoomSeatState) => ({
    seatIndex: s.seatIndex,
    playerId: s.playerId,
    name: s.playerId ? playerNames[s.playerId] || s.playerId : undefined,
    avatar: s.playerId ? playerAvatars[s.playerId] : undefined,
    isReady: s.isReady,
    isSplitHand: s.isSplitHand,
    originalSeatIndex: s.originalSeatIndex,
    hand: s.hand
      ? {
          cards: s.hand.cards,
          bet: hideSecretBets ? 0 : s.hand.bet,
          insuranceBet: s.hand.insuranceBet,
          sideBets: hideSecretBets ? { pair: 0, twentyOnePlusThree: 0 } : s.hand.sideBets,
          sideBetPairWon: s.hand.sideBetPairWon,
          sideBetPlus3Won: s.hand.sideBetPlus3Won,
          status: s.hand.status,
          score: s.hand.score,
        }
      : null,
  }));

  const hasPin = Boolean(ct.tableCode && /^\d{4}$/.test(String(ct.tableCode)));
  const tableCodeHash = hasPin ? computeTableCodeHash(ct.id, String(ct.tableCode)) : undefined;

  return {
    id: ct.id,
    name: ct.name,
    description: ct.description || '',
    houseId: ct.houseId,
    houseName: ct.houseName || (ct.houseId ? playerNames[ct.houseId] || ct.houseId : 'Host'),
    houseAvatar: ct.houseAvatar || (ct.houseId ? playerAvatars[ct.houseId] : undefined),
    createdAt: ct.createdAt,
    visits: ct.visits || 0,
    liquidity: ct.liquidity,
    initialLiquidity: ct.initialLiquidity,
    status: ct.status,
    hasTableCode: hasPin,
    tableCode: hasPin ? '****' : undefined,
    tableCodeHash,
    isPublic: hasPin ? false : Boolean(ct.isPublic ?? true),
    emptySince: ct.emptySince ?? null,
    maxHostingTimeMs: ct.maxHostingTimeMs,
    expiresAt: ct.expiresAt ?? null,
    mode: ct.mode,
    winningRule: ct.winningRule,
    order: ct.order,
    minBet: ct.minBet,
    maxBet: ct.maxBet,
    actionTimeLimitSec: ct.actionTimeLimitSec,
    phase: ct.phase,
    currentTurnSeatIndex: ct.currentTurnSeatIndex,
    turnOrder: ct.turnOrder,
    roundsPlayed: ct.roundsPlayed,
    deckRemainingCount: Array.isArray(ct.deck) ? ct.deck.length : 312,
    discardCount: ct.discardCount || 0,
    dealerHand: sanitizedDealer,
    seats: publicSeats,
    balances: ct.balances || {},
    prizePoolCoins: ct.prizePoolCoins || 0,
    tournament: ct.tournament || null,
    tournamentHistory: ct.tournamentHistory || [],
    lastRoundSummary: ct.lastRoundSummary || null,
    roundHistory: ct.roundHistory || [],
  };
}

/**
 * RandSeed RoomState 投影函数：
 * - 裁剪 `deck` 明文数组（仅暴露 `deckRemainingCount` 与 `discardCount`）
 * - 庄家暗牌未翻开前脱敏
 * - 锦标赛暗注 (secretBets) 在下注阶段对其他玩家隐藏
 * - 同步投影所有在线自建桌与扩容系统桌 (`customTables`)
 */
export function projectBlackjackRoomState(state: RoyalBlackjackRoomState): StateProjectionEnvelope {
  const playerNames = state.playerNames || {};
  const playerAvatars = state.playerAvatars || {};

  const sanitizedDealer = state.dealerHand
    ? {
        score: state.dealerHand.score,
        status: state.dealerHand.status,
        cards: state.dealerHand.cards.map((c) =>
          c.isHidden ? { ...MASKED_CARD } : c
        ),
      }
    : null;

  const hideSecretBets = state.mode === 'tournament' && state.phase === 'betting';

  const publicSeats = state.seats.map((s: RoomSeatState) => ({
    seatIndex: s.seatIndex,
    playerId: s.playerId,
    name: s.playerId ? playerNames[s.playerId] || s.playerId : undefined,
    avatar: s.playerId ? playerAvatars[s.playerId] : undefined,
    isReady: s.isReady,
    isSplitHand: s.isSplitHand,
    originalSeatIndex: s.originalSeatIndex,
    hand: s.hand
      ? {
          cards: s.hand.cards,
          bet: hideSecretBets ? 0 : s.hand.bet,
          insuranceBet: s.hand.insuranceBet,
          sideBets: hideSecretBets ? { pair: 0, twentyOnePlusThree: 0 } : s.hand.sideBets,
          sideBetPairWon: s.hand.sideBetPairWon,
          sideBetPlus3Won: s.hand.sideBetPlus3Won,
          status: s.hand.status,
          score: s.hand.score,
        }
      : null,
  }));

  const publicCustomTables: Record<string, ReturnType<typeof projectSingleSubTablePublic>> = {};
  if (state.customTables) {
    for (const [tid, ct] of Object.entries(state.customTables)) {
      if (!ct || ct.status === 'closed') continue;
      publicCustomTables[tid] = projectSingleSubTablePublic(ct, playerNames, playerAvatars);
    }
  }

  const publicState = {
    matchId: state.matchId,
    matchSeq: state.matchSeq,
    mode: state.mode,
    winningRule: state.winningRule,
    order: state.order,
    minBet: state.minBet,
    maxBet: state.maxBet,
    actionTimeLimitSec: state.actionTimeLimitSec,
    phase: state.phase,
    currentTurnSeatIndex: state.currentTurnSeatIndex,
    turnOrder: state.turnOrder,
    roundsPlayed: state.roundsPlayed,
    visits: state.visits ?? 1,
    totalTokensIssued: state.totalTokensIssued || 0,
    totalTokensPaidOut: state.totalTokensPaidOut || 0,
    totalRefillsCount: state.totalRefillsCount || 0,
    deckRemainingCount: state.deck.length,
    discardCount: state.discardCount,
    dealerHand: sanitizedDealer,
    seats: publicSeats,
    balances: state.balances,
    walletCoins: state.walletCoins,
    prizePoolCoins: state.prizePoolCoins,
    tournament: state.tournament || null,
    tournamentHistory: state.tournamentHistory || [],
    lastRoundSummary: state.lastRoundSummary || null,
    roundHistory: state.roundHistory || [],
    customTables: publicCustomTables,
    players: state.players || [],
    playerNames,
    playerAvatars,
  };

  const privateStates: Record<string, unknown> = {};
  for (const pid of state.players) {
    const mySeats: Array<{
      tableId: string;
      seatIndex: number;
      actualBet: number;
      sideBets: { pair: number; twentyOnePlusThree: number };
    }> = state.seats
      .filter((s) => s.playerId === pid)
      .map((s) => ({
        tableId: 'table_1',
        seatIndex: s.seatIndex,
        actualBet: s.hand?.bet || 0,
        sideBets: s.hand?.sideBets || { pair: 0, twentyOnePlusThree: 0 },
      }));

    const ownedTableCodes: Record<string, string> = {};
    if (state.customTables) {
      for (const [tid, ct] of Object.entries(state.customTables)) {
        if (!ct || ct.status === 'closed') continue;
        if (ct.houseId === pid && ct.tableCode) {
          ownedTableCodes[tid] = ct.tableCode;
        }
        for (const s of ct.seats) {
          if (s.playerId === pid) {
            mySeats.push({
              tableId: tid,
              seatIndex: s.seatIndex,
              actualBet: s.hand?.bet || 0,
              sideBets: s.hand?.sideBets || { pair: 0, twentyOnePlusThree: 0 },
            });
          }
        }
      }
    }

    privateStates[pid] = {
      playerId: pid,
      balance: state.balances[pid] || 0,
      walletCoins: state.walletCoins[pid] || 0,
      mySeats,
      unlockedTableIds: state.unlockedTablesByPlayer?.[pid] || [],
      ownedTableCodes,
    };
  }

  return { publicState, privateStates };
}

/**
 * 构造单局结算单元（仅负责把当前局内计算完的胜负与筹码变动打包输出）
 */
export function emitBlackjackHandSettlementUnit(params: {
  table: Table;
  seatResults: SeatResult[];
  endingBalances: Record<string, number>;
}): SettlementUnitEnvelope {
  const { table, seatResults, endingBalances } = params;
  const now = Date.now();
  const unitSeq = table.roundsPlayed || 1;
  const settlementUnitId = `${table.id}_hand_${unitSeq}_${now}`;

  const byPlayer = new Map<
    string,
    {
      handsPlayed: number;
      handsWon: number;
      handsLost: number;
      handsPushed: number;
      blackjackCount: number;
      netCoinsDelta: number;
      grossPayout: number;
      grossWager: number;
    }
  >();

  for (const sr of seatResults) {
    if (!sr.userId) continue;
    const cur = byPlayer.get(sr.userId) || {
      handsPlayed: 0,
      handsWon: 0,
      handsLost: 0,
      handsPushed: 0,
      blackjackCount: 0,
      netCoinsDelta: 0,
      grossPayout: 0,
      grossWager: 0,
    };

    cur.handsPlayed += 1;
    if (sr.action === 'won' || sr.action === 'blackjack') {
      cur.handsWon += 1;
    } else if (sr.action === 'push') {
      cur.handsPushed += 1;
    } else {
      cur.handsLost += 1;
    }

    if (sr.action === 'blackjack') {
      cur.blackjackCount += 1;
    }

    const wager = (sr.bet || 0) + (sr.sideBet || 0) + (sr.insuranceBet || 0);
    cur.grossWager += wager;
    cur.grossPayout += sr.win || 0;
    cur.netCoinsDelta += sr.net || 0;

    byPlayer.set(sr.userId, cur);
  }

  const participants: SettlementParticipantResult[] = [];
  const ledgerEntries: LedgerTransferEntry[] = [];
  const assetCode = 'GAME_COIN';

  for (const [playerId, stats] of byPlayer.entries()) {
    const outcome: ParticipantOutcome =
      stats.handsWon > stats.handsLost
        ? 'win'
        : stats.handsLost > stats.handsWon
        ? 'loss'
        : 'push';

    participants.push({
      playerId,
      outcome,
      metrics: {
        hands_played: stats.handsPlayed,
        hands_won: stats.handsWon,
        hands_lost: stats.handsLost,
        hands_pushed: stats.handsPushed,
        blackjack_count: stats.blackjackCount,
        net_coins_delta: Math.round(stats.netCoinsDelta),
        ending_balance: Math.round(endingBalances[playerId] ?? 0),
      },
    });

    if (stats.grossWager > 0) {
      ledgerEntries.push({
        playerId,
        assetCode,
        direction: 'DEBIT',
        amountMinor: String(Math.round(stats.grossWager)),
        reason: 'bet_wager',
      });
    }
    if (stats.grossPayout > 0) {
      ledgerEntries.push({
        playerId,
        assetCode,
        direction: 'CREDIT',
        amountMinor: String(Math.round(stats.grossPayout)),
        reason: stats.blackjackCount > 0 ? 'blackjack_payout' : 'hand_payout',
      });
    }
  }

  return {
    gameId: 'royal-blackjack',
    roomId: table.id,
    matchId: `${table.id}_session`,
    settlementUnitId,
    unitSeq,
    unitType: 'hand',
    rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
    timestampMs: now,
    durationMs: 15000,
    participants,
    ledgerReceipt: {
      idempotencyKey: `idem_${settlementUnitId}`,
      settlementUnitId,
      entries: ledgerEntries,
    },
  };
}
