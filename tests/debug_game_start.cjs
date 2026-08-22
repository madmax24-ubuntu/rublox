// Debug: simulate game start and check gates
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Game Start Simulation ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    console.log("Initial state:");
    let result = await page.evaluate(() => {
        const game = window.game;
        return {
            gameState: game.gameState,
            isStarted: game.isStarted,
            countdownTimer: game.countdownTimer,
            spawnTimer: game.spawnTimer,
            biomeGatesOpen: game.map?.biomeGatesOpen
        };
    });
    console.log("  gameState: " + result.gameState);
    console.log("  isStarted: " + result.isStarted);
    console.log("  countdownTimer: " + result.countdownTimer);
    console.log("  spawnTimer: " + result.spawnTimer);
    console.log("  biomeGatesOpen: " + result.biomeGatesOpen);
    
    // Force start the game
    console.log("\nForcing game start...");
    await page.evaluate(() => {
        const game = window.game;
        game.isStarted = true;
        game.countdownTimer = 0;
        game.gameState = "spawn";
        game.spawnTimer = 30;
    });
    
    // Wait for spawn timer to expire (simulate 31 seconds)
    console.log("Waiting for spawn timer to expire...");
    await page.evaluate(() => {
        const game = window.game;
        game.spawnTimer = 0;
        game._updateSpawnState(31);
    });
    
    result = await page.evaluate(() => {
        const game = window.game;
        return {
            gameState: game.gameState,
            spawnTimer: game.spawnTimer,
            centerPlatformOpen: game.centerPlatformOpen,
            biomeGatesOpen: game.map?.biomeGatesOpen
        };
    });
    console.log("\nAfter spawn:");
    console.log("  gameState: " + result.gameState);
    console.log("  spawnTimer: " + result.spawnTimer);
    console.log("  centerPlatformOpen: " + result.centerPlatformOpen);
    console.log("  biomeGatesOpen: " + result.biomeGatesOpen);
    
    await browser.close();
})();
