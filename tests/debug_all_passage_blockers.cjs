// Debug: find ALL colliders in passage areas
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== All Colliders in Passage Areas ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    const result = await page.evaluate(() => {
        const colliders = window.game.map.colliders || [];
        const passages = [
            { name: "NE-SW bridge", x: 0, z: -64, w: 14, d: 10 },
            { name: "NE-SE bridge", x: 64, z: 0, w: 10, d: 14 },
            { name: "NW-SE bridge", x: -64, z: 0, w: 10, d: 14 },
            { name: "SW-NE bridge", x: 0, z: 64, w: 14, d: 10 }
        ];
        var blockers = [];
        for (var pi = 0; pi < passages.length; pi++) {
            var p = passages[pi];
            for (var ci = 0; ci < colliders.length; ci++) {
                var c = colliders[ci];
                if (c.min.x <= p.x + p.w/2 && c.max.x >= p.x - p.w/2 && c.min.z <= p.z + p.d/2 && c.max.z >= p.z - p.d/2 && !c.walkable) {
                    blockers.push({
                        passage: p.name,
                        x: (c.min.x + c.max.x) / 2,
                        z: (c.min.z + c.max.z) / 2,
                        w: c.max.x - c.min.x,
                        d: c.max.z - c.min.z,
                        enabled: c.enabled,
                        walkable: c.walkable,
                        biomeBoundary: c.biomeBoundary,
                        isBiomeGate: c.isBiomeGate,
                        isMazeWall: c.isMazeWall,
                        isBuildingWall: c.isBuildingWall,
                        gameplayBoundary: c.gameplayBoundary,
                        sourceType: c.source ? (c.source.isInstancedMesh ? "InstancedMesh" : (c.source.isMesh ? "Mesh" : "Group")) : "none",
                        sourceName: c.source ? (c.source.name || "unnamed") : "none"
                    });
                }
            }
        }
        return blockers;
    });
    console.log("Found: " + result.length + " blockers");
    for (var i = 0; i < result.length; i++) {
        var b = result[i];
        var st = b.enabled ? "ACTIVE" : "DISABLED";
        console.log("  " + b.passage + ": (" + b.x.toFixed(1) + ", " + b.z.toFixed(1) + ") [" + st + "]");
        console.log("    w=" + b.w.toFixed(1) + " d=" + b.d.toFixed(1) + " boundary=" + b.biomeBoundary + " gate=" + b.isBiomeGate + " maze=" + b.isMazeWall + " building=" + b.isBuildingWall + " gameplay=" + b.gameplayBoundary);
        console.log("    source: " + b.sourceType + " " + b.sourceName);
    }
    await browser.close();
})();
