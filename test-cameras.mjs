import { chromium } from 'playwright';
import fs from 'fs';

const URL = 'http://localhost:3001/?debug=true';
const screenshotDir = 'test-screenshots';

const testCameras = [
    { name: 'center_high', pos: { x: 0, y: 100, z: 0.01 }, lookAt: { x: 0, y: 0, z: 0 } },
    { name: 'center_low', pos: { x: 0, y: 15, z: 10 }, lookAt: { x: 0, y: 0, z: 0 } },
    { name: 'forest_nw', pos: { x: -158, y: 50, z: -158 }, lookAt: { x: -158, y: 0, z: -158 } },
    { name: 'stone_ne', pos: { x: 158, y: 50, z: -158 }, lookAt: { x: 158, y: 0, z: -158 } },
    { name: 'military_sw', pos: { x: -158, y: 50, z: 158 }, lookAt: { x: -158, y: 0, z: 158 } },
    { name: 'snow_se', pos: { x: 158, y: 50, z: 158 }, lookAt: { x: 158, y: 0, z: 158 } },
    { name: 'north_wall', pos: { x: 0, y: 20, z: -256 }, lookAt: { x: 0, y: 0, z: -128 } },
    { name: 'south_wall', pos: { x: 0, y: 20, z: 256 }, lookAt: { x: 0, y: 0, z: 128 } },
    { name: 'east_wall', pos: { x: 256, y: 20, z: 0 }, lookAt: { x: 128, y: 0, z: 0 } },
    { name: 'west_wall', pos: { x: -256, y: 20, z: 0 }, lookAt: { x: -128, y: 0, z: 0 } },
    { name: 'boundary_n', pos: { x: 0, y: 15, z: -60 }, lookAt: { x: 0, y: 0, z: -30 } },
    { name: 'boundary_s', pos: { x: 0, y: 15, z: 60 }, lookAt: { x: 0, y: 0, z: 30 } },
    { name: 'boundary_e', pos: { x: 60, y: 15, z: 0 }, lookAt: { x: 30, y: 0, z: 0 } },
    { name: 'boundary_w', pos: { x: -60, y: 15, z: 0 }, lookAt: { x: -30, y: 0, z: 0 } },
    // Overview cameras
    { name: 'overview_high', pos: { x: 0, y: 500, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } },
    { name: 'overview_n', pos: { x: 0, y: 200, z: -400 }, lookAt: { x: 0, y: 0, z: 0 } },
    { name: 'overview_s', pos: { x: 0, y: 200, z: 400 }, lookAt: { x: 0, y: 0, z: 0 } },
    { name: 'overview_e', pos: { x: 400, y: 200, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } },
    { name: 'overview_w', pos: { x: -400, y: 200, z: 0 }, lookAt: { x: 0, y: 0, z: 0 } },
];

(async () => {
    // Create screenshots directory
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    page.on('console', msg => console.log(`[BROWSER] ${msg.text()}`));
    page.on('pageerror', err => console.error('[PAGE ERROR]', err.message));

    console.log('Opening debug mode...');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    // Wait for game to fully load
    console.log('Waiting for game to load...');
    await page.waitForFunction(() => {
        return typeof window.game !== 'undefined' && window.game.scene !== undefined;
    }, { timeout: 30000 }).catch(() => console.log('Game load timeout, continuing...'));

    console.log('Hiding UI elements...');
    await page.evaluate(() => {
        // Hide all non-canvas elements
        document.querySelectorAll('*').forEach(el => {
            if (el.tagName !== 'CANVAS') {
                el.style.display = 'none';
            }
        });
    });

    for (const cam of testCameras) {
        console.log(`📷 Capturing: ${cam.name} at (${cam.pos.x}, ${cam.pos.y}, ${cam.pos.z})`);
        try {
            await page.evaluate((c) => {
                if (window.game && window.game.camera) {
                    window.game.camera.position.set(c.pos.x, c.pos.y, c.pos.z);
                    window.game.camera.lookAt(c.lookAt.x, c.lookAt.y, c.lookAt.z);
                    window.game.camera.updateMatrixWorld();
                }
            }, cam);
            await page.waitForTimeout(500);

            // Trigger a render to ensure the frame is updated
            await page.evaluate(() => {
                if (window.game && window.game.renderer) {
                    window.game.renderer.render(window.game.scene, window.game.camera);
                }
            });

            const screenshot = await page.screenshot({ fullPage: false });
            const filePath = `${screenshotDir}/${cam.name}.png`;
            fs.writeFileSync(filePath, screenshot);
            console.log(`✅ Saved: ${cam.name}.png`);
        } catch (err) {
            console.error(`❌ Failed to capture: ${cam.name}`, err);
        }
    }

    await browser.close();
    console.log('Test complete.');
})();
