const { chromium } = require("playwright-core");
(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=d3d11"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const t0 = Date.now();
  const mark = (s) => console.log(`t=${((Date.now()-t0)/1000).toFixed(1)}s ${s}`);
  await page.goto("http://localhost:11949", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__THREEJS_DEVTOOLS_BRIDGE__ === true, { timeout: 15000 });
  const box = await page.locator("#startButtonDesktop").boundingBox();
  await page.mouse.click(box.x + box.width/2, box.y + box.height / 2);
  mark("clicked start");
  await page.waitForFunction(() => document.querySelector("#loadingOverlay")?.style.display === "none", {}, { timeout: 120000 });
  mark("loading hidden");
  for (let i = 0; i < 48; i++) {
    await page.waitForTimeout(5000);
    const info = await page.evaluate(() => {
      const g = window.game;
      const fps = g?.gameLoop?.fpsSamples;
      return { state: g?.gameState, lastFps: fps?.slice(-3), unmasked: g?.renderer?.capabilities?.unmaskedRenderer };
    }).catch(() => null);
    if (info) console.log(`poll${i}: state=${info.state} fps=${JSON.stringify(info.lastFps)} gl=${info.unmasked}`);
    if (info?.state === "playing") { mark("REACHED playing"); break; }
  }
  await page.screenshot({ path: "test-results/probe-playing.png" });
  mark("done");
  await browser.close();
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
