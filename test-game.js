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
    
    // Wait for map generation
    await page.waitForTimeout(3000);
    console.log('After 3s - logs:', logs.length);
    
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
