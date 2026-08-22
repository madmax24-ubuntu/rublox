// Debug: check maze walls blocking passages in stone biome
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Maze Walls in Stone Biome Passages ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const mapGen = game.map;
        const colliders = mapGen?.colliders || [];
        
        // Check for maze walls near the entrance corridor of the stone biome
        // NE quadrant entrance: around (45, -45) to (82, -82) diagonal
        const entranceCorridor = {
            name: "Stone biome entrance",
            x: 45, z: -45, w: 20, d: 20
        };
        
        var mazeBlockers = [];
        for (var ci = 0; ci < colliders.length; ci++) {
            var c = colliders[ci];
            if (!c.isMazeWall) continue;
            if (c.min.x <= entranceCorridor.x + entranceCorridor.w/2 && c.max.x >= entranceCorridor.x - entranceCorridor.w/2 && c.min.z <= entranceCorridor.z + entranceCorridor.d/2 && c.max.z >= entranceCorridor.z - entranceCorridor.d/2) {
                mazeBlockers.push({
                    x: (c.min.x + c.max.x) / 2,
                    z: (c.min.z + c.max.z) / 2,
                    enabled: c.enabled,
                    w: c.max.x - c.min.x,
                    d: c.max.z - c.min.z
                });
            }
        }
        return mazeBlockers;
    });
    
    console.log("Maze walls blocking stone biome entrance: " + result.length);
    for (var i = 0; i < result.length; i++) {
        var b = result[i];
        var st = b.enabled ? "ACTIVE" : "DISABLED";
        console.log("  (" + b.x.toFixed(1) + ", " + b.z.toFixed(1) + ") [" + st + "] w=" + b.w.toFixed(1) + " d=" + b.d.toFixed(1));
    }
    
    await browser.close();
})();
