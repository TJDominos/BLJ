import {
  MAX_RUNTIME_FRAME_WIDTH,
  RuntimeClient,
  RoomClient,
  getRandseedGameId,
  readRoomSnapshotState,
  type JsonValue,
  type RoomConnectionStatus,
  type RoomMatch,
  type RoomPlayer,
  type RoomSnapshot,
  type RuntimePlayerProfile,
} from "@randseed/game-sdk";
import { useUIStore } from "@/store/uiStore";
import { soundManager } from "@/lib/sounds";

export type { RoomConnectionStatus, RoomMatch, RoomPlayer, RoomSnapshot, RuntimePlayerProfile };

export const DESIGN_VIEWPORT_WIDTH = MAX_RUNTIME_FRAME_WIDTH; // 1280
export const DESIGN_VIEWPORT_HEIGHT = 720;

const detectedGameId = getRandseedGameId();
export const RANDSEED_GAME_ID = detectedGameId || "";
export const GAME_SLUG = "royal-blackjack";

let runtimeClientInstance: RuntimeClient | null = null;
let roomClientInstance: RoomClient | null = null;
let roomConnectionStatus: RoomConnectionStatus = "idle";
let roomConnectionError: string | null = null;
let cachedPlayerProfile: RuntimePlayerProfile | null = null;
let cachedRoomPlayers: RoomPlayer[] = [];

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
      // Older room hosts that do not include a roster cause getPlayers() to throw CAPABILITY_UNAVAILABLE
    }
  }
  const snapPlayers = (snapshot ?? room?.snapshot)?.players;
  if (Array.isArray(snapPlayers)) {
    cachedRoomPlayers = snapPlayers;
    return snapPlayers;
  }
  return cachedRoomPlayers;
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
 * Initialize RandSeed RuntimeClient for shell viewport, player profile & audio mute bridging.
 */
export async function initRandseedRuntime(): Promise<RuntimeClient | null> {
  if (typeof window === "undefined") return null;
  if (runtimeClientInstance) return runtimeClientInstance;

  try {
    const client = new RuntimeClient({
      gameId: RANDSEED_GAME_ID,
      viewport: {
        designWidth: DESIGN_VIEWPORT_WIDTH,
        designHeight: DESIGN_VIEWPORT_HEIGHT,
        resizeMode: "responsive",
      },
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

    // Fetch authenticated player profile from @randseed/game-sdk@0.3.0
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

    client.markReady();
    return client;
  } catch {
    // Running outside of the Randseed Player Shell
    return null;
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

/**
 * Connect to the full-stack RandSeed Room backend via RoomClient.
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
      const baseUrl = new URL("./", window.location.href).href;
      roomClientInstance = new RoomClient({
        baseUrl,
        onStatusChange: (nextStatus) => {
          notifyRoomStatusChange(nextStatus);
        },
        onError: (err) => {
          notifyRoomStatusChange("error", err?.message || "Failed to connect to the online room.");
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
            const validated = readRoomSnapshotState<Record<string, JsonValue>>(
              snapshot,
              (val: JsonValue): val is Record<string, JsonValue> =>
                Boolean(val && typeof val === "object" && !Array.isArray(val))
            );
            if (snapshotListener) {
              snapshotListener(validated, roomClientInstance?.allocation, snapshot, players);
            }
          } catch {
            // Ignore malformed snapshot frame
          }
        },
      });
    }

    // Pre-warm room container if supported by gateway
    roomClientInstance.warm().catch(() => {});

    const snapshot = await roomClientInstance.connect();
    notifyRoomStatusChange("connected", null);
    const players = readSafeRoomPlayers(roomClientInstance, snapshot);
    if (playersChangedListener && Array.isArray(players)) {
      playersChangedListener(players);
    }
    if (snapshotListener && snapshot?.state && typeof snapshot.state === "object") {
      snapshotListener(
        snapshot.state as Record<string, unknown>,
        roomClientInstance.allocation,
        snapshot,
        players
      );
    }
    return {
      allocation: roomClientInstance.allocation,
      snapshot,
      players,
    };
  } catch (err: any) {
    notifyRoomStatusChange(
      roomClientInstance?.status === "closed" ? "closed" : "error",
      err?.message || "Unable to connect to the online room."
    );
    return null;
  }
}

export async function sendRandseedRoomAction(
  action: Record<string, JsonValue>
): Promise<boolean> {
  if (!roomClientInstance || roomClientInstance.status !== "connected") {
    return false;
  }
  try {
    const curResult = roomClientInstance.snapshot?.gameResult;
    if (
      curResult &&
      typeof curResult === "object" &&
      !Array.isArray(curResult) &&
      (curResult as Record<string, JsonValue>).over === true
    ) {
      await roomClientInstance.readyForNextMatch().catch(() => {});
      const waitStart = Date.now();
      while (Date.now() - waitStart < 1500) {
        const nextRes = roomClientInstance.snapshot?.gameResult;
        const stillOver =
          nextRes &&
          typeof nextRes === "object" &&
          !Array.isArray(nextRes) &&
          (nextRes as Record<string, JsonValue>).over === true;
        if (!stillOver) break;
        await new Promise((r) => setTimeout(r, 80));
      }
    }

    if (roomClientInstance.sendSocketInput(action, { allowSameTick: true })) {
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

export async function setRandseedMuted(muted: boolean): Promise<void> {
  useUIStore.getState().setIsMuted(muted);
  soundManager.setMuted(muted);
  if (!runtimeClientInstance) return;
  try {
    await runtimeClientInstance.request("sound.setMuted", { muted });
  } catch {
    // Ignore when outside RandSeed Player Shell
  }
}

export async function readRandseedProgress<T = Record<string, unknown>>(): Promise<T | null> {
  if (!runtimeClientInstance) return null;
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
