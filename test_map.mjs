import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 300);
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
await page.waitForTimeout(30000);

// Screenshot
await page.screenshot({ path: './test_map.png', fullPage: false });
console.log('Screenshot saved');

// Get scene children count
const count = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gameRoot = document.getElementById('gameRoot');
    const w = window;
    // Try to find scene from various sources
    const sceneObj = w.scene || w.game?.scene || null;
    const sceneChildren = sceneObj ? sceneObj.children?.length : 0;
    return {
        canvas: !!canvas,
        sceneChildren: sceneChildren,
        domChildren: gameRoot?.children?.length || 0,
        bodyClass: document.body?.className,
        renderer: !!canvas,
        rendererWidth: canvas?.width,
        rendererHeight: canvas?.height,
        hasGame: !!w.game,
        hasScene: !!w.scene,
        gameKeys: w.game ? Object.keys(w.game).filter(k => !k.startsWith('_')).join(',') : 'none',
        sceneKeys: sceneObj ? Object.keys(sceneObj).filter(k => !k.startsWith('_')).join(',') : 'none'
    };
});
console.log('State:', JSON.stringify(count));

await browser.close();
