import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let failedRequests = [];
page.on('requestfailed', req => {
    failedRequests.push(req.url());
    console.log(`[404] ${req.url()}`);
});
page.on('console', msg => console.log(`[Console] ${msg.type()}: ${msg.text()}`));
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('Page loaded');

await page.waitForTimeout(5000);

console.log('\nFailed requests:', failedRequests.length);
console.log('State:', await page.evaluate(() => ({
    gameExists: typeof window.game !== 'undefined',
    error: window.game?.error,
    canvasCount: document.querySelectorAll('canvas').length
})));

await browser.close();
