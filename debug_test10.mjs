import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text()}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Simple check - just try to access THREE
try {
    const hasThree = await page.evaluate(() => {
        return typeof THREE !== 'undefined';
    });
    console.log('THREE defined:', hasThree);
} catch (e) {
    console.log('Cannot check THREE:', e.message);
}

await browser.close();
