// Debug: check bot count after spawn
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Bot Count Debug ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });
    
    // Wait for spawn timer to expire
    console.log("Waiting for spawn timer to expire...");
    await page.waitForFunction(() => {
        const game = window.game;
        return game.spawnTimer <= 0 && game.centerPlatformOpen;
    }, { timeout: 120000 });
    
    console.log("Spawn complete, checking bots...\n");
    
    const result = await page.evaluate(() => {
        const game = window.game;
        return {
            botsCount: game.bots?.length || 0,
            spawnTimer: game.spawnTimer,
            centerPlatformOpen: game.centerPlatformOpen,
            botSpawnStarted: game.botSpawnStarted
        };
    });
    
    console.log("Bots:", result.botsCount);
    console.log("Spawn timer:", result.spawnTimer);
    console.log("Center platform open:", result.centerPlatformOpen);
    console.log("Bot spawn started:", result.botSpawnStarted);
    
    await browser.close();
})();
