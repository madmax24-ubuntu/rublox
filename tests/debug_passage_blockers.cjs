// Debug: find objects blocking passages in stone biome
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Passage Blocker Analysis ===\n");
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
        
        // Find colliders blocking passages
        const passages = [
            { name: "NE-SW bridge area", x: 0, z: -64, w: 10, d: 6 },
            { name: "NE-SE bridge area", x: 64, z: 0, w: 6, d: 10 },
        ];
        
        const blockers = [];
        for (const p of passages) {
            const matching = colliders.filter(c => {
                return c.min.x <= p.x + p.w/2 && c.max.x >= p.x - p.w/2 &&
                       c.min.z <= p.z + p.d/2 && c.max.z >= p.z - p.d/2 &&
                       !c.walkable;
            });
            
            for (const c of matching) {
                const cx = (c.min.x + c.max.x) / 2;
                const cz = (c.min.z + c.max.z) / 2;
                const cw = c.max.x - c.min.x;
                const cd = c.max.z - c.min.z;
                
                blockers.push({
                    passage: p.name,
                    collider: {
                        x: cx.toFixed(1),
                        z: cz.toFixed(1),
                        w: cw.toFixed(1),
                        d: cd.toFixed(1),
                        walkable: c.walkable,
                        isMazeWall: c.isMazeWall,
                        isTowerStructure: c.isTowerStructure,
                        isBiomeEntrance: c.isBiomeEntrance,
                        biomeBoundary: c.biomeBoundary,
                        gameplayBoundary: c.gameplayBoundary,
                        isBuildingWall: c.isBuildingWall,
                    },
                    source: c.source ? {
                        type: c.source.isInstancedMesh ? "InstancedMesh" : (c.source.isMesh ? "Mesh" : "Group"),
                        uuid: c.source.uuid?.substring(0,8),
                        name: c.source.name || "unnamed",
                        userData: c.source.userData
                    } : null
                });
            }
        }
        
        return blockers;
    });
    
    console.log(`Found ${result.length} passage blockers:\n`);
    for (const b of result) {
        console.log(`${b.passage}:`);
        console.log(`  Collider: (${b.collider.x}, ${b.collider.z}) w=${b.collider.w} d=${b.collider.d}`);
        console.log(`  Props: walkable=${b.collider.walkable} maze=${b.collider.isMazeWall} tower=${b.collider.isTowerStructure} entrance=${b.collider.isBiomeEntrance} boundary=${b.collider.biomeBoundary} gameplay=${b.collider.gameplayBoundary} building=${b.collider.isBuildingWall}`);
        if (b.source) {
            console.log(`  Source: ${b.source.type} "${b.source.name}" uuid=${b.source.uuid}`);
            console.log(`  UserData: ${JSON.stringify(b.source.userData)}`);
        } else {
            console.log(`  Source: none`);
        }
        console.log("");
    }
    
    await browser.close();
})();
