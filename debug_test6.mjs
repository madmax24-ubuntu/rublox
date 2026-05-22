import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text()}`);
});
page.on('pageerror', err => {
    console.log(`[ERROR] ${err.message}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(5000);

// Try to load three directly
const threeResult = await page.evaluate(async () => {
    try {
        const three = await import('./node_modules/three/build/three.module.js');
        return { success: true, hasTHREE: !!three.THREE, defaultType: typeof three.default };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
console.log('Three import result:', JSON.stringify(threeResult, null, 2));

// Try loading MapGenerator directly
const mgResult = await page.evaluate(async () => {
    try {
        const mg = await import('./world/MapGenerator.js');
        return { success: true, hasMapGenerator: !!mg.MapGenerator };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
console.log('MapGenerator import result:', JSON.stringify(mgResult, null, 2));

await browser.close();
