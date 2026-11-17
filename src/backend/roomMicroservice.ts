import { createGameServer } from "./serverSdk/index";
import { royalBlackjackGameServer } from "./royalBlackjackRoomServer";

/**
 * 标准 RandSeed Wire Protocol (room-host-v1 / session-v1) 容器微服务入口（Node.js / TypeScript）。
 *
 * 在 Cloudflare Sandbox 或容器集群部署时，直接由 RandSeed Server SDK 的 createGameServer
 * 启动原生 node:http 服务（含 WebSocket 流升级 attachStreamUpgradeHandler），暴露：
 * - GET  /manifest (with X-RandSeed-Stream-Protocol: session-v1)
 * - GET  /health
 * - GET  /agent/capabilities
 * - GET  /agent/player-contract
 * - POST /agent/player-view
 * - POST /init
 * - POST /tick
 * - POST /onPlayerJoin
 * - POST /onPlayerLeave
 * - POST /isGameOver
 * - POST /onCommand
 */
const port = Number(process.env.PORT ?? 8080);
const fallbackGameId = (process.env.GAME_ID || "").trim();
if (
  process.env.RANDSEED_GAME_ID === undefined &&
  /^[A-Za-z0-9_-]{1,64}$/.test(fallbackGameId)
) {
  process.env.RANDSEED_GAME_ID = fallbackGameId;
}

const server = createGameServer(royalBlackjackGameServer, port);

server.once("listening", () => {
  console.log(
    `[RandSeed Wire Protocol] Royal BlackJack Room Server (gameId: ${process.env.RANDSEED_GAME_ID || "pending"}) listening on port ${port}`
  );
});
