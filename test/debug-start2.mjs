import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const text = msg.text().substring(0, 300);
    if (msg.type() === 'error' || msg.type() === 'warn') {
        console.log(`[${msg.type()}] ${text}`);
    }
});
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

await page.goto('http://localhost:3001/', { waitUntil: 'load', timeout: 30000 });
console.log('Page fully loaded');

await page.waitForTimeout(3000);

// Check if game object exists and what methods it has
const gameInfo = await page.evaluate(() => {
    const g = window.game;
    if (!g) return 'No game object';
    return {
        hasStartGame: typeof g.startGame === 'function',
        hasInitAsync: typeof g.initAsync === 'function',
        isStarted: g.isStarted,
        initialized: g.initialized,
        startingGame: g.startingGame,
        methods: Object.keys(g).filter(k => typeof g[k] === 'function').slice(0, 20)
    };
});

console.log('Game info:', JSON.stringify(gameInfo, null, 2));

// Click start
await page.click('#startButtonDesktop');
console.log('Clicked start button');

// Wait for game to start
for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
        const g = window.game;
        return {
            isStarted: g?.isStarted,
            initialized: g?.initialized,
            startingGame: g?.startingGame,
            hasScene: !!g?.scene,
            renderFrameCount: g?.renderFrameCount
        };
    });
    console.log(`[${i*3}s]`, JSON.stringify(state));
    if (state.isStarted) break;
}

await browser.close();
