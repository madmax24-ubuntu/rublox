const { chromium } = require("@playwright/test");

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Capture console errors
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('ERROR:', msg.text());
        }
    });
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    
    console.log("Waiting for game init...");
    try {
        await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
        console.log("Game initialized");
    } catch (e) {
        console.log("Game init timeout:", e.message);
    }
    
    // Check if physics is defined
    const hasPhysics = await page.evaluate(() => window.game && window.game.physics !== undefined);
    console.log("Has physics:", hasPhysics);
    
    if (!hasPhysics) {
        const gameInfo = await page.evaluate(() => {
            if (!window.game) return 'No window.game';
            return {
                hasPhysics: window.game.physics !== undefined,
                physicsType: typeof window.game.physics,
                keys: window.game ? Object.keys(window.game) : []
            };
        });
        console.log("Game info:", JSON.stringify(gameInfo));
    }
    
    await browser.close();
})();
