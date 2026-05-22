import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(5000);

// Try to import three from page
const threeResult = await page.evaluate(async () => {
    try {
        const m = await import('three');
        return {
            ok: true,
            keys: Object.keys(m).slice(0, 10),
            keysCount: Object.keys(m).length,
            Cache: m.Cache,
            DefaultLoadingManager: m.DefaultLoadingManager
        };
    } catch (e) {
        return { error: e.message };
    }
});

console.log('Three import result:', JSON.stringify(threeResult, null, 2));

// Try to import MapGenerator
const mgResult = await page.evaluate(async () => {
    try {
        const m = await import('./world/MapGenerator.js');
        return {
            ok: true,
            hasMapGenerator: !!m.MapGenerator,
            MapGeneratorType: typeof m.MapGenerator
        };
    } catch (e) {
        return { error: e.message };
    }
});

console.log('MapGenerator import result:', JSON.stringify(mgResult, null, 2));

await browser.close();
