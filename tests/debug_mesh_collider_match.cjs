// Verify InstancedMesh-collider correspondence by checking matrix positions vs collider centers
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== InstancedMesh vs Collider Verification ===\n");
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
            meshes: [],
            orphans: []
        };
        
        // Find all InstancedMesh
        scene.traverse(obj => {
            if (!obj.isInstancedMesh) return;
            
            const info = {
                name: obj.name || obj.uuid.substring(0,8),
                count: obj.count,
                visible: obj.visible,
                userData: obj.userData,
                positions: []
            };
            
            // Get all instance positions
            const m = new THREE.Matrix4();
            for (let i = 0; i < obj.count; i++) {
                obj.getMatrixAt(i, m);
                info.positions.push({
                    x: m.elements[12],
                    y: m.elements[13],
                    z: m.elements[14]
                });
            }
            result.meshes.push(info);
        });
        
        // For each InstancedMesh, find corresponding colliders and check correspondence
        for (const meshInfo of result.meshes) {
            // Determine what kind of collider this InstancedMesh represents
            const ud = meshInfo.userData;
            let colliderFlag = null;
            
            if (ud.isMazeWalls) colliderFlag = 'isMazeWall';
            else if (ud.isTowerStairs) colliderFlag = 'isTowerStair';
            else if (ud.isTowerPlatforms) colliderFlag = 'isTowerPlatform';
            else if (ud.isBarbedWire) colliderFlag = 'isBarbedWire';
            else if (ud.isCornucopia) colliderFlag = 'isCornucopia';
            else if (ud.gameplayBoundary) colliderFlag = 'gameplayBoundary';
            
            if (!colliderFlag) continue;
            
            const relatedColliders = physics.colliders.filter(c => c[colliderFlag]);
            
            console.log(`\n[${meshInfo.name}] count=${meshInfo.count}, colliders=${relatedColliders.length}`);
            
            // For each collider, check if there's a mesh instance nearby
            for (const collider of relatedColliders) {
                const cx = (collider.min.x + collider.max.x) / 2;
                const cz = (collider.min.z + collider.max.z) / 2;
                
                // Check if any mesh instance is close enough
                let closestDist = Infinity;
                for (const pos of meshInfo.positions) {
                    const dx = pos.x - cx;
                    const dz = pos.z - cz;
                    const dist = Math.sqrt(dx*dx + dz*dz);
                    if (dist < closestDist) closestDist = dist;
                }
                
                if (closestDist > 3) {
                    result.orphans.push({
                        mesh: meshInfo.name,
                        flag: colliderFlag,
                        colliderX: cx,
                        colliderZ: cz,
                        closestDist: closestDist.toFixed(1)
                    });
                }
            }
        }
        
        return result;
    });
    
    console.log("\n=== Summary ===");
    console.log(`Total InstancedMesh: ${result.meshes.length}`);
    for (const m of result.meshes) {
        console.log(`  ${m.name}: count=${m.count}, visible=${m.visible}, userData=${JSON.stringify(m.userData)}`);
    }
    
    console.log(`\n=== Orphaned Colliders: ${result.orphans.length} ===`);
    if (result.orphans.length > 0) {
        // Group by mesh
        const byMesh = {};
        for (const o of result.orphans) {
            if (!byMesh[o.mesh]) byMesh[o.mesh] = [];
            byMesh[o.mesh].push(o);
        }
        for (const [mesh, orphans] of Object.entries(byMesh)) {
            console.log(`\n[${mesh}] ${orphans.length} orphaned colliders:`);
            for (const o of orphans.slice(0, 5)) {
                console.log(`  (${o.colliderX.toFixed(1)}, ${o.colliderZ.toFixed(1)}) closestDist=${o.closestDist}`);
            }
            if (orphans.length > 5) console.log(`  ... and ${orphans.length - 5} more`);
        }
    }
    
    await browser.close();
})();
