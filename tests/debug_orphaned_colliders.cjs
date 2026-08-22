// Debug: check what happens to maze walls after cleanup
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Debug: Maze Walls After Cleanup ===");
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
        const scene = game.scene;
        const physics = game.physics;
        const THREE = window.THREE;
        
        const analysis = {};
        
        // Find mazeWalls InstancedMesh
        let mazeWallsMesh = null;
        scene.traverse(obj => {
            if (obj.userData?.isMazeWalls) mazeWallsMesh = obj;
        });
        
        if (mazeWallsMesh) {
            analysis.meshCount = mazeWallsMesh.count;
            analysis.meshOriginalCount = mazeWallsMesh.geometry?.boundingBox ? "has bbox" : "no bbox";
            
            // Check a few matrices
            const samples = [];
            for (let i = 0; i < Math.min(5, mazeWallsMesh.count); i++) {
                const m = new THREE.Matrix4();
                mazeWallsMesh.getMatrixAt(i, m);
                samples.push({
                    idx: i,
                    x: m.elements[12],
                    y: m.elements[13],
                    z: m.elements[14]
                });
            }
            analysis.meshSamples = samples;
        }
        
        // Count maze colliders
        const mazeColliders = physics.colliders.filter(c => c.isMazeWall);
        analysis.colliderCount = mazeColliders.length;
        
        // Check for colliders without corresponding mesh instances
        // This would indicate orphaned colliders
        const colliderPositions = mazeColliders.map(c => {
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            return { x: cx, z: cz, w: c.max.x - c.min.x, d: c.max.z - c.min.z };
        });
        
        // Check if each collider has a corresponding mesh instance
        let orphanedColliders = 0;
        const m = new THREE.Matrix4();
        for (const cp of colliderPositions) {
            let hasMesh = false;
            for (let i = 0; i < mazeWallsMesh.count; i++) {
                mazeWallsMesh.getMatrixAt(i, m);
                const mx = m.elements[12];
                const mz = m.elements[14];
                if (Math.abs(mx - cp.x) < 2 && Math.abs(mz - cp.z) < 2) {
                    hasMesh = true;
                    break;
                }
            }
            if (!hasMesh) orphanedColliders++;
        }
        
        analysis.orphanedColliders = orphanedColliders;
        
        return analysis;
    });
    
    console.log("Results:");
    console.log("Mesh instances:", result.meshCount);
    console.log("Colliders:", result.colliderCount);
    console.log("Orphaned colliders:", result.orphanedColliders);
    console.log("\nMesh samples:");
    for (const s of result.meshSamples || []) {
        console.log(`  [${s.idx}] (${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)})`);
    }
    
    if (result.orphanedColliders > 0) {
        console.log("\n⚠ WARNING: " + result.orphanedColliders + " colliders have no corresponding mesh!");
        console.log("This means invisible walls exist - colliders without visuals.");
    }
    
    await browser.close();
})();
