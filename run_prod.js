process.env.TEST_PORT = "3001";
process.env.NODE_ENV = "production";
import("./dist/server.cjs").catch(err => {
  console.error("Crash on startup:", err);
  process.exit(1);
});
setTimeout(() => {
  console.log("Server stayed alive for 4 seconds.");
  process.exit(0);
}, 4000);
