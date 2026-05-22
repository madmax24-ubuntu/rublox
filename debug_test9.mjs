import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let consoleMsgs = [];
let errors = [];

page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleMsgs.push(text);
    console.log(text);
});
page.on('pageerror', err => {
    const text = `[PAGEERROR] ${err.message}`;
    errors.push(text);
    console.log(text);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

// Check global state
const state = await page.evaluate(() => {
    return {
        THREE: typeof THREE,
        THREE_Cache: typeof THREE.Cache,
        THREE_DefaultLoadingManager: typeof THREE.DefaultLoadingManager,
        hasWindow: typeof window !== 'undefined',
        hasDocument: typeof document !== 'undefined',
        loadingOverlay: !!document.getElementById('loadingOverlay'),
        loadingFill: !!document.getElementById('loadingFill'),
        loadingText: !!document.getElementById('loadingText'),
        gameRoot: !!document.getElementById('gameRoot'),
        startScreen: !!document.getElementById('startScreen'),
        startBtnDesktop: !!document.getElementById('startButtonDesktop'),
        startBtnMobile: !!document.getElementById('startButtonMobile'),
        bodyClass: document.body?.className,
        gameStarted: document.body?.classList?.contains('game-started'),
        canvasCount: document.querySelectorAll('canvas').length
    };
});

console.log('\n=== State ===');
console.log(JSON.stringify(state, null, 2));

console.log('\n=== Errors ===');
errors.forEach(e => console.log(e));

console.log('\n=== Console messages count:', consoleMsgs.length);
consoleMsgs.slice(-10).forEach(m => console.log(m));

await browser.close();
