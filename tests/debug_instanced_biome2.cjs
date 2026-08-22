// Debug: check biome key assignment
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Biome Key Assignment Check ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const scene = window.game.scene;
        const instancedMeshes = [];
        scene.traverse(obj => {
            if (!obj.isInstancedMesh) return;
            const ud = obj.userData || {};
            // Skip gameplayBoundary and cornucopia
            if (ud.gameplayBoundary || ud.isCornucopia) return;
            
            const name = obj.name || obj.uuid.substring(0,8);
            var biomes = new Set();
            var localMatrix = new (window.THREE).Matrix4();
            var worldMatrix = new (window.THREE).Matrix4();
            obj.updateMatrixWorld(true);
            
            for (let i = 0; i < obj.count; i++) {
                obj.getMatrixAt(i, localMatrix);
                worldMatrix.multiplyMatrices(obj.matrixWorld, localMatrix);
                const pos = new (window.THREE).Vector3();
                pos.setFromMatrixPosition(worldMatrix);
                
                if (pos.x > 0 && pos.z < 0) biomes.add("stone");
                else if (pos.x > 0 && pos.z > 0) biomes.add("ice");
                else if (pos.x < 0 && pos.z < 0) biomes.add("forest");
                else if (pos.x < 0 && pos.z > 0) biomes.add("military");
                else if (Math.hypot(pos.x, pos.z) < 48) biomes.add("center");
            }
            
            if (biomes.size > 1) {
                instancedMeshes.push({
                    name,
                    count: obj.count,
                    biomes: [...biomes],
                    userData: ud
                });
            }
        });
        return instancedMeshes;
    });
    
    console.log("InstancedMeshes with mixed biomes (excluding boundary/cornucopia): " + result.length);
    for (const m of result) {
        console.log("  " + m.name + " (count=" + m.count + "): " + m.biomes.join(", "));
        console.log("    userData: " + JSON.stringify(m.userData));
    }
    
    await browser.close();
})();
