// Debug: check enabled flag after 35s spawn
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Passage Blocker Check (after 35s) ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    console.log("Waiting 35s for spawn timer...");
    await new Promise(r => setTimeout(r, 35000));
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        
        console.log(`[Browser] biomeGatesOpen: ${mapGen?.biomeGatesOpen}`);
        
        const passages = [
            { name: "NE-SW bridge area", x: 0, z: -64, w: 10, d: 6 },
            { name: "NE-SE bridge area", x: 64, z: 0, w: 6, d: 10 },
        ];
        
        const blockers = [];
        for (const p of passages) {
            const matching = colliders.filter(c => {
                return c.min.x <= p.x + p.w/2 && c.max.x >= p.x - p.w/2 &&
                       c.min.z <= p.z + p.d/2 && c.max.z >= p.z - p.d/2 &&
                       !c.walkable && c.enabled !== false;
            });
            
            for (const c of matching) {
                const cx = (c.min.x + c.max.x) / 2;
                const cz = (c.min.z + c.max.z) / 2;
                
                blockers.push({
                    passage: p.name,
                    collider: {
                        x: cx.toFixed(1),
                        z: cz.toFixed(1),
                        w: (c.max.x - c.min.x).toFixed(1),
                        d: (c.max.z - c.min.z).toFixed(1),
                        walkable: c.walkable,
                        enabled: c.enabled,
                        biomeBoundary: c.biomeBoundary,
                        isBiomeGate: c.isBiomeGate,
                    }
                });
            }
        }
        
        return blockers;
    });
    
    console.log(`Found ${result.length} active passage blockers:\n`);
    if (result.length === 0) {
        console.log("No active blockers - passages are clear!");
    } else {
        for (const b of result) {
            console.log(`${b.passage}:`);
            console.log(`  (${b.collider.x}, ${b.collider.z}) w=${b.collider.w} d=${b.collider.d}`);
            console.log(`  walkable=${b.collider.walkable} enabled=${b.collider.enabled} boundary=${b.collider.biomeBoundary} gate=${b.collider.isBiomeGate}`);
            console.log("");
        }
    }
    
    await browser.close();
})();
