import {
  AgentGameBridge,
  getRandseedGameId,
  getRandseedHostOrigin,
  type AgentActionResult,
  type AgentCapabilities,
  type AgentGameAdapter,
  type JsonValue,
} from "@randseed/game-sdk";
import { useGameStore, type PlayingCard, type Table } from "@/store/gameStore";

export const ROYAL_BLACKJACK_AGENT_ACTION_SCHEMA = "royal-blackjack.action.v1";

export const ROYAL_BLACKJACK_AGENT_CAPABILITIES: AgentCapabilities = {
  protocolVersion: 1,
  actionSchema: ROYAL_BLACKJACK_AGENT_ACTION_SCHEMA,
  maxDecisionHz: 2,
  supportsCopilot: true,
  supportsAutoplay: true,
  supportsFollow: true,
};

let agentBridgeInstance: AgentGameBridge | null = null;
let agentBridgeStarted = false;
let isApplyingFromAgentBridge = false;

function encodeCardCompact(card: PlayingCard): string {
  if (!card || card.isHidden) return "??";
  const suitChar =
    card.suit === "spades"
      ? "S"
      : card.suit === "hearts"
      ? "H"
      : card.suit === "diamonds"
      ? "D"
      : "C";
  return `${card.value}${suitChar}`;
}

function resolveObservedTable(): Table | null {
  const store = useGameStore.getState();
  if (store.activeTableId && store.tables[store.activeTableId]) {
    return store.tables[store.activeTableId];
  }
  const uid = store.currentUser?.id;
  if (uid) {
    for (const table of Object.values(store.tables)) {
      if (table.status !== "closed" && table.seats.some((s) => s.userId === uid)) {
        return table;
      }
    }
  }
  return store.tables["table_1"] || Object.values(store.tables).find((t) => t.status !== "closed") || null;
}

function computeLegalActionsForPlayer(table: Table | null, playerId: string, walletCoins: number): string[] {
  if (!table || table.status === "closed" || table.status === "paused") return [];
  const actions: string[] = [];
  const mySeatIndices: number[] = [];
  table.seats.forEach((s, idx) => {
    if (s.userId === playerId) mySeatIndices.push(idx);
  });
  const isPlaying = table.status === "playing";
  const isTournament = table.settings.mode === "tournament";

  if (!isPlaying) {
    if (table.seats.some((s) => s.userId === null)) {
      actions.push("join_seat");
    }
    if (mySeatIndices.length > 0) {
      if (!isTournament) {
        actions.push("leave_seat");
      }
      const unready = mySeatIndices.some((idx) => {
        const s = table.seats[idx];
        return !s.isReady || !s.hand || s.hand.bet <= 0;
      });
      if (unready) {
        actions.push("place_bet");
      }
      if (mySeatIndices.some((idx) => table.seats[idx]?.isReady)) {
        actions.push("start_game");
      }
    } else if (!isTournament && walletCoins >= table.settings.minBet) {
      actions.push("place_bet");
    }
    return actions;
  }

  const activeSeatIdx = table.currentTurnIndex;
  const activeSeat = activeSeatIdx >= 0 ? table.seats[activeSeatIdx] : null;
  if (!activeSeat || activeSeat.userId !== playerId || !activeSeat.hand || activeSeat.hand.status !== "playing") {
    return actions;
  }

  actions.push("hit", "stand");
  const hand = activeSeat.hand;
  const tableBal = table.userBalances?.[playerId]?.balance ?? walletCoins;
  if (hand.cards.length === 2 && tableBal >= hand.bet) {
    actions.push("double_down");
    const c1 = hand.cards[0];
    const c2 = hand.cards[1];
    const rankEq = c1 && c2 && c1.value === c2.value;
    const totalOwnedHands = table.seats.filter((s) => s.userId === playerId && s.hand).length;
    if (rankEq && totalOwnedHands < 4) {
      actions.push("split");
    }
  }
  const dealerUp = table.dealerHand?.cards?.find((c) => !c.isHidden);
  if (
    dealerUp?.value === "A" &&
    hand.cards.length === 2 &&
    !(hand.insuranceBet && hand.insuranceBet > 0) &&
    tableBal >= Math.floor(hand.bet / 2)
  ) {
    actions.push("buy_insurance");
  }

  return actions;
}

/**
 * Synchronous, compact observation (< 4 KB) strictly partitioned into
 * public table state (no deck, no dealer hole card) and current player's own private state.
 */
export function buildRoyalBlackjackAgentObservation(): {
  publicState: JsonValue;
  privateState: JsonValue;
} {
  const store = useGameStore.getState();
  const user = store.currentUser;
  const playerId = user?.id || "";
  const walletCoins = Math.floor(user?.balance || 0);
  const table = resolveObservedTable();

  if (!table) {
    return {
      publicState: {
        view: "lobby",
        activeTableCount: Object.values(store.tables).filter((t) => t.status !== "closed").length,
      },
      privateState: {
        playerId,
        walletCoins,
        isMyTurn: false,
        legalActions: [],
      },
    };
  }

  const hideSecretBets = table.settings.mode === "tournament" && table.status !== "playing";
  const mySeatIndices: number[] = [];
  const myHands: JsonValue[] = [];

  const publicSeats: JsonValue[] = table.seats.map((seat, idx) => {
    if (seat.userId === playerId) {
      mySeatIndices.push(idx);
      if (seat.hand) {
        myHands.push({
          seatIndex: idx,
          cards: seat.hand.cards.map(encodeCardCompact),
          score: seat.hand.score,
          bet: seat.hand.bet,
          insuranceBet: seat.hand.insuranceBet || 0,
          sidePair: seat.hand.sideBets?.pair || 0,
          sidePlus3: seat.hand.sideBets?.twentyOnePlusThree || 0,
          status: seat.hand.status,
        });
      }
    }
    return {
      seatIndex: idx,
      occupied: seat.userId !== null,
      playerId: seat.userId,
      isReady: seat.isReady,
      isSplit: Boolean(seat.isSplitHand),
      hand: seat.hand
        ? {
            cards: seat.hand.cards.map(encodeCardCompact),
            score: seat.hand.score,
            bet: hideSecretBets ? 0 : seat.hand.bet,
            status: seat.hand.status,
          }
        : null,
    };
  });

  const dealerCards = table.dealerHand
    ? table.dealerHand.cards.map(encodeCardCompact)
    : [];
  const legalActions = computeLegalActionsForPlayer(table, playerId, walletCoins);
  const isMyTurn =
    table.status === "playing" &&
    table.currentTurnIndex >= 0 &&
    table.seats[table.currentTurnIndex]?.userId === playerId;
  const tableBalance =
    table.userBalances?.[playerId]?.balance !== undefined
      ? Math.floor(table.userBalances[playerId].balance)
      : walletCoins;

  const publicState: JsonValue = {
    tableId: table.id,
    mode: table.settings.mode,
    status: table.status,
    minBet: table.settings.minBet,
    maxBet: table.settings.maxBet,
    roundsPlayed: table.roundsPlayed || 0,
    deckRemaining: Array.isArray(table.deck) ? table.deck.length : 0,
    activeSeatIndex: table.currentTurnIndex,
    dealer: table.dealerHand
      ? {
          cards: dealerCards,
          score: table.dealerHand.score,
          status: table.dealerHand.status,
        }
      : null,
    seats: publicSeats,
  };

  const privateState: JsonValue = {
    playerId,
    walletCoins,
    tableBalance,
    mySeatIndices,
    isMyTurn,
    legalActions,
    myHands,
  };

  return { publicState, privateState };
}

function isPlainRecord(value: JsonValue): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Synchronous action validator & dispatcher required by AgentGameBridge.
 */
function applyRoyalBlackjackAgentAction(action: JsonValue): AgentActionResult {
  if (!isPlainRecord(action) || typeof action.action !== "string") {
    return { accepted: false, reason: "Action must be an object with a string 'action' field." };
  }

  const store = useGameStore.getState();
  const playerId = store.currentUser?.id;
  if (!playerId || playerId === "connecting_player") {
    return { accepted: false, reason: "Player session is not connected yet." };
  }

  const requestedTableId = typeof action.tableId === "string" ? action.tableId : undefined;
  const table =
    (requestedTableId ? store.tables[requestedTableId] : null) || resolveObservedTable();
  if (!table || table.status === "closed") {
    return { accepted: false, reason: "No active table is available." };
  }

  const actionName = action.action;
  const mySeatIndexDefault = table.seats.findIndex((s) => s.userId === playerId);
  const explicitSeatIndex =
    typeof action.seatIndex === "number" && Number.isInteger(action.seatIndex)
      ? action.seatIndex
      : undefined;

  // Dispatch synchronously without awaiting network receipt so AgentGameBridge revocation remains synchronous.
  const runStoreCall = (fn: () => Promise<unknown>) => {
    isApplyingFromAgentBridge = true;
    try {
      void fn().catch(() => {});
    } finally {
      isApplyingFromAgentBridge = false;
    }
  };

  if (actionName === "join_seat") {
    const seatIdx =
      explicitSeatIndex !== undefined
        ? explicitSeatIndex
        : table.seats.findIndex((s) => s.userId === null);
    if (seatIdx < 0 || seatIdx >= table.seats.length || table.seats[seatIdx]?.userId !== null) {
      return { accepted: false, reason: "Requested seat is unavailable." };
    }
    const buyIn =
      typeof action.buyInAmount === "number" && Number.isFinite(action.buyInAmount) && action.buyInAmount > 0
        ? Math.round(action.buyInAmount)
        : undefined;
    runStoreCall(() => store.joinTable(table.id, seatIdx, "Gcoin", buyIn));
    return { accepted: true };
  }

  if (actionName === "leave_seat") {
    if (table.settings.mode === "tournament") {
      return { accepted: false, reason: "Cannot leave a tournament seat once seated." };
    }
    if (table.status === "playing") {
      return { accepted: false, reason: "Cannot leave seat during an active hand." };
    }
    runStoreCall(() => store.leaveTable(table.id, explicitSeatIndex));
    return { accepted: true };
  }

  if (actionName === "place_bet") {
    if (table.status === "playing") {
      return { accepted: false, reason: "Cannot place bets while a hand is in progress." };
    }
    const seatIdx = explicitSeatIndex !== undefined ? explicitSeatIndex : mySeatIndexDefault;
    if (seatIdx < 0 || seatIdx >= table.seats.length) {
      return { accepted: false, reason: "Player must occupy or specify a valid seat." };
    }
    const amount =
      typeof action.amount === "number" && Number.isFinite(action.amount)
        ? Math.round(action.amount)
        : table.settings.minBet;
    if (amount < table.settings.minBet || amount > table.settings.maxBet) {
      return { accepted: false, reason: "Bet amount is outside table limits." };
    }
    const pairBet =
      typeof action.pairBet === "number" && Number.isFinite(action.pairBet)
        ? Math.max(0, Math.round(action.pairBet))
        : 0;
    const plus3Bet =
      typeof action.plus3Bet === "number" && Number.isFinite(action.plus3Bet)
        ? Math.max(0, Math.round(action.plus3Bet))
        : 0;
    runStoreCall(() =>
      store.placeBet(table.id, seatIdx, amount, {
        pair: pairBet,
        twentyOnePlusThree: plus3Bet,
      })
    );
    return { accepted: true };
  }

  if (actionName === "start_game") {
    if (table.status === "playing") {
      return { accepted: false, reason: "Hand is already in progress." };
    }
    runStoreCall(() => store.startGame(table.id));
    return { accepted: true };
  }

  if (actionName === "table_buy_in") {
    const amount =
      typeof action.amount === "number" && Number.isFinite(action.amount)
        ? Math.round(action.amount)
        : 0;
    if (amount < table.settings.minBet) {
      return { accepted: false, reason: "Buy-in amount must be at least minBet." };
    }
    runStoreCall(() => store.buyInTableChips(table.id, amount));
    return { accepted: true };
  }

  if (actionName === "ready_next") {
    runStoreCall(() => store.dealerPlay(table.id));
    return { accepted: true };
  }

  if (
    actionName === "hit" ||
    actionName === "stand" ||
    actionName === "double_down" ||
    actionName === "split" ||
    actionName === "buy_insurance"
  ) {
    if (table.status !== "playing") {
      return { accepted: false, reason: "Table is not currently in the playing phase." };
    }
    const seatIdx =
      explicitSeatIndex !== undefined ? explicitSeatIndex : table.currentTurnIndex;
    const seat = seatIdx >= 0 ? table.seats[seatIdx] : null;
    if (!seat || seat.userId !== playerId || seatIdx !== table.currentTurnIndex) {
      return { accepted: false, reason: "It is not currently this player's turn." };
    }
    if (actionName === "hit") {
      runStoreCall(() => store.hit(table.id, seatIdx));
    } else if (actionName === "stand") {
      runStoreCall(() => store.stand(table.id, seatIdx));
    } else if (actionName === "double_down") {
      runStoreCall(() => store.doubleDown(table.id, seatIdx));
    } else if (actionName === "split") {
      runStoreCall(() => store.split(table.id, seatIdx));
    } else {
      runStoreCall(() => store.buyInsurance(table.id, seatIdx));
    }
    return { accepted: true };
  }

  return { accepted: false, reason: `Unsupported action '${actionName}'.` };
}

function resolveTrustedShellOrigin(): string | undefined {
  const metaEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
  const configured =
    typeof metaEnv?.VITE_RANDSEED_PLAYER_SHELL_ORIGIN === "string"
      ? metaEnv.VITE_RANDSEED_PLAYER_SHELL_ORIGIN.trim()
      : "";
  if (configured) return configured;
  try {
    return getRandseedHostOrigin() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Initialize and start @randseed/game-sdk@0.9.0 AgentGameBridge when running
 * with a valid RandSeed Game ID and trusted Player Shell origin.
 */
export function initRandseedAgentBridge(): AgentGameBridge | null {
  if (typeof window === "undefined") return null;
  if (agentBridgeInstance && agentBridgeStarted) return agentBridgeInstance;

  let gameId: string | undefined;
  try {
    gameId = getRandseedGameId();
  } catch {
    gameId = undefined;
  }
  const shellOrigin = resolveTrustedShellOrigin();
  if (!gameId || !shellOrigin) {
    return null;
  }

  try {
    const adapter: AgentGameAdapter = {
      capabilities: ROYAL_BLACKJACK_AGENT_CAPABILITIES,
      observe: () => buildRoyalBlackjackAgentObservation(),
      applyAction: (action) => applyRoyalBlackjackAgentAction(action),
      onError: (err) => {
        console.warn("[RandSeed AgentGameBridge]", err);
      },
    };
    const bridge = new AgentGameBridge(gameId, shellOrigin, adapter);
    bridge.start();
    agentBridgeInstance = bridge;
    agentBridgeStarted = true;
    return bridge;
  } catch (err) {
    console.warn("[RandSeed AgentGameBridge] Initialization skipped:", err);
    agentBridgeInstance = null;
    agentBridgeStarted = false;
    return null;
  }
}

export function stopRandseedAgentBridge(): void {
  if (agentBridgeInstance) {
    try {
      agentBridgeInstance.stop();
    } catch {
      // Ignore cleanup errors
    }
  }
  agentBridgeInstance = null;
  agentBridgeStarted = false;
}

export function invalidateRandseedAgentObservation(): void {
  try {
    agentBridgeInstance?.invalidateObservation();
  } catch {
    // Ignore
  }
}

export function revokeRandseedAgentControl(): void {
  try {
    agentBridgeInstance?.revokeControl();
  } catch {
    // Ignore
  }
}

/**
 * Notify AgentGameBridge of a human gameplay action so Follow mode records the
 * before/action/result/after transition and Autoplay control is cleanly revoked on manual input.
 */
export function recordHumanBlackjackAction(action: Record<string, JsonValue>): void {
  if (!agentBridgeInstance || isApplyingFromAgentBridge) return;
  try {
    // When Follow is active, performHumanAction records before/action/result/after.
    // Prevent re-dispatching the store call twice since the caller is already executing it.
    isApplyingFromAgentBridge = true;
    agentBridgeInstance.invalidateObservation();
    const bridgeAny = agentBridgeInstance as unknown as {
      sessionId?: string | null;
      mode?: string;
    };
    if (bridgeAny.sessionId && bridgeAny.mode !== "follow") {
      agentBridgeInstance.revokeControl();
    } else if (bridgeAny.sessionId && bridgeAny.mode === "follow") {
      // Let performHumanAction record cleanly without double-executing store side effects:
      // we temporarily swap applyAction via the re-entrancy flag handled inside executeHumanRecordedAction.
      const prevAdapterApply = (agentBridgeInstance as unknown as { adapter?: AgentGameAdapter }).adapter;
      if (prevAdapterApply) {
        const originalApply = prevAdapterApply.applyAction;
        prevAdapterApply.applyAction = () => ({ accepted: true });
        try {
          agentBridgeInstance.performHumanAction(action);
        } finally {
          prevAdapterApply.applyAction = originalApply;
        }
      }
    }
  } catch {
    // Human play must never be blocked by recording errors
  } finally {
    isApplyingFromAgentBridge = false;
  }
}
