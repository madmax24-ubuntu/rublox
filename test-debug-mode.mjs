import { chromium } from 'playwright';

const URL = 'http://localhost:3001?debug=true';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    // Capture console logs and errors
    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

    console.log('Opening debug mode...');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    
    // Wait for game to initialize and debug overlay to appear
    await page.waitForTimeout(8000);
    
    const fps = await page.evaluate(() => document.getElementById('dbgFps')?.textContent || null);
    console.log('FPS:', fps);

    const hasGame = await page.evaluate(() => typeof window.game !== 'undefined');
    console.log('Has game instance:', hasGame);

    const camExists = await page.evaluate(() => {
        if (!window.game) return false;
        return !!window.game.camera;
    });
    console.log('Camera exists on game object:', camExists);

    const pos = await page.evaluate(() => {
        if (!window.game?.camera) return null;
        return `X:${game.camera.position.x.toFixed(1)}, Y:${game.camera.position.y.toFixed(1)}, Z:${game.camera.position.z.toFixed(1)}`;
    });
    console.log('Camera position:', pos);

    // Test camera movement by simulating WASD keys
    await page.keyboard.press('KeyW');
    await page.waitForTimeout(200);
    
    const newPos = await page.evaluate(() => {
        if (!window.game?.camera) return null;
        return `X:${game.camera.position.x.toFixed(1)}, Y:${game.camera.position.y.toFixed(1)}, Z:${game.camera.position.z.toFixed(1)}`;
    });
    console.log('After W key:', newPos);

    // Test top-down view
    await page.keyboard.press('KeyT');
    await page.waitForTimeout(200);
    
    const topView = await page.evaluate(() => {
        if (!window.game?.camera) return null;
        return `X:${game.camera.position.x.toFixed(1)}, Y:${game.camera.position.y.toFixed(1)}, Z:${game.camera.position.z.toFixed(1)}`;
    });
    console.log('After T key (top-down):', topView);

    await browser.close();
})();
