import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, slowMo: 300 });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(5000);

// Inject a console.log at the very start
await page.evaluate(() => {
    const origLog = console.log;
    console.log = function(...args) {
        origLog('[OVERRIDDEN]', ...args);
    };
});

// Now wait and check
await page.waitForTimeout(3000);

// Try to execute a simple test
const test = await page.evaluate(() => {
    console.log('TEST MESSAGE');
    return 'done';
});
console.log('Test result:', test);

await browser.close();
