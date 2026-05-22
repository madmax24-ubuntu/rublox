import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log('[C:' + msg.type() + '] ' + msg.text().substring(0, 500));
});
page.on('pageerror', err => {
    console.log('[PAGEERR] ' + err.message);
});

await page.goto('http://localhost:3001/');

// Add init script after page loaded (not before)
await page.addInitScript(() => {
    console.log('[INIT-WORLD] Script running in init world');
    console.log('[INIT-WORLD] window.THREE = ' + (window.THREE ? 'exists' : 'none'));
    console.log('[INIT-WORLD] location = ' + window.location.href);
});

// Reload to trigger init script
await page.reload();
await page.waitForTimeout(10000);

const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return {
        hasCanvas: !!canvas,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        bodyClass: document.body?.className,
        threeGlobal: !!window.THREE,
    };
});

console.log('State: ' + JSON.stringify(state, null, 2));

await browser.close();
