import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let errorMessages = [];

page.on('console', msg => {
    const text = msg.text().substring(0, 300);
    console.log(`[CONSOLE] ${text}`);
});
page.on('pageerror', err => {
    errorMessages.push(err.message.substring(0, 500));
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');

// Wait and check every second
for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000);

    const check = await page.evaluate(() => {
        try {
            const loading = document.getElementById('loadingOverlay');
            const startScreen = document.getElementById('startScreen');
            const canvas = document.querySelector('canvas');
            return {
                loadingDisplay: loading ? loading.style.display : 'N/A',
                startScreenDisplay: startScreen ? startScreen.style.display : 'N/A',
                hasCanvas: !!canvas,
                bodyClass: document.body?.className
            };
        } catch (e) {
            return { error: e.message };
        }
    });

    console.log(`[${i}s] State:`, JSON.stringify(check));
}

console.log(`\nTotal errors: ${errorMessages.length}`);
errorMessages.forEach((e, i) => console.log(`Error ${i}:`, e.substring(0, 200)));

await browser.close();
