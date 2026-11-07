import { MAX_RUNTIME_FRAME_WIDTH, RuntimeClient, RoomClient, type RoomMatch, type RoomSnapshot } from "@randseed/game-sdk";
import { useUIStore } from "@/store/uiStore";
import { soundManager } from "@/lib/sounds";

export const DESIGN_VIEWPORT_WIDTH = MAX_RUNTIME_FRAME_WIDTH; // 1280
export const DESIGN_VIEWPORT_HEIGHT = 720;

let runtimeClientInstance: RuntimeClient | null = null;
let roomClientInstance: RoomClient | null = null;

/**
 * Initialize RandSeed RuntimeClient ONLY for shell viewport & audio mute bridging.
 * NOTE: RuntimeClient.storage (getProgress / saveProgress) is strictly for frontend-only
 * serverless games and MUST NOT be used in full-stack room games.
 * In a full-stack game, player identity & authoritative state are managed by the
 * Node.js backend (@randseed/server-sdk + RoomClient /api/match).
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
    // Running standalone outside of the Randseed Player Shell iframe
    return null;
  }
}

/**
 * Connect to the full-stack RandSeed Room backend via RoomClient (`POST /api/match`).
 */
export async function matchRandseedRoom(
  onSnapshotUpdate?: (state: Record<string, unknown>) => void
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
          if (onSnapshotUpdate && snapshot.state && typeof snapshot.state === "object") {
            onSnapshotUpdate(snapshot.state as Record<string, unknown>);
          }
        },
      });
    }
    const snapshot = await roomClientInstance.connect();
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
  action: Record<string, string | number | boolean | null>
): Promise<void> {
  if (!roomClientInstance) return;
  await roomClientInstance.sendInput(action);
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
