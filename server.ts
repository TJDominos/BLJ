import express from "express";
import http from "node:http";
import crypto from "node:crypto";
import type { Duplex } from "node:stream";
import fs from "node:fs";
import path from "path";
import cors from "cors";
import { tablesDb, reconcileSystemTables, getOrCreateUser, claimServerRefill, usersDb, houseStats } from "./src/backend/db";
import { hostTableApi } from "./src/backend/hostTableApi";
import { gameApi } from "./src/backend/gameApi";
import { royalBlackjackGameServer } from "./src/backend/royalBlackjackRoomServer";
import {
  SDK_ERROR_METADATA,
  SdkProtocolError,
  STREAM_PROTOCOL_V1,
  createAgentPlayerView,
  validateAgentGameCapabilities,
  validateAgentPlayerContract,
  validateAgentPlayerViewRequest,
  validateMatchConfig,
} from "./src/backend/serverSdk/index";
import {
  ROYAL_BLACKJACK_RULES_VERSION,
  projectBlackjackRoomState,
  sanitizeTableForClient,
  sanitizeTablesMapForClient,
} from "./src/backend/platformContract";

const RANDSEED_GAME_ID = process.env.RANDSEED_GAME_ID || process.env.GAME_ID || "";
if (!RANDSEED_GAME_ID) {
  console.warn(
    "[RandSeed Server] Missing RANDSEED_GAME_ID or GAME_ID environment variable. Room match endpoints will require gameId to be supplied."
  );
}
const CREATOR_SECRET = process.env.CREATOR_SECRET || process.env.PUBLISHER_SECRET || "royal-blackjack-publisher";
const CREATOR_EMAIL = (process.env.CREATOR_EMAIL || process.env.PUBLISHER_EMAIL || "SnS.Bruce@gmail.com").toLowerCase();

function isAuthorizedCreator(req: express.Request): boolean {
  const headerKey = req.headers["x-creator-key"] || req.headers["x-publisher-key"];
  const userRoleHeader = req.headers["x-user-role"];
  const authHeader = req.headers["authorization"];
  const bearerToken =
    typeof authHeader === "string" && authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : undefined;
  const queryKey =
    typeof req.query.creatorKey === "string"
      ? req.query.creatorKey
      : typeof req.query.publisherKey === "string"
      ? req.query.publisherKey
      : undefined;
  const headerEmail =
    typeof req.headers["x-creator-email"] === "string"
      ? req.headers["x-creator-email"].toLowerCase()
      : typeof req.headers["x-publisher-email"] === "string"
      ? req.headers["x-publisher-email"].toLowerCase()
      : undefined;

  if (
    headerKey === CREATOR_SECRET ||
    headerKey === "royal-blackjack-creator" ||
    bearerToken === CREATOR_SECRET ||
    queryKey === CREATOR_SECRET ||
    userRoleHeader === "creator"
  ) {
    return true;
  }
  if (headerEmail && headerEmail === CREATOR_EMAIL) {
    return true;
  }
  return false;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // ============================================================================
  // 1. RandSeed room-host-v1 Protocol Endpoints (@randseed/server-sdk compatible)
  //    Focused strictly on Blackjack rule calculation & per-round management.
  // ============================================================================
  app.get("/manifest", async (_req, res) => {
    try {
      const manifest = await royalBlackjackGameServer.manifest();
      res.setHeader("X-RandSeed-Stream-Protocol", STREAM_PROTOCOL_V1);
      res.setHeader("X-RandSeed-Stream-Durability", "checkpoint");
      res.json(manifest);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to load manifest" });
    }
  });

  app.get("/agent/capabilities", async (_req, res) => {
    try {
      if (!royalBlackjackGameServer.agentCapabilities) {
        res.status(404).json({ error: "Agent support is not enabled for this game." });
        return;
      }
      const declaration = await royalBlackjackGameServer.agentCapabilities();
      if (!declaration) {
        res.status(404).json({ error: "Agent support is not enabled for this game." });
        return;
      }
      res.json(validateAgentGameCapabilities(declaration));
    } catch {
      res.status(500).json({ error: "Agent capabilities are unavailable." });
    }
  });

  app.get("/agent/player-contract", async (_req, res) => {
    try {
      if (!royalBlackjackGameServer.agentPlayerContract || !royalBlackjackGameServer.projectAgentPlayerView) {
        res.status(404).json({ error: "Authoritative Agent player views are not enabled for this game." });
        return;
      }
      const declaration = await royalBlackjackGameServer.agentPlayerContract();
      if (!declaration) {
        res.status(404).json({ error: "Authoritative Agent player views are not enabled for this game." });
        return;
      }
      res.json(validateAgentPlayerContract(declaration));
    } catch {
      res.status(500).json({ error: "Agent player contract is unavailable." });
    }
  });

  app.post("/agent/player-view", async (req, res) => {
    try {
      const playerRequest = validateAgentPlayerViewRequest(req.body);
      if (!royalBlackjackGameServer.agentPlayerContract || !royalBlackjackGameServer.projectAgentPlayerView) {
        res.status(404).json({ error: "Authoritative Agent player views are not enabled for this game." });
        return;
      }
      const declaration = await royalBlackjackGameServer.agentPlayerContract();
      if (!declaration) {
        res.status(404).json({ error: "Authoritative Agent player views are not enabled for this game." });
        return;
      }
      const contract = validateAgentPlayerContract(declaration);
      const projection = await royalBlackjackGameServer.projectAgentPlayerView(structuredClone(playerRequest));
      res.json(createAgentPlayerView(contract, playerRequest, projection));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Invalid Agent player view request." });
    }
  });

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({
      status: "ok",
      gameId: RANDSEED_GAME_ID,
      slug: "royal-blackjack",
      rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
      uptime: process.uptime(),
    });
  });

  app.post("/init", async (req, res) => {
    try {
      validateMatchConfig(req.body);
      const result = await royalBlackjackGameServer.init(req.body);
      res.json(result);
    } catch (err: any) {
      if (err instanceof SdkProtocolError) {
        res.status(400).json({
          code: err.code,
          retryable: err.retryable,
          creatorAction: SDK_ERROR_METADATA[err.code].creatorAction,
          error: err.message,
        });
        return;
      }
      res.status(400).json({ code: "INVALID_REQUEST", error: err?.message || "Init failed" });
    }
  });

  app.post("/tick", async (req, res) => {
    try {
      const { ctx, state } = req.body;
      const result = await royalBlackjackGameServer.tick(ctx, state);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Tick failed" });
    }
  });

  app.post("/onPlayerJoin", async (req, res) => {
    try {
      const { playerId, state } = req.body;
      const result = await royalBlackjackGameServer.onPlayerJoin(playerId, state);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "onPlayerJoin failed" });
    }
  });

  app.post("/onPlayerLeave", async (req, res) => {
    try {
      const { playerId, state } = req.body;
      const result = await royalBlackjackGameServer.onPlayerLeave(playerId, state);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "onPlayerLeave failed" });
    }
  });

  app.post("/isGameOver", async (req, res) => {
    try {
      const { state } = req.body;
      const result = await royalBlackjackGameServer.isGameOver(state);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "isGameOver failed" });
    }
  });

  app.post("/onCommand", async (req, res) => {
    try {
      const { command, state } = req.body;
      if (!royalBlackjackGameServer.onCommand) {
        res.status(501).json({ error: "onCommand not implemented" });
        return;
      }
      const result = await royalBlackjackGameServer.onCommand(command, state);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "onCommand failed" });
    }
  });

  app.post("/projectState", (req, res) => {
    try {
      const { state } = req.body || {};
      const projection = projectBlackjackRoomState(state);
      res.json(projection);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "State projection failed" });
    }
  });

  // ============================================================================
  // 1a. Standard @randseed/game-sdk RoomClient Host Gateway
  //     (/api/warm, /api/match, /api/room/:roomId/state, /api/room/:roomId/input, /ws/room/:roomId)
  // ============================================================================
  const ROOM_ENVIRONMENT = process.env.NODE_ENV || "development";

  const resolveServerGameId = (req?: express.Request | http.IncomingMessage): string => {
    if (RANDSEED_GAME_ID) return RANDSEED_GAME_ID;
    const headers = req?.headers || {};
    const headerGameId =
      (headers["x-randseed-game-id"] as string) ||
      (headers["x-game-id"] as string);
    if (typeof headerGameId === "string" && headerGameId.trim()) {
      return headerGameId.trim();
    }
    const reqAny = req as express.Request | undefined;
    if (typeof reqAny?.body?.gameId === "string" && reqAny.body.gameId.trim()) {
      return reqAny.body.gameId.trim();
    }
    if (typeof reqAny?.query?.gameId === "string" && reqAny.query.gameId.trim()) {
      return reqAny.query.gameId.trim();
    }
    return "";
  };

  const buildRoomScope = (gameId: string) => ({
    gameId,
    environment: ROOM_ENVIRONMENT,
    versionId: ROYAL_BLACKJACK_RULES_VERSION,
  });

  const hostedRoomInstances = new Map<
    string,
    {
      roomId: string;
      matchId: string;
      matchSeq: number;
      tick: number;
      startedAtMs: number;
      gameOverAtMs?: number;
      scope: { gameId: string; environment: string; versionId: string };
      state: any;
      playerViews?: Record<string, any>;
      broadcasts: any[];
      gameResult: any;
      matchStatsByPlayer: Record<string, Record<string, number>>;
      sockets: Set<{ socket: Duplex; playerId: string }>;
      playerJoinedAt: Map<string, number>;
      observationGenerations: Map<string, number>;
    }
  >();

  // ============================================================================
  // 1b. Persistent Cross-Room / Cross-Version Match Archive (.data/randseed-archive.json)
  // ============================================================================
  const ARCHIVE_DIR = path.join(process.cwd(), ".data");
  const ARCHIVE_FILE = path.join(ARCHIVE_DIR, "randseed-archive.json");
  const WALLETS_FILE = path.join(ARCHIVE_DIR, "randseed-wallets.json");

  let persistedPlayerWallets: Record<string, number> = (() => {
    try {
      if (fs.existsSync(WALLETS_FILE)) {
        const raw = fs.readFileSync(WALLETS_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const out: Record<string, number> = {};
          for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
              out[k] = v;
            }
          }
          return out;
        }
      }
    } catch {
      // Ignore corrupt or missing wallet file
    }
    return {};
  })();

  const savePersistedWallets = () => {
    try {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      fs.writeFileSync(WALLETS_FILE, JSON.stringify(persistedPlayerWallets), "utf8");
    } catch {
      // Ignore disk write failure in read-only environments
    }
  };

  const syncRoomWalletsToPersistentStore = (state: any) => {
    if (!state?.walletCoins || typeof state.walletCoins !== "object") return;
    let changed = false;
    for (const [pid, coins] of Object.entries(state.walletCoins)) {
      if (pid.startsWith("bot_")) continue;
      if (typeof coins === "number" && Number.isFinite(coins) && coins >= 0) {
        if (persistedPlayerWallets[pid] !== coins) {
          persistedPlayerWallets[pid] = coins;
          changed = true;
        }
        if (usersDb[pid]) {
          usersDb[pid].balance = coins;
        }
      }
    }
    if (changed) {
      savePersistedWallets();
    }
  };

  interface PersistedMatchArchiveEntry {
    matchId: string;
    gameId: string;
    roomId: string;
    startTime: number;
    endTime: number;
    durationSeconds: number;
    playerIds: string[];
    winnerPlayerId: string | null;
    scores: Record<string, number>;
    summary: Record<string, any>;
    statsByPlayer: Record<string, Record<string, number>>;
  }

  let persistedMatchArchive: PersistedMatchArchiveEntry[] = (() => {
    try {
      if (fs.existsSync(ARCHIVE_FILE)) {
        const raw = fs.readFileSync(ARCHIVE_FILE, "utf8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // Ignore corrupt or missing local archive file
    }
    return [];
  })();

  const savePersistedArchive = () => {
    try {
      fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
      fs.writeFileSync(ARCHIVE_FILE, JSON.stringify(persistedMatchArchive), "utf8");
    } catch {
      // Ignore disk write failure in read-only environments
    }
  };

  const MAX_METRIC_KEYS = new Set(["best_single_win"]);
  const LAST_METRIC_KEYS = new Set(["ending_balance"]);

  const accumulateResultUnitsIntoMatchStats = (
    targetStats: Record<string, Record<string, number>>,
    resultUnits: any[] | undefined
  ) => {
    if (!Array.isArray(resultUnits) || resultUnits.length === 0) return;
    for (const unit of resultUnits) {
      const participants = Array.isArray(unit?.participants) ? unit.participants : [];
      for (const p of participants) {
        const pid = typeof p?.playerId === "string" ? p.playerId : "";
        if (!pid || pid.startsWith("bot_")) continue;
        if (!targetStats[pid]) targetStats[pid] = {};
        const rawMetrics = p?.metrics;
        const metricEntries: Array<[string, number]> = Array.isArray(rawMetrics)
          ? rawMetrics
              .filter(
                (m: any) =>
                  m &&
                  typeof m.key === "string" &&
                  typeof m.value === "number" &&
                  Number.isFinite(m.value)
              )
              .map((m: any) => [m.key, m.value])
          : rawMetrics && typeof rawMetrics === "object"
          ? Object.entries(rawMetrics).filter(
              (entry): entry is [string, number] =>
                typeof entry[0] === "string" &&
                typeof entry[1] === "number" &&
                Number.isFinite(entry[1])
            )
          : [];
        for (const [key, val] of metricEntries) {
          if (!key) continue;
          if (MAX_METRIC_KEYS.has(key)) {
            targetStats[pid][key] = Math.max(targetStats[pid][key] ?? 0, val);
          } else if (LAST_METRIC_KEYS.has(key)) {
            targetStats[pid][key] = val;
          } else {
            targetStats[pid][key] = (targetStats[pid][key] ?? 0) + val;
          }
        }
      }
    }
  };

  const persistCompletedMatchArchive = (
    inst: NonNullable<ReturnType<typeof hostedRoomInstances.get>>
  ) => {
    const gameResult = inst.gameResult;
    if (!gameResult?.over || !gameResult.summary) return;

    const summary = gameResult.summary as Record<string, any>;
    const customMetrics = (summary.customMetrics && typeof summary.customMetrics === "object"
      ? summary.customMetrics
      : {}) as Record<string, any>;

    const playerSet = new Set<string>();
    const addPlayer = (pid: unknown) => {
      if (typeof pid === "string" && pid.trim() && !pid.startsWith("bot_")) {
        playerSet.add(pid.trim());
      }
    };

    if (Array.isArray(inst.state?.players)) {
      inst.state.players.forEach(addPlayer);
    }
    Object.keys(inst.matchStatsByPlayer || {}).forEach(addPlayer);
    if (Array.isArray(customMetrics.settledRounds)) {
      for (const r of customMetrics.settledRounds) {
        if (Array.isArray(r?.seatResults)) {
          for (const sr of r.seatResults) {
            addPlayer(sr?.userId);
          }
        }
      }
    }
    if (Array.isArray(customMetrics.tournamentResults)) {
      for (const tr of customMetrics.tournamentResults) {
        if (Array.isArray(tr?.participantIds)) {
          tr.participantIds.forEach(addPlayer);
        }
        if (Array.isArray(tr?.record?.winners)) {
          for (const w of tr.record.winners) {
            addPlayer(w?.userId);
          }
        }
      }
    }

    const endTime = Date.now();
    const durationSeconds =
      typeof summary.durationSeconds === "number" && Number.isFinite(summary.durationSeconds)
        ? Math.max(0, Math.round(summary.durationSeconds))
        : Math.max(0, Math.round((endTime - inst.startedAtMs) / 1000));

    const entry: PersistedMatchArchiveEntry = {
      matchId: inst.matchId,
      gameId: inst.scope.gameId,
      roomId: inst.roomId,
      startTime: inst.startedAtMs,
      endTime,
      durationSeconds,
      playerIds: Array.from(playerSet),
      winnerPlayerId:
        typeof summary.winnerPlayerId === "string" && summary.winnerPlayerId
          ? summary.winnerPlayerId
          : null,
      scores:
        summary.scores && typeof summary.scores === "object" && !Array.isArray(summary.scores)
          ? { ...(summary.scores as Record<string, number>) }
          : {},
      summary: JSON.parse(JSON.stringify(summary)),
      statsByPlayer: JSON.parse(JSON.stringify(inst.matchStatsByPlayer || {})),
    };

    const existingIdx = persistedMatchArchive.findIndex(
      (item) => item.gameId === entry.gameId && item.matchId === entry.matchId
    );
    if (existingIdx >= 0) {
      persistedMatchArchive[existingIdx] = entry;
    } else {
      persistedMatchArchive.unshift(entry);
      if (persistedMatchArchive.length > 5000) {
        persistedMatchArchive = persistedMatchArchive.slice(0, 5000);
      }
    }
    savePersistedArchive();
  };

  const processRoomTickOutcome = async (
    inst: NonNullable<ReturnType<typeof hostedRoomInstances.get>>,
    tickRes: {
      state: any;
      playerViews?: Record<string, any>;
      broadcasts?: unknown[];
      resultUnits?: unknown[];
    }
  ) => {
    inst.state = tickRes.state;
    if (tickRes.playerViews) {
      inst.playerViews = tickRes.playerViews;
    }
    inst.broadcasts = tickRes.broadcasts || [];
    syncRoomWalletsToPersistentStore(inst.state);
    if (Array.isArray(tickRes.resultUnits) && tickRes.resultUnits.length > 0) {
      accumulateResultUnitsIntoMatchStats(inst.matchStatsByPlayer, tickRes.resultUnits);
    }
    inst.gameResult = await royalBlackjackGameServer.isGameOver(inst.state);
    if (inst.gameResult?.over) {
      if (!inst.gameOverAtMs) {
        inst.gameOverAtMs = Date.now();
      }
      persistCompletedMatchArchive(inst);
    }
  };

  const rolloverToNextMatchIfNeeded = async (
    inst: NonNullable<ReturnType<typeof hostedRoomInstances.get>>
  ): Promise<boolean> => {
    if (!inst.gameResult?.over) return false;
    const policy = inst.gameResult.nextMatchPolicy;
    if (policy?.mode !== "auto_next_match") return false;

    inst.matchSeq += 1;
    inst.matchId = `${inst.roomId}_m${inst.matchSeq}`;
    inst.tick = 0;
    inst.startedAtMs = Date.now();
    inst.gameOverAtMs = undefined;
    inst.matchStatsByPlayer = {};

    const fallbackJoinedPlayers = Array.from(inst.playerJoinedAt.keys());
    const activePlayers =
      Array.isArray(inst.state?.players) && inst.state.players.length > 0
        ? inst.state.players
        : fallbackJoinedPlayers.length > 0
        ? fallbackJoinedPlayers
        : ["player_1"];

    const randomSeed = crypto.randomBytes(32).toString("hex");
    const initRes = await royalBlackjackGameServer.init({
      matchId: inst.matchId,
      gameId: inst.scope.gameId,
      players: activePlayers,
      matchSeq: inst.matchSeq,
      options: {
        randomSeed,
        randomSeedIndex: inst.matchSeq,
        mode: "regular",
        minBet: 10,
        maxBet: 500,
        maxSeats: 7,
        initialWalletCoins: { ...persistedPlayerWallets },
      },
      ...(policy.carryover ? { carryover: policy.carryover } : {}),
    });
    inst.state = initRes.state;
    inst.playerViews = initRes.playerViews as Record<string, any> | undefined;
    inst.broadcasts = initRes.broadcasts || [];
    inst.gameResult = { over: false };
    syncRoomWalletsToPersistentStore(inst.state);
    return true;
  };

  const getElapsedSeconds = (inst: { startedAtMs: number }) =>
    Math.max(0, (Date.now() - inst.startedAtMs) / 1000);

  const sanitizeSdkDisplayName = (raw: unknown): string | undefined => {
    if (typeof raw !== "string") return undefined;
    const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
    return cleaned.length > 0 ? cleaned : undefined;
  };

  const sanitizeSdkAvatarUrl = (raw: unknown): string | undefined => {
    if (typeof raw !== "string") return undefined;
    const trimmed = raw.trim();
    if (!trimmed || trimmed.length > 4096 || /[\u0000-\u001f\u007f]/.test(trimmed)) {
      return undefined;
    }
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
      return trimmed;
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.hash) {
        return trimmed;
      }
    } catch {
      return undefined;
    }
    return undefined;
  };

  const encodeWsTextFrame = (text: string): Buffer => {
    const payload = Buffer.from(text, "utf8");
    const len = payload.length;
    let header: Buffer;
    if (len < 126) {
      header = Buffer.allocUnsafe(2);
      header[0] = 0x81;
      header[1] = len;
    } else if (len < 65536) {
      header = Buffer.allocUnsafe(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.allocUnsafe(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, payload]);
  };

  const buildRoomSnapshotFrame = (
    inst: NonNullable<ReturnType<typeof hostedRoomInstances.get>>,
    actionReceipts?: Array<{
      actionId: string;
      playerId: string;
      expectedTick: number;
      committedTick: number;
      status: "applied" | "rejected" | "unresolved";
      code?: string;
    }>,
    viewerPlayerId?: string
  ) => {
    const playerIds: string[] = Array.isArray(inst.state?.players) ? inst.state.players : [];
    const players = playerIds.slice(0, 100).map((pid) => {
      const displayName = sanitizeSdkDisplayName(
        inst.state?.playerNames?.[pid] || usersDb[pid]?.name || pid
      );
      const avatarUrl = sanitizeSdkAvatarUrl(
        inst.state?.playerAvatars?.[pid] || usersDb[pid]?.avatar
      );
      const joinedAt = inst.playerJoinedAt.get(pid) ?? inst.startedAtMs;
      return {
        playerId: pid,
        joinedAt,
        ...(displayName ? { displayName } : {}),
        ...(avatarUrl ? { avatarUrl } : {}),
      };
    });
    const authoritativePlayerView =
      viewerPlayerId && inst.playerViews && inst.playerViews[viewerPlayerId]
        ? inst.playerViews[viewerPlayerId]
        : null;
    const statePayload = authoritativePlayerView
      ? authoritativePlayerView
      : (() => {
          const projection = projectBlackjackRoomState(inst.state);
          return viewerPlayerId
            ? {
                ...(projection.publicState as Record<string, unknown>),
                self: {
                  playerId: viewerPlayerId,
                  privateState: projection.privateStates[viewerPlayerId] || null,
                },
              }
            : projection.publicState;
        })();
    return {
      type: "snapshot" as const,
      scope: inst.scope,
      matchId: inst.matchId,
      matchSeq: inst.matchSeq,
      tick: inst.tick,
      players,
      state: statePayload,
      broadcasts: inst.broadcasts || [],
      gameResult: inst.gameResult || { over: false },
      ...(actionReceipts && actionReceipts.length > 0 ? { actionReceipts } : {}),
    };
  };

  const broadcastRoomSnapshot = (
    inst: NonNullable<ReturnType<typeof hostedRoomInstances.get>>,
    actionReceipts?: Array<{
      actionId: string;
      playerId: string;
      expectedTick: number;
      committedTick: number;
      status: "applied" | "rejected" | "unresolved";
      code?: string;
    }>
  ) => {
    for (const client of [...inst.sockets]) {
      if (client.socket.destroyed || !client.socket.writable) {
        inst.sockets.delete(client);
        continue;
      }
      const playerReceipts = actionReceipts?.filter((r) => r.playerId === client.playerId);
      const frame = buildRoomSnapshotFrame(inst, playerReceipts, client.playerId);
      client.socket.write(encodeWsTextFrame(JSON.stringify(frame)));
    }
  };

  const getOrCreateHostedRoom = async (roomId: string, playerId: string, gameId: string) => {
    if (!gameId) {
      throw new Error("RANDSEED_GAME_ID is required from the server environment or request.");
    }
    let inst = hostedRoomInstances.get(roomId);
    if (!inst) {
      const matchId = `${roomId}_m1`;
      const nowMs = Date.now();
      const scope = buildRoomScope(gameId);
      const randomSeed = crypto.randomBytes(32).toString("hex");
      const initRes = await royalBlackjackGameServer.init({
        matchId,
        gameId,
        players: [playerId],
        matchSeq: 1,
        options: {
          randomSeed,
          randomSeedIndex: 1,
          mode: "regular",
          minBet: 10,
          maxBet: 500,
          maxSeats: 7,
          initialWalletCoins: { ...persistedPlayerWallets },
        },
      });
      inst = {
        roomId,
        matchId,
        matchSeq: 1,
        tick: 0,
        startedAtMs: nowMs,
        scope,
        state: initRes.state,
        playerViews: initRes.playerViews as Record<string, any> | undefined,
        broadcasts: initRes.broadcasts || [],
        gameResult: { over: false },
        matchStatsByPlayer: {},
        sockets: new Set(),
        playerJoinedAt: new Map([[playerId, nowMs]]),
        observationGenerations: new Map(),
      };
      syncRoomWalletsToPersistentStore(inst.state);
      hostedRoomInstances.set(roomId, inst);
    } else {
      if (!inst.playerJoinedAt.has(playerId)) {
        inst.playerJoinedAt.set(playerId, Date.now());
      }
      const isReconnecting = inst.state?.disconnectedAtElapsedSec?.[playerId] !== undefined;
      if (!inst.state.players.includes(playerId) || isReconnecting) {
        if (
          typeof inst.state.walletCoins?.[playerId] !== "number" &&
          typeof persistedPlayerWallets[playerId] === "number" &&
          persistedPlayerWallets[playerId] > 0
        ) {
          inst.state.walletCoins[playerId] = persistedPlayerWallets[playerId];
          if (inst.state.mode === "regular") {
            inst.state.balances[playerId] = persistedPlayerWallets[playerId];
          }
        }
        inst.state.elapsedSeconds = getElapsedSeconds(inst);
        const joinRes = await royalBlackjackGameServer.onPlayerJoin(playerId, inst.state);
        inst.state = joinRes.state;
        inst.playerViews = joinRes.playerViews as Record<string, any> | undefined;
        inst.broadcasts = joinRes.broadcasts || [];
        syncRoomWalletsToPersistentStore(inst.state);
        broadcastRoomSnapshot(inst);
      }
    }
    return inst;
  };

  const parseCookies = (cookieHeader = ""): Record<string, string> => {
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx > 0) {
        const k = pair.slice(0, idx).trim();
        const v = decodeURIComponent(pair.slice(idx + 1).trim());
        cookies[k] = v;
      }
    });
    return cookies;
  };

  const resolveAuthenticatedPlatformPlayer = (req: express.Request | http.IncomingMessage): {
    playerId: string;
    name?: string;
    avatar?: string;
    isCreator?: boolean;
  } => {
    const headers = req.headers || {};
    const headerPlayerId =
      (headers["x-randseed-player-id"] as string) ||
      (headers["x-player-id"] as string) ||
      (headers["x-user-id"] as string);
    const headerName =
      (headers["x-randseed-player-name"] as string) ||
      (headers["x-player-name"] as string) ||
      (headers["x-user-name"] as string);
    const headerAvatar =
      (headers["x-randseed-player-avatar"] as string) ||
      (headers["x-player-avatar"] as string);

    const cookies = parseCookies(headers.cookie || "");
    const cookiePlayerId = cookies["rs_player_id"] || cookies["randseed_player_id"] || cookies["player_id"];
    const cookieName = cookies["rs_player_name"] || cookies["player_name"];

    const body = (req as express.Request).body;
    const query = (req as express.Request).query;
    const fallbackId =
      (typeof body?.playerId === "string" && body.playerId) ||
      (typeof body?.userId === "string" && body.userId) ||
      (typeof query?.playerId === "string" && query.playerId) ||
      "player_1";

    return {
      playerId: (headerPlayerId || cookiePlayerId || fallbackId).trim(),
      name: headerName || cookieName || body?.name,
      avatar: headerAvatar || body?.avatar,
      isCreator: "query" in req ? isAuthorizedCreator(req as express.Request) || Boolean(body?.isCreator) : false,
    };
  };

  app.post("/api/warm", (req, res) => {
    const gameId = resolveServerGameId(req);
    if (!gameId) {
      res.status(400).json({
        success: false,
        code: "MISSING_GAME_ID",
        error: "Server RANDSEED_GAME_ID or GAME_ID is not configured.",
      });
      return;
    }
    res.json({
      success: true,
      data: {
        scope: buildRoomScope(gameId),
        status: "ready",
        readiness: "container",
      },
    });
  });

  // Background tick loop for active rooms & rooms waiting on 10s disconnect grace timers
  setInterval(async () => {
    for (const inst of hostedRoomInstances.values()) {
      const hasDisconnectedPlayers =
        Boolean(inst.state?.disconnectedAtElapsedSec) &&
        Object.keys(inst.state.disconnectedAtElapsedSec).length > 0;
      const pendingRollover =
        Boolean(inst.gameResult?.over) &&
        inst.gameResult?.nextMatchPolicy?.mode === "auto_next_match";
      if (inst.sockets.size === 0 && !hasDisconnectedPlayers && !pendingRollover) continue;
      try {
        if (pendingRollover) {
          const timeoutMs = Number(inst.gameResult?.nextMatchPolicy?.timeoutMs ?? 3000);
          if (inst.gameOverAtMs && Date.now() - inst.gameOverAtMs >= timeoutMs) {
            const rolled = await rolloverToNextMatchIfNeeded(inst);
            if (rolled) {
              broadcastRoomSnapshot(inst);
            }
          }
          continue;
        }
        inst.tick += 1;
        const tickRes = await royalBlackjackGameServer.tick(
          {
            tick: inst.tick,
            elapsedSeconds: getElapsedSeconds(inst),
            inputs: [],
          },
          inst.state
        );
        await processRoomTickOutcome(inst, tickRes);
        broadcastRoomSnapshot(inst);
        if (
          inst.gameResult?.over &&
          inst.gameResult?.nextMatchPolicy?.mode === "auto_next_match" &&
          Number(inst.gameResult?.nextMatchPolicy?.timeoutMs ?? 0) <= 0
        ) {
          const rolled = await rolloverToNextMatchIfNeeded(inst);
          if (rolled) {
            broadcastRoomSnapshot(inst);
          }
        }
      } catch {
        // Ignore background tick error
      }
    }
  }, 1000);

  app.post("/api/match", async (req, res) => {
    try {
      const gameId = resolveServerGameId(req);
      if (!gameId) {
        res.status(400).json({
          success: false,
          code: "MISSING_GAME_ID",
          error: "Server RANDSEED_GAME_ID or GAME_ID is not configured.",
        });
        return;
      }
      const resolved = resolveAuthenticatedPlatformPlayer(req);
      const playerId = resolved.playerId;
      const roomId = typeof req.body?.roomId === "string" && req.body.roomId ? req.body.roomId : "room_main";
      res.setHeader(
        "Set-Cookie",
        `rs_player_id=${encodeURIComponent(playerId)}; Path=/; SameSite=Lax`
      );
      getOrCreateUser(playerId, resolved.name || "Player", Boolean(resolved.isCreator), resolved.avatar);
      const inst = await getOrCreateHostedRoom(roomId, playerId, gameId);
      const nextGeneration = (inst.observationGenerations.get(playerId) || 0) + 1;
      inst.observationGenerations.set(playerId, nextGeneration);
      const wantsObservationAck = req.headers["x-randseed-room-protocol"] === "observation-ack-v1";
      res.json({
        success: true,
        data: {
          roomId,
          playerId,
          ready: true,
          status: "ready" as const,
          scope: inst.scope,
          ...(wantsObservationAck ? { observationGeneration: nextGeneration } : {}),
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "MATCH_FAILED", error: err?.message });
    }
  });

  app.post("/api/match/observed", (req, res) => {
    const roomId = typeof req.body?.roomId === "string" ? req.body.roomId : "";
    const observationGeneration =
      req.body?.observationGeneration ?? req.body?.startupGeneration;
    if (!roomId || !hostedRoomInstances.has(roomId)) {
      res.status(404).json({ success: false, code: "ROOM_NOT_FOUND", error: "Room not found." });
      return;
    }
    if (
      typeof observationGeneration !== "number" ||
      !Number.isSafeInteger(observationGeneration) ||
      observationGeneration < 1
    ) {
      res.status(400).json({
        success: false,
        code: "INVALID_OBSERVATION",
        error: "Invalid observationGeneration.",
      });
      return;
    }
    res.json({
      success: true,
      data: {
        acknowledged: true,
      },
    });
  });

  app.get("/api/room/:roomId/state", async (req, res) => {
    try {
      const gameId = resolveServerGameId(req) || hostedRoomInstances.get(req.params.roomId)?.scope.gameId || "";
      if (!gameId) {
        res.status(400).json({
          success: false,
          code: "MISSING_GAME_ID",
          error: "Server RANDSEED_GAME_ID or GAME_ID is not configured.",
        });
        return;
      }
      const resolved = resolveAuthenticatedPlatformPlayer(req);
      const inst = await getOrCreateHostedRoom(req.params.roomId, resolved.playerId, gameId);
      res.json({
        success: true,
        data: buildRoomSnapshotFrame(inst, undefined, resolved.playerId),
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "STATE_FAILED", error: err?.message });
    }
  });

  app.post("/api/room/:roomId/input", async (req, res) => {
    try {
      const gameId = resolveServerGameId(req) || hostedRoomInstances.get(req.params.roomId)?.scope.gameId || "";
      if (!gameId) {
        res.status(400).json({
          success: false,
          code: "MISSING_GAME_ID",
          error: "Server RANDSEED_GAME_ID or GAME_ID is not configured.",
        });
        return;
      }
      const resolved = resolveAuthenticatedPlatformPlayer(req);
      const playerId = resolved.playerId;
      const inst = await getOrCreateHostedRoom(req.params.roomId, playerId, gameId);
      if (typeof req.body?.matchId === "string" && req.body.matchId && req.body.matchId !== inst.matchId) {
        res.status(409).json({
          success: false,
          code: "ROOM_CONFLICT",
          error: "Match ID does not match the active room match.",
        });
        return;
      }
      const rawExpected = req.body?.expectedTick;
      const expectedTick =
        typeof rawExpected === "number" && Number.isSafeInteger(rawExpected) && rawExpected >= 0
          ? rawExpected
          : inst.tick;
      const actionId = typeof req.body?.actionId === "string" ? req.body.actionId : undefined;
      inst.tick = Math.max(inst.tick + 1, expectedTick + 1);
      const tickRes = await royalBlackjackGameServer.tick(
        {
          tick: inst.tick,
          elapsedSeconds: getElapsedSeconds(inst),
          inputs: [{ playerId, data: req.body?.data, ...(actionId ? { actionId } : {}) }],
        },
        inst.state
      );
      await processRoomTickOutcome(inst, tickRes);

      const receipts =
        actionId && tickRes.actionResults
          ? tickRes.actionResults.map((r) => ({
              actionId: r.actionId,
              playerId,
              expectedTick,
              committedTick: inst.tick,
              status: r.status,
              ...(r.code ? { code: r.code } : {}),
            }))
          : undefined;
      broadcastRoomSnapshot(inst, receipts);

      if (
        inst.gameResult?.over &&
        inst.gameResult?.nextMatchPolicy?.mode === "auto_next_match" &&
        Number(inst.gameResult?.nextMatchPolicy?.timeoutMs ?? 0) <= 0
      ) {
        const rolled = await rolloverToNextMatchIfNeeded(inst);
        if (rolled) {
          broadcastRoomSnapshot(inst);
        }
      }

      res.json({
        success: true,
        data: { applied: true },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "INPUT_FAILED", error: err?.message });
    }
  });

  app.post("/api/room/:roomId/ready", async (req, res) => {
    try {
      const gameId = resolveServerGameId(req) || hostedRoomInstances.get(req.params.roomId)?.scope.gameId || "";
      if (!gameId) {
        res.status(400).json({
          success: false,
          code: "MISSING_GAME_ID",
          error: "Server RANDSEED_GAME_ID or GAME_ID is not configured.",
        });
        return;
      }
      const resolved = resolveAuthenticatedPlatformPlayer(req);
      const inst = await getOrCreateHostedRoom(req.params.roomId, resolved.playerId, gameId);
      if (typeof req.body?.matchId === "string" && req.body.matchId && req.body.matchId !== inst.matchId) {
        res.status(409).json({
          success: false,
          code: "ROOM_CONFLICT",
          error: "Match ID does not match the active room match.",
        });
        return;
      }

      const rolled = await rolloverToNextMatchIfNeeded(inst);
      if (!rolled) {
        inst.tick += 1;
        const tickRes = await royalBlackjackGameServer.tick(
          {
            tick: inst.tick,
            elapsedSeconds: getElapsedSeconds(inst),
            inputs: [{ playerId: resolved.playerId, data: { action: "ready_next" } }],
          },
          inst.state
        );
        await processRoomTickOutcome(inst, tickRes);
      }
      broadcastRoomSnapshot(inst);

      res.json({
        success: true,
        data: {
          ready: true,
          readyCount: 1,
          totalCount: 1,
          allReady: true,
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "READY_FAILED", error: err?.message });
    }
  });

  // Persistent Player Match History Archive API (@randseed/game-sdk fetchPlayerMatchHistory compatible)
  app.get("/api/:gameId/history/:playerId", (req, res) => {
    try {
      const gameId = String(req.params.gameId || "").trim();
      if (!gameId) {
        res.status(400).json({
          success: false,
          code: "INVALID_GAME_ID",
          error: "gameId is required.",
        });
        return;
      }

      const rawPlayerId = String(req.params.playerId || "me").trim();
      const targetPlayerId =
        rawPlayerId === "me"
          ? resolveAuthenticatedPlatformPlayer(req).playerId
          : rawPlayerId;

      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const playerEntries = persistedMatchArchive
        .filter(
          (entry) =>
            entry.gameId === gameId &&
            (entry.playerIds.includes(targetPlayerId) ||
              Object.prototype.hasOwnProperty.call(entry.scores || {}, targetPlayerId) ||
              Object.prototype.hasOwnProperty.call(entry.statsByPlayer || {}, targetPlayerId))
        )
        .sort((a, b) => b.endTime - a.endTime || b.startTime - a.startTime);

      const total = playerEntries.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
      const page = Math.floor(offset / limit) + 1;
      const slice = playerEntries.slice(offset, offset + limit);

      const data = slice.map((entry) => {
        const sortedScoreIds = Object.entries(entry.scores || {})
          .filter(([pid]) => !pid.startsWith("bot_"))
          .sort((a, b) => b[1] - a[1])
          .map(([pid]) => pid);
        const rankIdx = sortedScoreIds.indexOf(targetPlayerId);
        const rank =
          rankIdx >= 0
            ? rankIdx + 1
            : entry.winnerPlayerId === targetPlayerId
            ? 1
            : null;
        const score =
          typeof entry.scores?.[targetPlayerId] === "number" &&
          Number.isFinite(entry.scores[targetPlayerId])
            ? entry.scores[targetPlayerId]
            : null;

        return {
          matchId: entry.matchId,
          gameId: entry.gameId,
          startTime: entry.startTime,
          endTime: entry.endTime,
          durationSeconds: entry.durationSeconds,
          playerCount: entry.playerIds.length,
          winnerPlayerId: entry.winnerPlayerId,
          summary: entry.summary,
          hasReplay: false,
          rank,
          score,
          stats: entry.statsByPlayer?.[targetPlayerId] || {},
        };
      });

      res.json({
        success: true,
        data,
        pagination: {
          page,
          pageSize: limit,
          total,
          totalPages,
        },
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        code: "ARCHIVE_REQUEST_FAILED",
        error: err?.message || "Failed to load player match history.",
      });
    }
  });

  // ============================================================================
  // 2. Backend-Authoritative Game Engine & Per-Round Management API
  //    All coin grants, refills, tournament ticket purchases, and card/round
  //    mechanics run strictly on the backend. Shoe cards & hidden hole cards
  //    are sanitized before returning to the frontend.
  // ============================================================================
  const buildStatePayload = (userId?: string, extra: Record<string, any> = {}) => {
    reconcileSystemTables();
    const user = userId ? getOrCreateUser(userId) : null;
    const sanitizedExtra: Record<string, any> = { ...extra };
    if (sanitizedExtra.table) {
      sanitizedExtra.table = sanitizeTableForClient(sanitizedExtra.table, userId);
    }
    if (sanitizedExtra.room) {
      sanitizedExtra.room = sanitizeTableForClient(sanitizedExtra.room, userId);
    }
    return {
      user,
      tables: sanitizeTablesMapForClient(tablesDb, userId),
      ...sanitizedExtra,
    };
  };

  app.post("/api/game/session", async (req, res) => {
    try {
      const platformIdentity = resolveAuthenticatedPlatformPlayer(req);
      const { userId, name = "Player", avatar, publisherKey, isCreator } = req.body || {};
      const resolvedId =
        platformIdentity.playerId && platformIdentity.playerId !== "player_1"
          ? platformIdentity.playerId
          : typeof userId === "string" && userId.trim()
          ? userId.trim()
          : `user_${crypto.randomBytes(6).toString("hex")}`;
      const resolvedName = platformIdentity.name || name || "Player";
      const resolvedAvatar = platformIdentity.avatar || avatar;
      const isCreatorAuth = Boolean(
        platformIdentity.isCreator ||
          isCreator ||
          (publisherKey && (publisherKey === CREATOR_SECRET || publisherKey === "royal-blackjack-creator")) ||
          isAuthorizedCreator(req)
      );
      const user = getOrCreateUser(
        resolvedId,
        resolvedName,
        isCreatorAuth,
        resolvedAvatar
      );
      const gameId = resolveServerGameId(req) || hostedRoomInstances.get("table_1")?.scope.gameId || "";
      if (!gameId) {
        res.status(400).json({ error: "Server RANDSEED_GAME_ID or GAME_ID is not configured." });
        return;
      }
      const inst = await getOrCreateHostedRoom("table_1", resolvedId, gameId);
      if (!inst.state.playerNames) inst.state.playerNames = {};
      if (!inst.state.playerAvatars) inst.state.playerAvatars = {};
      if (resolvedName && resolvedName !== "Player") {
        inst.state.playerNames[resolvedId] = resolvedName;
      }
      if (resolvedAvatar) {
        inst.state.playerAvatars[resolvedId] = resolvedAvatar;
      }
      res.setHeader(
        "Set-Cookie",
        `rs_player_id=${encodeURIComponent(resolvedId)}; Path=/; SameSite=Lax`
      );
      const snapFrame = buildRoomSnapshotFrame(inst, undefined, resolvedId);
      res.json({
        user,
        roomSnapshot: snapFrame.state,
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to initialize session" });
    }
  });

  app.get("/api/game/state", (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    res.json(buildStatePayload(userId));
  });

  // Backend-validated 5,000 Game Coins Refill (rejects if player is not out of coins)
  app.post("/api/game/refill", (req, res) => {
    try {
      const { userId, tableId } = req.body || {};
      if (!userId) {
        res.status(400).json({ error: "userId is required" });
        return;
      }
      const { user, table } = claimServerRefill(userId, tableId);
      res.json({
        user,
        table: table ? sanitizeTableForClient(table, userId) : null,
        tables: sanitizeTablesMapForClient(tablesDb, userId),
      });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Refill denied by server" });
    }
  });

  app.get("/api/rooms", (_req, res) => {
    reconcileSystemTables();
    const rooms = Object.values(tablesDb)
      .filter((t) => t.status !== "closed")
      .map((t) => sanitizeTableForClient(t));
    res.json({ rooms });
  });

  app.post(["/api/rooms", "/api/game/tables"], async (req, res) => {
    try {
      const { userId = "host_user", userName = "Player", userAvatar, settings, liquidity = 0 } = req.body || {};
      getOrCreateUser(userId, userName, false, userAvatar);
      const room = await hostTableApi.createTable(userId, userName, settings, liquidity, userAvatar);
      res.status(201).json(buildStatePayload(userId, { room, table: room }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to create room" });
    }
  });

  app.post("/api/game/tables/:id/verify-code", (req, res) => {
    const table = tablesDb[req.params.id];
    if (!table || table.status === "closed") {
      res.status(404).json({ valid: false, error: "Table not found" });
      return;
    }
    const { userId, tableCode } = req.body || {};
    const expectedCode = table.settings?.tableCode;
    if (!expectedCode || (userId && userId === table.houseId)) {
      res.json({ valid: true });
      return;
    }
    const submitted = typeof tableCode === "string" ? tableCode.trim() : "";
    if (submitted === String(expectedCode).trim()) {
      res.json({ valid: true });
    } else {
      res.status(403).json({ valid: false, error: "Incorrect 4-digit Table Code" });
    }
  });

  app.put("/api/game/tables/:id/settings", async (req, res) => {
    try {
      const { userId, settings } = req.body || {};
      const table = await hostTableApi.updateTableSettings(req.params.id, userId, settings);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to update settings" });
    }
  });

  app.post("/api/game/tables/:id/deposit", async (req, res) => {
    try {
      const { userId, amount } = req.body || {};
      const table = await hostTableApi.depositLiquidity(req.params.id, userId, Number(amount) || 0);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to deposit liquidity" });
    }
  });

  app.post("/api/game/tables/:id/withdraw", async (req, res) => {
    try {
      const { userId, amount } = req.body || {};
      const table = await hostTableApi.withdrawLiquidity(req.params.id, userId, Number(amount) || 0);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to withdraw liquidity" });
    }
  });

  app.post("/api/game/tables/:id/pause", async (req, res) => {
    try {
      const { userId } = req.body || {};
      const table = await hostTableApi.pauseTable(req.params.id, userId);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to pause table" });
    }
  });

  app.post("/api/game/tables/:id/resume", async (req, res) => {
    try {
      const { userId } = req.body || {};
      const table = await hostTableApi.resumeTable(req.params.id, userId);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to resume table" });
    }
  });

  app.post("/api/game/tables/:id/close", async (req, res) => {
    try {
      const { userId } = req.body || {};
      const { table } = await hostTableApi.closeTable(req.params.id, userId);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to close table" });
    }
  });

  app.post("/api/game/tables/:id/visit", async (req, res) => {
    try {
      const { userId } = req.body || {};
      await hostTableApi.recordVisit(req.params.id);
      res.json(buildStatePayload(userId, { table: tablesDb[req.params.id] }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to record visit" });
    }
  });

  app.post("/api/game/tables/:id/join", async (req, res) => {
    try {
      const { userId, seatIndex, currency = "Gcoin" } = req.body || {};
      const table = await gameApi.joinTable(req.params.id, userId, Number(seatIndex), 0, currency);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to join table" });
    }
  });

  app.post("/api/game/tables/:id/leave", async (req, res) => {
    try {
      const { userId, seatIndex, isTimeout } = req.body || {};
      const { table } = await gameApi.leaveTable(
        req.params.id,
        userId,
        seatIndex !== undefined ? Number(seatIndex) : undefined,
        Boolean(isTimeout)
      );
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to leave table" });
    }
  });

  app.post("/api/game/tables/:id/unlock", async (req, res) => {
    try {
      const { userId } = req.body || {};
      const { table, refundedAmount, currency } = await gameApi.unlockTableBalance(req.params.id, userId);
      res.json(buildStatePayload(userId, { table, refundedAmount, currency }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to unlock table balance" });
    }
  });

  app.post("/api/game/tables/:id/bet", async (req, res) => {
    try {
      const { userId, seatIndex, amount, sideBets } = req.body || {};
      const { table, deducted } = await gameApi.placeBet(
        req.params.id,
        Number(seatIndex),
        userId,
        Number(amount),
        sideBets
      );
      res.json(buildStatePayload(userId, { table, deducted }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to place bet" });
    }
  });

  app.post("/api/game/tables/:id/start", async (req, res) => {
    try {
      const { userId } = req.body || {};
      const table = await gameApi.startGame(req.params.id);
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to start game" });
    }
  });

  app.post("/api/game/tables/:id/hit", async (req, res) => {
    try {
      const { userId, seatIndex } = req.body || {};
      const table = await gameApi.hit(req.params.id, Number(seatIndex));
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to hit" });
    }
  });

  app.post("/api/game/tables/:id/stand", async (req, res) => {
    try {
      const { userId, seatIndex } = req.body || {};
      const table = await gameApi.stand(req.params.id, Number(seatIndex));
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to stand" });
    }
  });

  app.post("/api/game/tables/:id/double", async (req, res) => {
    try {
      const { userId, seatIndex } = req.body || {};
      const table = await gameApi.doubleDown(req.params.id, Number(seatIndex));
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to double down" });
    }
  });

  app.post("/api/game/tables/:id/split", async (req, res) => {
    try {
      const { userId, seatIndex } = req.body || {};
      const table = await gameApi.split(req.params.id, Number(seatIndex));
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to split" });
    }
  });

  app.post("/api/game/tables/:id/insurance", async (req, res) => {
    try {
      const { userId, seatIndex } = req.body || {};
      const table = await gameApi.buyInsurance(req.params.id, Number(seatIndex));
      res.json(buildStatePayload(userId, { table }));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to buy insurance" });
    }
  });

  app.post("/api/game/tables/:id/dealer-play", async (req, res) => {
    try {
      const { userId } = req.body || {};
      const result = await gameApi.dealerPlayAndResolve(req.params.id);
      res.json(buildStatePayload(userId, result));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Failed to resolve dealer hand" });
    }
  });

  // Game Runtime Overview (Game Stats: House tokens distributed, user counts, room overview)
  app.get("/api/stats", (req, res) => {
    reconcileSystemTables();
    const allTables = Object.values(tablesDb);
    const activeRooms = allTables.filter((t) => t.status !== "closed");
    const totalRoundsPlayed = allTables.reduce((sum, t) => sum + (t.roundsPlayed || 0), 0);
    const totalVisits = allTables.reduce((sum, t) => sum + (t.visits || 0), 0);
    const seatedPlayers = activeRooms.reduce(
      (sum, t) => sum + t.seats.filter((s) => s.userId !== null).length,
      0
    );

    const totalUsersCount = Object.keys(usersDb).length;
    const tokensIssued = houseStats.totalTokensIssuedByHouse;
    const tokensPaidOut = houseStats.totalTokensPaidOutToPlayers;
    const houseDistributedTokens = tokensIssued + tokensPaidOut;

    res.json({
      gameId: "royal-blackjack",
      rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
      uptimeSeconds: Math.floor(process.uptime()),
      activeRoomsCount: activeRooms.length,
      seatedPlayersCount: seatedPlayers,
      totalRoundsPlayed,
      totalVisits,
      totalUsersCount,
      houseDistributedTokens,
      tokensIssued,
      tokensPaidOut,
      totalRefillsCount: houseStats.totalRefillsCount,
      isCreator: isAuthorizedCreator(req),
      rooms: activeRooms.map((r) => ({
        id: r.id,
        name: r.name,
        mode: r.settings.mode || "regular",
        status: r.status,
        roundsPlayed: r.roundsPlayed,
        visits: r.visits,
        seatedPlayers: r.seats.filter((s) => s.userId !== null).length,
        maxSeats: r.settings.maxSeats,
      })),
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const httpServer = http.createServer(app);

  // Attach WebSocket upgrade handler for RoomClient (/ws/room/:roomId)
  const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  httpServer.on("upgrade", async (req, socket, head) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
      const match = url.pathname.match(/^\/ws\/room\/([^/]+)$/);
      if (!match) return;

      const key = req.headers["sec-websocket-key"];
      if (typeof key !== "string" || !key.trim()) {
        socket.destroy();
        return;
      }

      const roomId = decodeURIComponent(match[1]);
      const gameId =
        resolveServerGameId(req) || hostedRoomInstances.get(roomId)?.scope.gameId || "";
      if (!gameId) {
        socket.destroy();
        return;
      }
      const resolved = resolveAuthenticatedPlatformPlayer(req);
      const playerId = resolved.playerId;
      const inst = await getOrCreateHostedRoom(roomId, playerId, gameId);

      const accept = crypto.createHash("sha1").update(key.trim() + WS_GUID).digest("base64");
      socket.write(
        [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${accept}`,
          "\r\n",
        ].join("\r\n")
      );

      const clientEntry = { socket, playerId };
      inst.sockets.add(clientEntry);

      let disconnected = false;
      const handleWsDisconnect = async () => {
        if (disconnected) return;
        disconnected = true;
        inst.sockets.delete(clientEntry);
        const stillHasOpenSocket = [...inst.sockets].some(
          (c) => c.playerId === playerId && !c.socket.destroyed && c.socket.writable
        );
        if (!stillHasOpenSocket) {
          try {
            inst.state.elapsedSeconds = getElapsedSeconds(inst);
            const leaveRes = await royalBlackjackGameServer.onPlayerLeave(playerId, inst.state);
            inst.state = leaveRes.state;
            inst.playerViews = leaveRes.playerViews as Record<string, any> | undefined;
            inst.broadcasts = leaveRes.broadcasts || [];
            broadcastRoomSnapshot(inst);
          } catch {
            // Ignore leave handling error
          }
        }
      };

      // Send initial authoritative RoomSnapshot immediately on connect
      socket.write(encodeWsTextFrame(JSON.stringify(buildRoomSnapshotFrame(inst, undefined, playerId))));

      let buffer = head && head.length > 0 ? Buffer.from(head) : Buffer.alloc(0);

      const processBuffer = async () => {
        while (buffer.length >= 2) {
          const firstByte = buffer[0];
          const secondByte = buffer[1];
          const opcode = firstByte & 0x0f;
          const isMasked = (secondByte & 0x80) !== 0;
          let payloadLen = secondByte & 0x7f;
          let offset = 2;

          if (payloadLen === 126) {
            if (buffer.length < 4) return;
            payloadLen = buffer.readUInt16BE(2);
            offset = 4;
          } else if (payloadLen === 127) {
            if (buffer.length < 10) return;
            payloadLen = Number(buffer.readBigUInt64BE(2));
            offset = 10;
          }

          const maskLen = isMasked ? 4 : 0;
          if (buffer.length < offset + maskLen + payloadLen) return;

          const mask = isMasked ? buffer.subarray(offset, offset + 4) : null;
          offset += maskLen;
          const payload = Buffer.from(buffer.subarray(offset, offset + payloadLen));
          buffer = buffer.subarray(offset + payloadLen);

          if (mask) {
            for (let i = 0; i < payload.length; i++) {
              payload[i] ^= mask[i & 3];
            }
          }

          if (opcode === 0x08) {
            socket.end();
            await handleWsDisconnect();
            return;
          }

          if (opcode === 0x01) {
            try {
              const msg = JSON.parse(payload.toString("utf8"));
              if (msg?.type === "input" && msg.data !== undefined) {
                if (typeof msg.matchId === "string" && msg.matchId && msg.matchId !== inst.matchId) {
                  if (!socket.destroyed && socket.writable) {
                    socket.write(encodeWsTextFrame(JSON.stringify({ type: "error", code: "ROOM_CONFLICT" })));
                  }
                  continue;
                }
                const wsExpectedTick =
                  typeof msg.expectedTick === "number" && Number.isSafeInteger(msg.expectedTick) && msg.expectedTick >= 0
                    ? msg.expectedTick
                    : inst.tick;
                const wsActionId = typeof msg.actionId === "string" ? msg.actionId : undefined;
                inst.tick = Math.max(inst.tick + 1, wsExpectedTick + 1);
                const tickRes = await royalBlackjackGameServer.tick(
                  {
                    tick: inst.tick,
                    elapsedSeconds: getElapsedSeconds(inst),
                    inputs: [{ playerId, data: msg.data, ...(wsActionId ? { actionId: wsActionId } : {}) }],
                  },
                  inst.state
                );
                await processRoomTickOutcome(inst, tickRes);
                const receipts =
                  wsActionId && tickRes.actionResults
                    ? tickRes.actionResults.map((r) => ({
                        actionId: r.actionId,
                        playerId,
                        expectedTick: wsExpectedTick,
                        committedTick: inst.tick,
                        status: r.status,
                        ...(r.code ? { code: r.code } : {}),
                      }))
                    : undefined;
                if (msg.ack !== false && !socket.destroyed && socket.writable) {
                  socket.write(encodeWsTextFrame(JSON.stringify({ type: "inputAccepted", applied: true })));
                }
                broadcastRoomSnapshot(inst, receipts);
                if (
                  inst.gameResult?.over &&
                  inst.gameResult?.nextMatchPolicy?.mode === "auto_next_match" &&
                  Number(inst.gameResult?.nextMatchPolicy?.timeoutMs ?? 0) <= 0
                ) {
                  const rolled = await rolloverToNextMatchIfNeeded(inst);
                  if (rolled) {
                    broadcastRoomSnapshot(inst);
                  }
                }
              } else if (msg?.type === "ping") {
                socket.write(encodeWsTextFrame(JSON.stringify({ type: "pong" })));
              }
            } catch {
              // Ignore malformed client WS frame
            }
          }
        }
      };

      socket.on("data", (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        void processBuffer();
      });

      socket.on("close", () => {
        void handleWsDisconnect();
      });
      socket.on("error", () => {
        void handleWsDisconnect();
      });
    } catch {
      socket.destroy();
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Royal BlackJack Server (gameId: ${RANDSEED_GAME_ID}) running on http://localhost:${PORT}`);
  });
}

startServer();
