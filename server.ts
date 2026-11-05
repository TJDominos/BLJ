import express from "express";
import path from "path";
import cors from "cors";
import { tablesDb, reconcileSystemTables, getOrCreateUser, claimServerRefill, usersDb, houseStats } from "./src/backend/db";
import { hostTableApi } from "./src/backend/hostTableApi";
import { gameApi } from "./src/backend/gameApi";
import { royalBlackjackGameServer } from "./src/backend/royalBlackjackRoomServer";
import {
  ROYAL_BLACKJACK_RULES_VERSION,
  projectBlackjackRoomState,
  sanitizeTableForClient,
  sanitizeTablesMapForClient,
} from "./src/backend/platformContract";

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
      res.json(manifest);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to load manifest" });
    }
  });

  app.get(["/health", "/api/health"], (_req, res) => {
    res.json({
      status: "ok",
      gameId: "royal-blackjack",
      rulesVersion: ROYAL_BLACKJACK_RULES_VERSION,
      uptime: process.uptime(),
    });
  });

  app.post("/init", async (req, res) => {
    try {
      const result = await royalBlackjackGameServer.init(req.body);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Init failed" });
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
  //     (/api/match, /api/room/:roomId/state, /api/room/:roomId/input)
  // ============================================================================
  const hostedRoomInstances = new Map<
    string,
    {
      roomId: string;
      matchId: string;
      matchSeq: number;
      tick: number;
      state: any;
      broadcasts: any[];
      gameResult: any;
    }
  >();

  const getOrCreateHostedRoom = async (roomId: string, playerId: string) => {
    let inst = hostedRoomInstances.get(roomId);
    if (!inst) {
      const matchId = `${roomId}_m1`;
      const initRes = await royalBlackjackGameServer.init({
        matchId,
        gameId: "royal-blackjack",
        players: [playerId],
        matchSeq: 1,
        options: { seed: 20261031, mode: "regular", minBet: 10, maxBet: 500, maxSeats: 7 },
      });
      inst = {
        roomId,
        matchId,
        matchSeq: 1,
        tick: 0,
        state: initRes.state,
        broadcasts: initRes.broadcasts || [],
        gameResult: { over: false },
      };
      hostedRoomInstances.set(roomId, inst);
    } else if (!inst.state.players.includes(playerId)) {
      const joinRes = await royalBlackjackGameServer.onPlayerJoin(playerId, inst.state);
      inst.state = joinRes.state;
      inst.broadcasts = joinRes.broadcasts || [];
    }
    return inst;
  };

  /**
   * Resolve authenticated player identity from the RandSeed Platform Gateway / HttpOnly session cookie.
   * Per @randseed/game-sdk & @randseed/server-sdk specification:
   * - The Player Shell establishes an HttpOnly platform session cookie before loading the iframe.
   * - The Platform Worker / Gateway derives pairwise `playerId` and injects trusted headers or session cookies.
   */
  const resolveAuthenticatedPlatformPlayer = (req: express.Request): {
    playerId: string;
    name?: string;
    avatar?: string;
    isCreator?: boolean;
  } => {
    // 1. Check trusted RandSeed Platform Gateway headers
    const headerPlayerId =
      (req.headers["x-randseed-player-id"] as string) ||
      (req.headers["x-player-id"] as string) ||
      (req.headers["x-user-id"] as string);
    const headerName =
      (req.headers["x-randseed-player-name"] as string) ||
      (req.headers["x-player-name"] as string) ||
      (req.headers["x-user-name"] as string);
    const headerAvatar =
      (req.headers["x-randseed-player-avatar"] as string) ||
      (req.headers["x-player-avatar"] as string);

    // 2. Check HttpOnly cookie (e.g., randseed_session / rs_player_id)
    const cookieHeader = req.headers.cookie || "";
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx > 0) {
        const k = pair.slice(0, idx).trim();
        const v = decodeURIComponent(pair.slice(idx + 1).trim());
        cookies[k] = v;
      }
    });
    const cookiePlayerId = cookies["rs_player_id"] || cookies["randseed_player_id"] || cookies["player_id"];
    const cookieName = cookies["rs_player_name"] || cookies["player_name"];

    // 3. Fallback to body / query for local development
    const fallbackId =
      (typeof req.body?.playerId === "string" && req.body.playerId) ||
      (typeof req.body?.userId === "string" && req.body.userId) ||
      (typeof req.query?.playerId === "string" && req.query.playerId) ||
      "player_1";

    return {
      playerId: (headerPlayerId || cookiePlayerId || fallbackId).trim(),
      name: headerName || cookieName || req.body?.name,
      avatar: headerAvatar || req.body?.avatar,
      isCreator: isAuthorizedCreator(req) || Boolean(req.body?.isCreator),
    };
  };

  app.post("/api/match", async (req, res) => {
    try {
      const resolved = resolveAuthenticatedPlatformPlayer(req);
      const playerId = resolved.playerId;
      const roomId = typeof req.body?.roomId === "string" && req.body.roomId ? req.body.roomId : "table_1";
      getOrCreateUser(playerId, resolved.name || "Player", Boolean(resolved.isCreator), undefined, resolved.avatar);
      await getOrCreateHostedRoom(roomId, playerId);
      res.json({
        success: true,
        data: {
          roomId,
          playerId,
          ready: true,
          scope: {
            gameId: "royal-blackjack",
            environment: process.env.NODE_ENV || "development",
            versionId: ROYAL_BLACKJACK_RULES_VERSION,
          },
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "MATCH_FAILED", error: err?.message });
    }
  });

  app.get("/api/room/:roomId/state", async (req, res) => {
    try {
      const playerId = typeof req.query.playerId === "string" ? req.query.playerId : "player_1";
      const inst = await getOrCreateHostedRoom(req.params.roomId, playerId);
      res.json({
        success: true,
        data: {
          type: "snapshot",
          scope: {
            gameId: "royal-blackjack",
            environment: process.env.NODE_ENV || "development",
            versionId: ROYAL_BLACKJACK_RULES_VERSION,
          },
          matchId: inst.matchId,
          matchSeq: inst.matchSeq,
          tick: inst.tick,
          state: projectBlackjackRoomState(inst.state).publicState,
          broadcasts: inst.broadcasts,
          gameResult: inst.gameResult,
        },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "STATE_FAILED", error: err?.message });
    }
  });

  app.post("/api/room/:roomId/input", async (req, res) => {
    try {
      const playerId = typeof req.body?.playerId === "string" ? req.body.playerId : "player_1";
      const inst = await getOrCreateHostedRoom(req.params.roomId, playerId);
      inst.tick += 1;
      const tickRes = await royalBlackjackGameServer.tick(
        {
          tick: inst.tick,
          elapsedSeconds: inst.tick / 5,
          inputs: [{ playerId, data: req.body?.data }],
        },
        inst.state
      );
      inst.state = tickRes.state;
      inst.broadcasts = tickRes.broadcasts || [];
      inst.gameResult = await royalBlackjackGameServer.isGameOver(inst.state);
      res.json({
        success: true,
        data: { applied: true },
      });
    } catch (err: any) {
      res.status(400).json({ success: false, code: "INPUT_FAILED", error: err?.message });
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

  app.post("/api/game/session", (req, res) => {
    try {
      const platformIdentity = resolveAuthenticatedPlatformPlayer(req);
      const { userId, name = "Player", avatar, publisherKey, isCreator } = req.body || {};
      const resolvedId =
        platformIdentity.playerId && platformIdentity.playerId !== "player_1"
          ? platformIdentity.playerId
          : typeof userId === "string" && userId.trim()
          ? userId.trim()
          : `user_${Math.random().toString(36).slice(2, 11)}`;
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
        isCreatorAuth ? publisherKey || CREATOR_SECRET : undefined,
        resolvedAvatar
      );
      reconcileSystemTables();
      res.json({
        user,
        tables: sanitizeTablesMapForClient(tablesDb, resolvedId),
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
      const { userId = "host_user", userName = "Player", settings, liquidity = 0 } = req.body || {};
      getOrCreateUser(userId, userName);
      const room = await hostTableApi.createTable(userId, userName, settings, liquidity);
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Royal BlackJack Server running on http://localhost:${PORT}`);
  });
}

startServer();
