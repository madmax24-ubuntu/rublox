import { chromium } from 'playwright';

const URL = 'http://localhost:3001';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    console.log('Navigating to game...');
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    
    console.log('Setting test mode via localStorage...');
    await page.waitForSelector('#startScreen', { timeout: 5000 });
    await page.evaluate(() => {
        localStorage.setItem('testMode', 'true');
    });
    
    await page.waitForTimeout(1000);

    console.log('Clicking start button...');
    try {
        await page.click('#startButtonDesktop');
    } catch {
        await page.click('#startButtonMobile');
    }

    console.log('Waiting for game initialization (map generation)...');
    await page.waitForFunction(() => typeof window.game !== 'undefined' && window.game.isStarted, { timeout: 30000 });
    
    // Force render frames and wait for map to be visible
    console.log('Forcing render frames...');
    for (let i = 0; i < 10; i++) {
        await page.evaluate(() => {
            return new Promise(resolve => requestAnimationFrame(resolve));
        });
        await page.waitForTimeout(50);
    }

    const cameraPos = await page.evaluate(() => {
        if (!window.game || !window.game.camera) return null;
        return {
            x: window.game.camera.position.x,
            y: window.game.camera.position.y,
            z: window.game.camera.position.z
        };
    });

    console.log('Camera position:', cameraPos);

    const uiStatus = await page.evaluate(() => {
        return {
            perkPanel: document.getElementById('perkPanel')?.style.display || 'missing',
            perkBackdrop: document.getElementById('perkBackdrop')?.style.display || 'missing',
            hud: document.getElementById('hud')?.style.display || 'missing'
        };
    });

    console.log('UI status:', uiStatus);

    const gameState = await page.evaluate(() => window.game?.gameState);
    console.log('Game state:', gameState);

    // Force render and take screenshot via canvas.toDataURL
    console.log('Forcing explicit renderer call...');
    const imageData = await page.evaluate(() => {
        if (!window.game || !window.game.renderer) return null;
        
        // Set a red background to verify rendering works
        window.game.scene.background = new THREE.Color(0xff0000);
        
        window.game.renderer.render(window.game.scene, window.game.camera);
        try {
            const canvas = document.querySelector('canvas');
            if (canvas) return canvas.toDataURL('image/png', 0.9);
        } catch(e) {}
        return null;
    });

    console.log('Canvas image data length:', imageData?.length || 'null');
    
    await page.screenshot({ path: 'test-map-view.png', fullPage: false });
    console.log('Screenshot saved to test-map-view.png');

    const cameraPositions = [
        { name: 'north-east', x: 100, y: 200, z: 100 },
        { name: 'south-west', x: -100, y: 200, z: -100 },
    ];

    for (const pos of cameraPositions) {
        console.log(`Moving camera to ${pos.name}...`);
        await page.evaluate((p) => {
            if (window.game && window.game.camera) {
                window.game.camera.position.set(p.x, p.y, p.z);
                window.game.camera.lookAt(0, 0, 0);
            }
        }, pos);

        for (let i = 0; i < 5; i++) {
            await page.evaluate(() => requestAnimationFrame(() => {}));
            await page.waitForTimeout(32);
        }

        const screenshotName = `test-map-${pos.name}.png`;
        await page.screenshot({ path: screenshotName });
        console.log(`Screenshot saved to ${screenshotName}`);
    }

    const objectCount = await page.evaluate(() => {
        if (!window.game || !window.game.scene) return 0;
        let count = 0;
        window.game.scene.traverse((child) => {
            if (child.isMesh || child.isGroup) count++;
        });
        return count;
    });

    console.log(`Total scene objects: ${objectCount}`);

    const hasBoundaries = await page.evaluate(() => {
        if (!window.game || !window.game.map) return false;
        let foundBrickWall = false;
        window.game.scene.traverse((child) => {
            if (child.isMesh && child.material) {
                const mat = child.material;
                if (mat.color && (mat.color.getHex() === 0x6b5a4a || mat.color.getHex() === 0x7a6a5a)) {
                    foundBrickWall = true;
                }
            }
        });
        return foundBrickWall;
    });

    console.log('Has brick boundaries:', hasBoundaries);

    console.log('\n=== TEST SUMMARY ===');
    console.log(`Camera position: ${JSON.stringify(cameraPos)}`);
    console.log(`UI elements hidden: perkPanel=${uiStatus.perkPanel}, perkBackdrop=${uiStatus.perkBackdrop}, hud=${uiStatus.hud}`);
    console.log(`Game state: ${gameState}`);
    console.log(`Scene objects: ${objectCount}`);
    console.log(`Brick boundaries found: ${hasBoundaries}`);

    await browser.close();
    console.log('\nTest completed successfully!');
})();
