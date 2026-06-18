import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const text = msg.text().substring(0, 300);
    console.log(`[${msg.type()}] ${text}`);
});
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

await page.goto('http://localhost:3001/', { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(5000);

// Directly call startGame
console.log('Calling game.startGame() directly...');
try {
    await page.evaluate(async () => {
        if (window.game && !window.game.isStarted) {
            await window.game.startGame();
        }
    });
    console.log('startGame() called');
} catch (e) {
    console.log(`Error: ${e.message}`);
}

await page.waitForTimeout(10000);

const finalState = await page.evaluate(() => {
    const g = window.game;
    return {
        isStarted: g?.isStarted,
        initialized: g?.initialized,
        hasScene: !!g?.scene,
        hasRenderer: !!g?.renderer,
        error: g?.error
    };
});

console.log('Final state:', JSON.stringify(finalState, null, 2));

await browser.close();
