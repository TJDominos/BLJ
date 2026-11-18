import { create } from 'zustand';
import { ROYAL_BLACKJACK_RULES_VERSION } from '../backend/platformContract';
import {
  RANDSEED_GAME_ID,
  GAME_SLUG,
  formatOpaquePlayerId,
  initRandseedRuntime,
  onRandseedRoomStatusChange,
  getRandseedOnlinePlayers,
  getRandseedCurrentPlayerProfile,
  isRandseedRoomConnected,
  getRandseedRoomStatus,
  getRandseedRoomError,
  getRandseedRoomAllocation,
  getRandseedRoomSnapshot,
  matchRandseedRoom,
  sendRandseedRoomAction,
  sendRandseedRoomActionConfirmed,
  readyRandseedRoom,
  fetchAllRandseedMatchHistory,
  type ArchiveHistoryEntry,
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
  shuffleSeq?: number;
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
  isDouble?: boolean;
  win?: number;
  net: number;
  action: string;
  score?: number;
}

export interface GameRecord {
  id: string;
  tableId: string;
  tableMode?: TableMode;
  tableName?: string;
  tableMinBet?: number;
  result: 'win' | 'lose' | 'push' | 'blackjack';
  amountWon: number;
  timestamp: number;
  seatResults: SeatResult[];
  dealerScore?: number;
  currency?: 'Gcoin' | 'Bonus';
}

export interface PersonalArchiveLegacyAggregates {
  regularRounds: number;
  regularWins: number;
  regularNet: number;
  regularBlackjacks: number;
  regularDoubles: number;
  regularSplits: number;
  regularSideBetHands: number;
  regularSideBetWins: number;
  regularSideBetNet: number;
  regularSideBetGrossWin: number;
  regularPairWins: number;
  regularPlus3Wins: number;
  tournamentRounds: number;
  tournamentWins: number;
  tournamentNet: number;
  tournamentBlackjacks: number;
  tournamentSideBetHands: number;
  tournamentSideBetWins: number;
  tournamentSideBetNet: number;
  tournamentSideBetGrossWin: number;
  tournamentPairWins: number;
  tournamentPlus3Wins: number;
  bestSingleWin: number;
}

export interface PersonalArchiveData {
  records: GameRecord[];
  legacyAggregates: PersonalArchiveLegacyAggregates;
  tournamentsEntered: number;
  tournamentsWon: number;
  tournamentPrizeCoinsWon: number;
  totalArchivedMatches: number;
}

export interface OnlinePlayerEntry {
  userId: string;
  name: string;
  avatar?: string;
  isGameCreator?: boolean;
  joinedAt?: number;
  tableId?: string;
  tableName?: string;
  isPlaying?: boolean;
  isDisconnected?: boolean;
}

const sessionStartedAtMs = Date.now();
const MASKED_CARD: PlayingCard = { suit: 'spades', value: 'A', isHidden: true };
const CACHED_MASKED_DECK: PlayingCard[] = Array.from({ length: 320 }, () => MASKED_CARD);

// Authoritative online room state cache from RandSeed RoomClient
let latestOnlineRoomState: Record<string, any> | null = null;
let latestOnlineRoomId: string | null = null;
let roomListenersRegistered = false;
let loginInFlight: Promise<void> | null = null;
let ownerStatusInFlight: Promise<boolean> | null = null;
let archiveFetchInFlight: Promise<void> | null = null;
let archiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let archiveWarmupTimer: ReturnType<typeof setTimeout> | null = null;
const seenSettledRoundIdsForArchive = new Set<string>();

function createEmptyLegacyAggregates(): PersonalArchiveLegacyAggregates {
  return {
    regularRounds: 0,
    regularWins: 0,
    regularNet: 0,
    regularBlackjacks: 0,
    regularDoubles: 0,
    regularSplits: 0,
    regularSideBetHands: 0,
    regularSideBetWins: 0,
    regularSideBetNet: 0,
    regularSideBetGrossWin: 0,
    regularPairWins: 0,
    regularPlus3Wins: 0,
    tournamentRounds: 0,
    tournamentWins: 0,
    tournamentNet: 0,
    tournamentBlackjacks: 0,
    tournamentSideBetHands: 0,
    tournamentSideBetWins: 0,
    tournamentSideBetNet: 0,
    tournamentSideBetGrossWin: 0,
    tournamentPairWins: 0,
    tournamentPlus3Wins: 0,
    bestSingleWin: 0,
  };
}

function createEmptyPersonalArchive(): PersonalArchiveData {
  return {
    records: [],
    legacyAggregates: createEmptyLegacyAggregates(),
    tournamentsEntered: 0,
    tournamentsWon: 0,
    tournamentPrizeCoinsWon: 0,
    totalArchivedMatches: 0,
  };
}

function resolveSelfIdWithinArchiveEntry(
  entry: ArchiveHistoryEntry,
  currentUserId: string | undefined,
  candidateIds: string[]
): string | undefined {
  const nonBotCandidates = candidateIds.filter((id) => id && !id.startsWith('bot_'));
  if (currentUserId && nonBotCandidates.includes(currentUserId)) {
    return currentUserId;
  }

  const summaryObj =
    entry.summary && typeof entry.summary === 'object' && !Array.isArray(entry.summary)
      ? (entry.summary as Record<string, any>)
      : {};
  const scoresObj =
    summaryObj.scores && typeof summaryObj.scores === 'object' && !Array.isArray(summaryObj.scores)
      ? (summaryObj.scores as Record<string, unknown>)
      : null;

  if (typeof entry.score === 'number' && Number.isFinite(entry.score) && scoresObj) {
    const matchingScoreIds = Object.entries(scoresObj)
      .filter(([pid, sc]) => !pid.startsWith('bot_') && typeof sc === 'number' && sc === entry.score)
      .map(([pid]) => pid);
    if (matchingScoreIds.length === 1) {
      return matchingScoreIds[0];
    }
    const candidateMatch = matchingScoreIds.find((pid) => nonBotCandidates.includes(pid));
    if (candidateMatch) return candidateMatch;
  }

  if (typeof entry.rank === 'number' && entry.rank >= 1 && scoresObj) {
    const rankedIds = Object.entries(scoresObj)
      .filter(([pid, sc]) => !pid.startsWith('bot_') && typeof sc === 'number')
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([pid]) => pid);
    if (rankedIds[entry.rank - 1]) {
      return rankedIds[entry.rank - 1];
    }
  }

  if (nonBotCandidates.length === 1) {
    return nonBotCandidates[0];
  }

  return currentUserId;
}

function readMetricNumber(
  metricsSource: Record<string, unknown> | any[] | undefined,
  statsObj: Record<string, unknown> | null,
  key: string
): number {
  if (statsObj && typeof statsObj[key] === 'number' && Number.isFinite(statsObj[key] as number)) {
    return Number(statsObj[key]);
  }
  if (Array.isArray(metricsSource)) {
    const found = metricsSource.find((m) => m && m.key === key && typeof m.value === 'number');
    if (found) return Number(found.value);
  } else if (metricsSource && typeof metricsSource === 'object') {
    const val = metricsSource[key];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return val;
    }
  }
  return 0;
}

function buildPersonalArchiveFromEntries(
  entries: ArchiveHistoryEntry[],
  currentUserId?: string
): PersonalArchiveData {
  const legacyAggregates = createEmptyLegacyAggregates();
  const records: GameRecord[] = [];
  const seenRoundIds = new Set<string>();
  const seenTournamentKeys = new Set<string>();
  let tournamentsEntered = 0;
  let tournamentsWon = 0;
  let tournamentPrizeCoinsWon = 0;

  for (const entry of entries) {
    const summaryObj =
      entry.summary && typeof entry.summary === 'object' && !Array.isArray(entry.summary)
        ? (entry.summary as Record<string, any>)
        : {};
    const customMetrics =
      summaryObj.customMetrics &&
      typeof summaryObj.customMetrics === 'object' &&
      !Array.isArray(summaryObj.customMetrics)
        ? (summaryObj.customMetrics as Record<string, any>)
        : {};

    const settledRounds: any[] = Array.isArray(customMetrics.settledRounds)
      ? customMetrics.settledRounds
      : [];
    const tournamentResults: any[] = Array.isArray(customMetrics.tournamentResults)
      ? customMetrics.tournamentResults
      : [];
    const settlementUnit =
      customMetrics.settlementUnit &&
      typeof customMetrics.settlementUnit === 'object' &&
      !Array.isArray(customMetrics.settlementUnit)
        ? (customMetrics.settlementUnit as Record<string, any>)
        : null;

    const candidateSet = new Set<string>();
    for (const r of settledRounds) {
      if (Array.isArray(r?.seatResults)) {
        for (const sr of r.seatResults) {
          if (typeof sr?.userId === 'string' && sr.userId) candidateSet.add(sr.userId);
        }
      }
    }
    for (const tr of tournamentResults) {
      if (Array.isArray(tr?.participantIds)) {
        for (const pid of tr.participantIds) {
          if (typeof pid === 'string' && pid) candidateSet.add(pid);
        }
      }
      if (Array.isArray(tr?.record?.winners)) {
        for (const w of tr.record.winners) {
          if (typeof w?.userId === 'string' && w.userId) candidateSet.add(w.userId);
        }
      }
    }
    if (Array.isArray(settlementUnit?.participants)) {
      for (const p of settlementUnit.participants) {
        if (typeof p?.playerId === 'string' && p.playerId) candidateSet.add(p.playerId);
      }
    }
    if (summaryObj.scores && typeof summaryObj.scores === 'object' && !Array.isArray(summaryObj.scores)) {
      for (const pid of Object.keys(summaryObj.scores)) {
        candidateSet.add(pid);
      }
    }

    const selfEntryId = resolveSelfIdWithinArchiveEntry(
      entry,
      currentUserId,
      Array.from(candidateSet)
    );
    const normalizedSelfId = currentUserId || selfEntryId || 'me';

    // 1. Parse persisted tournament results across all tables in the match
    for (const tr of tournamentResults) {
      const rec = tr?.record;
      if (!rec || typeof rec !== 'object') continue;
      const tKey = `${tr.tableId || 'table'}:${rec.id || rec.timestamp || entry.matchId}`;
      if (seenTournamentKeys.has(tKey)) continue;

      const participantIds: string[] = Array.isArray(tr.participantIds) ? tr.participantIds : [];
      const winners: any[] = Array.isArray(rec.winners) ? rec.winners : [];
      const inParticipants = Boolean(selfEntryId && participantIds.includes(selfEntryId));
      const winnerIdx = selfEntryId ? winners.findIndex((w) => w?.userId === selfEntryId) : -1;

      if (inParticipants || winnerIdx !== -1) {
        seenTournamentKeys.add(tKey);
        tournamentsEntered += 1;
        if (winnerIdx !== -1) {
          tournamentPrizeCoinsWon += Number(winners[winnerIdx]?.prizeCoins || 0);
          if (winnerIdx === 0) {
            tournamentsWon += 1;
          }
        }
      }
    }

    // 2. Parse detailed settled rounds (contains exact seatResults, side bets, doubles, splits, scores)
    let matchHadMyDetailedRounds = false;
    for (const sr of settledRounds) {
      if (!sr || typeof sr !== 'object') continue;
      const roundId = typeof sr.roundId === 'string' && sr.roundId ? sr.roundId : '';
      if (!roundId || seenRoundIds.has(roundId)) continue;

      const rawSeatResults: SeatResult[] = Array.isArray(sr.seatResults) ? sr.seatResults : [];
      if (rawSeatResults.length === 0) continue;

      const mySeats = selfEntryId
        ? rawSeatResults.filter((s) => s && s.userId === selfEntryId)
        : [];
      if (mySeats.length === 0) continue;

      seenRoundIds.add(roundId);
      matchHadMyDetailedRounds = true;

      const normalizedSeatResults: SeatResult[] = rawSeatResults.map((s) =>
        selfEntryId && s.userId === selfEntryId
          ? { ...s, userId: normalizedSelfId }
          : s
      );

      const amountWon =
        (selfEntryId && sr.winnings && typeof sr.winnings[selfEntryId] === 'number'
          ? sr.winnings[selfEntryId]
          : 0) || 0;
      const totalNet = mySeats.reduce((sum, s) => sum + (Number(s.net) || 0), 0);
      const hasBlackjack = mySeats.some((s) => (s.action || '').toLowerCase().includes('blackjack'));
      const resType: GameRecord['result'] = hasBlackjack
        ? 'blackjack'
        : totalNet > 0
        ? 'win'
        : totalNet < 0
        ? 'lose'
        : 'push';

      records.push({
        id: roundId,
        tableId: typeof sr.tableId === 'string' && sr.tableId ? sr.tableId : 'table_1',
        tableMode: sr.tableMode === 'tournament' ? 'tournament' : 'regular',
        tableName: typeof sr.tableName === 'string' && sr.tableName ? sr.tableName : undefined,
        tableMinBet: typeof sr.tableMinBet === 'number' ? sr.tableMinBet : undefined,
        result: resType,
        amountWon,
        timestamp: Number(sr.timestamp) || entry.endTime || entry.startTime || Date.now(),
        seatResults: normalizedSeatResults,
        dealerScore: typeof sr.dealerScore === 'number' ? sr.dealerScore : undefined,
        currency: 'Gcoin',
      });
    }

    // 3. Fallback for legacy / Result-Unit-only archived matches lacking settledRounds
    if (!matchHadMyDetailedRounds && settledRounds.length === 0) {
      const statsObj =
        entry.stats && typeof entry.stats === 'object' && !Array.isArray(entry.stats)
          ? (entry.stats as Record<string, unknown>)
          : null;
      const participants: any[] = Array.isArray(settlementUnit?.participants)
        ? settlementUnit!.participants
        : [];
      const myParticipant = selfEntryId
        ? participants.find((p) => p && p.playerId === selfEntryId)
        : participants.length === 1
        ? participants[0]
        : undefined;
      const metricsSource: Record<string, unknown> | any[] | undefined =
        myParticipant?.metrics && typeof myParticipant.metrics === 'object'
          ? myParticipant.metrics
          : undefined;

      const handsPlayed = readMetricNumber(metricsSource, statsObj, 'hands_played');
      const handsWon = readMetricNumber(metricsSource, statsObj, 'hands_won');
      const blackjacks = readMetricNumber(metricsSource, statsObj, 'blackjack_count');
      const doubles = readMetricNumber(metricsSource, statsObj, 'double_count');
      const splits = readMetricNumber(metricsSource, statsObj, 'split_count');
      const sideBetHands = readMetricNumber(metricsSource, statsObj, 'side_bet_hands');
      const sideBetWins = readMetricNumber(metricsSource, statsObj, 'side_bet_wins');
      const sideBetNet = readMetricNumber(metricsSource, statsObj, 'side_bet_net');
      const sideBetGrossWin = readMetricNumber(metricsSource, statsObj, 'side_bet_gross_win');
      const pairWins = readMetricNumber(metricsSource, statsObj, 'pair_wins');
      const plus3Wins = readMetricNumber(metricsSource, statsObj, 'plus3_wins');
      const bestSingleWin = readMetricNumber(metricsSource, statsObj, 'best_single_win');
      const netDelta =
        readMetricNumber(metricsSource, statsObj, 'net_coins_delta') ||
        (typeof myParticipant?.score === 'number' ? Number(myParticipant.score) : 0);

      const hasAnyStats =
        handsPlayed > 0 ||
        netDelta !== 0 ||
        Boolean(myParticipant) ||
        (statsObj !== null && Object.keys(statsObj).length > 0);

      if (hasAnyStats) {
        const metaMode = settlementUnit?.metadata?.mode === 'tournament' ? 'tournament' : 'regular';
        const effectiveHands = handsPlayed > 0 ? handsPlayed : 1;
        const effectiveWins =
          handsPlayed > 0
            ? handsWon
            : myParticipant?.outcome === 'win' || netDelta > 0
            ? 1
            : 0;

        if (bestSingleWin > legacyAggregates.bestSingleWin) {
          legacyAggregates.bestSingleWin = bestSingleWin;
        } else if (netDelta > legacyAggregates.bestSingleWin) {
          legacyAggregates.bestSingleWin = netDelta;
        }

        if (metaMode === 'tournament') {
          legacyAggregates.tournamentRounds += effectiveHands;
          legacyAggregates.tournamentWins += effectiveWins;
          legacyAggregates.tournamentNet += netDelta;
          legacyAggregates.tournamentBlackjacks += blackjacks;
          legacyAggregates.tournamentSideBetHands += sideBetHands;
          legacyAggregates.tournamentSideBetWins += sideBetWins;
          legacyAggregates.tournamentSideBetNet += sideBetNet;
          legacyAggregates.tournamentSideBetGrossWin += sideBetGrossWin;
          legacyAggregates.tournamentPairWins += pairWins;
          legacyAggregates.tournamentPlus3Wins += plus3Wins;
        } else {
          legacyAggregates.regularRounds += effectiveHands;
          legacyAggregates.regularWins += effectiveWins;
          legacyAggregates.regularNet += netDelta;
          legacyAggregates.regularBlackjacks += blackjacks;
          legacyAggregates.regularDoubles += doubles;
          legacyAggregates.regularSplits += splits;
          legacyAggregates.regularSideBetHands += sideBetHands;
          legacyAggregates.regularSideBetWins += sideBetWins;
          legacyAggregates.regularSideBetNet += sideBetNet;
          legacyAggregates.regularSideBetGrossWin += sideBetGrossWin;
          legacyAggregates.regularPairWins += pairWins;
          legacyAggregates.regularPlus3Wins += plus3Wins;
        }

        const legacyId = `archive_${entry.matchId}`;
        if (!seenRoundIds.has(legacyId)) {
          seenRoundIds.add(legacyId);
          const actionLabel =
            blackjacks > 0
              ? 'blackjack'
              : effectiveWins > 0 || netDelta > 0
              ? 'won'
              : netDelta < 0
              ? 'lost'
              : 'push';
          records.push({
            id: legacyId,
            tableId:
              typeof settlementUnit?.metadata?.tableId === 'string' &&
              settlementUnit.metadata.tableId
                ? settlementUnit.metadata.tableId
                : 'table_1',
            tableMode: metaMode,
            tableName:
              typeof settlementUnit?.metadata?.tableName === 'string' &&
              settlementUnit.metadata.tableName
                ? settlementUnit.metadata.tableName
                : undefined,
            result:
              blackjacks > 0
                ? 'blackjack'
                : netDelta > 0
                ? 'win'
                : netDelta < 0
                ? 'lose'
                : 'push',
            amountWon: Math.max(0, netDelta),
            timestamp: entry.endTime || entry.startTime || Date.now(),
            seatResults: [
              {
                seatIndex: 0,
                userId: normalizedSelfId,
                bet: 0,
                sideBetWin: sideBetGrossWin,
                net: netDelta,
                action: actionLabel,
              },
            ],
            currency: 'Gcoin',
          });
        }
      }
    }
  }

  records.sort((a, b) => b.timestamp - a.timestamp);

  return {
    records,
    legacyAggregates,
    tournamentsEntered,
    tournamentsWon,
    tournamentPrizeCoinsWon,
    totalArchivedMatches: entries.length,
  };
}

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

  let base: Record<string, any> = { ...raw };
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
              c.isHidden ? MASKED_CARD : c
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
    deck:
      deckCount <= CACHED_MASKED_DECK.length
        ? CACHED_MASKED_DECK.slice(0, Math.max(0, deckCount))
        : Array.from({ length: Math.max(0, deckCount) }, () => MASKED_CARD),
    discardCount: Number(roomState.discardCount) || 0,
    shuffleSeq:
      typeof roomState.shuffleSeq === 'number'
        ? roomState.shuffleSeq
        : existing?.shuffleSeq ?? 0,
    discardedCards:
      Number(roomState.discardCount || 0) === 0 ? [] : existing?.discardedCards || [],
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

  const disconnectedSet = new Set<string>(
    Array.isArray(roomState?.disconnectedPlayerIds)
      ? roomState.disconnectedPlayerIds.filter((id: unknown): id is string => typeof id === 'string')
      : []
  );

  for (const rp of sdkPlayers) {
    if (!rp || typeof rp.playerId !== 'string') continue;
    const uid = rp.playerId.trim();
    if (!uid || uid.startsWith('bot_')) continue;
    const isMe = currentUser?.id === uid;
    const tableInfo = findPlayerTableInfo(uid);
    const sdkDisplayName =
      typeof rp.displayName === 'string' && rp.displayName.trim() ? rp.displayName.trim() : '';
    const sdkAvatarUrl =
      typeof rp.avatarUrl === 'string' && rp.avatarUrl.trim() ? rp.avatarUrl.trim() : '';
    const resolvedName =
      sdkDisplayName ||
      (isMe && currentUser?.name && currentUser.name !== 'Player' ? currentUser.name : '') ||
      (stateNames[uid] && stateNames[uid] !== uid ? stateNames[uid] : '') ||
      tableInfo?.seatName ||
      formatOpaquePlayerId(uid);
    const resolvedAvatar =
      sdkAvatarUrl ||
      (isMe ? currentUser?.avatar : undefined) ||
      stateAvatars[uid] ||
      tableInfo?.seatAvatar ||
      undefined;

    map.set(uid, {
      userId: uid,
      name: resolvedName,
      avatar: resolvedAvatar,
      isGameCreator: rp.isGameCreator === true,
      joinedAt: rp.joinedAt,
      tableId: tableInfo?.tableId,
      tableName: tableInfo?.tableName,
      isPlaying: tableInfo?.isPlaying ?? false,
      isDisconnected: disconnectedSet.has(uid),
    });
  }

  const hasLiveSdkRoster = Array.isArray(sdkPlayers) && sdkPlayers.length > 0;
  if (!hasLiveSdkRoster) {
    const statePlayerIds: string[] = Array.isArray(roomState?.players) ? roomState.players : [];
    for (const rawId of statePlayerIds) {
      if (typeof rawId !== 'string') continue;
      const uid = rawId.trim();
      if (!uid || uid.startsWith('bot_') || map.has(uid)) continue;
      const isMe = currentUser?.id === uid;
      const tableInfo = findPlayerTableInfo(uid);
      const resolvedName =
        (isMe && currentUser?.name && currentUser.name !== 'Player' ? currentUser.name : '') ||
        (stateNames[uid] && stateNames[uid] !== uid ? stateNames[uid] : '') ||
        tableInfo?.seatName ||
        (isMe && currentUser?.name ? currentUser.name : '') ||
        formatOpaquePlayerId(uid);
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
        isDisconnected: disconnectedSet.has(uid),
      });
    }
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
      if (hasLiveSdkRoster && !disconnectedSet.has(uid)) {
        continue;
      }
      const isMe = currentUser?.id === uid;
      const resolvedName =
        (isMe && currentUser?.name && currentUser.name !== 'Player' ? currentUser.name : '') ||
        (s.name && s.name !== uid ? s.name : '') ||
        (stateNames[uid] && stateNames[uid] !== uid ? stateNames[uid] : '') ||
        (isMe && currentUser?.name ? currentUser.name : '') ||
        formatOpaquePlayerId(uid);
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
        isDisconnected: disconnectedSet.has(uid),
      });
    }
  }

  if (
    currentUser?.id &&
    currentUser.id !== 'connecting_player' &&
    !map.has(currentUser.id)
  ) {
    const tableInfo = findPlayerTableInfo(currentUser.id);
    map.set(currentUser.id, {
      userId: currentUser.id,
      name: currentUser.name || 'Player',
      avatar: currentUser.avatar,
      isGameCreator: Boolean(currentUser.isCreator),
      tableId: tableInfo?.tableId,
      tableName: tableInfo?.tableName,
      isPlaying: tableInfo?.isPlaying ?? false,
      isDisconnected: disconnectedSet.has(currentUser.id),
    });
  }

  return Array.from(map.values()).filter((p) => p.userId !== 'connecting_player');
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
    isCreator: Boolean(storeState.isGameOwner),
    isGameOwner: Boolean(storeState.isGameOwner),
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

export interface ActionOutcome {
  ok: boolean;
  code?: string;
  error?: string;
}

interface GameStore {
  currentUser: User | null;
  isGameOwner: boolean;
  tables: Record<string, Table>;
  activeTableId: string | null;
  gameRecords: GameRecord[];
  onlinePlayers: OnlinePlayerEntry[];
  disconnectedPlayerIds: string[];
  unlockedTableIds: Record<string, boolean>;
  roomStatus: RoomConnectionStatus;
  roomError: string | null;
  personalArchive: PersonalArchiveData;
  personalArchiveStatus: 'idle' | 'loading' | 'loaded' | 'error';
  personalArchiveError: string | null;
  personalArchiveLastFetchedAt: number | null;

  fetchPersonalArchive: (force?: boolean) => Promise<void>;
  fetchGameOwnerStatus: () => Promise<boolean>;
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
  joinTable: (tableId: string, seatIndex: number, currency?: 'Gcoin' | 'Bonus') => Promise<ActionOutcome>;
  observeTable: (tableId: string) => void;
  recordVisit: (tableId: string) => Promise<void>;
  leaveTable: (tableId: string, seatIndex?: number | number[], isTimeout?: boolean) => Promise<ActionOutcome>;
  unlockTableBalance: (tableId: string) => Promise<ActionOutcome>;
  refillGameCoins: (tableId?: string) => Promise<ActionOutcome>;
  placeBet: (tableId: string, seatIndex: number, amount: number, sideBets?: SideBets) => Promise<ActionOutcome>;
  placeBets: (tableId: string, seatIndices: number[], amount: number, sideBets?: SideBets) => Promise<ActionOutcome>;
  closeTable: (tableId: string) => Promise<void>;

  startGame: (tableId: string) => Promise<ActionOutcome>;
  hit: (tableId: string, seatIndex: number) => Promise<ActionOutcome>;
  stand: (tableId: string, seatIndex: number) => Promise<ActionOutcome>;
  doubleDown: (tableId: string, seatIndex: number) => Promise<ActionOutcome>;
  split: (tableId: string, seatIndex: number) => Promise<ActionOutcome>;
  buyInsurance: (tableId: string, seatIndex: number) => Promise<ActionOutcome>;
  dealerPlay: (tableId: string) => Promise<ActionOutcome>;
  resolveGame: (tableId: string) => Promise<void>;
  addGameRecord: (record: GameRecord) => void;
}

export const useGameStore = create<GameStore>((set, get) => {
  let lastAppliedRoomSnapshotSig = '';

  const applyOnlineRoomSnapshot = (
    rawRoomState: Record<string, any>,
    allocation?: { roomId: string; playerId: string },
    roomPlayers?: RoomPlayer[]
  ) => {
    const roomState = unwrapOnlineRoomState(rawRoomState);
    if (!roomState || !Array.isArray(roomState.seats)) {
      return;
    }

    const sdkPlayers = roomPlayers ?? getRandseedOnlinePlayers();

    roomState.playerNames =
      roomState.playerNames && typeof roomState.playerNames === 'object'
        ? { ...roomState.playerNames }
        : {};
    roomState.playerAvatars =
      roomState.playerAvatars && typeof roomState.playerAvatars === 'object'
        ? { ...roomState.playerAvatars }
        : {};

    // Merge trusted public display profiles (`displayName`, `avatarUrl`, `isGameCreator`) from @randseed/game-sdk@0.8.0
    const sdkRosterById = new Map<string, RoomPlayer>();
    if (Array.isArray(sdkPlayers)) {
      for (const rp of sdkPlayers) {
        if (!rp || typeof rp.playerId !== 'string' || !rp.playerId.trim()) continue;
        const pid = rp.playerId.trim();
        sdkRosterById.set(pid, rp);
        if (typeof rp.displayName === 'string' && rp.displayName.trim()) {
          roomState.playerNames[pid] = rp.displayName.trim();
        }
        if (typeof rp.avatarUrl === 'string' && rp.avatarUrl.trim()) {
          roomState.playerAvatars[pid] = rp.avatarUrl.trim();
        }
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
      (typeof roomState.self?.playerId === 'string' && roomState.self.playerId) ||
      current?.id ||
      '';

    if (!resolvedId) {
      return;
    }

    const myRosterProfile =
      sdkRosterById.get(resolvedId) || getRandseedCurrentPlayerProfile(resolvedId);
    const confirmedOwner = Boolean(
      get().isGameOwner ||
        myRosterProfile?.isGameCreator === true ||
        roomState._privateState?.isGameOwner === true
    );

    const viewRev = Number(roomState.viewRev || 0);
    if (viewRev > 0 && get().roomStatus === 'connected' && current?.id === resolvedId) {
      const rosterSig = Array.isArray(sdkPlayers)
        ? sdkPlayers
            .map(
              (rp) =>
                `${rp.playerId}:${rp.displayName ?? ''}:${rp.avatarUrl ?? ''}:${
                  rp.isGameCreator === true ? '1' : '0'
                }`
            )
            .join(',')
        : '';
      const disconnectedSig = Array.isArray(roomState.disconnectedPlayerIds)
        ? roomState.disconnectedPlayerIds.join(',')
        : '';
      const snapSig = `${roomState.matchId ?? ''}:${roomState.matchSeq ?? 0}:${viewRev}:${resolvedId}:${confirmedOwner ? '1' : '0'}:${rosterSig}:${disconnectedSig}`;
      if (snapSig === lastAppliedRoomSnapshotSig) {
        return;
      }
      lastAppliedRoomSnapshotSig = snapSig;
    } else {
      lastAppliedRoomSnapshotSig = '';
    }

    const sdkMyName =
      typeof myRosterProfile?.displayName === 'string' && myRosterProfile.displayName.trim()
        ? myRosterProfile.displayName.trim()
        : '';
    const sdkMyAvatar =
      typeof myRosterProfile?.avatarUrl === 'string' && myRosterProfile.avatarUrl.trim()
        ? myRosterProfile.avatarUrl.trim()
        : '';

    const resolvedName =
      sdkMyName ||
      (roomState.playerNames?.[resolvedId] && roomState.playerNames[resolvedId] !== resolvedId
        ? roomState.playerNames[resolvedId]
        : '') ||
      (current?.name && current.name !== 'Player' ? current.name : '') ||
      formatOpaquePlayerId(resolvedId);

    const resolvedAvatar =
      sdkMyAvatar ||
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
      role: confirmedOwner ? 'creator' : 'player',
      isCreator: confirmedOwner,
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

    const disconnectedPlayerIds: string[] = Array.isArray(roomState.disconnectedPlayerIds)
      ? roomState.disconnectedPlayerIds.filter((id: unknown): id is string => typeof id === 'string')
      : [];

    let detectedNewSettledRound = false;
    for (const t of Object.values(nextTables)) {
      const roundId = t.lastRoundSummary?.roundId;
      if (roundId && !seenSettledRoundIdsForArchive.has(roundId)) {
        seenSettledRoundIdsForArchive.add(roundId);
        // Only trigger a background refresh if we already fetched the archive at least once
        if (get().personalArchiveLastFetchedAt !== null) {
          detectedNewSettledRound = true;
        }
      }
    }

    set({
      currentUser: syncedUser,
      isGameOwner: confirmedOwner,
      tables: nextTables,
      gameRecords: updatedRecords,
      onlinePlayers,
      disconnectedPlayerIds,
      unlockedTableIds: nextUnlocked,
      activeTableId: nextActiveId,
      roomStatus: 'connected',
      roomError: null,
    });

    if (get().personalArchiveStatus === 'idle') {
      if (!archiveWarmupTimer) {
        archiveWarmupTimer = setTimeout(() => {
          archiveWarmupTimer = null;
          if (get().personalArchiveStatus === 'idle') {
            get().fetchPersonalArchive().catch(() => {});
          }
        }, 1000);
      }
    } else if (detectedNewSettledRound) {
      if (archiveRefreshTimer) clearTimeout(archiveRefreshTimer);
      archiveRefreshTimer = setTimeout(() => {
        archiveRefreshTimer = null;
        get().fetchPersonalArchive(true).catch(() => {});
      }, 600);
    }
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

  const dispatchConfirmedOnlineAction = async (
    actionData: Record<string, any>
  ): Promise<ActionOutcome> => {
    return sendRandseedRoomActionConfirmed(actionData);
  };

  const inFlightTableStepPromises = new Map<string, Promise<ActionOutcome>>();
  const completedTableStepKeys = new Set<string>();

  const markTableStepCompleted = (stepKey: string, ttlMs = 4000) => {
    completedTableStepKeys.add(stepKey);
    setTimeout(() => {
      completedTableStepKeys.delete(stepKey);
    }, ttlMs);
  };

  const dispatchTurnStepAction = (
    tableId: string,
    seatIndex: number,
    actionData: Record<string, any>
  ): Promise<ActionOutcome> => {
    const t = get().tables[tableId];
    const seat = t?.seats?.[seatIndex];
    const hand = seat?.hand;
    const turnStepKey = `turn:${tableId}:${t?.roundsPlayed ?? 0}:${t?.seats?.length ?? 0}:${seatIndex}:${hand?.cards?.length ?? 0}:${hand?.status ?? ''}:${hand?.insuranceBet ?? 0}`;

    if (completedTableStepKeys.has(turnStepKey)) {
      return Promise.resolve({ ok: true });
    }
    const existing = inFlightTableStepPromises.get(turnStepKey);
    if (existing) {
      return existing;
    }
    const promise = dispatchConfirmedOnlineAction(actionData)
      .then((res) => {
        if (res.ok) {
          markTableStepCompleted(turnStepKey, 4500);
        }
        return res;
      })
      .finally(() => {
        inFlightTableStepPromises.delete(turnStepKey);
      });
    inFlightTableStepPromises.set(turnStepKey, promise);
    return promise;
  };

  const connectAndSyncRoom = async (fallbackName = 'Player', fallbackAvatar?: string) => {
    const res = await matchRandseedRoom(
      (roomState, allocation, _snapshot, players) => {
        applyOnlineRoomSnapshot(roomState, allocation, players);
      },
      (players) => {
        set((state) => {
          const profileMap = new Map<string, RoomPlayer>();
          for (const rp of players) {
            if (rp && typeof rp.playerId === 'string' && rp.playerId.trim()) {
              profileMap.set(rp.playerId.trim(), rp);
            }
          }

          let nextUser = state.currentUser;
          let nextOwner = state.isGameOwner;
          const allocPlayerId =
            getRandseedRoomAllocation()?.playerId ||
            (players.length === 1 && typeof players[0]?.playerId === 'string'
              ? players[0].playerId.trim()
              : undefined);
          if (nextUser) {
            if (nextUser.id === 'connecting_player' && allocPlayerId) {
              nextUser = { ...nextUser, id: allocPlayerId };
            }
            const me = profileMap.get(nextUser.id);
            if (me) {
              const sdkName =
                typeof me.displayName === 'string' && me.displayName.trim()
                  ? me.displayName.trim()
                  : nextUser.name;
              const sdkAvatar =
                typeof me.avatarUrl === 'string' && me.avatarUrl.trim()
                  ? me.avatarUrl.trim()
                  : nextUser.avatar;
              if (me.isGameCreator === true) {
                nextOwner = true;
              }
              nextUser = {
                ...nextUser,
                name: sdkName,
                avatar: sdkAvatar,
                role: nextOwner ? 'creator' : 'player',
                isCreator: nextOwner,
              };
            }
          }

          // Also refresh seated player & custom table host profiles immediately on roster change
          const updatedTables: Record<string, Table> = {};
          for (const [tid, t] of Object.entries(state.tables)) {
            const hostEntry = t.houseId && t.houseId !== 'system' ? profileMap.get(t.houseId) : undefined;
            const nextHouseName =
              (typeof hostEntry?.displayName === 'string' && hostEntry.displayName.trim()) ||
              t.houseName;
            const nextHouseAvatar =
              (typeof hostEntry?.avatarUrl === 'string' && hostEntry.avatarUrl.trim()) ||
              t.houseAvatar;
            const nextSeats = t.seats.map((s) => {
              if (!s.userId) return s;
              const pEntry = profileMap.get(s.userId);
              if (!pEntry) return s;
              const sName =
                (typeof pEntry.displayName === 'string' && pEntry.displayName.trim()) || s.name;
              const sAvatar =
                (typeof pEntry.avatarUrl === 'string' && pEntry.avatarUrl.trim()) || s.avatar;
              return sName !== s.name || sAvatar !== s.avatar
                ? { ...s, name: sName, avatar: sAvatar }
                : s;
            });
            updatedTables[tid] = {
              ...t,
              houseName: nextHouseName,
              houseAvatar: nextHouseAvatar,
              seats: nextSeats,
            };
          }

          return {
            currentUser: nextUser,
            isGameOwner: nextOwner,
            tables: updatedTables,
            onlinePlayers: buildOnlinePlayersList(
              updatedTables,
              nextUser,
              players,
              latestOnlineRoomState
            ),
          };
        });
      }
    );

    if (
      res?.snapshot?.state &&
      typeof res.snapshot.state === 'object' &&
      !Array.isArray(res.snapshot.state)
    ) {
      applyOnlineRoomSnapshot(
        res.snapshot.state as Record<string, any>,
        res.allocation,
        res.players
      );
    }
  };

  const initialBootstrapUser: User = {
    id: 'connecting_player',
    name: 'Player',
    balance: DEFAULT_GAME_COINS,
    bonusBalance: 0,
    role: 'player',
    isCreator: false,
  };

  const initialBootstrapTable1 = mapRoomStateToTable(
    {
      name: 'Table #1',
      houseId: 'system',
      mode: 'regular',
      winningRule: 'standard',
      order: 'sequential',
      minBet: 10,
      maxBet: 500,
      actionTimeLimitSec: 20,
      phase: 'betting',
      isPublic: true,
      visits: 1,
      liquidity: 100000,
      initialLiquidity: 100000,
      deckRemainingCount: 312,
      discardCount: 0,
      roundsPlayed: 0,
      seats: Array.from({ length: 7 }, (_, seatIndex) => ({
        seatIndex,
        playerId: null,
        isReady: false,
        hand: null,
      })),
      balances: {},
      walletCoins: {},
    },
    'table_1'
  );

  return {
    currentUser: initialBootstrapUser,
    isGameOwner: false,
    tables: { table_1: initialBootstrapTable1 },
    activeTableId: null,
    gameRecords: [],
    onlinePlayers: [],
    disconnectedPlayerIds: [],
    unlockedTableIds: {},
    roomStatus: getRandseedRoomStatus(),
    roomError: getRandseedRoomError(),
    personalArchive: createEmptyPersonalArchive(),
    personalArchiveStatus: 'idle',
    personalArchiveError: null,
    personalArchiveLastFetchedAt: null,

    fetchGameOwnerStatus: async () => {
      if (ownerStatusInFlight) {
        return ownerStatusInFlight;
      }
      ownerStatusInFlight = (async () => {
        try {
          const metaOwner =
            typeof document !== 'undefined'
              ? (
                  document.querySelector('meta[name="randseed-game-owner"]')?.getAttribute('content') ||
                  document.querySelector('meta[name="randseed-is-owner"]')?.getAttribute('content') ||
                  ''
                )
                  .trim()
                  .toLowerCase()
              : '';
          if (metaOwner === 'true' || metaOwner === '1') {
            set((state) => ({
              isGameOwner: true,
              currentUser: state.currentUser
                ? { ...state.currentUser, role: 'creator', isCreator: true }
                : null,
            }));
            return true;
          }

          const statsUrl = new URL('./api/stats', window.location.href).href;
          const res = await fetch(statsUrl, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: AbortSignal.timeout(2000),
          });
          if (!res.ok) {
            return Boolean(get().isGameOwner);
          }
          const contentType = (res.headers.get('content-type') || '').toLowerCase();
          if (!contentType.includes('application/json')) {
            return Boolean(get().isGameOwner);
          }
          const data = await res.json();
          const apiConfirmedOwner = Boolean(
            data && (data.isGameOwner === true || data.isCreator === true)
          );
          set((state) => {
            const sdkSelf = getRandseedCurrentPlayerProfile(state.currentUser?.id);
            const nextOwner = Boolean(
              state.isGameOwner ||
                apiConfirmedOwner ||
                sdkSelf?.isGameCreator === true ||
                latestOnlineRoomState?._privateState?.isGameOwner === true
            );
            return {
              isGameOwner: nextOwner,
              currentUser: state.currentUser
                ? {
                    ...state.currentUser,
                    role: nextOwner ? 'creator' : 'player',
                    isCreator: nextOwner,
                  }
                : null,
            };
          });
          return Boolean(get().isGameOwner);
        } catch {
          return Boolean(get().isGameOwner);
        } finally {
          ownerStatusInFlight = null;
        }
      })();
      return ownerStatusInFlight;
    },

    fetchPersonalArchive: async (force = false) => {
      const state = get();
      if (archiveFetchInFlight) {
        return archiveFetchInFlight;
      }
      if (
        !force &&
        state.personalArchiveStatus === 'loaded' &&
        state.personalArchiveLastFetchedAt &&
        Date.now() - state.personalArchiveLastFetchedAt < 5000
      ) {
        return;
      }

      archiveFetchInFlight = (async () => {
        set({
          personalArchiveStatus: 'loading',
          personalArchiveError: null,
        });
        const res = await fetchAllRandseedMatchHistory({
          pageSize: force ? 100 : 50,
          maxPages: force ? 10 : 2,
        });
        if (res.error) {
          set({
            personalArchiveStatus: 'error',
            personalArchiveError: res.error,
          });
          return;
        }

        const currentUserId = get().currentUser?.id;
        const parsed = buildPersonalArchiveFromEntries(res.items, currentUserId);
        set({
          personalArchive: parsed,
          personalArchiveStatus: 'loaded',
          personalArchiveError: null,
          personalArchiveLastFetchedAt: Date.now(),
        });
      })().finally(() => {
        archiveFetchInFlight = null;
      });

      return archiveFetchInFlight;
    },

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
        }

        // Fire runtime initialization and owner check concurrently so neither blocks room connection
        void initRandseedRuntime().catch(() => null);
        void get().fetchGameOwnerStatus().catch(() => false);

        const effectiveName = (name && name !== 'Player' ? name : '') || 'Player';
        const effectiveAvatar = avatar || undefined;

        await connectAndSyncRoom(effectiveName, effectiveAvatar);
      })().finally(() => {
        loginInFlight = null;
      });

      return loginInFlight;
    },

    reconnectRoom: async () => {
      const cur = get().currentUser;
      await connectAndSyncRoom(cur?.name || 'Player', cur?.avatar);
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
        const isOwner = await get().fetchGameOwnerStatus();
        if (!isOwner) return;
        const nextName = creatorName || current.name || 'Creator';
        await dispatchOnlineAction({
          action: 'sync_profile',
          name: nextName,
          ...(current.avatar ? { avatar: current.avatar } : {}),
        });
        set((state) => ({
          isGameOwner: true,
          currentUser: state.currentUser
            ? { ...state.currentUser, name: nextName, role: 'creator', isCreator: true }
            : null,
        }));
      } else {
        get().exitPublisherMode();
      }
    },

    verifyPublisher: async () => {
      return get().fetchGameOwnerStatus();
    },

    exitPublisherMode: () => {
      set((state) => ({
        isGameOwner: false,
        currentUser: state.currentUser
          ? { ...state.currentUser, role: 'player', isCreator: false }
          : null,
      }));
    },

    createTable: async (settings, liquidity) => {
      const user = get().currentUser;
      if (!user) {
        throw new Error('Player session is not ready yet. Please wait a moment and try again.');
      }
      if (!isRandseedRoomConnected()) {
        throw new Error(
          getRandseedRoomError() ||
            'Online room is not connected. Please wait for the room connection and try again.'
        );
      }

      const newTableId = `table_${Math.random().toString(36).slice(2, 11)}`;
      const safeAvatar =
        typeof user.avatar === 'string' && user.avatar.length > 0 && user.avatar.length <= 4096
          ? user.avatar
          : undefined;
      const safeLiquidity = Number.isFinite(Number(liquidity))
        ? Math.max(0, Math.round(Number(liquidity)))
        : 0;
      const cleanSettings = JSON.parse(JSON.stringify(settings));

      const dispatchRes = await dispatchConfirmedOnlineAction({
        action: 'create_table',
        tableId: newTableId,
        settings: cleanSettings,
        liquidity: safeLiquidity,
        playerName: (user.name || 'Player').trim().slice(0, 120) || 'Player',
        ...(safeAvatar ? { playerAvatar: safeAvatar } : {}),
      });

      if (!dispatchRes.ok) {
        throw new Error(dispatchRes.error || 'Failed to create custom table.');
      }

      // Wait for the authoritative room snapshot containing the new online table
      const waitStart = Date.now();
      while (Date.now() - waitStart < 6000) {
        if (get().tables[newTableId]) break;
        await get().syncStateFromServer();
        if (get().tables[newTableId]) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      if (!get().tables[newTableId]) {
        throw new Error(
          'Custom table was not confirmed by the room server in time. Please try again.'
        );
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

      const res = await dispatchConfirmedOnlineAction({
        action: 'verify_table_code',
        tableId,
        tableCode: submitted,
      });
      if (!res.ok) {
        return false;
      }

      set((state) => ({
        unlockedTableIds: { ...state.unlockedTableIds, [tableId]: true },
      }));
      return true;
    },

    updateTableSettings: async (tableId, settings) => {
      const res = await dispatchConfirmedOnlineAction({
        action: 'update_table_settings',
        tableId,
        settings: JSON.parse(JSON.stringify(settings)),
      });
      if (!res.ok) {
        throw new Error(res.error || 'Failed to update table settings.');
      }
    },

    depositLiquidity: async (tableId, amount) => {
      await dispatchConfirmedOnlineAction({
        action: 'deposit_liquidity',
        tableId,
        amount: Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0,
      });
    },

    pauseTable: async (tableId) => {
      await dispatchConfirmedOnlineAction({
        action: 'pause_table',
        tableId,
      });
    },

    resumeTable: async (tableId) => {
      await dispatchConfirmedOnlineAction({
        action: 'resume_table',
        tableId,
      });
    },

    withdrawLiquidity: async (tableId, amount) => {
      if (amount <= 0) return;
      await dispatchConfirmedOnlineAction({
        action: 'withdraw_liquidity',
        tableId,
        amount: Number.isFinite(Number(amount)) ? Math.max(0, Number(amount)) : 0,
      });
    },

    joinTable: async (tableId, seatIndex, _currency = 'Gcoin') => {
      const user = get().currentUser;
      if (!user) {
        return {
          ok: false,
          code: 'NO_USER',
          error: 'Player session is not ready yet. Please wait a moment and try again.',
        };
      }

      const seatKey = `seat:${tableId}:${seatIndex}:join`;
      const existing = inFlightTableStepPromises.get(seatKey);
      if (existing) {
        return existing;
      }

      const safeName = (user.name || 'Player').trim().slice(0, 120) || 'Player';
      const safeAvatar =
        typeof user.avatar === 'string' && user.avatar.length > 0 && user.avatar.length <= 4096
          ? user.avatar
          : undefined;

      const promise = dispatchConfirmedOnlineAction({
        action: 'join_seat',
        tableId,
        seatIndex,
        playerName: safeName,
        ...(safeAvatar ? { playerAvatar: safeAvatar } : {}),
      })
        .then((res) => {
          if (res.ok) {
            set({ activeTableId: tableId });
          }
          return res;
        })
        .finally(() => {
          inFlightTableStepPromises.delete(seatKey);
        });

      inFlightTableStepPromises.set(seatKey, promise);
      return promise;
    },

    observeTable: (tableId) => {
      const user = get().currentUser;
      if (!user) return;
      // Switch view immediately without firing a state-mutating tick that would race with join_seat
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
      if (!user) {
        return { ok: false, code: 'NO_USER', error: 'Player session is not ready.' };
      }

      const seatTarget = Array.isArray(seatIndex)
        ? seatIndex.join(',')
        : seatIndex !== undefined
        ? String(seatIndex)
        : 'all';
      const leaveKey = `seat:${tableId}:${seatTarget}:leave`;
      const existing = inFlightTableStepPromises.get(leaveKey);
      if (existing) {
        return existing;
      }

      const promise = (async (): Promise<ActionOutcome> => {
        if (Array.isArray(seatIndex)) {
          return dispatchConfirmedOnlineAction({
            action: 'leave_seat',
            tableId,
            seatIndices: seatIndex,
          });
        }
        if (seatIndex !== undefined) {
          return dispatchConfirmedOnlineAction({
            action: 'leave_seat',
            tableId,
            seatIndex,
          });
        }
        const res = await dispatchConfirmedOnlineAction({
          action: 'leave_seat',
          tableId,
        });
        if (res.ok) {
          set({ activeTableId: null });
        }
        return res;
      })().finally(() => {
        inFlightTableStepPromises.delete(leaveKey);
      });

      inFlightTableStepPromises.set(leaveKey, promise);
      return promise;
    },

    unlockTableBalance: async (tableId) => {
      return dispatchConfirmedOnlineAction({
        action: 'unlock_table_balance',
        tableId,
      });
    },

    refillGameCoins: async (tableId) => {
      const targetTableId = tableId || get().activeTableId || Object.keys(get().tables)[0];
      return dispatchConfirmedOnlineAction({
        action: 'claim_refill',
        ...(targetTableId ? { tableId: targetTableId } : {}),
      });
    },

    placeBet: async (tableId, seatIndex, amount, sideBets) => {
      return get().placeBets(tableId, [seatIndex], amount, sideBets);
    },

    placeBets: async (tableId, seatIndices, amount, sideBets) => {
      const t = get().tables[tableId];
      const sortedSeats = [...seatIndices].sort((a, b) => a - b).join(',');
      const dealStepKey = `deal:${tableId}:${t?.roundsPlayed ?? 0}:${t?.status ?? 'waiting'}:${sortedSeats}`;
      if (completedTableStepKeys.has(dealStepKey)) {
        return { ok: true };
      }
      const existing = inFlightTableStepPromises.get(dealStepKey);
      if (existing) {
        return existing;
      }
      const promise = dispatchConfirmedOnlineAction({
        action: 'place_bets',
        tableId,
        seatIndices,
        amount,
        sideBets: {
          pair: sideBets?.pair || 0,
          twentyOnePlusThree: sideBets?.twentyOnePlusThree || 0,
        },
        pairBet: sideBets?.pair || 0,
        plus3Bet: sideBets?.twentyOnePlusThree || 0,
      }).then((res) => {
        if (res.ok) {
          markTableStepCompleted(dealStepKey, 4000);
        }
        return res;
      }).finally(() => {
        inFlightTableStepPromises.delete(dealStepKey);
      });
      inFlightTableStepPromises.set(dealStepKey, promise);
      return promise;
    },

    startGame: async (tableId) => {
      const t = get().tables[tableId];
      const startKey = `start:${tableId}:${t?.roundsPlayed ?? 0}:${t?.status ?? 'waiting'}`;
      if (t?.status === 'playing' || completedTableStepKeys.has(startKey)) {
        return { ok: true };
      }
      const existing = inFlightTableStepPromises.get(startKey);
      if (existing) {
        return existing;
      }
      const promise = dispatchConfirmedOnlineAction({
        action: 'start_game',
        tableId,
      }).then((res) => {
        if (res.ok) {
          markTableStepCompleted(startKey, 4000);
        }
        return res;
      }).finally(() => {
        inFlightTableStepPromises.delete(startKey);
      });
      inFlightTableStepPromises.set(startKey, promise);
      return promise;
    },

    hit: async (tableId, seatIndex) => {
      return dispatchTurnStepAction(tableId, seatIndex, {
        action: 'hit',
        tableId,
        seatIndex,
      });
    },

    stand: async (tableId, seatIndex) => {
      return dispatchTurnStepAction(tableId, seatIndex, {
        action: 'stand',
        tableId,
        seatIndex,
      });
    },

    doubleDown: async (tableId, seatIndex) => {
      return dispatchTurnStepAction(tableId, seatIndex, {
        action: 'double_down',
        tableId,
        seatIndex,
      });
    },

    split: async (tableId, seatIndex) => {
      return dispatchTurnStepAction(tableId, seatIndex, {
        action: 'split',
        tableId,
        seatIndex,
      });
    },

    buyInsurance: async (tableId, seatIndex) => {
      return dispatchTurnStepAction(tableId, seatIndex, {
        action: 'buy_insurance',
        tableId,
        seatIndex,
      });
    },

    dealerPlay: async (tableId) => {
      if (tableId === 'table_1') {
        readyRandseedRoom().catch(() => {});
      }
      return dispatchConfirmedOnlineAction({
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
      const res = await dispatchConfirmedOnlineAction({
        action: 'close_table',
        tableId,
      });
      if (res.ok) {
        set((state) => ({
          activeTableId: state.activeTableId === tableId ? null : state.activeTableId,
        }));
      }
    },
  };
});

// Start matching & connecting to the authoritative room immediately at module load
// so container warmup runs in parallel with initial React rendering.
if (typeof window !== 'undefined') {
  queueMicrotask(() => {
    useGameStore.getState().login('Player').catch(() => {});
  });
}
