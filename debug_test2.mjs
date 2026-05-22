import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let allMessages = [];

page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    allMessages.push(text);
    console.log(text);
});
page.on('pageerror', err => {
    const text = `[PAGEERROR] ${err.message}`;
    allMessages.push(text);
    console.log(text);
});

await page.goto('http://localhost:3001');
console.log('=== Page loaded, waiting for game init ===');

// Wait longer for game to initialize
await page.waitForTimeout(10000);

console.log('=== Checking state ===');
const state = await page.evaluate(() => {
    return {
        hasCanvas: !!document.querySelector('canvas'),
        hasGameRoot: !!document.getElementById('gameRoot'),
        hasLoadingOverlay: !!document.getElementById('loadingOverlay'),
        loadingDisplayed: document.getElementById('loadingOverlay')?.style.display !== 'none',
        bodyClass: document.body?.className,
        gameStarted: document.body?.classList?.contains('game-started')
    };
});
console.log('State:', JSON.stringify(state, null, 2));

// Show last 20 messages
console.log('\n=== Last 20 messages ===');
allMessages.slice(-20).forEach(m => console.log(m));

await browser.close();
