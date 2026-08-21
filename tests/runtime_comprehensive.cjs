// Comprehensive runtime test: verify all stone biome elements
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Comprehensive Runtime Test: Stone Biome ===");
    console.log("");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    console.log("Navigating to http://localhost:3001...");
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    
    console.log("Waiting for game initialization...");
    try {
        await page.waitForFunction(`() => window.game && window.game.initialized`, { timeout: 60000 });
        console.log("Game initialized!");
    } catch (e) {
        console.log("Timeout waiting for game init: " + e.message);
        await browser.close();
        process.exit(1);
    }
    
    console.log("Waiting for map generation...");
    try {
        await page.waitForFunction(
            `() => {
                const g = window.game;
                if (!g) return false;
                let mazeWalls = null;
                g.scene.traverse(o => { if (o.userData?.isMazeWalls) mazeWalls = o; });
                return mazeWalls !== null;
            }`,
            { timeout: 60000 }
        );
        console.log("Map generation complete!");
    } catch (e) {
        console.log("Timeout waiting for map: " + e.message);
    }
    
    const result = await page.evaluate(() => {
        const results = {};
        const game = window.game;
        const scene = game?.scene;
        const physics = game?.physics;
        const THREE = window.THREE;
        
        if (!scene || !THREE) return { error: "Scene or THREE not found" };
        
        // Count InstancedMesh instances
        let mazeWallsMesh = null, towerStepsMesh = null, roofTilesMesh = null;
        let mazeWallsCount = 0, towerStepsCount = 0, roofTilesCount = 0;
        
        scene.traverse(obj => {
            if (obj.userData?.isMazeWalls) { mazeWallsMesh = obj; mazeWallsCount = obj.count || 0; }
            if (obj.userData?.isTowerStairs) { towerStepsMesh = obj; towerStepsCount = obj.count || 0; }
            if (obj.userData?.isTowerStructure && obj.count && obj.count > 10 && !obj.userData?.isTowerStairs) { roofTilesMesh = obj; roofTilesCount = obj.count || 0; }
        });
        
        // Check matrices are set (not identity)
        const checkMatrix = (mesh, idx) => {
            if (!mesh) return false;
            const m = new THREE.Matrix4();
            mesh.getMatrixAt(idx % mesh.count, m);
            const e = m.elements;
            return Math.abs(e[12]) > 0.1 || Math.abs(e[13]) > 0.1 || Math.abs(e[14]) > 0.1;
        };
        
        results.mazeWalls = {
            instancedCount: mazeWallsCount,
            matricesSet: mazeWallsMesh ? checkMatrix(mazeWallsMesh, 0) : false,
            frustumCulled: mazeWallsMesh?.frustumCulled,
            boundingSphere: mazeWallsMesh?.boundingSphere?.radius
        };
        
        results.towerSteps = {
            instancedCount: towerStepsCount,
            matricesSet: towerStepsMesh ? checkMatrix(towerStepsMesh, 0) : false
        };
        
        results.roofTiles = {
            instancedCount: roofTilesCount,
            matricesSet: roofTilesMesh ? checkMatrix(roofTilesMesh, 0) : false
        };
        
        // Count colliders
        if (physics) {
            let mazeColliders = 0, towerStairColliders = 0, buildingWalls = 0, towerStructure = 0;
            for (const c of physics.colliders) {
                if (c.isMazeWall) mazeColliders++;
                if (c.isTowerStair) towerStairColliders++;
                if (c.isBuildingWall) buildingWalls++;
                if (c.isTowerStructure) towerStructure++;
            }
            results.colliders = {
                total: physics.colliders.length,
                mazeWalls: mazeColliders,
                towerStairs: towerStairColliders,
                buildingWalls,
                towerStructure
            };
        }
        
        // Check if counts match
        results.countMismatch = {
            mazeWalls: results.mazeWalls.instancedCount !== results.colliders?.mazeWalls,
            towerSteps: results.towerSteps.instancedCount !== results.colliders?.towerStairs
        };
        
        return results;
    });
    
    console.log("\nResults:", JSON.stringify(result, null, 2));
    console.log("\n--- Analysis ---");
    
    let passed = true;
    
    // Maze walls
    console.log("\nMaze Walls:");
    console.log(`  InstancedMesh: ${result.mazeWalls.instancedCount} instances`);
    console.log(`  Matrices set: ${result.mazeWalls.matricesSet ? "✓" : "✗"}`);
    console.log(`  Frustum culling: ${result.mazeWalls.frustumCulled}`);
    console.log(`  Bounding sphere radius: ${result.mazeWalls.boundingSphere?.toFixed(2) || "N/A"}`);
    console.log(`  Colliders: ${result.colliders?.mazeWalls || 0}`);
    
    if (!result.mazeWalls.matricesSet) {
        console.log("  ✗ FAIL: Matrices NOT set - walls invisible!");
        passed = false;
    }
    if (result.countMismatch.mazeWalls) {
        console.log(`  ⚠ WARNING: Count mismatch (mesh:${result.mazeWalls.instancedCount} vs colliders:${result.colliders?.mazeWalls})`);
    }
    
    // Tower stairs
    console.log("\nTower Stairs:");
    console.log(`  InstancedMesh: ${result.towerSteps.instancedCount} instances`);
    console.log(`  Matrices set: ${result.towerSteps.matricesSet ? "✓" : "✗"}`);
    console.log(`  Colliders: ${result.colliders?.towerStairs || 0}`);
    
    if (!result.towerSteps.matricesSet) {
        console.log("  ✗ FAIL: Matrices NOT set - stairs invisible!");
        passed = false;
    }
    if (result.countMismatch.towerSteps) {
        console.log(`  ⚠ WARNING: Count mismatch (mesh:${result.towerSteps.instancedCount} vs colliders:${result.colliders?.towerStairs})`);
    }
    
    // Roof tiles
    console.log("\nRoof Tiles:");
    console.log(`  InstancedMesh: ${result.roofTiles.instancedCount} instances`);
    console.log(`  Matrices set: ${result.roofTiles.matricesSet ? "✓" : "✗"}`);
    
    if (!result.roofTiles.matricesSet) {
        console.log("  ✗ FAIL: Matrices NOT set - roof invisible!");
        passed = false;
    }
    
    console.log("\nTotal colliders:", result.colliders?.total);
    console.log("Building walls:", result.colliders?.buildingWalls);
    console.log("Tower structure:", result.colliders?.towerStructure);
    
    console.log("\n=== " + (passed ? "ALL TESTS PASSED ✓" : "TESTS FAILED ✗") + " ===");
    
    await browser.close();
    process.exit(passed ? 0 : 1);
})();
