// Debug: check ring walls near passages
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Ring Wall Analysis ===\n");
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
        
        // Check biomeBoundary colliders near axes
        const axisColliders = colliders.filter(c => {
            if (!c.biomeBoundary) return false;
            const cx = (c.min.x + c.max.x) / 2;
            const cz = (c.min.z + c.max.z) / 2;
            const cw = c.max.x - c.min.x;
            const cd = c.max.z - c.min.z;
            // Near X axis (z ~ 0) or Z axis (x ~ 0)
            return (Math.abs(cz) < 5 && cw < 5) || (Math.abs(cx) < 5 && cd < 5);
        });
        
        return axisColliders.map(c => ({
            x: ((c.min.x + c.max.x)/2).toFixed(1),
            z: ((c.min.z + c.max.z)/2).toFixed(1),
            w: (c.max.x - c.min.x).toFixed(1),
            d: (c.max.z - c.min.z).toFixed(1),
            biomeBoundary: c.biomeBoundary,
            source: c.source ? (c.source.isInstancedMesh ? "InstancedMesh" : c.source.uuid?.substring(0,8)) : "none"
        }));
    });
    
    console.log(`Found ${result.length} axis-aligned biomeBoundary colliders:\n`);
    for (const c of result) {
        console.log(`  (${c.x}, ${c.z}) w=${c.w} d=${c.d} boundary=${c.biomeBoundary} src=${c.source}`);
    }
    
    await browser.close();
})();
