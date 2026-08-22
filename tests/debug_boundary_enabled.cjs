// Debug: check biomeBoundary collider enabled
const { chromium } = require("@playwright/test");

(async () => {
    console.log("=== BiomeBoundary Enabled Check ===");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto("http://localhost:3001", { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(() => window.game && window.game.initialized, { timeout: 60000 });
    const result = await page.evaluate(() => {
        const colliders = window.game.map.colliders || [];
        return colliders.filter(c => c.biomeBoundary).map(c => ({
            x: (c.min.x + c.max.x) / 2,
            z: (c.min.z + c.max.z) / 2,
            enabled: c.enabled,
            w: c.max.x - c.min.x,
            d: c.max.z - c.min.z
        }));
    });
    console.log("Total: " + result.length);
    var active = result.filter(c => c.enabled);
    var disabled = result.filter(c => !c.enabled);
    console.log("Active: " + active.length + " Disabled: " + disabled.length);
    for (var i = 0; i < result.length; i++) {
        var c = result[i];
        var st = c.enabled ? "ACTIVE" : "DISABLED";
        console.log("  (" + c.x.toFixed(1) + ", " + c.z.toFixed(1) + ") [" + st + "] w=" + c.w.toFixed(1) + " d=" + c.d.toFixed(1));
    }
    await browser.close();
})();
