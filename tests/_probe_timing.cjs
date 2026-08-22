const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on("console", (m) => logs.push(`[${new Date().toISOString().slice(11,19)}] ${m.type()}: ${m.text().slice(0,150)}`));
  const t0 = Date.now();
  const mark = (s) => console.log(`t=${((Date.now()-t0)/1000).toFixed(1)}s ${s}`);
  mark("launch done");
  await page.goto("http://localhost:11949", { waitUntil: "domcontentloaded" });
  mark("domcontentloaded");
  await page.waitForFunction(() => window.__THREEJS_DEVTOOLS_BRIDGE__ === true, { timeout: 15000 });
  mark("bridge injected");
  const box = await page.locator("#startButtonDesktop").boundingBox();
  await page.mouse.click(box.x + box.width/2, box.y + box.height/2);
  mark("clicked start");
  await page.waitForFunction(() => document.querySelector("#loadingOverlay")?.style.display === "none", {}, { timeout: 120000 });
  mark("loading overlay hidden");
  const st = await page.evaluate(() => window.game?.gameState);
  mark(`gameState=${st}`);
  await page.waitForFunction(() => ["spawn","playing"].includes(window.game?.gameState), {}, { timeout: 90000 });
  mark("state spawn/playing");
  await page.waitForFunction(() => window.game?.gameState === "playing", {}, { timeout: 90000 });
  mark("state playing");
  await page.waitForTimeout(3000);
  const info = await page.evaluate(() => ({
    state: window.game?.gameState,
    bots: window.game?.bots?.length,
    zombies: window.game?.zombies?.length,
  }));
  console.log("final:", JSON.stringify(info));
  const errs = logs.filter((l) => l.includes(": error"));
  console.log(`--- console errors: ${errs.length} ---`);
  for (const l of errs.slice(0, 20)) console.log(l);
  await page.screenshot({ path: "test-results/probe-playing.png" });
  mark("done");
  await browser.close();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
