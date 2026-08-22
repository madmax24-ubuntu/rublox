// Debug: check game state
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Game State Debug ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });
    
    console.log("Game initialized, checking state...\n");
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        
        // Check spawn pads
        const spawnPads = mapGen?.getSpawnPads?.() || [];
        
        return {
            spawnPadsCount: spawnPads.length,
            botsCount: game.bots?.length || 0,
            spawnTimer: game.spawnTimer,
            centerPlatformOpen: game.centerPlatformOpen,
            botSpawnStarted: game.botSpawnStarted,
            initialized: game.initialized
        };
    });
    
    console.log("Spawn pads:", result.spawnPadsCount);
    console.log("Bots:", result.botsCount);
    console.log("Spawn timer:", result.spawnTimer);
    console.log("Center platform open:", result.centerPlatformOpen);
    console.log("Bot spawn started:", result.botSpawnStarted);
    console.log("Initialized:", result.initialized);
    
    await browser.close();
})();
