// Debug: check cornucopia objects
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Cornucopia Objects Check ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const scene = window.game.scene;
        const THREE = window.THREE;
        const cornucopia = [];
        
        scene.traverse(obj => {
            if (!obj.isMesh || obj.isInstancedMesh) return;
            const ud = obj.userData || {};
            if (!ud.mapGenerated) return;
            
            const pos = new THREE.Vector3();
            obj.getWorldPosition(pos);
            const dist = Math.hypot(pos.x, pos.z);
            
            if (ud.isCornucopia || (dist < 48 && ud.isSpawnPlatform)) {
                cornucopia.push({
                    name: obj.name || obj.uuid.substring(0,8),
                    x: pos.x.toFixed(1),
                    z: pos.z.toFixed(1),
                    dist: dist.toFixed(1),
                    isCornucopia: ud.isCornucopia,
                    isSpawnPlatform: ud.isSpawnPlatform,
                    instanced: ud.instanced
                });
            }
        });
        
        return cornucopia;
    });
    
    console.log("Cornucopia/Spawn objects: " + result.length);
    for (const o of result) {
        console.log("  " + o.name + " at (" + o.x + ", " + o.z + ") dist=" + o.dist);
        console.log("    isCornucopia=" + o.isCornucopia + " isSpawnPlatform=" + o.isSpawnPlatform + " instanced=" + o.instanced);
    }
    
    await browser.close();
})();
