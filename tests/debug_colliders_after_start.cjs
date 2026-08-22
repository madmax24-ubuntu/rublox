// Debug: check colliders after game start
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Colliders After Game Start ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    // Force game start
    await page.evaluate(() => {
        const game = window.game;
        game.isStarted = true;
        game.countdownTimer = 0;
        game.gameState = "spawn";
        game.spawnTimer = 0;
        game._updateSpawnState(31);
    });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        const passages = [
            { name: "NE-SW bridge", x: 0, z: -64, w: 14, d: 10 },
            { name: "NE-SE bridge", x: 64, z: 0, w: 10, d: 14 }
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
                        enabled: c.enabled,
                        biomeBoundary: c.biomeBoundary,
                        isBiomeGate: c.isBiomeGate,
                        isMazeWall: c.isMazeWall,
                        isBuildingWall: c.isBuildingWall
                    });
                }
            }
        }
        return blockers;
    });
    
    console.log("Found: " + result.length + " blockers after game start");
    for (var i = 0; i < result.length; i++) {
        var b = result[i];
        var st = b.enabled ? "ACTIVE" : "DISABLED";
        console.log("  " + b.passage + ": (" + b.x.toFixed(1) + ", " + b.z.toFixed(1) + ") [" + st + "]");
        console.log("    boundary=" + b.biomeBoundary + " gate=" + b.isBiomeGate + " maze=" + b.isMazeWall + " building=" + b.isBuildingWall);
    }
    
    await browser.close();
})();
