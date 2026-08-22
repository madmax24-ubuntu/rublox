import { test } from "@playwright/test";

test("track state transitions until playing", async ({ page }) => {
  test.setTimeout(300000);
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (err) => pageErrors.push(String(err?.stack || err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  await page.goto("http://localhost:3001", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  const startBtn = page.locator("#startButtonDesktop");
  await startBtn.waitFor({ state: "visible", timeout: 30000 });
  const box = await startBtn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  await page.waitForFunction(
    () => document.querySelector("#loadingOverlay")?.style.display === "none",
    {},
    { timeout: 120000 },
  );
  console.log("[diag] loading overlay hidden at t=" + Date.now());

  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(5000);
    const s = await page.evaluate(() => {
      const g = window.game;
      if (!g) return { missing: true };
      return {
        state: g.gameState,
        countdown: g.countdownTimer,
        spawnTimer: g.spawnTimer,
        scatterInit: g.spawnScatterInitialized,
        scatterWork: !!g._spawnScatterWork,
        bots: g.bots?.length || 0,
        fps: g.fps ?? null,
        loopRunning: g.gameLoop?.isRunning ?? null,
        sceneFps: g.scene?.userData?.fps ?? null,
      };
    });
    console.log("[diag] " + JSON.stringify(s));
    if (s.state === "playing") break;
  }
  console.log("[diag] PAGE ERRORS: " + JSON.stringify(pageErrors.slice(0, 5)));
  console.log("[diag] CONSOLE ERRORS: " + JSON.stringify(consoleErrors.slice(0, 10)));
});
