// Debug: find ice objects in stone biome (NE quadrant)
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Ice Objects in Stone Biome Check ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    const result = await page.evaluate(() => {
        const scene = window.game.scene;
        const iceInStone = [];
        const stoneInIce = [];
        scene.traverse(obj => {
            if (!obj.userData) return;
            const px = obj.position.x;
            const pz = obj.position.z;
            const ud = obj.userData;
            const name = obj.name || obj.uuid.substring(0,8);
            // Ice markers
            const isIce = ud.isIceTree || ud.isSnowParticles || ud.isIceCrystal || ud.isIce || ud.isIgloo || ud.isSnowShelter || ud.isSnowTree || ud.isIceCampfire;
            // Stone/maze markers
            const isStone = ud.isMazeWalls || ud.isMazeWall || ud.isTowerStructure || ud.buildingType === "tower";
            // NE quadrant (Stone biome): x > 0, z < 0
            if (px > 0 && pz < 0) {
                if (isIce) {
                    iceInStone.push({ name, x: px, z: pz, marker: Object.keys(ud).find(k => ['isIceTree', 'isSnowParticles', 'isIceCrystal', 'isIce', 'isIgloo', 'isSnowShelter', 'isSnowTree', 'isIceCampfire'].includes(k)) });
                }
            }
            // SE quadrant (Ice biome): x > 0, z > 0
            if (px > 0 && pz > 0) {
                if (isStone) {
                    stoneInIce.push({ name, x: px, z: pz, marker: Object.keys(ud).find(k => ['isMazeWalls', 'isMazeWall', 'isTowerStructure'].includes(k)) });
                }
            }
        });
        return { iceInStone, stoneInIce };
    });
    console.log("Ice objects in Stone biome (NE): " + result.iceInStone.length);
    for (const o of result.iceInStone) {
        console.log("  " + o.name + " at (" + o.x.toFixed(1) + ", " + o.z.toFixed(1) + ") marker=" + o.marker);
    }
    console.log("\nStone objects in Ice biome (SE): " + result.stoneInIce.length);
    for (const o of result.stoneInIce) {
        console.log("  " + o.name + " at (" + o.x.toFixed(1) + ", " + o.z.toFixed(1) + ") marker=" + o.marker);
    }
    await browser.close();
})();
