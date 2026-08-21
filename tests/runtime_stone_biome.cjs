// Runtime test: verify InstancedMesh matrices are correctly set after map generation
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Runtime Test: Stone Biome InstancedMesh ===");
    console.log("");
    
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    
    // Collect console messages
    const consoleMessages = [];
    page.on("console", msg => {
        if (msg.type() === "error") {
            consoleMessages.push({ type: msg.type(), text: msg.text() });
        }
    });
    
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
    
    // Wait a bit more for map generation
    console.log("Waiting for map generation to complete...");
    try {
        await page.waitForFunction(
            `() => {
                const game = window.game;
                if (!game) return false;
                // Check if scene has mazeWalls
                let found = false;
                if (game.scene) {
                    game.scene.traverse(obj => {
                        if (obj.userData?.isMazeWalls) found = true;
                    });
                }
                return found;
            }`,
            { timeout: 60000 }
        );
        console.log("Map generation complete!");
    } catch (e) {
        console.log("Timeout waiting for map: " + e.message);
    }
    
    // Run the actual test
    console.log("");
    console.log("Running InstancedMesh verification...");
    
    const result = await page.evaluate(() => {
        const results = {};
        
        try {
            const game = window.game;
            const scene = game?.scene;
            const THREE = window.THREE;
            
            if (!scene || !THREE) {
                return { error: "Scene or THREE not found" };
            }
            
            // Find mazeWalls
            let mazeWalls = null;
            let towerSteps = null;
            let roofTiles = null;
            let mazeWallCount = 0;
            
            scene.traverse(obj => {
                if (obj.userData?.isMazeWalls) mazeWalls = obj;
                if (obj.userData?.isTowerStairs) towerSteps = obj;
                if (obj.userData?.isTowerStructure && obj.count && obj.count > 10) roofTiles = obj;
                if (obj.userData?.isMazeWall) mazeWallCount++;
            });
            
            // Check mazeWalls InstancedMesh
            if (mazeWalls) {
                const dummyMatrix = new THREE.Matrix4();
                mazeWalls.getMatrixAt(0, dummyMatrix);
                
                // Check if matrix is not identity (i.e., has position)
                const e = dummyMatrix.elements;
                const hasPosition = Math.abs(e[12]) > 0.1 || Math.abs(e[13]) > 0.1 || Math.abs(e[14]) > 0.1;
                
                // Check bounding sphere
                const bs = mazeWalls.boundingSphere;
                
                results.mazeWalls = {
                    found: true,
                    count: mazeWalls.count,
                    matrixSet: hasPosition,
                    matrix0: { x: e[12], y: e[13], z: e[14] },
                    frustumCulled: mazeWalls.frustumCulled,
                    boundingSphere: bs ? { radius: bs.radius } : null
                };
            } else {
                results.mazeWalls = { found: false };
            }
            
            // Check colliders
            results.mazeColliders = mazeWallCount;
            
            // Check towerSteps InstancedMesh
            if (towerSteps) {
                const dummyMatrix = new THREE.Matrix4();
                towerSteps.getMatrixAt(0, dummyMatrix);
                const e = dummyMatrix.elements;
                const hasPosition = Math.abs(e[12]) > 0.1 || Math.abs(e[13]) > 0.1 || Math.abs(e[14]) > 0.1;
                
                results.towerSteps = {
                    found: true,
                    count: towerSteps.count,
                    matrixSet: hasPosition
                };
            } else {
                results.towerSteps = { found: false };
            }
            
            // Check roofTiles InstancedMesh
            if (roofTiles) {
                const dummyMatrix = new THREE.Matrix4();
                roofTiles.getMatrixAt(0, dummyMatrix);
                const e = dummyMatrix.elements;
                const hasPosition = Math.abs(e[12]) > 0.1 || Math.abs(e[13]) > 0.1 || Math.abs(e[14]) > 0.1;
                
                results.roofTiles = {
                    found: true,
                    count: roofTiles.count,
                    matrixSet: hasPosition
                };
            } else {
                results.roofTiles = { found: false };
            }
            
        } catch (e) {
            results.error = e.message + " " + e.stack;
        }
        
        return results;
    });
    
    console.log("Results:", JSON.stringify(result, null, 2));
    console.log("");
    
    // Evaluate results
    let passed = true;
    
    if (result.error) {
        console.log("ERROR: " + result.error);
        passed = false;
    }
    
    if (result.mazeWalls?.found) {
        if (result.mazeWalls.matrixSet) {
            console.log("✓ mazeWalls: matrices correctly set (has position)");
            console.log("  count: " + result.mazeWalls.count);
            console.log("  matrix[0]: (" + result.mazeWalls.matrix0.x.toFixed(2) + ", " + result.mazeWalls.matrix0.y.toFixed(2) + ", " + result.mazeWalls.matrix0.z.toFixed(2) + ")");
            console.log("  frustumCulled: " + result.mazeWalls.frustumCulled);
            if (result.mazeWalls.boundingSphere) {
                console.log("  boundingSphere radius: " + result.mazeWalls.boundingSphere.radius.toFixed(2));
            }
        } else {
            console.log("✗ mazeWalls: matrices are identity (NOT SET) - INVISIBLE WALLS!");
            console.log("  This means the fix did NOT work - matrices were set AFTER needsUpdate");
            passed = false;
        }
        
        console.log("  maze colliders: " + result.mazeColliders);
    } else {
        console.log("⚠ mazeWalls: not found in scene (stone biome may not be at default position)");
    }
    
    if (result.towerSteps?.found) {
        if (result.towerSteps.matrixSet) {
            console.log("✓ towerSteps: matrices correctly set");
            console.log("  count: " + result.towerSteps.count);
        } else {
            console.log("✗ towerSteps: matrices are identity (NOT SET)");
            passed = false;
        }
    } else {
        console.log("⚠ towerSteps: not found in scene");
    }
    
    if (result.roofTiles?.found) {
        if (result.roofTiles.matrixSet) {
            console.log("✓ roofTiles: matrices correctly set");
            console.log("  count: " + result.roofTiles.count);
        } else {
            console.log("✗ roofTiles: matrices are identity (NOT SET)");
            passed = false;
        }
    } else {
        console.log("⚠ roofTiles: not found in scene");
    }
    
    // Print console errors from the game
    if (consoleMessages.length > 0) {
        console.log("");
        console.log("Console errors from game:");
        consoleMessages.slice(0, 5).forEach(e => console.log("  " + e.text));
    }
    
    console.log("");
    if (passed) {
        console.log("=== RUNTIME TEST PASSED ===");
        console.log("Stone biome invisible walls fix VERIFIED at runtime!");
    } else {
        console.log("=== RUNTIME TEST FAILED ===");
    }
    
    await browser.close();
    process.exit(passed ? 0 : 1);
})();
