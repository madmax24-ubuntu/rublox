// Check biome overlap more carefully - look for ice objects in stone biome
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Biome Overlap Check (Ice in Stone) ===\n");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const game = window.game;
        const scene = game.scene;
        const THREE = window.THREE;
        
        const result = {
            iceInStone: [],
            forestInStone: [],
            militaryInStone: [],
            stoneInIce: [],
            stoneInForest: [],
            stoneInMilitary: []
        };
        
        // Check all meshes
        scene.traverse(obj => {
            if (!obj.geometry) return;
            const px = obj.position.x;
            const pz = obj.position.z;
            const ud = obj.userData || {};
            const name = obj.name || obj.uuid.substring(0,8);
            
            // Ice biome markers
            const isIce = ud.isIceTree || ud.isSnowParticles || ud.isIceCrystal || ud.isIce;
            // Forest biome markers
            const isForest = ud.isTree || ud.isForestTree || ud.isMushroom;
            // Military markers
            const isMilitary = ud.isBarbedWire || ud.isMilitary || ud.isBunker;
            
            // Stone/maze markers
            const isMaze = ud.isMazeWalls || ud.isMazeWall;
            
            // NE = Stone (x>0, z<0)
            if (px > 0 && pz < 0) {
                if (isIce) {
                    result.iceInStone.push({ name, x: px, z: pz, type: "ice" });
                }
                if (isForest) {
                    result.forestInStone.push({ name, x: px, z: pz, type: "forest" });
                }
                if (isMilitary) {
                    result.militaryInStone.push({ name, x: px, z: pz, type: "military" });
                }
            }
            // SE = Ice (x>0, z>0)
            if (px > 0 && pz > 0) {
                if (isMaze) {
                    result.stoneInIce.push({ name, x: px, z: pz, type: "maze" });
                }
                if (isForest) {
                    result.forestInIce.push({ name, x: px, z: pz, type: "forest" });
                }
                if (isMilitary) {
                    result.militaryInIce.push({ name, x: px, z: pz, type: "military" });
                }
            }
            // SW = Forest (x<0, z<0)
            if (px < 0 && pz < 0) {
                if (isMaze) {
                    result.stoneInForest.push({ name, x: px, z: pz, type: "maze" });
                }
                if (isIce) {
                    result.iceInForest.push({ name, x: px, z: pz, type: "ice" });
                }
                if (isMilitary) {
                    result.militaryInForest.push({ name, x: px, z: pz, type: "military" });
                }
            }
            // NW = Military (x<0, z>0)
            if (px < 0 && pz > 0) {
                if (isMaze) {
                    result.stoneInMilitary.push({ name, x: px, z: pz, type: "maze" });
                }
                if (isIce) {
                    result.iceInMilitary.push({ name, x: px, z: pz, type: "ice" });
                }
                if (isForest) {
                    result.forestInMilitary.push({ name, x: px, z: pz, type: "forest" });
                }
            }
        });
        
        return result;
    });
    
    console.log("=== Ice objects in Stone biome ===");
    if (result.iceInStone.length === 0) console.log("  None");
    else for (const o of result.iceInStone) console.log(`  ${o.name} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)})`);
    
    console.log("\n=== Forest objects in Stone biome ===");
    if (result.forestInStone.length === 0) console.log("  None");
    else for (const o of result.forestInStone) console.log(`  ${o.name} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)})`);
    
    console.log("\n=== Military objects in Stone biome ===");
    if (result.militaryInStone.length === 0) console.log("  None");
    else for (const o of result.militaryInStone) console.log(`  ${o.name} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)})`);
    
    console.log("\n=== Stone/Maze objects in Ice biome ===");
    if (result.stoneInIce.length === 0) console.log("  None");
    else for (const o of result.stoneInIce) console.log(`  ${o.name} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)})`);
    
    console.log("\n=== Stone/Maze objects in Forest biome ===");
    if (result.stoneInForest.length === 0) console.log("  None");
    else for (const o of result.stoneInForest) console.log(`  ${o.name} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)})`);
    
    console.log("\n=== Stone/Maze objects in Military biome ===");
    if (result.stoneInMilitary.length === 0) console.log("  None");
    else for (const o of result.stoneInMilitary) console.log(`  ${o.name} at (${o.x.toFixed(1)}, ${o.z.toFixed(1)})`);
    
    await browser.close();
})();
