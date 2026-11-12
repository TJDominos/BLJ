import { createGameServer } from "./src/backend/serverSdk/index";
import { royalBlackjackGameServer } from "./src/backend/royalBlackjackRoomServer";

const PORT = Number(process.env.ROOM_PORT || process.env.PORT || 8080);
const GAME_ID =
  process.env.RANDSEED_GAME_ID ||
  process.env.GAME_ID ||
  process.env.VITE_RANDSEED_GAME_ID ||
  undefined;

createGameServer(royalBlackjackGameServer, PORT, {
  ...(GAME_ID ? { gameId: GAME_ID } : {}),
});

console.log(`RandSeed Room Host Server (gameId: ${GAME_ID || "dynamic"}) listening on port ${PORT}`);
