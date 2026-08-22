import { test, expect } from "@playwright/test";
const SERVER_URL = "http://localhost:3001";
test("instrumented", async ({ page }) => {
  test.setTimeout(240000);
  page.on("pageerror", (err) => console.log("[pageerror]", String(err)));
  await page.goto(SERVER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  const startBtn = page.locator("#startButtonDesktop");
  await startBtn.waitFor({ state: "visible", timeout: 30000 });
  const box = await startBtn.boundingBox();
  const t0 = Date.now();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] clicked start`);
  await page.evaluate(() => {
    window.__pollLog = [];
    window.__pollStart = Date.now();
    window.__pollInt = setInterval(() => {
      const g = window.game;
      if (!g) return;
      window.__pollLog.push({
        t: ((Date.now() - window.__pollStart)/1000).toFixed(1),
        state: g.gameState,
        spawnTimer: g.spawnTimer?.toFixed?.(1),
        countdown: g.countdownTimer?.toFixed?.(1),
        scatterInit: g.spawnScatterInitialized,
        paused: g.isPaused,
        player: !!g.player,
        bots: g.bots?.length || 0
      });
    }, 3000);
  });
  await page.waitForFunction(() => document.querySelector("#loadingOverlay")?.style.display === "none", {}, { timeout: 120000 });
  console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] overlay hidden`);
  await page.waitForFunction(() => ["spawn","playing"].includes(window.game?.gameState), {}, { timeout: 60000 });
  console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] state=spawn/playing`);
  try {
    await page.waitForFunction(() => window.game?.gameState === "playing" && window.game?.player, {}, { timeout: 90000 });
    console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] state=playing REACHED`);
  } catch (e) {
    console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] state=playing TIMEOUT`);
  }
  const log = await page.evaluate(() => { clearInterval(window.__pollInt); return window.__pollLog; });
  console.log("=== POLL LOG ===");
  log.forEach(l => console.log(JSON.stringify(l)));
});
