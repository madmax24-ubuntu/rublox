// Runtime test: verify maze colliders are created correctly
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Runtime Test: Maze Colliders ===");
    console.log("");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Navigate to the game
    console.log("Navigating to http://localhost:3001...");
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    
    // Wait for game to be ready
    console.log("Waiting for game initialization...");
    try {
        await page.waitForFunction(
            `() => window.game && window.game.initialized`,
            { timeout: 60000 }
        );
        console.log("Game initialized!");
    } catch (e) {
        console.log("Timeout waiting for game init: " + e.message);
        await browser.close();
        process.exit(1);
    }
    
    // Wait for map generation
    console.log("Waiting for map generation...");
    try {
        await page.waitForFunction(
            `() => {
                const game = window.game;
                if (!game) return false;
                const physics = game.physics;
                if (!physics) return false;
                // Check if there are colliders with isMazeWall
                let found = false;
                for (const c of physics.colliders) {
                    if (c.isMazeWall) { found = true; break; }
                }
                return found;
            }`,
            { timeout: 60000 }
        );
        console.log("Map generation complete!");
    } catch (e) {
        console.log("Timeout waiting for map: " + e.message);
    }
    
    // Run the collider test
    console.log("");
    console.log("Checking Physics colliders...");
    
    const result = await page.evaluate(() => {
        const results = {};
        
        try {
            const game = window.game;
            const physics = game?.physics;
            
            if (!physics) {
                return { error: "Physics system not found" };
            }
            
            const colliders = physics.colliders;
            results.totalColliders = colliders.length;
            
            // Count by type
            let mazeWallCount = 0;
            let buildingWallCount = 0;
            let towerStairCount = 0;
            let towerStructureCount = 0;
            let biomeResidenceCount = 0;
            
            for (const c of colliders) {
                if (c.isMazeWall) mazeWallCount++;
                if (c.isBuildingWall) buildingWallCount++;
                if (c.isTowerStair) towerStairCount++;
                if (c.isTowerStructure) towerStructureCount++;
                if (c.isBiomeResidence) biomeResidenceCount++;
            }
            
            results.mazeWalls = mazeWallCount;
            results.buildingWalls = buildingWallCount;
            results.towerStairs = towerStairCount;
            results.towerStructure = towerStructureCount;
            results.biomeResidence = biomeResidenceCount;
            
            // Check a sample maze collider
            let sampleMaze = null;
            for (const c of colliders) {
                if (c.isMazeWall) { sampleMaze = c; break; }
            }
            
            if (sampleMaze) {
                const box = sampleMaze;
                results.sampleMaze = {
                    min: box.min ? [box.min.x, box.min.y, box.min.z] : null,
                    max: box.max ? [box.max.x, box.max.y, box.max.z] : null,
                    isBuildingWall: box.isBuildingWall,
                    isMazeWall: box.isMazeWall
                };
            }
            
        } catch (e) {
            results.error = e.message + " " + e.stack;
        }
        
        return results;
    });
    
    console.log("Results:", JSON.stringify(result, null, 2));
    console.log("");
    
    // Evaluate
    let passed = true;
    
    if (result.error) {
        console.log("ERROR: " + result.error);
        passed = false;
    }
    
    console.log("Total colliders: " + result.totalColliders);
    console.log("Maze walls (isMazeWall): " + result.mazeWalls);
    console.log("Building walls (isBuildingWall): " + result.buildingWalls);
    console.log("Tower stairs (isTowerStair): " + result.towerStairs);
    console.log("Tower structure (isTowerStructure): " + result.towerStructure);
    console.log("Biome residence (isBiomeResidence): " + result.biomeResidence);
    console.log("");
    
    if (result.mazeWalls > 0) {
        console.log("✓ Maze colliders created: " + result.mazeWalls);
        if (result.sampleMaze) {
            console.log("  Sample maze collider:");
            console.log("    min: (" + result.sampleMaze.min.join(", ") + ")");
            console.log("    max: (" + result.sampleMaze.max.join(", ") + ")");
            console.log("    isBuildingWall: " + result.sampleMaze.isBuildingWall);
            console.log("    isMazeWall: " + result.sampleMaze.isMazeWall);
            
            if (!result.sampleMaze.isBuildingWall) {
                console.log("  ✗ isBuildingWall is NOT set on maze colliders!");
                passed = false;
            }
        }
    } else {
        console.log("✗ Maze colliders NOT created!");
        passed = false;
    }
    
    if (result.towerStairs > 0) {
        console.log("✓ Tower stair colliders created: " + result.towerStairs);
    } else {
        console.log("⚠ Tower stair colliders: 0");
    }
    
    console.log("");
    if (passed) {
        console.log("=== COLLIDER TEST PASSED ===");
    } else {
        console.log("=== COLLIDER TEST FAILED ===");
    }
    
    await browser.close();
    process.exit(passed ? 0 : 1);
})();
