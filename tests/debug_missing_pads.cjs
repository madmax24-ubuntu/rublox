// Debug: check which spawn pads are missing
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Missing Spawn Pads Debug ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });
    
    console.log("Game initialized, checking missing spawn pads...\n");
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        
        // Get spawn pads from scene (Groups with isSpawnPlatform)
        const spawnPlatformGroups = Array.from(mapGen.scene.children).filter(c => c.userData?.isSpawnPlatform);
        
        // Get filtered spawn pads
        const spawnPads = mapGen?.spawnPads || [];
        
        // Check which pads are missing
        const missing = [];
        for (const group of spawnPlatformGroups) {
            const found = spawnPads.some(p => {
                return Math.abs(p.x - group.position.x) < 0.01 && Math.abs(p.z - group.position.z) < 0.01;
            });
            if (!found) {
                const dist = Math.sqrt(group.position.x * group.position.x + group.position.z * group.position.z);
                const angle = Math.atan2(group.position.z, group.position.x) * 180 / Math.PI;
                missing.push({
                    x: group.position.x,
                    z: group.position.z,
                    dist,
                    angle
                });
            }
        }
        
        return {
            spawnPlatformGroupsCount: spawnPlatformGroups.length,
            spawnPadsCount: spawnPads.length,
            missingCount: missing.length,
            missing
        };
    });
    
    console.log("Spawn platform Groups:", result.spawnPlatformGroupsCount);
    console.log("Spawn pads (filtered):", result.spawnPadsCount);
    console.log("Missing pads:", result.missingCount);
    
    if (result.missing.length > 0) {
        console.log("\nMissing pads:");
        for (const p of result.missing) {
            console.log(`  (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) dist=${p.dist.toFixed(2)} angle=${p.angle.toFixed(1)}°`);
        }
    }
    
    await browser.close();
})();
