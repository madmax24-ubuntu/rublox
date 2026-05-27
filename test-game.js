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
    page.on('pageerror', err => { pageError = err.message; console.log('PAGE ERROR:', err.message); });
    page.on('crash', () => console.log('BROWSER PAGE CRASHED'));
    page.on('close', () => console.log('PAGE CLOSED'));

    const response = await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded, status:', response.status);

    await page.waitForTimeout(2000);

    // Click the start button
    try { await page.click('button.start-btn'); } catch(e) { console.log('Start button click failed:', e.message); }
    console.log('Clicked start button');

    // Wait for game to produce map ready message, then wait a bit more
    const mapReadyCheck = await page.evaluate(() => {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                const elapsed = Date.now() - start;
                if (elapsed > 120000) {
                    resolve({ timeout: true, logs: 'timeout' });
                    return;
                }
                // Check if game loop has started by looking at HUD state
                const hud = document.getElementById('hud');
                const overlay = document.getElementById('loadingOverlay');
                if (overlay && overlay.style.display === 'none') {
                    resolve({ overlayHidden: true });
                    return;
                }
                setTimeout(check, 1000);
            };
            check();
        });
    }).catch(err => ({ evaluateError: err.message }));

    console.log('Map/Overlay check result:', JSON.stringify(mapReadyCheck));

    // Wait a bit more after overlay hidden
    if (mapReadyCheck.overlayHidden) {
        await page.waitForTimeout(5000);
    }

    // Try to get game state (page may have crashed)
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
        }, { timeout: 5000 }).catch(() => null);
        console.log('Game state:', JSON.stringify(gameState));
    } catch(e) {
        console.log('Could not get game state:', e.message);
    }

    // Check for console errors
    const errors = await page.evaluate(() => {
        const errDiv = document.getElementById('errorPanel');
        return errDiv ? errDiv.innerText : 'none';
    }).catch(() => 'could not check');
    console.log('Error panel:', errors);

    console.log('\n=== TOTAL LOGS:', logs.length, '===');
    console.log('Page error:', pageError ? 'YES - ' + pageError : 'NONE');

    await browser.close();
    process.exit(pageError ? 1 : 0);
})();
