// Headless Playwright bridge for threejs_devtools MCP
// Usage: node scripts/devtools-bridge.mjs <proxy-url>
// Keeps a headless browser open at the proxy URL so the MCP bridge stays connected.

import { chromium } from 'playwright';

const proxyUrl = process.argv[2];
if (!proxyUrl) {
  console.error('Usage: node scripts/devtools-bridge.mjs <proxy-url>');
  console.error('Example: node scripts/devtools-bridge.mjs http://localhost:18706');
  process.exit(1);
}

console.log('[devtools-bridge] Starting headless browser at:', proxyUrl);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Handle unhandled rejections gracefully
  process.on('unhandledRejection', (reason) => {
    console.error('[devtools-bridge] Unhandled rejection:', reason);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[devtools-bridge] Shutting down...');
    await browser.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
   await page.goto(proxyUrl, { waitUntil: 'networkidle', timeout: 15000 });
    console.log('[devtools-bridge] Page loaded, bridge connected.');

    // Stop the render loop to save CPU in headless mode.
    await page.evaluate(() => {
      if (window.__game && window.__game.gameLoop) {
        window.__game.gameLoop.stop();
      }
    });
    console.log('[devtools-bridge] Render loop paused (CPU saved).');

   console.log('[devtools-bridge] Waiting for connection...');

    // Wait a bit for the bridge script to inject and connect
    await new Promise((r) => setTimeout(r, 3000));

    // Check if bridge connected by looking for the injected script
    const bridgeConnected = await page.evaluate(() => {
      return typeof window.__threejsBridge !== 'undefined' ||
             document.querySelector('script[src*="bridge"]') !== null ||
             document.querySelector('script[src*="devtools"]') !== null;
    }).catch(() => false);

    if (bridgeConnected) {
      console.log('[devtools-bridge] Bridge script detected.');
    } else {
      console.log('[devtools-bridge] Bridge script not yet detected, waiting...');
    }

    // Keep alive - poll periodically
    let ticks = 0;
    while (true) {
      await new Promise((r) => setTimeout(r, 30000));
      ticks++;

      // Check if page is still alive
      try {
        const alive = await page.evaluate(() => document.readyState === 'complete');
        if (!alive) {
          console.log('[devtools-bridge] Page disconnected, reloading...');
          await page.reload({ waitUntil: 'networkidle', timeout: 10000 });
          await new Promise((r) => setTimeout(r, 3000));
        }
      } catch (e) {
        console.log('[devtools-bridge] Page check failed, reloading...');
        try { await page.reload({ waitUntil: 'networkidle', timeout: 10000 }); } catch {}
      }

      if (ticks % 10 === 0) {
        console.log(`[devtools-bridge] Alive, tick ${ticks} (${ticks * 30}s)`);
      }
    }
  } catch (err) {
    console.error('[devtools-bridge] Error:', err.message);
    await browser.close();
    process.exit(1);
  }
})();
