import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let errorCount = 0;

page.on('console', msg => {
    console.log(`[CONSOLE ${msg.type()}] ${msg.text().substring(0, 200)}`);
});
page.on('pageerror', err => {
    errorCount++;
    console.log(`[PAGEERROR #${errorCount}] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

console.log(`\nTotal pageerrors: ${errorCount}`);

// Check if script failed to load
const scriptCheck = await page.evaluate(() => {
    const scripts = document.querySelectorAll('script[type="module"]');
    return {
        moduleScriptCount: scripts.length,
        moduleSrcs: Array.from(scripts).map(s => s.src || 'inline')
    };
});
console.log('Scripts:', JSON.stringify(scriptCheck, null, 2));

await browser.close();
