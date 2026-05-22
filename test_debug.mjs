import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log(`[ERR] ${t}`);
    else if (type === 'log') console.log(`[LOG] ${t}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

// Click start button
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(35000);

// Screenshot
await page.screenshot({ path: './test_debug.png', fullPage: false });
console.log('Screenshot saved');

// Deep debug
const traverse = await page.evaluate(() => {
    const w = window;
    const game = w.game;
    if (!game || !game.scene) return { error: 'no game or scene' };

    let meshCount = 0;
    let lightCount = 0;
    let mapObjects = 0;
    let meshTypes = {};
    const first10 = [];

    game.scene.traverse((obj) => {
        if (obj.isMesh) {
            meshCount++;
            const name = obj.name || (obj.userData?.biome || obj.userData?.biomeId || 'mesh');
            meshTypes[name] = (meshTypes[name] || 0) + 1;
        }
        if (obj.isLight) lightCount++;
        if (obj.userData?.mapGenerated) mapObjects++;

        if (first10.length < 12) {
            first10.push({
                type: obj.type,
                name: obj.name || '',
                isMesh: obj.isMesh,
                isLight: obj.isLight,
                y: obj.position ? obj.position.y.toFixed(2) : 'N/A',
                userData: Object.keys(obj.userData || {}).join(',')
            });
        }
    });

    return {
        meshCount,
        lightCount,
        mapObjects,
        meshTypes: Object.keys(meshTypes).slice(0, 20),
        first10
    };
});

console.log('Traverse:', JSON.stringify(traverse, null, 2));

await browser.close();
