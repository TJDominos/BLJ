import {
  MAX_RUNTIME_FRAME_WIDTH,
  RuntimeClient,
  RoomClient,
  RoomClientError,
  getRandseedGameId,
  getRandseedHostOrigin,
  peekRoomSnapshotState,
  readAgentPlayerView,
  classifyAgentPlayerViewUpdate,
  createAgentPlayerTransition,
  fetchMatchReplay,
  fetchPlayerMatchHistory,
  type AgentPlayerTransition,
  type AgentPlayerView,
  type AgentPlayerViewUpdate,
  type ArchiveHistoryEntry,
  type ArchiveHistoryPage,
  type JsonValue,
  type MatchReplayResult,
  type RoomConnectionStatus,
  type RoomMatch,
  type RoomPlayer,
  type RoomSnapshot,
  type RuntimeViewportDeclaration,
} from "@randseed/game-sdk";
import { useUIStore } from "@/store/uiStore";
import { soundManager } from "@/lib/sounds";

export type RoomAgentProof = NonNullable<AgentPlayerTransition["proof"]>;

export type {
  AgentPlayerTransition,
  AgentPlayerView,
  AgentPlayerViewUpdate,
  RoomConnectionStatus,
  RoomMatch,
  RoomPlayer,
  RoomSnapshot,
  RuntimeViewportDeclaration,
  ArchiveHistoryEntry,
  ArchiveHistoryPage,
  MatchReplayResult,
};

export const DESIGN_VIEWPORT_WIDTH = MAX_RUNTIME_FRAME_WIDTH; // 1280
export const DESIGN_VIEWPORT_HEIGHT = 720;

export const DEFAULT_RUNTIME_VIEWPORT: RuntimeViewportDeclaration = {
  designWidth: DESIGN_VIEWPORT_WIDTH,
  designHeight: DESIGN_VIEWPORT_HEIGHT,
  resizeMode: "responsive",
};

export function formatOpaquePlayerId(playerId: string): string {
  const trimmed = (playerId || "").trim();
  if (!trimmed) return "Player";
  if (trimmed.startsWith("bot_")) return trimmed;
  if (trimmed.length <= 12 && !/^[0-9a-f-]{10,}$/i.test(trimmed)) {
    return trimmed;
  }
  return `Player #${trimmed.slice(-4).toUpperCase()}`;
}

function safeGetRandseedGameId(): string {
  try {
    return getRandseedGameId() || "";
  } catch {
    return "";
  }
}

function safeGetRandseedHostOrigin(): string {
  try {
    return getRandseedHostOrigin() || "";
  } catch {
    return "";
  }
}

export const RANDSEED_GAME_ID = safeGetRandseedGameId();
export const RANDSEED_HOST_ORIGIN = safeGetRandseedHostOrigin();
export const GAME_SLUG = "royal-blackjack";

let runtimeClientInstance: RuntimeClient | null = null;
let runtimeInitPromise: Promise<RuntimeClient | null> | null = null;
let roomClientInstance: RoomClient | null = null;
let roomConnectionStatus: RoomConnectionStatus = "idle";
let roomConnectionError: string | null = null;
let cachedRoomPlayers: RoomPlayer[] = [];
let cachedRoomAllocation: RoomMatch | undefined = undefined;
let latestRawSnapshot: RoomSnapshot | undefined = undefined;
let lastDeliveredSnapshotKey: string | null = null;
let lastSnapshotReceivedAtMs = 0;

export type AgentPlayerViewStatus = "idle" | "ready" | "unavailable";
let latestAgentPlayerView: AgentPlayerView | null = null;
let latestAgentPlayerProof: RoomAgentProof | undefined = undefined;
let latestAgentPlayerViewStatus: AgentPlayerViewStatus = "idle";
let agentPlayerViewListeners: Array<
  (transition: AgentPlayerTransition | null, status: AgentPlayerViewStatus) => void
> = [];

function processSnapshotAgentPlayerView(
  snapshot: RoomSnapshot,
  allocation?: RoomMatch
): void {
  if (snapshot.agentPlayerViewStatus === "unavailable") {
    latestAgentPlayerViewStatus = "unavailable";
    for (const listener of agentPlayerViewListeners) {
      listener(null, latestAgentPlayerViewStatus);
    }
    return;
  }
  if (!snapshot.agentPlayer) return;
  const expectedPlayerId = allocation?.playerId;
  const expectedRoomId = allocation?.roomId;
  if (!expectedPlayerId || !expectedRoomId) return;

  try {
    const view = readAgentPlayerView(snapshot, expectedPlayerId, expectedRoomId);
    const update = classifyAgentPlayerViewUpdate(latestAgentPlayerView, view);
    const transition = createAgentPlayerTransition(
      snapshot,
      latestAgentPlayerView,
      expectedPlayerId,
      expectedRoomId,
      latestAgentPlayerProof
    );
    // Preserve monotonic cursor: never roll back on stale or duplicate frames.
    if (update.kind !== "stale" && update.kind !== "duplicate") {
      latestAgentPlayerView = view;
      latestAgentPlayerProof = transition.proof;
    }
    latestAgentPlayerViewStatus = "ready";
    for (const listener of agentPlayerViewListeners) {
      listener(transition, latestAgentPlayerViewStatus);
    }
  } catch {
    // Keep gameplay snapshots uninterrupted even if optional Agent projection fails validation.
    latestAgentPlayerViewStatus = "unavailable";
    for (const listener of agentPlayerViewListeners) {
      listener(null, latestAgentPlayerViewStatus);
    }
  }
}

export function getLatestRandseedAgentPlayerView(): AgentPlayerView | null {
  return latestAgentPlayerView;
}

export function getRandseedAgentPlayerViewStatus(): AgentPlayerViewStatus {
  return latestAgentPlayerViewStatus;
}

export function onRandseedAgentPlayerViewUpdate(
  listener: (transition: AgentPlayerTransition | null, status: AgentPlayerViewStatus) => void
): () => void {
  agentPlayerViewListeners.push(listener);
  return () => {
    agentPlayerViewListeners = agentPlayerViewListeners.filter((l) => l !== listener);
  };
}

let snapshotListener:
  | ((
      state: Record<string, unknown>,
      allocation?: RoomMatch,
      snapshot?: RoomSnapshot,
      players?: RoomPlayer[]
    ) => void)
  | null = null;

let playersChangedListener: ((players: RoomPlayer[]) => void) | null = null;
let statusListeners: Array<(status: RoomConnectionStatus, error: string | null) => void> = [];

function notifyRoomStatusChange(nextStatus: RoomConnectionStatus, errorMessage: string | null = null) {
  roomConnectionStatus = nextStatus;
  if (nextStatus === "connected" || nextStatus === "matching" || nextStatus === "connecting") {
    roomConnectionError = null;
  } else if (errorMessage !== null) {
    roomConnectionError = errorMessage;
  }
  for (const listener of statusListeners) {
    listener(roomConnectionStatus, roomConnectionError);
  }
}

export function onRandseedRoomStatusChange(
  listener: (status: RoomConnectionStatus, error: string | null) => void
): () => void {
  statusListeners.push(listener);
  listener(getRandseedRoomStatus(), roomConnectionError);
  return () => {
    statusListeners = statusListeners.filter((l) => l !== listener);
  };
}

function readSafeRoomPlayers(room: RoomClient | null, snapshot?: RoomSnapshot): RoomPlayer[] {
  if (room) {
    try {
      const list = room.getPlayers();
      if (Array.isArray(list)) {
        cachedRoomPlayers = list;
        return list;
      }
    } catch {
      // Room hosts that do not include a roster cause getPlayers() to throw CAPABILITY_UNAVAILABLE
    }
  }
  const snapPlayers = (snapshot ?? latestRawSnapshot)?.players;
  if (Array.isArray(snapPlayers)) {
    cachedRoomPlayers = snapPlayers;
    return snapPlayers;
  }
  return cachedRoomPlayers;
}


function formatRoomErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof RoomClientError) {
    switch (err.code) {
      case "GAME_ID_UNAVAILABLE":
        return "Platform Game ID is unavailable. Launch through RandSeed or configure VITE_RANDSEED_GAME_ID.";
      case "ROOM_SDK_UPGRADE_REQUIRED":
        return "Room SDK update required. Please refresh to load the latest version.";
      case "GAME_SCOPE_MISMATCH":
        return "Game scope mismatch with platform room allocation.";
      case "ROOM_SCOPE_CHANGED":
        return "Room scope changed during connection. Please reconnect.";
      case "ROOM_START_TIMEOUT":
        return "The online room did not finish starting in time.";
      case "ACTION_RECEIPT_TIMEOUT":
        return "The action timed out waiting for confirmation.";
      case "CAPABILITY_UNAVAILABLE":
        return "Online room capability is unavailable on this host.";
      case "INVALID_GAME_STATE":
        return "Received an invalid game state from the room host.";
      case "INVALID_ROOM_RESPONSE":
        return "Received an invalid room protocol response.";
      case "ROOM_CONFLICT":
        return "Room state updated simultaneously. Retrying automatically — please try again if needed.";
      case "SECURE_RANDOM_UNAVAILABLE":
        return "Browser secure random generator is unavailable.";
      default:
        if (err.message) return err.message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

interface PendingSocketActionEntry {
  reqId: string;
  actionPayload: Record<string, JsonValue>;
  lastSentTick: number;
  resendCount: number;
  resolve: (outcome: { status: "applied" | "rejected"; code?: string } | null) => void;
  retryTimer: ReturnType<typeof setInterval>;
  timeoutTimer: ReturnType<typeof setTimeout>;
}

const pendingSocketActions = new Map<string, PendingSocketActionEntry>();

function extractRecentActionOutcomesFromStateObj(
  stateObj: Record<string, unknown> | null | undefined
): Array<{ reqId: string; status: "applied" | "rejected"; code?: string }> {
  if (!stateObj || typeof stateObj !== "object") return [];
  const selfObj =
    stateObj.self && typeof stateObj.self === "object" && !Array.isArray(stateObj.self)
      ? (stateObj.self as Record<string, unknown>)
      : null;
  const privObj =
    (selfObj?.privateState &&
    typeof selfObj.privateState === "object" &&
    !Array.isArray(selfObj.privateState)
      ? (selfObj.privateState as Record<string, unknown>)
      : null) ||
    (stateObj.privateState &&
    typeof stateObj.privateState === "object" &&
    !Array.isArray(stateObj.privateState)
      ? (stateObj.privateState as Record<string, unknown>)
      : null) ||
    (stateObj._privateState &&
    typeof stateObj._privateState === "object" &&
    !Array.isArray(stateObj._privateState)
      ? (stateObj._privateState as Record<string, unknown>)
      : null);

  const combined: Array<{ reqId: string; status: "applied" | "rejected"; code?: string }> = [];
  if (Array.isArray(privObj?.recentActionOutcomes)) {
    for (const item of privObj!.recentActionOutcomes) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as any).reqId === "string" &&
        ((item as any).status === "applied" || (item as any).status === "rejected")
      ) {
        combined.push(item as { reqId: string; status: "applied" | "rejected"; code?: string });
      }
    }
  }
  const publicMap = stateObj.recentClientActionOutcomes;
  if (publicMap && typeof publicMap === "object" && !Array.isArray(publicMap)) {
    for (const list of Object.values(publicMap as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (
          item &&
          typeof item === "object" &&
          typeof (item as any).reqId === "string" &&
          ((item as any).status === "applied" || (item as any).status === "rejected")
        ) {
          combined.push(item as { reqId: string; status: "applied" | "rejected"; code?: string });
        }
      }
    }
  }
  return combined;
}

function isActionEffectVisibleInStateObj(
  stateObj: Record<string, unknown> | null,
  actionPayload?: Record<string, JsonValue>
): { status: "applied" } | null {
  if (!stateObj || !actionPayload) return null;
  const act = actionPayload.action;
  if (act === "create_table" && typeof actionPayload.tableId === "string" && actionPayload.tableId) {
    const customTables = stateObj.customTables as Record<string, unknown> | undefined;
    if (customTables && typeof customTables === "object" && customTables[actionPayload.tableId]) {
      return { status: "applied" };
    }
  }
  return null;
}

function findClientReqOutcomeInSnapshot(
  snapshot: RoomSnapshot | undefined,
  reqId: string,
  actionPayload?: Record<string, JsonValue>
): { status: "applied" | "rejected"; code?: string } | null {
  if (!snapshot || !snapshot.state || typeof snapshot.state !== "object" || Array.isArray(snapshot.state)) {
    return null;
  }
  const stateObj = snapshot.state as Record<string, unknown>;
  const outcomes = extractRecentActionOutcomesFromStateObj(stateObj);
  const matched = outcomes.find((item) => item.reqId === reqId);
  if (matched) {
    return { status: matched.status, code: matched.code };
  }
  return isActionEffectVisibleInStateObj(stateObj, actionPayload);
}

function inspectSnapshotForSocketActionReceipts(
  stateObj: Record<string, unknown> | null,
  snapshotTick: number
): void {
  if (!stateObj || pendingSocketActions.size === 0) return;
  const rawOutcomes = extractRecentActionOutcomesFromStateObj(stateObj);

  for (const [reqId, waiter] of Array.from(pendingSocketActions.entries())) {
    const matched =
      rawOutcomes.find((item) => item.reqId === reqId) ||
      isActionEffectVisibleInStateObj(stateObj, waiter.actionPayload);

    if (matched) {
      clearInterval(waiter.retryTimer);
      clearTimeout(waiter.timeoutTimer);
      pendingSocketActions.delete(reqId);
      waiter.resolve({ status: matched.status, code: (matched as any).code });
      continue;
    }

    // If the room tick advanced past our sent tick without recording our reqId
    // (e.g. WS frame crossed a tick boundary or was dropped), re-transmit with fresh snapshot tick.
    if (
      snapshotTick > waiter.lastSentTick &&
      waiter.resendCount < 5 &&
      roomClientInstance &&
      roomClientInstance.status === "connected"
    ) {
      const sent = roomClientInstance.sendSocketInput(waiter.actionPayload, {
        allowSameTick: true,
        force: true,
      });
      if (sent) {
        waiter.lastSentTick = snapshotTick;
        waiter.resendCount += 1;
      }
    }
  }
}

function getSnapshotKey(snapshot: RoomSnapshot, players?: RoomPlayer[]): string {
  const rosterSig = Array.isArray(players)
    ? players
        .map(
          (p) =>
            `${p.playerId}:${p.displayName ?? ""}:${p.avatarUrl ?? ""}:${
              p.isGameCreator === true ? "1" : p.isGameCreator === false ? "0" : ""
            }`
        )
        .join(",")
    : "";
  const broadcastLen = Array.isArray(snapshot.broadcasts) ? snapshot.broadcasts.length : 0;
  const stateRec =
    snapshot.state && typeof snapshot.state === "object" && !Array.isArray(snapshot.state)
      ? (snapshot.state as Record<string, unknown>)
      : null;
  const viewRev = typeof stateRec?.viewRev === "number" ? stateRec.viewRev : 0;
  const outcomesLen = extractRecentActionOutcomesFromStateObj(stateRec).length;
  const allocPlayerId =
    cachedRoomAllocation?.playerId ?? roomClientInstance?.allocation?.playerId ?? "";
  return `${snapshot.scope.gameId}:${snapshot.matchId}:${snapshot.matchSeq}:${snapshot.tick}:${viewRev}:${outcomesLen}:${allocPlayerId}:${rosterSig}:${broadcastLen}`;
}

function extractSnapshotState(
  snapshot: RoomSnapshot
): Record<string, unknown> | null {
  const validated = peekRoomSnapshotState<Record<string, JsonValue>>(
    snapshot,
    (val: JsonValue): val is Record<string, JsonValue> =>
      Boolean(val && typeof val === "object" && !Array.isArray(val))
  );
  return validated as Record<string, unknown>;
}

export function getRandseedOnlinePlayers(): RoomPlayer[] {
  return readSafeRoomPlayers(roomClientInstance);
}

/**
 * Read the current player's trusted public profile & owner display hint
 * (`displayName`, `avatarUrl`, `isGameCreator`) from @randseed/game-sdk@0.8.0 RoomClient.getPlayers().
 */
export function getRandseedCurrentPlayerProfile(playerIdOverride?: string): RoomPlayer | null {
  const targetId =
    playerIdOverride ||
    cachedRoomAllocation?.playerId ||
    roomClientInstance?.allocation?.playerId ||
    "";
  if (!targetId) return null;
  const players = readSafeRoomPlayers(roomClientInstance);
  return players.find((p) => p.playerId === targetId) || null;
}

/**
 * Initialize RandSeed RuntimeClient (@randseed/game-sdk@0.8.0) for responsive shell viewport,
 * room session refresh, fullscreen & audio mute bridging.
 */
export async function initRandseedRuntime(): Promise<RuntimeClient | null> {
  if (typeof window === "undefined") return null;
  if (runtimeClientInstance) return runtimeClientInstance;
  if (runtimeInitPromise) return runtimeInitPromise;

  const hostOrigin = safeGetRandseedHostOrigin();
  const isInIframe = (() => {
    try {
      return window.parent !== window;
    } catch {
      return true;
    }
  })();

  // Outside the RandSeed Player Shell iframe without an explicit host origin, skip postMessage wait immediately
  if (!isInIframe && !hostOrigin) {
    return null;
  }

  runtimeInitPromise = (async () => {
    try {
      const client = new RuntimeClient({
        ...(hostOrigin ? { hostOrigin } : {}),
        viewport: DEFAULT_RUNTIME_VIEWPORT,
        readinessMode: "game",
        timeoutMs: 1000,
      });

      runtimeClientInstance = client;

      client.onStateChanged((nextState) => {
        const muted = !!nextState?.sound?.muted;
        useUIStore.getState().setIsMuted(muted);
        soundManager.setMuted(muted);
      });

      const initialState = await client.connect();
      if (initialState?.sound) {
        const muted = !!initialState.sound.muted;
        useUIStore.getState().setIsMuted(muted);
        soundManager.setMuted(muted);
      }

      client.markReady();
      return client;
    } catch {
      // Running outside of the Randseed Player Shell
      runtimeClientInstance = null;
      return null;
    } finally {
      runtimeInitPromise = null;
    }
  })();

  return runtimeInitPromise;
}

export async function requestRandseedFullscreen(): Promise<boolean> {
  if (!runtimeClientInstance) return false;
  const caps = runtimeClientInstance.getCapabilities();
  if (caps.length > 0 && !caps.includes("display.requestFullscreen")) {
    return false;
  }
  try {
    return await runtimeClientInstance.display.requestFullscreen();
  } catch {
    return false;
  }
}

export function isRandseedRoomConnected(): boolean {
  return Boolean(roomClientInstance && roomClientInstance.status === "connected");
}

export function getRandseedRoomStatus(): RoomConnectionStatus {
  return roomClientInstance?.status ?? roomConnectionStatus;
}

export function getRandseedRoomError(): string | null {
  return roomConnectionError;
}

export function getRandseedRoomAllocation(): RoomMatch | undefined {
  if (roomClientInstance?.allocation) {
    cachedRoomAllocation = roomClientInstance.allocation;
  }
  return cachedRoomAllocation;
}

export function getRandseedRoomSnapshot(): RoomSnapshot | undefined {
  return latestRawSnapshot ?? roomClientInstance?.snapshot;
}

export function disconnectRandseedRoom(): void {
  if (roomClientInstance) {
    roomClientInstance.disconnect();
    cachedRoomAllocation = undefined;
    latestRawSnapshot = undefined;
    cachedRoomPlayers = [];
    lastDeliveredSnapshotKey = null;
    lastSnapshotReceivedAtMs = 0;
    latestAgentPlayerView = null;
    latestAgentPlayerProof = undefined;
    latestAgentPlayerViewStatus = "idle";
  }
}

let matchInFlightPromise: Promise<{
  allocation?: RoomMatch;
  snapshot?: RoomSnapshot;
  players?: RoomPlayer[];
} | null> | null = null;

/**
 * Connect to the full-stack RandSeed Room backend via RoomClient (@randseed/game-sdk@0.7.0).
 */
export async function matchRandseedRoom(
  onSnapshotUpdate?: (
    state: Record<string, unknown>,
    allocation?: RoomMatch,
    snapshot?: RoomSnapshot,
    players?: RoomPlayer[]
  ) => void,
  onPlayersUpdate?: (players: RoomPlayer[]) => void
): Promise<{
  allocation?: RoomMatch;
  snapshot?: RoomSnapshot;
  players?: RoomPlayer[];
} | null> {
  if (typeof window === "undefined") return null;

  if (onSnapshotUpdate) {
    snapshotListener = onSnapshotUpdate;
  }
  if (onPlayersUpdate) {
    playersChangedListener = onPlayersUpdate;
  }

  if (matchInFlightPromise) {
    return matchInFlightPromise;
  }

  const runConnect = async (): Promise<{
    allocation?: RoomMatch;
    snapshot?: RoomSnapshot;
    players?: RoomPlayer[];
  } | null> => {
  try {
    if (!roomClientInstance) {
      lastDeliveredSnapshotKey = null;
      const baseUrl = new URL("./", window.location.href).href;
      roomClientInstance = new RoomClient({
        baseUrl,
        cloneSnapshots: false,
        refreshSession: async () => {
          if (!runtimeClientInstance) return false;
          const caps = runtimeClientInstance.getCapabilities();
          if (caps.length > 0 && !caps.includes("room.refreshSession")) {
            return false;
          }
          try {
            const res = await runtimeClientInstance.refreshRoomSession();
            return Boolean(res?.renewed);
          } catch {
            return false;
          }
        },
        onStatusChange: (nextStatus) => {
          notifyRoomStatusChange(nextStatus);
        },
        onError: (err) => {
          const currentStatus = roomClientInstance?.status;
          const isReconnecting =
            (err instanceof RoomClientError && err.code === "RECONNECTING") ||
            currentStatus === "reconnecting";
          notifyRoomStatusChange(
            isReconnecting ? "reconnecting" : "error",
            formatRoomErrorMessage(err, "Failed to connect to the online room.")
          );
        },
        onAgentPlayerViewUnavailable: () => {
          // Optional Agent projection unavailable; never fall back to raw gameplay state for Agent APIs,
          // while keeping live gameplay snapshots completely uninterrupted.
          latestAgentPlayerViewStatus = "unavailable";
          for (const listener of agentPlayerViewListeners) {
            listener(null, latestAgentPlayerViewStatus);
          }
        },
        onPlayersChanged: (players) => {
          if (roomClientInstance?.allocation) {
            cachedRoomAllocation = roomClientInstance.allocation;
          }
          if (Array.isArray(players)) {
            cachedRoomPlayers = players;
            if (playersChangedListener) {
              playersChangedListener(players);
            }
          }
        },
        onSnapshot: (snapshot) => {
          try {
            latestRawSnapshot = snapshot;
            lastSnapshotReceivedAtMs = Date.now();
            if (roomClientInstance?.allocation) {
              cachedRoomAllocation = roomClientInstance.allocation;
            }
            processSnapshotAgentPlayerView(snapshot, cachedRoomAllocation);
            const players = readSafeRoomPlayers(roomClientInstance, snapshot);
            const nextState = extractSnapshotState(snapshot);
            inspectSnapshotForSocketActionReceipts(nextState, snapshot.tick);
            if (nextState && snapshotListener) {
              lastDeliveredSnapshotKey = getSnapshotKey(snapshot, players);
              snapshotListener(nextState, cachedRoomAllocation, snapshot, players);
            } else if (playersChangedListener && Array.isArray(players)) {
              playersChangedListener(players);
            }
          } catch {
            // Ignore malformed snapshot frame
          }
        },
      });
    }

    const snapshot = await roomClientInstance.connect();
    latestRawSnapshot = snapshot;
    lastSnapshotReceivedAtMs = Date.now();
    cachedRoomAllocation = roomClientInstance.allocation;
    processSnapshotAgentPlayerView(snapshot, cachedRoomAllocation);
    attachSocketFrameMonitor(roomClientInstance);
    notifyRoomStatusChange("connected", null);
    const players = readSafeRoomPlayers(roomClientInstance, snapshot);
    const snapKey = getSnapshotKey(snapshot, players);
    if (snapKey !== lastDeliveredSnapshotKey) {
      const nextState = extractSnapshotState(snapshot);
      inspectSnapshotForSocketActionReceipts(nextState, snapshot.tick);
      if (nextState && snapshotListener) {
        lastDeliveredSnapshotKey = snapKey;
        snapshotListener(
          nextState,
          cachedRoomAllocation,
          snapshot,
          players
        );
      }
    } else if (playersChangedListener && Array.isArray(players)) {
      playersChangedListener(players);
    }
    return {
      allocation: cachedRoomAllocation,
      snapshot,
      players,
    };
  } catch (err: unknown) {
    const currentStatus = roomClientInstance?.status;
    const isReconnecting =
      (err instanceof RoomClientError && err.code === "RECONNECTING") ||
      currentStatus === "reconnecting";
    notifyRoomStatusChange(
      isReconnecting
        ? "reconnecting"
        : currentStatus === "closed"
        ? "closed"
        : "error",
      formatRoomErrorMessage(err, "Unable to connect to the online room.")
    );
    return null;
  } finally {
    matchInFlightPromise = null;
  }
  };

  matchInFlightPromise = runConnect();
  return matchInFlightPromise;
}

function isSnapshotGameOver(snapshot?: RoomSnapshot): boolean {
  const res = snapshot?.gameResult;
  return Boolean(
    res &&
      typeof res === "object" &&
      !Array.isArray(res) &&
      (res as Record<string, JsonValue>).over === true
  );
}

function formatActionRejectionCode(code?: string): string {
  switch (code) {
    case "ROOM_TABLE_LIMIT_REACHED":
      return "This room has reached the maximum number of active custom tables (15).";
    case "HOST_TABLE_LIMIT_REACHED":
      return "You already have 3 active custom tables open. Close an existing table first.";
    case "INVALID_TABLE_CODE":
      return "Incorrect 4-digit Table Code.";
    case "TABLE_NOT_FOUND":
      return "The requested table was not found or has already closed.";
    case "TABLE_UNAVAILABLE":
      return "This table is currently paused or closed.";
    case "UNAUTHORIZED":
      return "Only the table host can perform this action.";
    case "INSUFFICIENT_FUNDS":
      return "Insufficient Game Coins for this action.";
    case "INSUFFICIENT_LIQUIDITY":
      return "Amount exceeds available table liquidity.";
    case "HOUSE_INSUFFICIENT_LIQUIDITY":
      return "Host bankroll cannot cover this wager. Ask the host to add liquidity or lower your bet.";
    case "INVALID_LIQUIDITY":
      return "Host bankroll must meet the minimum requirement (Min Bet × 10 × Max Seats).";
    case "INVALID_BUY_IN":
      return "Buy-in amount must be at least the table minimum bet and within your wallet balance.";
    case "INVALID_AMOUNT":
      return "Please enter a valid positive amount.";
    case "SEAT_TAKEN":
      return "That seat has already been taken by another player.";
    case "ALREADY_SEATED":
      return "You already occupy a seat at this tournament table.";
    case "NOT_SEATED":
      return "You are not currently seated at this table.";
    case "TOURNAMENT_LOCKED":
      return "Tournament seats are locked until the tournament concludes.";
    case "NO_READY_PLAYERS":
      return "Not enough ready seats to start the hand yet.";
    case "NOT_YOUR_TURN":
      return "Please wait for your turn to act.";
    case "INVALID_PHASE":
      return "This action is not available during the current table phase.";
    case "CANNOT_DOUBLE":
      return "Double Down is only available on your initial two cards.";
    case "CANNOT_SPLIT":
      return "Split is only available on matching initial two-card pairs (up to 4 hands).";
    case "CANNOT_INSURE":
      return "Insurance is not available on this hand.";
    case "REFILL_NOT_ELIGIBLE":
      return "Free 5,000 Coin Refill is only available when your balance is below the table minimum.";
    default:
      return code
        ? `Action rejected by room server (${code}).`
        : "Action was rejected by the room server.";
  }
}

let confirmedActionChain: Promise<unknown> = Promise.resolve();

async function waitForRandseedRoomConnected(maxWaitMs = 15000): Promise<boolean> {
  const getStatus = (): RoomConnectionStatus | undefined => roomClientInstance?.status;
  if (getStatus() === "connected") return true;

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = getStatus();
    if (status === "connected") return true;
    if (status === "error" || status === "closed") {
      return false;
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return getStatus() === "connected";
}

async function waitForMatchRolloverIfOver(maxWaitMs = 3000): Promise<boolean> {
  if (!roomClientInstance) return false;
  const curSnap = latestRawSnapshot ?? roomClientInstance.snapshot;
  if (!isSnapshotGameOver(curSnap)) {
    return roomClientInstance.status === "connected";
  }

  await roomClientInstance.readyForNextMatch().catch(() => {});
  const waitStart = Date.now();
  while (Date.now() - waitStart < maxWaitMs) {
    if (!roomClientInstance || roomClientInstance.status !== "connected") {
      return false;
    }
    if (!isSnapshotGameOver(latestRawSnapshot ?? roomClientInstance.snapshot)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  return !isSnapshotGameOver(latestRawSnapshot ?? roomClientInstance?.snapshot);
}

const monitoredSockets = new WeakSet<WebSocket>();
let refreshStateInFlight: Promise<void> | null = null;

async function refreshRoomClientState(): Promise<void> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") return;
  if (refreshStateInFlight) return refreshStateInFlight;
  refreshStateInFlight = (async () => {
    try {
      const clientAny = roomClientInstance as unknown as {
        refresh?: (signal?: AbortSignal) => Promise<void>;
        controller?: AbortController;
      };
      if (typeof clientAny.refresh === "function") {
        const sig = clientAny.controller?.signal ?? AbortSignal.timeout(4000);
        await clientAny.refresh(sig);
      }
    } catch {
      // Ignore transient refresh failures
    } finally {
      refreshStateInFlight = null;
    }
  })();
  return refreshStateInFlight;
}

function attachSocketFrameMonitor(client: RoomClient | null): void {
  if (!client) return;
  const rawSocket = (client as unknown as { socket?: WebSocket }).socket;
  if (!rawSocket || typeof rawSocket.addEventListener !== "function") return;
  if (monitoredSockets.has(rawSocket)) return;
  monitoredSockets.add(rawSocket);

  rawSocket.addEventListener("message", (event) => {
    if (typeof event.data !== "string" || pendingSocketActions.size === 0) return;
    try {
      const parsed = JSON.parse(event.data);
      if (parsed && parsed.type === "error" && parsed.code === "ROOM_CONFLICT") {
        // RoomClient ignores WS ROOM_CONFLICT without refreshing this.current.tick.
        // Immediately refresh GET /state (200 OK) and re-transmit pending socket inputs on the fresh tick.
        void (async () => {
          await refreshRoomClientState();
          if (!roomClientInstance || roomClientInstance.status !== "connected") return;
          attachSocketFrameMonitor(roomClientInstance);
          const freshSnap = roomClientInstance.snapshot ?? latestRawSnapshot;
          const freshTick = freshSnap?.tick ?? 0;
          const stateObj =
            freshSnap?.state && typeof freshSnap.state === "object" && !Array.isArray(freshSnap.state)
              ? (freshSnap.state as Record<string, unknown>)
              : null;
          inspectSnapshotForSocketActionReceipts(stateObj, freshTick);
          for (const waiter of Array.from(pendingSocketActions.values())) {
            if (waiter.resendCount >= 8) continue;
            const sent = roomClientInstance.sendSocketInput(waiter.actionPayload, {
              allowSameTick: true,
              force: true,
            });
            if (sent) {
              waiter.lastSentTick = freshTick;
              waiter.resendCount += 1;
            }
          }
        })();
      }
    } catch {
      // Ignore non-JSON frame
    }
  });
}

async function submitActionViaSocketWithReceipt(
  actionPayload: Record<string, JsonValue>,
  reqId: string,
  timeoutMs = 3600
): Promise<{ status: "applied" | "rejected"; code?: string } | null> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") {
    return null;
  }

  attachSocketFrameMonitor(roomClientInstance);

  // Only block on refreshRoomClientState if we don't have a snapshot at all yet.
  if (!roomClientInstance.snapshot && !latestRawSnapshot) {
    await refreshRoomClientState();
  }

  if (!roomClientInstance || roomClientInstance.status !== "connected") {
    return null;
  }

  attachSocketFrameMonitor(roomClientInstance);

  const initialTick = roomClientInstance.snapshot?.tick ?? latestRawSnapshot?.tick ?? 0;
  const sent = roomClientInstance.sendSocketInput(actionPayload, {
    allowSameTick: true,
    force: true,
  });
  if (!sent) {
    void roomClientInstance.sendInput(actionPayload).catch(() => {});
  }

  return new Promise((resolve) => {
    const retryTimer = setInterval(() => {
      const waiter = pendingSocketActions.get(reqId);
      if (!waiter || !roomClientInstance || roomClientInstance.status !== "connected") {
        return;
      }

      const existing = findClientReqOutcomeInSnapshot(
        latestRawSnapshot ?? roomClientInstance.snapshot,
        reqId,
        waiter.actionPayload
      );
      if (existing) {
        clearInterval(waiter.retryTimer);
        clearTimeout(waiter.timeoutTimer);
        pendingSocketActions.delete(reqId);
        waiter.resolve(existing);
        return;
      }

      if (waiter.resendCount >= 8) return;

      void (async () => {
        if (!pendingSocketActions.has(reqId) || !roomClientInstance) return;
        await refreshRoomClientState();
        const currentTick =
          roomClientInstance?.snapshot?.tick ?? latestRawSnapshot?.tick ?? waiter.lastSentTick;
        const activeWaiter = pendingSocketActions.get(reqId);
        if (!activeWaiter || !roomClientInstance || roomClientInstance.status !== "connected") {
          return;
        }
        const postRefreshCheck = findClientReqOutcomeInSnapshot(
          latestRawSnapshot ?? roomClientInstance.snapshot,
          reqId,
          activeWaiter.actionPayload
        );
        if (postRefreshCheck) {
          clearInterval(activeWaiter.retryTimer);
          clearTimeout(activeWaiter.timeoutTimer);
          pendingSocketActions.delete(reqId);
          activeWaiter.resolve(postRefreshCheck);
          return;
        }
        attachSocketFrameMonitor(roomClientInstance);
        const ok = roomClientInstance.sendSocketInput(activeWaiter.actionPayload, {
          allowSameTick: true,
          force: true,
        });
        activeWaiter.lastSentTick = currentTick;
        activeWaiter.resendCount += 1;
        if (!ok || activeWaiter.resendCount === 1 || activeWaiter.resendCount === 3) {
          void roomClientInstance.sendInput(activeWaiter.actionPayload).catch(() => {});
        }
      })();
    }, 320);

    const timeoutTimer = setTimeout(() => {
      const waiter = pendingSocketActions.get(reqId);
      if (waiter) {
        clearInterval(waiter.retryTimer);
        pendingSocketActions.delete(reqId);
      }
      resolve(null);
    }, timeoutMs);

    pendingSocketActions.set(reqId, {
      reqId,
      actionPayload,
      lastSentTick: initialTick,
      resendCount: 0,
      resolve,
      retryTimer,
      timeoutTimer,
    });
  });
}

async function executeConfirmedRoomAction(
  action: Record<string, JsonValue>
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const connected = await waitForRandseedRoomConnected(15000);
  if (!connected || !roomClientInstance) {
    const status = roomClientInstance?.status ?? roomConnectionStatus;
    return {
      ok: false,
      code: status === "reconnecting" ? "RECONNECTING" : "NOT_CONNECTED",
      error:
        status === "reconnecting"
          ? "Reconnecting to the online room. Please try again in a moment."
          : getRandseedRoomError() ||
            "Online room is still starting up. Please try again in a moment.",
    };
  }

  try {
    const ready = await waitForMatchRolloverIfOver(3000);
    if (!ready) {
      return {
        ok: false,
        code: "MATCH_TRANSITIONING",
        error: "The room is transitioning between rounds. Please try again in a moment.",
      };
    }

    const clientReqId = `rq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const actionPayload: Record<string, JsonValue> = {
      ...action,
      clientReqId,
    };

    // Primary Path: WebSocket sendSocketInput + idempotent clientReqId receipt check.
    // Avoids HTTP POST /api/room/:roomId/input 409 Conflict responses completely while the room socket is active.
    const wsOutcome = await submitActionViaSocketWithReceipt(actionPayload, clientReqId, 3500);
    if (wsOutcome) {
      if (wsOutcome.status === "applied") {
        return { ok: true };
      }
      return {
        ok: false,
        code: wsOutcome.code,
        error: formatActionRejectionCode(wsOutcome.code),
      };
    }

    await refreshRoomClientState();
    const finalCheck = findClientReqOutcomeInSnapshot(
      latestRawSnapshot ?? roomClientInstance?.snapshot,
      clientReqId
    );
    if (finalCheck) {
      if (finalCheck.status === "applied") {
        return { ok: true };
      }
      return {
        ok: false,
        code: finalCheck.code,
        error: formatActionRejectionCode(finalCheck.code),
      };
    }

    return {
      ok: false,
      code: "ACTION_RECEIPT_TIMEOUT",
      error: "The room did not confirm the action in time. Please try again.",
    };
  } catch (err: unknown) {
    return {
      ok: false,
      code: err instanceof RoomClientError ? err.code : undefined,
      error: formatRoomErrorMessage(err, "Failed to send action to the room server."),
    };
  }
}

export async function sendRandseedRoomActionConfirmed(
  action: Record<string, JsonValue>
): Promise<{ ok: boolean; code?: string; error?: string }> {
  const run = confirmedActionChain.then(
    () => executeConfirmedRoomAction(action),
    () => executeConfirmedRoomAction(action)
  );
  confirmedActionChain = run.catch(() => {});
  return run;
}

export async function sendRandseedRoomAction(
  action: Record<string, JsonValue>
): Promise<boolean> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") {
    return false;
  }
  try {
    if (isSnapshotGameOver(latestRawSnapshot)) {
      return false;
    }
    return roomClientInstance.sendSocketInput(action, { allowSameTick: true, force: true });
  } catch {
    return false;
  }
}

export async function readyRandseedRoom(): Promise<void> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") return;
  if (!isSnapshotGameOver(latestRawSnapshot ?? roomClientInstance.snapshot)) return;
  try {
    await roomClientInstance.readyForNextMatch();
  } catch {
    // Ignore when match is not complete
  }
}

export interface PersonalArchiveFetchResult {
  items: ArchiveHistoryEntry[];
  total: number;
  error: string | null;
}

export async function fetchAllRandseedMatchHistory(options?: {
  pageSize?: number;
  maxPages?: number;
}): Promise<PersonalArchiveFetchResult> {
  const gameId = safeGetRandseedGameId() || cachedRoomAllocation?.scope.gameId;
  if (!gameId) {
    return {
      items: [],
      total: 0,
      error: "Game ID is unavailable until the room session connects.",
    };
  }

  const pageSize = Math.min(100, Math.max(1, Math.trunc(options?.pageSize ?? 100)));
  const maxPages = Math.max(1, Math.trunc(options?.maxPages ?? 10));
  const baseUrl = new URL("./", window.location.href).href;
  const allItems: ArchiveHistoryEntry[] = [];
  let total = 0;

  try {
    for (let pageIndex = 0; pageIndex < maxPages; pageIndex++) {
      const offset = pageIndex * pageSize;
      const page = await fetchPlayerMatchHistory({
        gameId,
        playerId: "me",
        baseUrl,
        limit: pageSize,
        offset,
      });
      total = page.pagination?.total ?? allItems.length + page.items.length;
      if (page.items.length > 0) {
        allItems.push(...page.items);
      }
      if (page.items.length < pageSize || allItems.length >= total) {
        break;
      }
    }
    return {
      items: allItems,
      total: Math.max(total, allItems.length),
      error: null,
    };
  } catch (err: unknown) {
    return {
      items: allItems,
      total: allItems.length,
      error:
        err instanceof Error && err.message
          ? err.message
          : "Failed to load persistent player archive.",
    };
  }
}

export async function fetchRandseedMatchHistory(options?: {
  limit?: number;
  offset?: number;
}): Promise<ArchiveHistoryPage | null> {
  const gameId = safeGetRandseedGameId() || cachedRoomAllocation?.scope.gameId;
  if (!gameId) return null;
  try {
    return await fetchPlayerMatchHistory({
      gameId,
      baseUrl: new URL("./", window.location.href).href,
      ...(options?.limit !== undefined ? { limit: options.limit } : {}),
      ...(options?.offset !== undefined ? { offset: options.offset } : {}),
    });
  } catch {
    return null;
  }
}

export async function fetchRandseedMatchReplay(matchId: string): Promise<MatchReplayResult | null> {
  const gameId = safeGetRandseedGameId() || cachedRoomAllocation?.scope.gameId;
  if (!gameId || !matchId) return null;
  try {
    return await fetchMatchReplay({
      gameId,
      matchId,
      baseUrl: new URL("./", window.location.href).href,
    });
  } catch {
    return null;
  }
}

export async function setRandseedMuted(muted: boolean): Promise<void> {
  useUIStore.getState().setIsMuted(muted);
  soundManager.setMuted(muted);
  if (!runtimeClientInstance) return;
  const caps = runtimeClientInstance.getCapabilities();
  if (caps.length > 0 && !caps.includes("sound.setMuted")) return;
  try {
    await runtimeClientInstance.request("sound.setMuted", { muted });
  } catch {
    // Ignore when outside RandSeed Player Shell
  }
}

export async function readRandseedProgress<T = Record<string, unknown>>(): Promise<T | null> {
  if (!runtimeClientInstance) return null;
  const caps = runtimeClientInstance.getCapabilities();
  if (caps.length > 0 && !caps.includes("storage.getProgress")) return null;
  try {
    const progress = await runtimeClientInstance.storage.getProgress();
    return (progress?.data as T) ?? null;
  } catch {
    return null;
  }
}

export async function saveRandseedProgress(
  data: Record<string, string | number | boolean | null>
): Promise<void> {
  if (!runtimeClientInstance) return;
  const caps = runtimeClientInstance.getCapabilities();
  if (caps.length > 0 && !caps.includes("storage.saveProgress")) return;
  try {
    runtimeClientInstance.storage.onSyncStatusChanged(() => {});
    await runtimeClientInstance.storage.saveProgress({
      schemaVersion: 1,
      summary: {
        level: 1,
        score: 0,
        playTimeSec: 0,
        milestones: [],
        leaderboards: [],
      },
      data,
    });
    await runtimeClientInstance.storage.flush();
  } catch {
    // Ignore when outside RandSeed Player Shell
  }
}
