const { chromium } = require("@playwright/test");
(async () => {
    const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=d3d11"] });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });
    const startBtn = page.locator("#startButtonDesktop");
    const box = await startBtn.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    console.log("Clicked start. Tracking to 'playing'...");
    let reachedPlaying = false;
    for (let i = 0; i < 90; i++) {
        await page.waitForTimeout(2000);
        const st = await page.evaluate(() => {
            const g = window.game;
            if (!g) return null;
            return { state: g.gameState, spawnTimer: g.spawnTimer, scatter: g.spawnScatterInitialized, scatterWork: !!g._spawnScatterWork, paused: g.isPaused, bots: g.bots?.length || 0, player: !!g.player };
        });
        if (st) {
            console.log(`t=${(i+1)*2}s state=${st.state} spawnTimer=${st.spawnTimer?.toFixed?.(1)} scatterInit=${st.scatter} scatterWork=${st.scatterWork} paused=${st.paused} bots=${st.bots} player=${st.player}`);
            if (st.state === "playing") { reachedPlaying = true; break; }
        }
    }
    console.log(reachedPlaying ? "REACHED_PLAYING" : "DID_NOT_REACH_PLAYING");
    await browser.close();
})();
