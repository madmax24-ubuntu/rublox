import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Game]') || text.includes('[MapGen]')) {
            logs.push(text);
            console.log(text);
        }
    });
    let error = null;
    page.on('pageerror', err => { error = err.message; console.log('PAGE ERROR:', error); });

    const response = await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded, status:', response.status);

    await page.waitForTimeout(2000);

    // Click the start button
    try { await page.click('button.start-btn'); } catch(e) { console.log('Start button click failed:', e.message); }
    console.log('Clicked start button');

    // Wait for loading overlay to disappear (up to 90s)
    const start = Date.now();
    let overlayGone = false;
    while (Date.now() - start < 90000 && !overlayGone) {
        overlayGone = await page.evaluate(() => {
            const overlay = document.getElementById('loadingOverlay');
            return !overlay || overlay.style.display === 'none' || overlay.style.display === 'hidden';
        }).catch(() => false);
        if (!overlayGone) {
            await page.waitForTimeout(500);
        }
    }
    console.log('Overlay gone:', overlayGone);

    // Check final state
    try {
        const gameState = await page.evaluate(() => {
            if (!window.game) return 'no game';
            return {
                initialized: window.game.initialized,
                isStarted: window.game.isStarted,
                gameState: window.game.gameState,
                hasMap: !!window.game.map,
                hasPlayer: !!window.game.player
            };
        });
        console.log('Game state:', JSON.stringify(gameState));
    } catch(e) {
        console.log('Could not get game state:', e.message);
    }

    console.log('\n=== TOTAL LOGS:', logs.length, '===');

    await browser.close();
    process.exit(error ? 1 : 0);
})();
