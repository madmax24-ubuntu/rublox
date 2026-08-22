// Deep diagnostic: all InstancedMesh vs colliders, biome overlap check
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Deep Diagnostic: All InstancedMesh + Biome Check ===\n");
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
            instancedMeshes: [],
            biomeOverlap: [],
            allOrphans: [],
            stoneBiomeObjects: []
        };
        
        // Find all InstancedMesh objects
        scene.traverse(obj => {
            if (obj.isInstancedMesh) {
                const info = {
                    name: obj.name || obj.uuid.substring(0,8),
                    uuid: obj.uuid.substring(0,8),
                    count: obj.count,
                    visible: obj.visible,
                    userData: obj.userData,
                    parent: obj.parent?.name || obj.parent?.uuid?.substring(0,8) || "scene"
                };
                
                // Sample matrices
                const samples = [];
                for (let i = 0; i < Math.min(3, obj.count); i++) {
                    const m = new THREE.Matrix4();
                    obj.getMatrixAt(i, m);
                    samples.push({
                        idx: i,
                        x: m.elements[12],
                        y: m.elements[13],
                        z: m.elements[14]
                    });
                }
                info.samples = samples;
                result.instancedMeshes.push(info);
            }
        });
        
        // Check each InstancedMesh for orphaned colliders
        for (const meshInfo of result.instancedMeshes) {
            const mesh = scene.children.find(c => c.uuid.startsWith(meshInfo.uuid)) 
                       || scene.children.find(c => c.name === meshInfo.name);
            if (!mesh) continue;
            
            // Find colliders that correspond to this InstancedMesh
            const marker = meshInfo.userData?.isMazeWalls ? 'isMazeWall'
                       : meshInfo.userData?.isTowerStairs ? 'isTowerStair'
                       : meshInfo.userData?.isBuildingWall ? 'isBuildingWall'
                       : null;
            
            if (!marker) continue;
            
            const relatedColliders = physics.colliders.filter(c => c[marker]);
            
            // For each collider, check if there's a corresponding mesh instance
            for (const collider of relatedColliders) {
                const cx = (collider.min.x + collider.max.x) / 2;
                const cz = (collider.min.z + collider.max.z) / 2;
                const hasMesh = mesh.userData.instances?.some(inst => 
                    Math.abs(inst.x - cx) < 2 && Math.abs(inst.z - cz) < 2
                );
                
                if (!hasMesh) {
                    result.allOrphans.push({
                        mesh: meshInfo.name,
                        marker,
                        colliderX: cx,
                        colliderZ: cz,
                        colliderW: collider.max.x - collider.min.x,
                        colliderD: collider.max.z - collider.min.z,
                        colliderProps: {
                            isBuildingWall: collider.isBuildingWall,
                            isMazeWall: collider.isMazeWall,
                            isTowerStair: collider.isTowerStair,
                            isBiomeResidence: collider.isBiomeResidence,
                            walkable: collider.walkable
                        }
                    });
                }
            }
        }
        
        // Check biome overlap: stone (maze) biome is NE quadrant (x>0, z<0)
        // Winter (ice) biome is SE quadrant (x>0, z>0)
        // Forest biome is SW quadrant (x<0, z<0)
        // Military biome is NW quadrant (x<0, z>0)
        
        // Collect all scene objects and classify by biome
        scene.traverse(obj => {
            if (!obj.geometry) return;
            const px = obj.position.x;
            const pz = obj.position.z;
            const name = obj.name || obj.uuid.substring(0,8);
            
            // Check userData for biome hints
            const userData = obj.userData || {};
            const isIce = userData.isIceTree || userData.isSnowParticles || userData.isIceCrystal;
            const isForest = userData.isTree || userData.isForestTree;
            
            // Object in stone biome (NE: x>0, z<0)
            if (px > 0 && pz < 0) {
                if (isIce) {
                    result.biomeOverlap.push({
                        type: "ICE_OBJECT_IN_STONE_BIOME",
                        name,
                        x: px, z: pz,
                        reason: "Ice biome object found in stone/maze biome"
                    });
                }
                if (isForest) {
                    result.biomeOverlap.push({
                        type: "FOREST_OBJECT_IN_STONE_BIOME",
                        name,
                        x: px, z: pz,
                        reason: "Forest biome object found in stone/maze biome"
                    });
                }
            }
            // Object in ice biome (SE: x>0, z>0)
            if (px > 0 && pz > 0) {
                // Check for stone/maze objects in ice biome
                const isMaze = userData.isMazeWalls || userData.isMazeWall;
                if (isMaze) {
                    result.biomeOverlap.push({
                        type: "STONE_OBJECT_IN_ICE_BIOME",
                        name,
                        x: px, z: pz,
                        reason: "Stone/maze biome object found in ice biome"
                    });
                }
            }
        });
        
        // Also check colliders for biome overlap
        for (const collider of physics.colliders) {
            if (!collider.min) continue;
            const cx = (collider.min.x + collider.max.x) / 2;
            const cz = (collider.min.z + collider.max.z) / 2;
            
            // Ice biome colliders in stone biome
            if (cx > 0 && cz < 0 && (collider.isIceCrystal || collider.isIce)) {
                result.biomeOverlap.push({
                    type: "ICE_COLLIDER_IN_STONE_BIOME",
                    x: cx, z: cz,
                    props: { isIceCrystal: collider.isIceCrystal, isIce: collider.isIce }
                });
            }
        }
        
        return result;
    });
    
    console.log("=== InstancedMesh objects ===");
    for (const m of result.instancedMeshes) {
        console.log(`  ${m.name}: count=${m.count}, visible=${m.visible}`);
        console.log(`    userData: ${JSON.stringify(m.userData)}`);
        for (const s of m.samples) {
            console.log(`    [${s.idx}] (${s.x.toFixed(1)}, ${s.y.toFixed(1)}, ${s.z.toFixed(1)})`);
        }
    }
    
    console.log("\n=== Orphaned Colliders ===");
    if (result.allOrphans.length === 0) {
        console.log("  None found!");
    } else {
        console.log(`  Found ${result.allOrphans.length} orphaned colliders:`);
        for (const o of result.allOrphans) {
            console.log(`  [${o.mesh}] (${o.colliderX.toFixed(1)}, ${o.colliderZ.toFixed(1)}) ${JSON.stringify(o.colliderProps)}`);
        }
    }
    
    console.log("\n=== Biome Overlap ===");
    if (result.biomeOverlap.length === 0) {
        console.log("  No biome overlap detected!");
    } else {
        console.log(`  Found ${result.biomeOverlap.length} biome overlap issues:`);
        for (const b of result.biomeOverlap) {
            console.log(`  ${b.type}: ${b.name || 'collider'} at (${(b.x||b.cx||0).toFixed(1)}, ${(b.z||b.cz||0).toFixed(1)})`);
            console.log(`    ${b.reason}`);
        }
    }
    
    await browser.close();
})();
