import playwright from 'playwright';

const view = process.argv[2] || 'top';
const out = process.argv[3] || `test-results/preview_${view}.png`;

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1000, height: 1000 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { const t = m.text(); if (/error|Error/.test(t)) console.log('[console]', t.slice(0, 200)); });

await page.goto('http://localhost:3001/map-preview.html', { waitUntil: 'load', timeout: 20000 });
if (view !== 'top') await page.evaluate(v => window.setView(v), view);

// wait for map ready
for (let i = 0; i < 40; i++) {
    const ready = await page.evaluate(() => window.__ready === true);
    if (ready) break;
    await page.waitForTimeout(500);
}
await page.waitForTimeout(800);
if (view !== 'top') await page.evaluate(v => window.setView(v), view);
await page.waitForTimeout(300);
await page.screenshot({ path: out });
console.log('saved', out);
await browser.close();
