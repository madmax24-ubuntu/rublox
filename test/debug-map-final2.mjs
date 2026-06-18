import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Error] ${msg.text().substring(0, 200)}`);
});
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

await page.goto('http://localhost:3001/', { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(5000);

// Start game
await page.evaluate(async () => {
    if (window.game && !window.game.isStarted) {
        await window.game.startGame();
    }
});

// Wait for full generation
for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
        const g = window.game;
        return {
            isStarted: g?.isStarted,
            renderFrameCount: g?.renderFrameCount,
            mapReady: g?.map?.ready?.then ? 'pending' : 'ready',
            sceneChildren: g?.scene?.children?.length || 0
        };
    });
    if (state.isStarted && state.renderFrameCount > 50) break;
    console.log(`[${i*3}s]`, JSON.stringify(state));
}

// Get scene info
const sceneInfo = await page.evaluate(() => {
    const g = window.game;
    if (!g?.scene) return null;
    const children = g.scene.children.map(c => ({
        type: c.constructor?.name,
        name: c.name || '',
        visible: c.visible,
        children: c.children?.length || 0
    }));
    return {
        totalChildren: g.scene.children.length,
        children: children.slice(0, 20)
    };
});

console.log('Scene info:', JSON.stringify(sceneInfo, null, 2));

// Screenshot
await page.screenshot({ path: 'test-results/map-final.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
