import { createGameServer } from "./src/backend/serverSdk/index";
import { royalBlackjackGameServer } from "./src/backend/royalBlackjackRoomServer";

const PORT = Number(process.env.ROOM_PORT ?? process.env.PORT ?? 8080);
const fallbackGameId = (process.env.GAME_ID || process.env.VITE_RANDSEED_GAME_ID || "").trim();
if (
  process.env.RANDSEED_GAME_ID === undefined &&
  /^[A-Za-z0-9_-]{1,64}$/.test(fallbackGameId)
) {
  process.env.RANDSEED_GAME_ID = fallbackGameId;
}

const server = createGameServer(royalBlackjackGameServer, PORT);

server.once("listening", () => {
  console.log(
    `RandSeed Room Host Server (gameId: ${process.env.RANDSEED_GAME_ID || "pending"}) listening on port ${PORT}`
  );
});
