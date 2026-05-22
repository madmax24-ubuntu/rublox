import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 200);
    if (msg.type() === 'error') console.log(`[ERR] ${t}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

// Click start button
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(10000);

// Screenshot
await page.screenshot({ path: './test_current.png', fullPage: false });
console.log('Screenshot saved');

// Get scene children count
const count = await page.evaluate(() => {
    const root = document.getElementById('gameRoot');
    const canvas = document.querySelector('canvas');
    return {
        canvas: !!canvas,
        children: root?.children?.length || 0,
        bodyClass: document.body?.className
    };
});
console.log('State:', JSON.stringify(count));

await browser.close();
