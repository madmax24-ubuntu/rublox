// Opens the MCP proxy URL in Firefox.
// Usage: node scripts/devtools-bridge.cjs <proxy-url>
//
// This keeps a lightweight process alive so the browser tab stays open.
// Close this terminal or press Ctrl+C to exit.

const { spawn } = require('child_process');

const proxyUrl = process.argv[2];
if (!proxyUrl) {
  console.error('Usage: node scripts/devtools-bridge.cjs <proxy-url>');
  console.error('Example: node scripts/devtools-bridge.cjs http://localhost:9222');
  process.exit(1);
}

const firefoxPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';

console.log('[devtools-bridge] Opening in Firefox:', proxyUrl);

const child = spawn(firefoxPath, [`"${proxyUrl}"`], {
  shell: true,
  detached: true,
  stdio: 'ignore',
});

child.unref();

console.log('[devtools-bridge] Firefox opened. Keep this terminal running.');
console.log('[devtools-bridge] Press Ctrl+C to exit.');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n[devtools-bridge] Exiting.');
  process.exit(0);
});
process.on('SIGTERM', () => {
  process.exit(0);
});

// Periodic heartbeat
let ticks = 0;
setInterval(() => {
  ticks++;
  if (ticks % 10 === 0) {
    console.log(`[devtools-bridge] Alive, tick ${ticks} (${ticks * 10}s)`);
  }
}, 10000);
