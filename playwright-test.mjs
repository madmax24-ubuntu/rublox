import { chromium } from 'playwright';

const url = 'http://localhost:3001/';

console.log('=== GAME TEST SUITE ===\n');
console.log('Target:', url);

const browser = await chromium.launch({
    headless: false,
    args: [
        '--start-fullscreen',
        '--disable-gpu',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
        '--use-gl=swiftshader',
        '--use-pref-control=true'
    ]
});
const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
});
const page = await context.newPage();

// Capture console messages
page.on('console', msg => {
    const text = msg.text();
    if (text.includes('error') || text.includes('Error')) {
        console.log('⚠️  Console:', text);
    }
});
page.on('pageerror', err => {
    console.log('❌  Page Error:', err.message);
});

console.log('\n📍 Step 1: Opening game...');
await page.goto(url);
await page.waitForTimeout(2000);

let screenshots = [];
let errorCount = 0;

async function screenshot(name) {
    const buf = await page.screenshot({ fullPage: false });
    screenshots.push({ name, data: buf });
    console.log(`📷 ${name}: ${buf.length} bytes`);
    return buf;
}

// Check loading screen
console.log('\n📍 Step 2: Checking loading screen...');
await page.waitForTimeout(1000);
await screenshot('loading-screen');

// Click start button
console.log('\n📍 Step 3: Clicking "Начать игру"...');
const startBtn = await page.$('#startButtonDesktop') || await page.$('#startButtonMobile') || await page.$('#startButton') || await page.$('button');
if (startBtn) {
    await startBtn.click();
    console.log('✅ Start button clicked');
} else {
    console.log('❌ Start button not found');
    await screenshot('no-start-button');
}

await page.waitForTimeout(5000);
console.log('\n📍 Step 4: Waiting for map generation...');
await screenshot('after-click-5s');

// Check game state
console.log('\n📍 Step 5: Checking game state...');
const gameState = await page.evaluate(() => {
    if (!window.game) return { error: 'window.game not found' };
    return {
        initialized: window.game.initialized,
        isStarted: window.game.isStarted,
        sceneChildren: window.game.scene?.children?.length || 0,
        spawnPads: window.game.map?.getSpawnPads?.()?.length || 0,
        colliders: window.game.map?.getColliders?.()?.length || 0,
        playerPos: window.game.player?.position,
        gameState: window.game.gameState,
        mapChildren: window.game.map?.scene?.children?.length || 'N/A'
    };
});

console.log('Game State:', JSON.stringify(gameState, null, 2));

await screenshot('game-state-check');

// Wait more for full initialization
console.log('\n📍 Step 6: Waiting for full initialization...');
await page.waitForTimeout(5000);
await screenshot('after-10s-total');

// Check state again
const gameState2 = await page.evaluate(() => {
    if (!window.game) return { error: 'window.game not found' };
    return {
        initialized: window.game.initialized,
        isStarted: window.game.isStarted,
        sceneChildren: window.game.scene?.children?.length || 0,
        spawnPads: window.game.map?.getSpawnPads?.()?.length || 0,
        colliders: window.game.map?.getColliders?.()?.length || 0,
        playerPos: window.game.player?.position,
        gameState: window.game.gameState,
        bots: window.game.bots?.length || 0,
        zoneRadius: window.game.zone?.currentRadius,
        rendererSize: window.game.renderer?.domElement ? `${window.game.renderer.domElement.offsetWidth}x${window.game.renderer.domElement.offsetHeight}` : 'N/A'
    };
});

console.log('Game State (after 10s):', JSON.stringify(gameState2, null, 2));

await screenshot('game-state-after-10s');

// Take camera view screenshots from different angles
if (gameState2.isStarted) {
    console.log('\n📍 Step 7: Camera view screenshots...');

    // Top-down view
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(0, 300, 0.01);
            window.game.camera.lookAt(0, 0, 0);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('top-down-view');

    // Side view
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(300, 100, 0);
            window.game.camera.lookAt(0, 0, 0);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('side-view');

    // Cornucopia view
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(50, 100, 50);
            window.game.camera.lookAt(0, 10, 0);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('cornucopia-view');

    // Citadel view (NW)
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(-120, 80, 120);
            window.game.camera.lookAt(-80, 5, 80);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('citadel-view');

    // Crystal grotto view (NE)
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(120, 80, 120);
            window.game.camera.lookAt(80, 5, 80);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('crystal-view');

    // Burning wastes view (SW)
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(-120, 80, -120);
            window.game.camera.lookAt(-80, 5, -80);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('wastes-view');

    // Forest view (SE)
    await page.evaluate(() => {
        if (window.game && window.game.camera) {
            window.game.camera.position.set(120, 80, -120);
            window.game.camera.lookAt(80, 5, -80);
            window.game.camera.updateProjectionMatrix();
            window.game.renderer.render(window.game.scene, window.game.camera);
        }
    });
    await page.waitForTimeout(500);
    await screenshot('forest-view');
}

// Check console errors
console.log('\n📍 Step 8: Checking for errors...');
const errorCount2 = await page.evaluate(() => {
    const errors = [];
    // Check if there are any recent errors in window
    return {
        sceneChildren: window.game?.scene?.children?.length,
        mapLoaded: !!window.game?.map,
        playerSpawned: !!window.game?.player,
        rendererExists: !!window.game?.renderer
    };
});
console.log('Final checks:', JSON.stringify(errorCount2, null, 2));

await screenshot('final-state');

// Summary
console.log('\n=== TEST SUMMARY ===');
console.log('Total screenshots:', screenshots.length);
console.log('Game State:', JSON.stringify(gameState2, null, 2));
console.log('\n✅ Test completed');

// Save screenshots
console.log('\n💾 Saving screenshots to test-results/');
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const testDir = join(process.cwd(), 'test-results');
try {
    import('fs').then(fs => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        screenshots.forEach((s, i) => {
            writeFileSync(join(testDir, `${s.name}.png`), s.data);
            console.log(`  Saved: test-results/${s.name}.png`);
        });
    });
} catch (e) {
    console.log('Could not save screenshots:', e.message);
}

await browser.close();
console.log('\n🏁 Browser closed. Test complete!');
