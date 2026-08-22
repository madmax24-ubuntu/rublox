// Debug: check for visually misplaced objects
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== Visual Biome Check ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    
    const result = await page.evaluate(() => {
        const scene = window.game.scene;
        const THREE = window.THREE;
        const misplaced = [];
        
        scene.traverse(obj => {
            if (!obj.isMesh || obj.isInstancedMesh) return;
            const ud = obj.userData || {};
            if (!ud.mapGenerated) return;
            
            const pos = new THREE.Vector3();
            obj.getWorldPosition(pos);
            const x = pos.x;
            const z = pos.z;
            
            // Check color for ice-like objects (blue/white)
            const mat = obj.material;
            if (!mat) return;
            const color = mat.color;
            if (!color) return;
            
            const r = color.r;
            const g = color.g;
            const b = color.b;
            
            // Ice-like: high blue, low red
            const isIceColor = b > 0.7 && r < 0.5 && !ud.isRiver && !ud.isLake;
            // Snow-like: high all channels (white)
            const isSnowColor = r > 0.8 && g > 0.8 && b > 0.8;
            
            // NE quadrant (Stone biome)
            if (x > 0 && z < 0 && (isIceColor || isSnowColor)) {
                misplaced.push({
                    type: "ice_in_stone",
                    name: obj.name || obj.uuid.substring(0,8),
                    x: x.toFixed(1),
                    z: z.toFixed(1),
                    color: "rgb(" + (r*255).toFixed(0) + "," + (g*255).toFixed(0) + "," + (b*255).toFixed(0) + ")"
                });
            }
        });
        
        return misplaced;
    });
    
    console.log("Misplaced objects: " + result.length);
    for (const o of result) {
        console.log("  " + o.type + ": " + o.name + " at (" + o.x + ", " + o.z + ") color=" + o.color);
    }
    
    await browser.close();
})();
