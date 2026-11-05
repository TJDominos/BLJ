import { createGameServer } from "@randseed/server-sdk";
import { royalBlackjackGameServer } from "./royalBlackjackRoomServer";

/**
 * 标准 RandSeed Wire Protocol (room-host-v1) 容器微服务入口（Node.js / TypeScript）。
 *
 * 在 Cloudflare Sandbox 或容器集群部署时，直接由 @randseed/server-sdk 的 createGameServer
 * 启动原生 node:http 服务，暴露：
 * - GET  /manifest
 * - GET  /health
 * - POST /init
 * - POST /tick
 * - POST /onPlayerJoin
 * - POST /onPlayerLeave
 * - POST /isGameOver
 * - POST /onCommand
 */
const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "0.0.0.0";

createGameServer(royalBlackjackGameServer, port, {
  gameId: "royal-blackjack",
  host,
});

console.log(`[RandSeed Wire Protocol] Royal BlackJack Room Server listening on http://${host}:${port}`);
