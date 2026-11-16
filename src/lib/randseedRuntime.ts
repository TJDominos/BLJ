import {
  MAX_RUNTIME_FRAME_WIDTH,
  RuntimeClient,
  RoomClient,
  RoomClientError,
  getRandseedGameId,
  getRandseedHostOrigin,
  readRoomSnapshotState,
  readAgentPlayerView,
  classifyAgentPlayerViewUpdate,
  fetchMatchReplay,
  fetchPlayerMatchHistory,
  type AgentPlayerView,
  type ArchiveHistoryEntry,
  type ArchiveHistoryPage,
  type JsonValue,
  type MatchReplayResult,
  type RoomConnectionStatus,
  type RoomMatch,
  type RoomPlayer,
  type RoomSnapshot,
  type RuntimePlayerProfile,
} from "@randseed/game-sdk";
import { useUIStore } from "@/store/uiStore";
import { soundManager } from "@/lib/sounds";

export type {
  RoomConnectionStatus,
  RoomMatch,
  RoomPlayer,
  RoomSnapshot,
  RuntimePlayerProfile,
  ArchiveHistoryEntry,
  ArchiveHistoryPage,
  MatchReplayResult,
};

export const DESIGN_VIEWPORT_WIDTH = MAX_RUNTIME_FRAME_WIDTH; // 1280
export const DESIGN_VIEWPORT_HEIGHT = 720;

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
let roomClientInstance: RoomClient | null = null;
let roomConnectionStatus: RoomConnectionStatus = "idle";
let roomConnectionError: string | null = null;
let cachedPlayerProfile: RuntimePlayerProfile | null = null;
let cachedRoomPlayers: RoomPlayer[] = [];
let lastAgentPlayerView: AgentPlayerView | null = null;
let lastDeliveredSnapshotKey: string | null = null;

let snapshotListener:
  | ((
      state: Record<string, unknown>,
      allocation?: RoomMatch,
      snapshot?: RoomSnapshot,
      players?: RoomPlayer[]
    ) => void)
  | null = null;

let playersChangedListener: ((players: RoomPlayer[]) => void) | null = null;
let profileListeners: Array<(profile: RuntimePlayerProfile) => void> = [];
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
  const snapPlayers = (snapshot ?? room?.snapshot)?.players;
  if (Array.isArray(snapPlayers)) {
    cachedRoomPlayers = snapPlayers;
    return snapPlayers;
  }
  return cachedRoomPlayers;
}

function isAgentPlayerViewEnvelope(val: JsonValue): boolean {
  if (!val || typeof val !== "object" || Array.isArray(val)) return false;
  const rec = val as Record<string, JsonValue>;
  return (
    rec.protocolVersion === 1 &&
    typeof rec.schemaId === "string" &&
    "publicState" in rec &&
    "self" in rec &&
    "decision" in rec
  );
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
      default:
        if (err.message) return err.message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function getSnapshotKey(snapshot: RoomSnapshot): string {
  return `${snapshot.scope.gameId}:${snapshot.matchId}:${snapshot.matchSeq}:${snapshot.tick}`;
}

function extractSnapshotState(
  snapshot: RoomSnapshot,
  room: RoomClient | null
): Record<string, unknown> | null {
  if (isAgentPlayerViewEnvelope(snapshot.state)) {
    const view = readAgentPlayerView(
      snapshot,
      room?.allocation?.playerId,
      room?.allocation?.roomId
    );
    const classification = classifyAgentPlayerViewUpdate(lastAgentPlayerView, view);
    if (classification.kind === "stale" || classification.kind === "duplicate") {
      return null;
    }
    lastAgentPlayerView = view;
    return view as unknown as Record<string, unknown>;
  }

  const validated = readRoomSnapshotState<Record<string, JsonValue>>(
    snapshot,
    (val: JsonValue): val is Record<string, JsonValue> =>
      Boolean(val && typeof val === "object" && !Array.isArray(val))
  );
  return validated as Record<string, unknown>;
}

export function getRandseedPlayerProfile(): RuntimePlayerProfile | null {
  return cachedPlayerProfile;
}

export function onRandseedProfileUpdate(
  listener: (profile: RuntimePlayerProfile) => void
): () => void {
  profileListeners.push(listener);
  if (cachedPlayerProfile) {
    listener(cachedPlayerProfile);
  }
  return () => {
    profileListeners = profileListeners.filter((l) => l !== listener);
  };
}

export function getRandseedOnlinePlayers(): RoomPlayer[] {
  return readSafeRoomPlayers(roomClientInstance);
}

/**
 * Initialize RandSeed RuntimeClient (@randseed/game-sdk@0.5.0) for shell viewport,
 * player profile, room session refresh, fullscreen & audio mute bridging.
 */
export async function initRandseedRuntime(): Promise<RuntimeClient | null> {
  if (typeof window === "undefined") return null;
  if (runtimeClientInstance) return runtimeClientInstance;

  try {
    const hostOrigin = safeGetRandseedHostOrigin();
    const client = new RuntimeClient({
      ...(hostOrigin ? { hostOrigin } : {}),
      readinessMode: "game",
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

    const capabilities = client.getCapabilities();
    if (capabilities.includes("player.getProfile")) {
      client.player
        .getProfile()
        .then((profile) => {
          if (profile && (profile.displayName || profile.avatarUrl)) {
            cachedPlayerProfile = profile;
            for (const listener of profileListeners) {
              listener(profile);
            }
          }
        })
        .catch(() => {});
    }

    client.markReady();
    return client;
  } catch {
    // Running outside of the Randseed Player Shell
    return null;
  }
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
  return roomClientInstance?.allocation;
}

export function getRandseedRoomSnapshot(): RoomSnapshot | undefined {
  return roomClientInstance?.snapshot;
}

export function disconnectRandseedRoom(): void {
  if (roomClientInstance) {
    roomClientInstance.disconnect();
    lastAgentPlayerView = null;
    lastDeliveredSnapshotKey = null;
  }
}

/**
 * Connect to the full-stack RandSeed Room backend via RoomClient (@randseed/game-sdk@0.5.0).
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

  try {
    if (!roomClientInstance) {
      lastAgentPlayerView = null;
      lastDeliveredSnapshotKey = null;
      const baseUrl = new URL("./", window.location.href).href;
      roomClientInstance = new RoomClient({
        baseUrl,
        cloneSnapshots: true,
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
          notifyRoomStatusChange(
            "error",
            formatRoomErrorMessage(err, "Failed to connect to the online room.")
          );
        },
        onPlayersChanged: (players) => {
          if (Array.isArray(players)) {
            cachedRoomPlayers = players;
            if (playersChangedListener) {
              playersChangedListener(players);
            }
          }
        },
        onSnapshot: (snapshot) => {
          try {
            const players = readSafeRoomPlayers(roomClientInstance, snapshot);
            if (playersChangedListener && Array.isArray(players)) {
              playersChangedListener(players);
            }
            const nextState = extractSnapshotState(snapshot, roomClientInstance);
            if (nextState && snapshotListener) {
              lastDeliveredSnapshotKey = getSnapshotKey(snapshot);
              snapshotListener(nextState, roomClientInstance?.allocation, snapshot, players);
            }
          } catch {
            // Ignore malformed snapshot frame
          }
        },
      });
    }

    // Pre-warm standby container only when idle/disconnected
    if (
      roomClientInstance.status === "idle" ||
      roomClientInstance.status === "closed" ||
      roomClientInstance.status === "error"
    ) {
      roomClientInstance.warm().catch(() => {});
    }

    const snapshot = await roomClientInstance.connect();
    notifyRoomStatusChange("connected", null);
    const players = readSafeRoomPlayers(roomClientInstance, snapshot);
    if (playersChangedListener && Array.isArray(players)) {
      playersChangedListener(players);
    }
    const snapKey = getSnapshotKey(snapshot);
    if (snapKey !== lastDeliveredSnapshotKey) {
      const nextState = extractSnapshotState(snapshot, roomClientInstance);
      if (nextState && snapshotListener) {
        lastDeliveredSnapshotKey = snapKey;
        snapshotListener(
          nextState,
          roomClientInstance.allocation,
          snapshot,
          players
        );
      }
    }
    return {
      allocation: roomClientInstance.allocation,
      snapshot,
      players,
    };
  } catch (err: unknown) {
    notifyRoomStatusChange(
      roomClientInstance?.status === "closed" ? "closed" : "error",
      formatRoomErrorMessage(err, "Unable to connect to the online room.")
    );
    return null;
  }
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

async function waitForMatchRolloverIfOver(maxWaitMs = 3000): Promise<boolean> {
  if (!roomClientInstance) return false;
  if (!isSnapshotGameOver(roomClientInstance.snapshot)) {
    return roomClientInstance.status === "connected";
  }

  await roomClientInstance.readyForNextMatch().catch(() => {});
  const waitStart = Date.now();
  while (Date.now() - waitStart < maxWaitMs) {
    if (!roomClientInstance || roomClientInstance.status !== "connected") {
      return false;
    }
    if (!isSnapshotGameOver(roomClientInstance.snapshot)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 30));
  }
  return !isSnapshotGameOver(roomClientInstance?.snapshot);
}

export async function sendRandseedRoomActionConfirmed(
  action: Record<string, JsonValue>
): Promise<{ ok: boolean; code?: string; error?: string }> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") {
    return {
      ok: false,
      error: "Online room is not connected yet. Please wait for the room to connect.",
    };
  }

  try {
    const ready = await waitForMatchRolloverIfOver(3000);
    if (!ready) {
      return {
        ok: false,
        error: "The room is transitioning between rounds. Please try again in a moment.",
      };
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      if (!roomClientInstance || roomClientInstance.status !== "connected") {
        return { ok: false, error: "Lost connection to the online room." };
      }

      if (isSnapshotGameOver(roomClientInstance.snapshot)) {
        const rolled = await waitForMatchRolloverIfOver(2500);
        if (!rolled) {
          return {
            ok: false,
            error: "The room is transitioning between rounds. Please try again in a moment.",
          };
        }
      }

      try {
        const receipt = await roomClientInstance.sendAction(action);
        if (receipt.status === "applied") {
          return { ok: true };
        }
        if (receipt.status === "rejected") {
          return {
            ok: false,
            code: receipt.code,
            error: formatActionRejectionCode(receipt.code),
          };
        }
        return { ok: true };
      } catch (err: unknown) {
        if (err instanceof RoomClientError) {
          if (err.code === "ACTION_RECEIPT_TIMEOUT") {
            // Host accepted HTTP input (applied: true) even if WS receipt frame was omitted
            return { ok: true };
          }
          if (err.code === "INPUT_PENDING" && attempt < 3) {
            await new Promise((r) => setTimeout(r, 100));
            continue;
          }
          if (err.status === 409 && attempt < 3) {
            await new Promise((r) => setTimeout(r, 50));
            continue;
          }
        }
        return {
          ok: false,
          error: formatRoomErrorMessage(err, "Failed to send action to the room server."),
        };
      }
    }

    return {
      ok: false,
      error: "Room state changed while submitting your request. Please try again.",
    };
  } catch (err: unknown) {
    return {
      ok: false,
      error: formatRoomErrorMessage(err, "Failed to send action to the room server."),
    };
  }
}

export async function sendRandseedRoomAction(
  action: Record<string, JsonValue>
): Promise<boolean> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") {
    return false;
  }
  try {
    const ready = await waitForMatchRolloverIfOver(3000);
    if (!ready) {
      return false;
    }

    if (roomClientInstance.sendSocketInput(action, { allowSameTick: true, force: true })) {
      return true;
    }
    const res = await roomClientInstance.sendInput(action);
    return Boolean(res?.applied);
  } catch {
    return false;
  }
}

export async function readyRandseedRoom(): Promise<void> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") return;
  try {
    await roomClientInstance.readyForNextMatch();
  } catch {
    // Also send in-band ready_next action for persistent tables
    await sendRandseedRoomAction({ action: "ready_next" });
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
  const gameId = safeGetRandseedGameId() || roomClientInstance?.allocation?.scope.gameId;
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
  const gameId = safeGetRandseedGameId() || roomClientInstance?.allocation?.scope.gameId;
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
  const gameId = safeGetRandseedGameId() || roomClientInstance?.allocation?.scope.gameId;
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
