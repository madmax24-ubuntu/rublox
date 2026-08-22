// Debug: check colliders in stone biome
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Stone Biome Collider Analysis ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const scene = game.scene;
        const THREE = window.THREE;
        
        // Find MapGenerator - it is game.map
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        
        if (colliders.length === 0) {
            return { error: "No colliders found. mapGen: " + (!!mapGen) + " colliders: " + colliders.length };
        }
        
        const stoneBiome = { min: { x: 0, z: -128 }, max: { x: 128, z: 0 } };
        
        const stoneColliders = colliders.filter(c => {
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            return cx >= stoneBiome.min.x && cx <= stoneBiome.max.x &&
                   cz >= stoneBiome.min.z && cz <= stoneBiome.max.z;
        });
        
        // Check for passages
        const passages = [
            { name: "NE-SW bridge area", x: 0, z: -64, w: 10, d: 6 },
            { name: "NE-SE bridge area", x: 64, z: 0, w: 6, d: 10 },
            { name: "center corridor", x: 0, z: -32, w: 8, d: 4 },
        ];
        
        const passageBlockers = [];
        for (const p of passages) {
            const blockers = stoneColliders.filter(c => {
                return c.min.x <= p.x + p.w/2 && c.max.x >= p.x - p.w/2 &&
                       c.min.z <= p.z + p.d/2 && c.max.z >= p.z - p.d/2 &&
                       !c.walkable;
            });
            if (blockers.length > 0) {
                passageBlockers.push({
                    passage: p.name,
                    count: blockers.length,
                    colliders: blockers.slice(0, 5).map(c => ({
                        x: ((c.min.x + c.max.x)/2).toFixed(1),
                        z: ((c.min.z + c.max.z)/2).toFixed(1),
                        w: (c.max.x - c.min.x).toFixed(1),
                        d: (c.max.z - c.min.z).toFixed(1),
                        walkable: c.walkable,
                        isMazeWall: c.isMazeWall,
                        source: c.source ? (c.source.isInstancedMesh ? "InstancedMesh" : c.source.uuid?.substring(0,8)) : "none"
                    }))
                });
            }
        }
        
        return {
            totalColliders: colliders.length,
            stoneColliders: stoneColliders.length,
            passageBlockers,
            sampleColliders: stoneColliders.slice(0, 30).map(c => ({
                x: ((c.min.x + c.max.x)/2).toFixed(1),
                z: ((c.min.z + c.max.z)/2).toFixed(1),
                w: (c.max.x - c.min.x).toFixed(1),
                d: (c.max.z - c.min.z).toFixed(1),
                walkable: c.walkable,
                isMazeWall: c.isMazeWall,
                source: c.source ? (c.source.isInstancedMesh ? "InstancedMesh" : c.source.uuid?.substring(0,8)) : "none"
            }))
        };
    });
    
    if (result.error) {
        console.log("ERROR:", result.error);
        await browser.close();
        return;
    }
    
    console.log(`Total colliders: ${result.totalColliders}`);
    console.log(`Stone biome colliders: ${result.stoneColliders}`);
    console.log("");
    
    if (result.passageBlockers.length > 0) {
        console.log("=== PASSAGE BLOCKERS ===");
        for (const pb of result.passageBlockers) {
            console.log(`\n${pb.passage}: ${pb.count} blockers`);
            for (const c of pb.colliders) {
                console.log(`  (${c.x}, ${c.z}) w=${c.w} d=${c.d} walkable=${c.walkable} maze=${c.isMazeWall} src=${c.source}`);
            }
        }
    } else {
        console.log("No passage blockers found");
    }
    
    console.log("\n=== Sample Stone Colliders ===");
    for (const c of result.sampleColliders) {
        console.log(`  (${c.x}, ${c.z}) w=${c.w} d=${c.d} walkable=${c.walkable} maze=${c.isMazeWall} src=${c.source}`);
    }
    
    await browser.close();
})();
