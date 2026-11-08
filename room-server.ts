import { createGameServer } from "./src/backend/serverSdk/index";
import { royalBlackjackGameServer } from "./src/backend/royalBlackjackRoomServer";

const PORT = Number(process.env.ROOM_PORT || process.env.PORT || 8080);
const GAME_ID = process.env.RANDSEED_GAME_ID || process.env.GAME_ID;
if (!GAME_ID) {
  console.error("[RandSeed Room Host] Missing required environment variable RANDSEED_GAME_ID or GAME_ID.");
  process.exit(1);
}

createGameServer(royalBlackjackGameServer, PORT, {
  gameId: GAME_ID,
});

console.log(`RandSeed Room Host Server (gameId: ${GAME_ID}) listening on port ${PORT}`);
