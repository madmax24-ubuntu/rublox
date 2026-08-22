// Debug: check maze walls in entrance corridors (InstancedMesh)
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Maze Walls in Entrance Corridors (InstancedMesh) ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 120000 });
    
    console.log("Game initialized, checking maze walls...\n");
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const scene = game.scene;
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        const THREE = window.THREE;
        
        // Find maze walls InstancedMesh
        let mazeWalls = null;
        scene.traverse(obj => {
            if (obj.isInstancedMesh && obj.userData?.isMazeWalls) {
                mazeWalls = obj;
            }
        });
        
        if (!mazeWalls) {
            return { error: "No maze walls InstancedMesh found" };
        }
        
        // Check which maze walls are in entrance corridors
        const axes = [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
        ];
        const corridorHit = (x, z, padding = 0) =>
            axes.some(([sx, sz]) => {
                const radial = (x * sx + z * sz) / Math.SQRT2;
                const lateral = Math.abs((x * sz - z * sx) / Math.SQRT2);
                return (
                    radial >= 49 - padding &&
                    radial <= 82 + padding &&
                    lateral <= 7 + padding
                );
            });
        
        const localMatrix = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const scale = new THREE.Vector3();
        
        mazeWalls.updateMatrixWorld(true);
        
        const wallsInCorridors = [];
        const wallsNotInCorridors = [];
        
        for (let i = 0; i < mazeWalls.count; i++) {
            mazeWalls.getMatrixAt(i, localMatrix);
            pos.setFromMatrixPosition(localMatrix);
            scale.setFromMatrixScale(localMatrix);
            
            const padding = Math.min(8, Math.hypot(scale.x, scale.z) * 0.5);
            
            if (corridorHit(pos.x, pos.z, padding)) {
                wallsInCorridors.push({
                    index: i,
                    x: pos.x,
                    z: pos.z,
                    dist: Math.sqrt(pos.x * pos.x + pos.z * pos.z),
                    angle: Math.atan2(pos.z, pos.x) * 180 / Math.PI
                });
            } else {
                wallsNotInCorridors.push({
                    index: i,
                    x: pos.x,
                    z: pos.z
                });
            }
        }
        
        // Check maze colliders
        const mazeColliders = colliders.filter(c => c.isMazeWall);
        const mazeCollidersDisabled = mazeColliders.filter(c => !c.enabled);
        
        return {
            wallCount: mazeWalls.count,
            wallsInCorridorsCount: wallsInCorridors.length,
            wallsNotInCorridorsCount: wallsNotInCorridors.length,
            wallsInCorridors: wallsInCorridors,
            colliderCount: mazeColliders.length,
            collidersDisabled: mazeCollidersDisabled.length
        };
    });
    
    if (result.error) {
        console.log(result.error);
    } else {
        console.log("Maze walls:", result.wallCount);
        console.log("Walls in entrance corridors:", result.wallsInCorridorsCount);
        console.log("Walls NOT in entrance corridors:", result.wallsNotInCorridorsCount);
        console.log("Maze colliders:", result.colliderCount);
        console.log("Maze colliders disabled:", result.collidersDisabled);
        
        if (result.wallsInCorridors.length > 0) {
            console.log("\nWalls in entrance corridors:");
            for (const w of result.wallsInCorridors) {
                console.log(`  [${w.index}] (${w.x.toFixed(1)}, ${w.z.toFixed(1)}) dist=${w.dist.toFixed(1)} angle=${w.angle.toFixed(1)}°`);
            }
        }
    }
    
    await browser.close();
})();
