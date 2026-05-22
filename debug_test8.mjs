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

// Check importmap and direct import
const result = await page.evaluate(async () => {
    try {
        // Check importmap
        const importmap = document.querySelector('script[type="importmap"]');
        const importmapJson = importmap ? importmap.textContent : 'NOT FOUND';

        // Try direct import
        const three = await import('./node_modules/three/build/three.module.js');
        const threeKeys = Object.keys(three);

        return {
            importmapJson,
            threeKeysCount: threeKeys.length,
            hasCache: threeKeys.includes('Cache'),
            hasVector3: threeKeys.includes('Vector3'),
            hasMesh: threeKeys.includes('Mesh'),
            hasDefaultLoadingManager: threeKeys.includes('DefaultLoadingManager'),
            THREE_type: typeof three,
            three_is_namespace: threeKeys.length > 10
        };
    } catch (err) {
        return { error: err.message };
    }
});

console.log('=== Result ===');
console.log(JSON.stringify(result, null, 2));

await browser.close();
