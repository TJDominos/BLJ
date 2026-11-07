import {
  MAX_RUNTIME_FRAME_WIDTH,
  RuntimeClient,
  RoomClient,
  type RoomMatch,
  type RoomSnapshot,
} from "@randseed/game-sdk";
import { useUIStore } from "@/store/uiStore";
import { soundManager } from "@/lib/sounds";

export const DESIGN_VIEWPORT_WIDTH = MAX_RUNTIME_FRAME_WIDTH; // 1280
export const DESIGN_VIEWPORT_HEIGHT = 720;

let runtimeClientInstance: RuntimeClient | null = null;
let roomClientInstance: RoomClient | null = null;

export function readRoomSnapshotState<TState>(
  snapshot: RoomSnapshot,
  isState: (value: unknown) => value is TState
): TState {
  if (!snapshot || typeof snapshot !== "object" || !isState(snapshot.state)) {
    throw new Error("Room snapshot state failed validation.");
  }
  return snapshot.state;
}

/**
 * Initialize RandSeed RuntimeClient ONLY for shell viewport & audio mute bridging.
 * NOTE: RuntimeClient.storage (getProgress / saveProgress) is strictly for frontend-only
 * serverless games and MUST NOT be used in full-stack room games.
 * In a full-stack game, player identity & authoritative state are managed by the
 * Node.js backend (@randseed/server-sdk + RoomClient).
 */
export async function initRandseedRuntime(): Promise<RuntimeClient | null> {
  if (typeof window === "undefined") return null;
  if (runtimeClientInstance) return runtimeClientInstance;

  try {
    const client = new RuntimeClient({
      gameId: "royal-blackjack",
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
    // Running standalone outside of the Randseed Player Shell
    return null;
  }
}

/**
 * Connect to the full-stack RandSeed Room backend via RoomClient.
 */
export async function matchRandseedRoom(
  onSnapshotUpdate?: (state: Record<string, unknown>, allocation?: RoomMatch) => void
): Promise<{
  allocation?: RoomMatch;
  snapshot?: RoomSnapshot;
} | null> {
  if (typeof window === "undefined") return null;

  try {
    if (!roomClientInstance) {
      roomClientInstance = new RoomClient({
        gameId: "royal-blackjack",
        onSnapshot: (snapshot) => {
          try {
            const validated = readRoomSnapshotState<Record<string, unknown>>(
              snapshot,
              (val): val is Record<string, unknown> => Boolean(val && typeof val === "object")
            );
            if (onSnapshotUpdate) {
              onSnapshotUpdate(validated, roomClientInstance?.allocation);
            }
          } catch {
            // Ignore malformed snapshot frame
          }
        },
      });
    }
    const snapshot = await roomClientInstance.connect();
    if (onSnapshotUpdate && snapshot?.state && typeof snapshot.state === "object") {
      onSnapshotUpdate(snapshot.state as Record<string, unknown>, roomClientInstance.allocation);
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

type ExtendedRoomClient = RoomClient & {
  sendSocketInput?: (action: Record<string, string | number | boolean | null>) => boolean;
  readyForNextMatch?: () => Promise<unknown>;
};

export async function sendRandseedRoomAction(
  action: Record<string, string | number | boolean | null>
): Promise<void> {
  if (!roomClientInstance) return;
  try {
    const extClient = roomClientInstance as ExtendedRoomClient;
    if (!extClient.sendSocketInput || !extClient.sendSocketInput(action)) {
      await roomClientInstance.sendInput(action);
    }
  } catch {
    // Ignore transient room gateway errors in standalone preview
  }
}

export async function readyRandseedRoom(): Promise<void> {
  if (!roomClientInstance) return;
  try {
    const extClient = roomClientInstance as ExtendedRoomClient;
    if (extClient.readyForNextMatch) {
      await extClient.readyForNextMatch();
    }
  } catch {
    // Ignore when outside active room match transition
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

export async function saveRandseedProgress(data: Record<string, string | number | boolean | null>): Promise<void> {
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

