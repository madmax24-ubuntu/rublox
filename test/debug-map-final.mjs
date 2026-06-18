import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Error] ${msg.text().substring(0, 200)}`);
});
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

await page.goto('http://localhost:3001/', { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(5000);

// Directly call startGame
await page.evaluate(async () => {
    if (window.game && !window.game.isStarted) {
        await window.game.startGame();
    }
});

// Wait for map to render
for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    const state = await page.evaluate(() => {
        const g = window.game;
        return {
            isStarted: g?.isStarted,
            hasMap: !!g?.map,
            mapType: g?.map?.constructor?.name,
            renderFrameCount: g?.renderFrameCount,
            cameraPos: g?.camera?.position?.toArray?.()?.map?.(v => v.toFixed(2)),
            canvasCount: document.querySelectorAll('canvas').length
        };
    });
    console.log(`[${i*3}s]`, JSON.stringify(state));
    if (state.isStarted && state.hasMap) break;
}

// Take screenshot with map view
await page.waitForTimeout(5000);
await page.screenshot({ path: 'test-results/map-topdown.png', fullPage: false });
console.log('Screenshot saved');

// Check map data
const mapData = await page.evaluate(() => {
    const g = window.game;
    if (!g?.map) return null;
    return {
        gridWidth: g.map.gridWidth,
        gridHeight: g.map.gridHeight,
        biomeTypes: g.map.biomeTypes ? [...new Set(g.map.biomeTypes.slice(0, 10))] : 'N/A',
        hasGrid: !!g.map.grid
    };
});

console.log('Map data:', JSON.stringify(mapData, null, 2));

await browser.close();
