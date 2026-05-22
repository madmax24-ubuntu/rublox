import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Collect all console messages and errors
page.on('console', msg => {
    console.log('[CONSOLE]', msg.type(), msg.text());
});
page.on('pageerror', err => {
    console.log('[PAGE ERROR]', err.message);
});

await page.goto('http://localhost:3001');
console.log('Page loaded');

// Wait a bit for any errors
await page.waitForTimeout(3000);

// Check if game is running
const hasError = await page.evaluate(() => {
    return !!document.querySelector('.error');
});
console.log('Has error element:', hasError);

// Check renderer
const hasCanvas = await page.evaluate(() => {
    return document.querySelector('canvas') !== null;
});
console.log('Has canvas:', hasCanvas);

await browser.close();
