import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});
page.on('requestfailed', req => {
    console.log(`[FAILED] ${req.url().substring(req.url().indexOf('/rublox'))}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Check if Stats module loaded
const statsCheck = await page.evaluate(async () => {
    try {
        const stats = await import('three/addons/libs/stats.module.js');
        return {
            success: true,
            hasStats: !!stats.default,
            hasStatsClass: typeof stats.default,
            keys: Object.keys(stats).slice(0, 5)
        };
    } catch (err) {
        return { error: err.message };
    }
});

console.log('Stats import:', JSON.stringify(statsCheck, null, 2));

await browser.close();
