import { createGameServer } from "@randseed/server-sdk";
import { royalBlackjackGameServer } from "./src/backend/royalBlackjackRoomServer";

const PORT = Number(process.env.ROOM_PORT || 8080);

createGameServer(royalBlackjackGameServer, PORT, {
  gameId: "royal-blackjack",
});

console.log(`RandSeed Room Host Server (room-host-v1) listening on port ${PORT}`);
