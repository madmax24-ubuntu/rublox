import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => console.log(`[Console] ${msg.type()}: ${msg.text()}`));
page.on('pageerror', err => console.log(`[PageError] ${err}`));

await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('Page loaded');

await page.waitForTimeout(3000);

const state = await page.evaluate(() => {
    return {
        gameExists: typeof window.game !== 'undefined',
        gameStarted: window.game?.isStarted,
        hasScene: !!window.game?.scene,
        hasRenderer: !!window.game?.renderer,
        hasCamera: !!window.game?.camera,
        hasMap: !!window.game?.map,
        hasPlayer: !!window.game?.player,
        canvasCount: document.querySelectorAll('canvas').length,
        bodyClass: document.body?.className,
        loadingVisible: document.getElementById('loadingOverlay')?.offsetParent !== null,
        startScreenVisible: document.getElementById('startScreen')?.offsetParent !== null,
        error: window.game?.error
    };
});

console.log('State:', JSON.stringify(state, null, 2));

// Screenshot
await page.screenshot({ path: 'test-results/map-debug-initial.png', fullPage: true });
console.log('Screenshot saved');

await browser.close();
