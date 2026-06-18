import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => console.log(`[Console] ${msg.type()}: ${msg.text().substring(0, 200)}`));
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('Page loaded');

// Click start button
await page.waitForSelector('#startButtonDesktop, #startButtonMobile, .start-btn', { timeout: 5000 });
await page.click('.start-btn');
console.log('Clicked start button');

// Wait for game to initialize
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => ({
        gameStarted: window.game?.isStarted,
        hasScene: !!window.game?.scene,
        hasRenderer: !!window.game?.renderer,
        hasCamera: !!window.game?.camera,
        hasMap: !!window.game?.map,
        hasPlayer: !!window.game?.player,
        canvasCount: document.querySelectorAll('canvas').length,
        bodyClass: document.body?.className,
        renderFrameCount: window.game?.renderFrameCount,
        loadingVisible: document.getElementById('loadingOverlay')?.offsetParent !== null
    }));
    
    console.log(`[${i*3}s]`, JSON.stringify(state));
    
    if (state.gameStarted && state.hasScene && state.hasRenderer) {
        console.log('Game is ready!');
        break;
    }
}

// Take screenshot
await page.waitForTimeout(3000);
await page.screenshot({ path: 'test-results/map-screenshot.png', fullPage: true });
console.log('Screenshot saved');

await browser.close();
