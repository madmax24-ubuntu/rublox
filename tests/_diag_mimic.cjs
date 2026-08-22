const { chromium } = require("@playwright/test");
(async () => {
    const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=d3d11"] });
    const page = await browser.newPage();
    const SERVER_URL = "http://localhost:3001";
    await page.goto(SERVER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    const startBtn = page.locator("#startButtonDesktop");
    await startBtn.waitFor({ state: "visible", timeout: 30000 });
    const box = await startBtn.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    console.log("Clicked start (mimic play-smoke). Tracking...");
    // Track for up to 150s
    let reachedPlaying = false;
    for (let i = 0; i < 75; i++) {
        await page.waitForTimeout(2000);
        const st = await page.evaluate(() => {
            const g = window.game;
            if (!g) return null;
            return { state: g.gameState, spawnTimer: g.spawnTimer, countdown: g.countdownTimer, scatterInit: g.spawnScatterInitialized, paused: g.isPaused, bots: g.bots?.length || 0, player: !!g.player, overlay: document.querySelector("#loadingOverlay")?.style.display };
        });
        if (st) {
            const t = (i+1)*2;
            console.log(`t=${t}s state=${st.state} spawnTimer=${st.spawnTimer?.toFixed?.(1)} countdown=${st.countdown?.toFixed?.(1)} scatterInit=${st.scatterInit} paused=${st.paused} bots=${st.bots} player=${st.player} overlay=${st.overlay}`);
            if (st.state === "playing") { reachedPlaying = true; break; }
        }
    }
    console.log(reachedPlaying ? "REACHED_PLAYING" : "DID_NOT_REACH_PLAYING");
    await browser.close();
})();
