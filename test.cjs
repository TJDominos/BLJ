const { spawn } = require('child_process');

// spawn node dist/server.cjs with NODE_ENV=production but force port to 3001 ?
// wait, server.ts hardcodes 3000.
