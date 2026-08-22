// Check colliders in central zone (radius < 82)
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Colliders in Central Zone ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate((radius) => {
        const game = window.game;
        const physics = game.physics;
        const THREE = window.THREE;
        
        const result = {
            intruding: [],
            allColliders: physics.colliders.length
        };
        
        for (const collider of physics.colliders) {
            const cx = (collider.min.x + collider.max.x) / 2;
            const cz = (collider.min.z + collider.max.z) / 2;
            const dist = Math.sqrt(cx*cx + cz*cz);
            
            if (dist < radius) {
                result.intruding.push({
                    x: cx,
                    z: cz,
                    dist: dist.toFixed(1),
                    w: collider.max.x - collider.min.x,
                    d: collider.max.z - collider.min.z,
                    isMazeWall: collider.isMazeWall,
                    isBuildingWall: collider.isBuildingWall,
                    isTowerStair: collider.isTowerStair,
                    isBiomeResidence: collider.isBiomeResidence,
                    isTerrain: collider.isTerrain,
                    isCornucopia: collider.isCornucopia,
                    isBiomeEntrance: collider.isBiomeEntrance,
                    biomeBoundary: collider.biomeBoundary,
                    gameplayBoundary: collider.gameplayBoundary,
                    walkable: collider.walkable,
                    isTowerStructure: collider.isTowerStructure
                });
            }
        }
        
        return result;
    }, 82);
    
    console.log(`Total colliders: ${result.allColliders}`);
    console.log(`Intruding colliders (central zone radius 82): ${result.intruding.length}`);
    
    if (result.intruding.length > 0) {
        console.log("\nIntruding colliders:");
        for (const c of result.intruding) {
            const props = [];
            if (c.isMazeWall) props.push("mazeWall");
            if (c.isBuildingWall) props.push("buildingWall");
            if (c.isTowerStair) props.push("towerStair");
            if (c.isBiomeResidence) props.push("biomeResidence");
            if (c.isTerrain) props.push("terrain");
            if (c.isCornucopia) props.push("cornucopia");
            if (c.isBiomeEntrance) props.push("biomeEntrance");
            if (c.biomeBoundary) props.push("biomeBoundary");
            if (c.gameplayBoundary) props.push("gameplayBoundary");
            if (c.walkable) props.push("walkable");
            if (c.isTowerStructure) props.push("towerStructure");
            
            console.log(`  (${c.x.toFixed(1)}, ${c.z.toFixed(1)}) dist=${c.dist} w=${c.w.toFixed(1)} d=${c.d.toFixed(1)} [${props.join(", ")}]`);
        }
    }
    
    await browser.close();
})();
