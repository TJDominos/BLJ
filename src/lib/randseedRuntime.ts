import {
  MAX_RUNTIME_FRAME_WIDTH,
  RuntimeClient,
  RoomClient,
  getRandseedGameId,
  readRoomSnapshotState,
  type JsonValue,
  type RoomConnectionStatus,
  type RoomMatch,
  type RoomSnapshot,
} from "@randseed/game-sdk";
import { useUIStore } from "@/store/uiStore";
import { soundManager } from "@/lib/sounds";

export const DESIGN_VIEWPORT_WIDTH = MAX_RUNTIME_FRAME_WIDTH; // 1280
export const DESIGN_VIEWPORT_HEIGHT = 720;

const detectedGameId = getRandseedGameId();
export const RANDSEED_GAME_ID = detectedGameId || "";
export const GAME_SLUG = "royal-blackjack";

let runtimeClientInstance: RuntimeClient | null = null;
let roomClientInstance: RoomClient | null = null;
let roomConnectionStatus: RoomConnectionStatus = "idle";
let snapshotListener:
  | ((state: Record<string, unknown>, allocation?: RoomMatch, snapshot?: RoomSnapshot) => void)
  | null = null;

/**
 * Initialize RandSeed RuntimeClient for shell viewport & audio mute bridging.
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
    snapshot?: RoomSnapshot
  ) => void
): Promise<{
  allocation?: RoomMatch;
  snapshot?: RoomSnapshot;
} | null> {
  if (typeof window === "undefined") return null;

  if (onSnapshotUpdate) {
    snapshotListener = onSnapshotUpdate;
  }

  try {
    if (!roomClientInstance) {
      const baseUrl = new URL("./", window.location.href).href;
      roomClientInstance = new RoomClient({
        baseUrl,
        onStatusChange: (nextStatus) => {
          roomConnectionStatus = nextStatus;
        },
        onError: () => {
          roomConnectionStatus = "error";
        },
        onSnapshot: (snapshot) => {
          try {
            const validated = readRoomSnapshotState<Record<string, JsonValue>>(
              snapshot,
              (val: JsonValue): val is Record<string, JsonValue> =>
                Boolean(val && typeof val === "object" && !Array.isArray(val))
            );
            if (snapshotListener) {
              snapshotListener(validated, roomClientInstance?.allocation, snapshot);
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
    if (snapshotListener && snapshot?.state && typeof snapshot.state === "object") {
      snapshotListener(
        snapshot.state as Record<string, unknown>,
        roomClientInstance.allocation,
        snapshot
      );
    }
    return {
      allocation: roomClientInstance.allocation,
      snapshot,
    };
  } catch {
    // Fallback when running outside of WebSocket Room gateway
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
