const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    let error = null;
    page.on('pageerror', err => { error = err.message; });
    
    const logs = [];
    page.on('console', msg => {
        const text = msg.text();
        if (text.includes('[Game]') || text.includes('[MapGen]') || text.includes('[Environment]')) {
            logs.push(text);
        }
    });
    
    const response = await page.goto('http://localhost:3001/', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded, status:', response.status);
    
    // Wait for page to be interactive
    await page.waitForTimeout(2000);

    // Click the start button
    await page.click('button.start-btn');
    console.log('Clicked start button');

    // Wait for map generation (up to 60s)
    const mapReady = await page.evaluate(() => {
        return new Promise((resolve) => {
            const start = Date.now();
            const check = () => {
                if (window.mapReady === true) { resolve(true); return; }
                if (Date.now() - start > 60000) { resolve(false); return; }
                setTimeout(check, 500);
            };
            check();
        });
    });
    console.log('Map ready:', mapReady);
    
    // Check for errors
    if (error) {
        console.log('JS ERROR:', error);
    }
    
    // Check page content
    const content = await page.content();
    console.log('Page has loading overlay:', content.includes('loadingOverlay'));
    
    // Try to get the game instance
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
    } catch (e) {
        console.log('Could not get game state:', e.message);
    }
    
    // Print all logs
    console.log('\n=== ALL LOGS ===');
    logs.forEach(l => console.log(l));
    
    await browser.close();
    process.exit(error ? 1 : 0);
})();
