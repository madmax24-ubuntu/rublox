// Debug: check maze collider positions and dimensions
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Debug: Maze Colliders Analysis ===");
    console.log("");
    
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    console.log("Loading game...");
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    
    console.log("Waiting for game init...");
    await page.waitForFunction(`() => window.game && window.game.initialized`, { timeout: 60000 });
    
    console.log("Waiting for maze walls...");
    await page.waitForFunction(
        `() => {
            const g = window.game;
            let found = false;
            g.scene.traverse(o => { if (o.userData?.isMazeWalls) found = true; });
            return found;
        }`,
        { timeout: 60000 }
    );
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const physics = game.physics;
        const colliders = physics.colliders;
        
        // Find maze wall colliders
        const mazeColliders = colliders.filter(c => c.isMazeWall);
        
        // Analyze
        const analysis = {
            totalColliders: colliders.length,
            mazeColliders: mazeColliders.length,
            samples: []
        };
        
        // Get first 10 maze colliders
        for (let i = 0; i < Math.min(10, mazeColliders.length); i++) {
            const c = mazeColliders[i];
            analysis.samples.push({
                idx: i,
                center: {
                    x: (c.min.x + c.max.x) / 2,
                    y: (c.min.y + c.max.y) / 2,
                    z: (c.min.z + c.max.z) / 2
                },
                size: {
                    w: c.max.x - c.min.x,
                    h: c.max.y - c.min.y,
                    d: c.max.z - c.min.z
                },
                isBuildingWall: c.isBuildingWall,
                isMazeWall: c.isMazeWall,
                walkable: c.walkable
            });
        }
        
        // Check for colliders that overlap with maze passages
        // Maze passages should be ~cellWidth wide (between walls)
        // Check if any colliders are too wide
        const overlyWide = mazeColliders.filter(c => {
            const w = c.max.x - c.min.x;
            const d = c.max.z - c.min.z;
            // Walls should be either wide(north/south) or deep(east/west)
            // A wall that's both wide AND deep might block passages
            return w > 15 && d > 15;
        });
        
        analysis.overlyWide = overlyWide.length;
        
        // Check for colliders near the entrance
        const nearEntrance = mazeColliders.filter(c => {
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            const dist = Math.sqrt(cx * cx + cz * cz);
            return dist < 80;
        });
        
        analysis.nearEntrance = nearEntrance.length;
        
        return analysis;
    });
    
    console.log("\nResults:");
    console.log("Total colliders:", result.totalColliders);
    console.log("Maze colliders:", result.mazeColliders);
    console.log("Overly wide colliders:", result.overlyWide);
    console.log("Near entrance:", result.nearEntrance);
    
    console.log("\nSample maze colliders:");
    for (const s of result.samples) {
        console.log(`  [${s.idx}] center:(${s.center.x.toFixed(1)}, ${s.center.y.toFixed(1)}, ${s.center.z.toFixed(1)}) size:${s.size.w.toFixed(1)}x${s.size.h.toFixed(1)}x${s.size.d.toFixed(1)} wall:${s.isBuildingWall} maze:${s.isMazeWall}`);
    }
    
    await browser.close();
})();
