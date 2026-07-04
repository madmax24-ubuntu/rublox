const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('Starting playwright for camera test...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 720 });

    const targetUrl = 'file://' + path.resolve('index.html');
    console.log('Loading', targetUrl);
    await page.goto(targetUrl, { waitUntil: 'networkidle' });

    console.log('Waiting for start button...');
    await page.waitForFunction(() => {
        const btn = document.querySelector('#startButtonDesktop');
        return btn && btn.offsetParent !== null && !document.querySelector('#loadingOverlay:not([style*="display: none"])');
    });
    console.log('Clicking start button and waiting 4 seconds...');
    await page.click('#startButtonDesktop');
    await new Promise(r => setTimeout(r, 4000));

    console.log('Taking screenshot from (18, 4, 0) looking East...');
    await page.evaluate(() => {
        if (!window.game || !window.game.camera) return;
        window.game.camera.position.set(18, 4, 0);
        window.game.camera.lookAt(50, 4, 0);
        window.game.renderer.render(window.game.scene, window.game.camera);
    });
    await page.screenshot({ path: 'camera_view_east.png' });

    console.log('Taking screenshot from (18, 4, 0) looking West...');
    await page.evaluate(() => {
        window.game.camera.position.set(18, 4, 0);
        window.game.camera.lookAt(-50, 4, 0);
        window.game.renderer.render(window.game.scene, window.game.camera);
    });
    await page.screenshot({ path: 'camera_view_west.png' });
    
    console.log('Taking screenshot from (18, 4, 0) looking North (Maze)...');
    await page.evaluate(() => {
        window.game.camera.position.set(18, 4, 0);
        window.game.camera.lookAt(18, 4, -50);
        window.game.renderer.render(window.game.scene, window.game.camera);
    });
    await page.screenshot({ path: 'camera_view_north.png' });

    console.log('Taking screenshot from (18, 4, 0) looking South (Ice)...');
    await page.evaluate(() => {
        window.game.camera.position.set(18, 4, 0);
        window.game.camera.lookAt(18, 4, 50);
        window.game.renderer.render(window.game.scene, window.game.camera);
    });
    await page.screenshot({ path: 'camera_view_south.png' });

    await browser.close();
    console.log('Done!');
})();
