// Check gameplayBoundary colliders vs InstancedMesh
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== GameplayBoundary Colliders vs InstancedMesh ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const scene = game.scene;
        const physics = game.physics;
        const THREE = window.THREE;
        
        const result = {
            boundaryMeshes: [],
            boundaryColliders: []
        };
        
        // Find gameplayBoundary InstancedMesh
        scene.traverse(obj => {
            if (!obj.isInstancedMesh) return;
            if (!obj.userData?.gameplayBoundary) return;
            
            const info = {
                name: obj.name || obj.uuid.substring(0,8),
                count: obj.count,
                positions: []
            };
            
            const m = new THREE.Matrix4();
            for (let i = 0; i < obj.count; i++) {
                obj.getMatrixAt(i, m);
                info.positions.push({
                    x: m.elements[12],
                    y: m.elements[13],
                    z: m.elements[14]
                });
            }
            result.boundaryMeshes.push(info);
        });
        
        // Find gameplayBoundary colliders
        const boundaryColliders = physics.colliders.filter(c => c.gameplayBoundary);
        result.boundaryColliders = boundaryColliders.map(c => ({
            x: (c.min.x + c.max.x) / 2,
            z: (c.min.z + c.max.z) / 2,
            w: c.max.x - c.min.x,
            d: c.max.z - c.min.z,
            h: c.max.y - c.min.y
        }));
        
        return result;
    });
    
    console.log("=== InstancedMesh (gameplayBoundary) ===");
    for (const mesh of result.boundaryMeshes) {
        console.log(`[${mesh.name}] count=${mesh.count}`);
        console.log("  Positions:");
        for (const p of mesh.positions) {
            console.log(`    (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
        }
    }
    
    console.log(`\n=== Colliders (gameplayBoundary): ${result.boundaryColliders.length} ===`);
    for (const c of result.boundaryColliders) {
        console.log(`  (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) w=${c.w.toFixed(1)} d=${c.d.toFixed(1)} h=${c.h.toFixed(1)}`);
    }
    
    await browser.close();
})();
