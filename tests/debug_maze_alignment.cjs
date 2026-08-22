// Debug: check maze wall vs collider alignment
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Maze Wall vs Collider Alignment ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
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
        
        // Get maze colliders
        const mazeColliders = colliders.filter(c => c.isMazeWall);
        
        // Check alignment
        const mismatches = [];
        const localMatrix = new THREE.Matrix4();
        const worldMatrix = new THREE.Matrix3();
        const pos = new THREE.Vector3();
        const scale = new THREE.Vector3();
        
        mazeWalls.updateMatrixWorld(true);
        for (let i = 0; i < mazeWalls.count; i++) {
            mazeWalls.getMatrixAt(i, localMatrix);
            pos.setFromMatrixPosition(localMatrix);
            scale.setFromMatrixScale(localMatrix);
            
            // Find matching collider
            const matchingCollider = mazeColliders.find(c => {
                const cx = (c.min.x + c.max.x) / 2;
                const cz = (c.min.z + c.max.z) / 2;
                const dist = Math.hypot(pos.x - cx, pos.z - cz);
                return dist < 0.5;
            });
            
            if (!matchingCollider) {
                mismatches.push({
                    type: "wall_without_collider",
                    wallPos: { x: pos.x.toFixed(1), z: pos.z.toFixed(1) },
                    wallScale: { x: scale.x.toFixed(1), z: scale.z.toFixed(1) }
                });
            } else {
                const cx = (matchingCollider.min.x + matchingCollider.max.x) / 2;
                const cz = (matchingCollider.min.z + matchingCollider.max.z) / 2;
                const cw = matchingCollider.max.x - matchingCollider.min.x;
                const cd = matchingCollider.max.z - matchingCollider.min.z;
                const dist = Math.hypot(pos.x - cx, pos.z - cz);
                
                if (dist > 1.0) {
                    mismatches.push({
                        type: "position_mismatch",
                        wallPos: { x: pos.x.toFixed(1), z: pos.z.toFixed(1) },
                        colliderPos: { x: cx.toFixed(1), z: cz.toFixed(1) },
                        dist: dist.toFixed(1)
                    });
                }
            }
        }
        
        // Check for colliders without walls
        const usedColliders = new Set();
        for (let i = 0; i < mazeWalls.count; i++) {
            mazeWalls.getMatrixAt(i, localMatrix);
            pos.setFromMatrixPosition(localMatrix);
            
            const matchingCollider = mazeColliders.find(c => {
                const cx = (c.min.x + c.max.x) / 2;
                const cz = (c.min.z + c.max.z) / 2;
                const dist = Math.hypot(pos.x - cx, pos.z - cz);
                return dist < 0.5;
            });
            
            if (matchingCollider) {
                usedColliders.add(matchingCollider);
            }
        }
        
        const orphanColliders = mazeColliders.filter(c => !usedColliders.has(c));
        for (const c of orphanColliders) {
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            mismatches.push({
                type: "collider_without_wall",
                colliderPos: { x: cx.toFixed(1), z: cz.toFixed(1) },
                colliderSize: { w: (c.max.x - c.min.x).toFixed(1), d: (c.max.z - c.min.z).toFixed(1) }
            });
        }
        
        return {
            wallCount: mazeWalls.count,
            colliderCount: mazeColliders.length,
            mismatches
        };
    });
    
    if (result.error) {
        console.log(result.error);
    } else {
        console.log("Walls: " + result.wallCount + ", Colliders: " + result.colliderCount);
        console.log("Mismatches: " + result.mismatches.length);
        for (const m of result.mismatches) {
            console.log("  " + m.type);
            if (m.wallPos) console.log("    wall: (" + m.wallPos.x + ", " + m.wallPos.z + ")");
            if (m.colliderPos) console.log("    collider: (" + m.colliderPos.x + ", " + m.colliderPos.z + ")");
            if (m.dist) console.log("    dist: " + m.dist);
        }
    }
    
    await browser.close();
})();
