import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

await page.goto('http://localhost:3001/');

// Check every second for 15 seconds
for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1000);

    const state = await page.evaluate(() => {
        return {
            bodyClass: document.body?.className,
            gameStarted: document.body?.classList?.contains('game-started'),
            loadingDisplay: document.getElementById('loadingOverlay')?.style?.display,
            startDisplay: document.getElementById('startScreen')?.style?.display,
            hasCanvas: !!document.querySelector('canvas'),
            childrenCount: document.getElementById('gameRoot')?.children?.length
        };
    });

    if (state.gameStarted || state.hasCanvas || state.loadingDisplay === 'none') {
        console.log(`[${i}s] STATE CHANGED:`, JSON.stringify(state));
    }
}

// Final state
const final = await page.evaluate(() => {
    return {
        bodyClass: document.body?.className,
        gameStarted: document.body?.classList?.contains('game-started'),
        loadingDisplay: document.getElementById('loadingOverlay')?.style?.display,
        startDisplay: document.getElementById('startScreen')?.style?.display,
        hasCanvas: !!document.querySelector('canvas'),
        childrenCount: document.getElementById('gameRoot')?.children?.length
    };
});

console.log('\n=== Final state ===');
console.log(JSON.stringify(final, null, 2));

await browser.close();
