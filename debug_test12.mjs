import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});

// Inject a script to intercept imports BEFORE main.js runs
await page.addInitScript(() => {
    const origImport = window.import;
    console.log('init script loaded');
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Check if main.js even started
const check = await page.evaluate(() => {
    // Check if the loading overlay is still visible
    const loading = document.getElementById('loadingOverlay');
    return {
        loadingVisible: loading ? loading.style.display !== 'none' : 'no element',
        loadingDisplayStyle: loading ? loading.style.display : 'N/A',
        bodyExists: !!document.body,
        htmlExists: !!document.documentElement
    };
});

console.log('Page state:', JSON.stringify(check, null, 2));

await browser.close();
