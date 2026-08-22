// Debug: check spawn pad positions and corridor proximity
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Spawn Pad Positions Debug ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });
    
    console.log("Game initialized, checking spawn pad positions...\n");
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        
        // Check spawn pads (filtered)
        const spawnPads = mapGen?.spawnPads || [];
        
        // Check scene children for spawn platforms
        const spawnPlatformGroups = Array.from(mapGen.scene.children).filter(c => c.userData?.isSpawnPlatform);
        
        // Check spawn pad positions
        const padPositions = spawnPads.map(p => ({
            x: p.x,
            z: p.z,
            dist: Math.sqrt(p.x * p.x + p.z * p.z),
            angle: Math.atan2(p.z, p.x) * 180 / Math.PI
        }));
        
        // Sort by angle
        padPositions.sort((a, b) => a.angle - b.angle);
        
        return {
            spawnPadsCount: spawnPads.length,
            spawnPlatformGroupsCount: spawnPlatformGroups.length,
            padPositions: padPositions
        };
    });
    
    console.log("Spawn pads (filtered):", result.spawnPadsCount);
    console.log("Spawn platform Groups in scene:", result.spawnPlatformGroupsCount);
    console.log("\nSpawn pad positions (sorted by angle):");
    
    // Group by quadrant
    const quadrants = {
        NW: result.padPositions.filter(p => p.x < -5 && p.z < -5),
        NE: result.padPositions.filter(p => p.x > 5 && p.z < -5),
        SW: result.padPositions.filter(p => p.x < -5 && p.z > 5),
        SE: result.padPositions.filter(p => p.x > 5 && p.z > 5),
        axes: result.padPositions.filter(p => Math.abs(p.x) <= 5 || Math.abs(p.z) <= 5)
    };
    
    for (const [name, pads] of Object.entries(quadrants)) {
        console.log(`\n${name}: ${pads.length} pads`);
        for (const p of pads.slice(0, 5)) {
            console.log(`  (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) dist=${p.dist.toFixed(2)} angle=${p.angle.toFixed(1)}°`);
        }
        if (pads.length > 5) console.log(`  ... and ${pads.length - 5} more`);
    }
    
    await browser.close();
})();
