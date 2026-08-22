const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  console.log("Opening proxy...");
  await page.goto("http://localhost:9222", { waitUntil: "domcontentloaded", timeout: 20000 });
  console.log("Waiting for bridge...");
  try {
    await page.waitForFunction(() => window.__THREEJS_DEVTOOLS_BRIDGE__ === true, {}, { timeout: 15000 });
    console.log("Bridge connected!");
  } catch(e) {
    console.log("Bridge not connected, waiting more...");
    await page.waitForTimeout(5000);
    const connected = await page.evaluate(() => window.__THREEJS_DEVTOOLS_BRIDGE__);
    console.log("Bridge status:", connected);
  }
  await page.waitForTimeout(2000);
  await browser.close();
  console.log("Done");
})();
