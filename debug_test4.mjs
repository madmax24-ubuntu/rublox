import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Track network requests
page.on('console', msg => {
    console.log(`[CONSOLE ${msg.type()}] ${msg.text()}`);
});
page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
});
page.on('response', response => {
    const url = response.url();
    const status = response.status();
    if (!url.includes('ws://')) {
        console.log(`[HTTP ${status}] ${url.substring(url.indexOf('/rublox'))}`);
    }
});
page.on('requestfailed', request => {
    console.log(`[FAILED] ${request.url().substring(request.url().indexOf('/rublox'))} - ${request.failure().errorText}`);
});

await page.goto('http://localhost:3001/');
console.log('=== Navigation done ===');

await page.waitForTimeout(5000);

await browser.close();
