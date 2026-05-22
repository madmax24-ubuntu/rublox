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

// Test THREE.Cache.enabled
const cacheTest = await page.evaluate(() => {
    try {
        console.log('THREE type:', typeof THREE);
        console.log('THREE.Cache type:', typeof THREE.Cache);
        THREE.Cache.enabled = true;
        console.log('Cache enabled:', THREE.Cache.enabled);
        return { success: true };
    } catch (err) {
        return { error: err.message, stack: err.stack?.substring(0, 500) };
    }
});

console.log('Cache test:', JSON.stringify(cacheTest, null, 2));

await browser.close();
