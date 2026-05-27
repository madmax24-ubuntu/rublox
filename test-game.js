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
    let pageError = null;
    page.on('pageerror', err => { pageError = err.message; });
    page.on('crash', () => console.log('PAGE CRASHED'));

    const response = await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded, status:', response.status);

    await page.waitForTimeout(2000);

    // Click the start button
    try { await page.click('button.start-btn'); } catch(e) { console.log('Start button click failed:', e.message); }
    console.log('Clicked start button');

    // Wait for loading overlay to disappear by polling style.display
    // This happens in JS before Three.js render, so it won't crash
    const start = Date.now();
    let overlayGone = false;
    let overlayCheckCount = 0;
    while (Date.now() - start < 120000 && !overlayGone) {
        try {
            const display = await page.evaluate(() => {
                const ol = document.getElementById('loadingOverlay');
                return ol ? ol.style.display : 'no-overlay';
            }, { timeout: 3000 });

            if (display === 'none') {
                overlayGone = true;
                console.log('Overlay hidden successfully');
            } else {
                overlayCheckCount++;
                const elapsed = Math.round((Date.now() - start) / 1000);
                if (elapsed % 15 === 0 && elapsed > 1) {
                    console.log(`Overlay visible (${elapsed}s): display=${display}`);
                }
            }
        } catch(e) {
            console.log('Overlay check error:', e.message.substring(0, 100));
            break;
        }
        await page.waitForTimeout(1000);
    }
    console.log('Overlay check done: gone=', overlayGone, 'checks=', overlayCheckCount);

    // Check if map generation completed
    const mapGenDone = logs.some(l => l.includes('[MapGen] ready resolved!'));
    const gameStarted = logs.some(l => l.includes('[Game] map ready!'));
    console.log('Map gen complete:', mapGenDone, '| Game started:', gameStarted);

    // Check final game state (may not be available if page crashed)
    try {
        const gs = await page.evaluate(() => {
            if (!window.game) return null;
            const g = window.game;
            return {
                initialized: g.initialized,
                isStarted: g.isStarted,
                gameState: g.gameState,
                hasMap: !!g.map,
                hasPlayer: !!g.player,
            };
        }, { timeout: 5000 }).catch(() => null);
        if (gs) console.log('Game state:', JSON.stringify(gs));
    } catch(e) {
        console.log('Game state check failed:', e.message.substring(0, 100));
    }

    console.log('\n=== TOTAL LOGS:', logs.length, '===');
    console.log('Error:', pageError ? 'YES - ' + pageError : 'NONE');
    console.log('Result:', overlayGone && mapGenDone ? 'PASS' : 'FAIL');

    await browser.close();
    process.exit((overlayGone && mapGenDone) ? 0 : 1);
})();
