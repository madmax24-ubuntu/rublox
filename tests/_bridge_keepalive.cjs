const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log("Opening proxy...");
  await page.goto("http://localhost:9222", { waitUntil: "domcontentloaded", timeout: 20000 });
  console.log("Waiting for bridge...");
  await page.waitForFunction(() => window.__THREEJS_DEVTOOLS_BRIDGE__ === true, {}, { timeout: 15000 });
  console.log("Bridge connected! Keeping alive...");
  // Keep alive - wait for signal file
  const fs = require("fs");
  const path = require("path");
  const signalFile = path.join(__dirname, "..", ".bridge_ready");
  while (!fs.existsSync(signalFile)) {
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log("Signal received, closing...");
  await browser.close();
})();
