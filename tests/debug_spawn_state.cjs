// Debug: check spawn state
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Spawn State Check ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    console.log("Game initialized, checking spawn state...");
    
    const result = await page.evaluate(() => {
        const game = window.game;
        return {
            spawnTimer: game.spawnTimer,
            centerPlatformOpen: game.centerPlatformOpen,
            biomeGatesOpen: game.map?.biomeGatesOpen,
        };
    });
    
    console.log(`spawnTimer: ${result.spawnTimer}`);
    console.log(`centerPlatformOpen: ${result.centerPlatformOpen}`);
    console.log(`biomeGatesOpen: ${result.biomeGatesOpen}`);
    
    await browser.close();
})();
