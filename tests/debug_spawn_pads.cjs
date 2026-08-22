// Debug: check spawn pads and biomeBoundary colliders
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Spawn Pads & BiomeBoundary Debug ===\n");
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
        const spawnPadsCount = spawnPads.length;
        
        // Check bot count
        const botsCount = game.bots?.length || 0;
        
        // Check spawn pad colliders
        const colliders = mapGen?.colliders || [];
        const spawnColliders = colliders.filter(c => c.isSpawnPlatform);
        const spawnCollidersCount = spawnColliders.length;
        const spawnCollidersEnabled = spawnColliders.filter(c => c.enabled).length;
        const spawnCollidersDisabled = spawnColliders.filter(c => !c.enabled).length;
        
        // Check biomeBoundary colliders
        const biomeBoundaryColliders = colliders.filter(c => c.biomeBoundary);
        const biomeBoundaryActive = biomeBoundaryColliders.filter(c => c.enabled).length;
        const biomeBoundaryDisabled = biomeBoundaryColliders.filter(c => !c.enabled).length;
        
        // Check which biomeBoundary colliders are disabled
        const biomeBoundaryDisabledList = biomeBoundaryColliders.filter(c => !c.enabled).map(c => ({
            x: (c.min.x + c.max.x) / 2,
            z: (c.min.z + c.max.z) / 2,
            w: c.max.x - c.min.x,
            d: c.max.z - c.min.z
        }));
        
        return {
            spawnPadsCount,
            botsCount,
            spawnCollidersCount,
            spawnCollidersEnabled,
            spawnCollidersDisabled,
            biomeBoundaryTotal: biomeBoundaryColliders.length,
            biomeBoundaryActive,
            biomeBoundaryDisabled,
            biomeBoundaryDisabledList
        };
    });
    
    console.log("Spawn pads:", result.spawnPadsCount);
    console.log("Bots:", result.botsCount);
    console.log("Spawn colliders:", result.spawnCollidersCount, "(enabled:", result.spawnCollidersEnabled, ", disabled:", result.spawnCollidersDisabled + ")");
    console.log("BiomeBoundary colliders:", result.biomeBoundaryTotal, "(active:", result.biomeBoundaryActive, ", disabled:", result.biomeBoundaryDisabled + ")");
    
    if (result.biomeBoundaryDisabled > 0) {
        console.log("\nDisabled biomeBoundary colliders:");
        for (const c of result.biomeBoundaryDisabledList) {
            console.log(`  (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) w=${c.w.toFixed(1)} d=${c.d.toFixed(1)}`);
        }
    } else {
        console.log("\nAll biomeBoundary colliders are ACTIVE - ring walls work correctly!");
    }
    
    await browser.close();
})();
