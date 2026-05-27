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

    // Wait for loading overlay to disappear (up to 120s)
    const start = Date.now();
    let overlayGone = false;
    try {
        while (Date.now() - start < 120000 && !overlayGone) {
            const overlayInfo = await page.evaluate(() => {
                const overlay = document.getElementById('loadingOverlay');
                if (!overlay) return { exists: false, display: 'no-overlay' };
                const computed = window.getComputedStyle(overlay).display;
                return { exists: true, display: overlay.style.display, computed, opacity: window.getComputedStyle(overlay).opacity };
            }).catch(() => ({ exists: true, display: 'error', computed: 'error' }));

            if (overlayInfo.display === 'none' || overlayInfo.computed === 'none') {
                overlayGone = true;
                console.log('Overlay hidden');
            } else {
                const elapsed = Math.round((Date.now() - start) / 1000);
                if (elapsed % 15 === 0 && elapsed > 1) {
                    console.log(`Overlay still visible (${elapsed}s): ${JSON.stringify(overlayInfo)}`);
                }
            }
            await page.waitForTimeout(500);
        }
    } catch(e) {
        console.log('Overlay detection error:', e.message);
    }
    console.log('Overlay check done: gone=', overlayGone);

    // Wait a bit for game loop to start
    await page.waitForTimeout(5000);

    // Check final state with timeout
    try {
        const gameState = await page.evaluate(() => {
            if (!window.game) return 'no game';
            const g = window.game;
            return {
                initialized: g.initialized,
                isStarted: g.isStarted,
                gameState: g.gameState,
                hasMap: !!g.map,
                hasPlayer: !!g.player,
                hasBots: Array.isArray(g.bots) ? g.bots.length : 'none',
            };
        }, { timeout: 10000 });
        console.log('Game state:', JSON.stringify(gameState));
    } catch(e) {
        console.log('Could not get game state:', e.message);
    }

    // Take screenshot
    try {
        await page.screenshot({ path: './test-screenshot.png' });
        console.log('Screenshot saved');
    } catch(e) {
        console.log('Screenshot failed:', e.message);
    }

    console.log('\n=== TOTAL LOGS:', logs.length, '===');
    console.log('Error:', error ? 'YES - ' + error : 'NONE');

    await browser.close();
    process.exit(error ? 1 : 0);
})();
