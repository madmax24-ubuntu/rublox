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
    
    await page.waitForTimeout(2000);
    
    await page.click('button.start-btn');
    console.log('Clicked start button');
    
    await page.waitForTimeout(5000);
    console.log('After 5s - logs:', logs.length);
    
    if (error) {
        console.log('JS ERROR:', error);
    }
    
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
    
    console.log('\n=== ALL LOGS ===');
    logs.forEach(l => console.log(l));
    
    await browser.close();
    process.exit(error ? 1 : 0);
})();
