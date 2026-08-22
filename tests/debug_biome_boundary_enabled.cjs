// Debug: check biomeBoundary collider enabled state
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== BiomeBoundary Collider Enabled Check ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        
        const boundaryColliders = colliders.filter(c => c.biomeBoundary);
        return boundaryColliders.map(c => ({
            centerX: (c.min.x + c.max.x) / 2,
            centerZ: (c.min.z + c.max.z) / 2,
            enabled: c.enabled,
            walkable: c.walkable,
            sourceType: c.source ? (c.source.isInstancedMesh ? "InstancedMesh" : (c.source.isMesh ? "Mesh" : "Group")) : "none",
            sourceName: c.source ? (c.source.name || "unnamed") : "none",
            sourceUserData: c.source ? c.source.userData : null
        }));
    });
    
    console.log("Total biomeBoundary colliders: " + result.length + "\n");
    for (const c of result) {
        const status = c.enabled ? "ACTIVE" : "DISABLED";
        console.log("  (" + c.centerX.toFixed(1) + ", " + c.centerZ.toFixed(1) + ") [" + status + "] walkable=" + c.walkable);
        console.log("    source: " + c.sourceType + " " + c.sourceName);
        if (c.sourceUserData) {
            console.log("    userData: " + JSON.stringify(c.sourceUserData));
        }
        console.log("");
    }
    
    const activeCount = result.filter(c => c.enabled).length;
    const disabledCount = result.filter(c => !c.enabled).length;
    console.log("\nSummary: " + activeCount + " active, " + disabledCount + " disabled\n");
    
    await browser.close();
})();
