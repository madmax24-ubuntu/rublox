import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});

// Add init script that logs module resolution
await page.addInitScript(() => {
    window.addEventListener('error', (e) => {
        console.log(`[GLOBAL ERROR] ${e.message}`);
    });
    window.addEventListener('unhandledrejection', (e) => {
        console.log(`[UNHANDLED REJECTION] ${e.reason}`);
    });
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Try importing three from the page context
const threeCheck = await page.evaluate(async () => {
    try {
        const three = await import('three');
        const keys = Object.keys(three);
        return {
            success: true,
            keysCount: keys.length,
            hasCache: keys.includes('Cache'),
            hasDefaultLoadingManager: keys.includes('DefaultLoadingManager'),
            threeType: typeof three,
            keysSample: keys.slice(0, 5)
        };
    } catch (err) {
        return { error: err.message };
    }
});

console.log('Three import from page:', JSON.stringify(threeCheck, null, 2));

await browser.close();
