const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Collider Enabled Check ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        
        const mazeColliders = colliders.filter(c => c.isMazeWall);
        const ringColliders = colliders.filter(c => c.isRingWall);
        const boundaryColliders = colliders.filter(c => c.biomeBoundary);
        
        return {
            total: colliders.length,
            totalDisabled: colliders.filter(c => c.enabled === false).length,
            maze: {
                total: mazeColliders.length,
                disabled: mazeColliders.filter(c => c.enabled === false).length,
                enabled: mazeColliders.filter(c => c.enabled !== false).length
            },
            ring: {
                total: ringColliders.length,
                disabled: ringColliders.filter(c => c.enabled === false).length,
                enabled: ringColliders.filter(c => c.enabled !== false).length
            },
            boundary: {
                total: boundaryColliders.length,
                disabled: boundaryColliders.filter(c => c.enabled === false).length,
                enabled: boundaryColliders.filter(c => c.enabled !== false).length
            }
        };
    });
    
    console.log("Total colliders:", result.total);
    console.log("Total disabled:", result.totalDisabled);
    console.log("");
    console.log("Maze colliders:");
    console.log("  total:", result.maze.total);
    console.log("  enabled:", result.maze.enabled);
    console.log("  disabled:", result.maze.disabled);
    console.log("");
    console.log("Ring colliders:");
    console.log("  total:", result.ring.total);
    console.log("  enabled:", result.ring.enabled);
    console.log("  disabled:", result.ring.disabled);
    console.log("");
    console.log("Boundary colliders:");
    console.log("  total:", result.boundary.total);
    console.log("  enabled:", result.boundary.enabled);
    console.log("  disabled:", result.boundary.disabled);
    
    await browser.close();
})();
