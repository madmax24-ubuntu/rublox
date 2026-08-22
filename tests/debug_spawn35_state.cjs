// Debug: check spawn state after 35s
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Spawn State After 35s ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    console.log("Waiting 35s...");
    await new Promise(r => setTimeout(r, 35000));
    
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
