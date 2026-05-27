const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: false, slowMo: 0 });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

    // Capture console messages
    page.on('console', msg => {
        const text = msg.text().substring(0, 200);
        if (!text.includes('DEBUG:') && !text.includes('Camera options')) {
            console.log(`[CONSOLE ${msg.type()}]:`, text);
        }
    });
    page.on('pageerror', err => {
        console.error(`[PAGE ERROR]:`, err.message);
    });

    console.log('Navigating to game...');
    await page.goto('http://localhost:3001/');

    // Wait for start button then click
    await page.waitForSelector('#startButtonDesktop', { timeout: 10000 });
    await page.screenshot({ path: 'test-screenshots/01-start.png', fullPage: false });
    console.log('Screenshot: start screen');

    console.log('Clicking start button...');
    await page.evaluate(() => {
        const btn = document.getElementById('startButtonDesktop');
        if (btn) btn.click();
    });

    // Wait for game to initialize - check every 3 seconds
    for (let i = 0; i < 20; i++) {
        await page.waitForTimeout(3000);
        const state = await page.evaluate(() => {
            return {
                initialized: !!window.game?.initialized,
                isStarted: !!window.game?.isStarted,
                children: window.game?.scene?.children?.length || 0,
                spawnPads: window.game?.map?.getSpawnPads?.().length || 0,
                colliders: window.game?.map?.getColliders?.().length || 0,
                gameState: window.game?.gameState || 'N/A',
                playerPos: window.game?.player?.position ?
                    `${window.game.player.position.x},${window.game.player.position.y},${window.game.player.position.z}` : 'none',
                rendererW: window.game?.renderer?.domElement?.offsetWidth || 0,
                rendererH: window.game?.renderer?.domElement?.offsetHeight || 0,
                bots: window.game?.bots?.length || 0,
                zone: window.game?.zone?.currentRadius || 0
            };
        });

        const step = i + 2;
        try {
            await page.screenshot({ path: `test-screenshots/${step.toString().padStart(2, '0')}-state${step}.png`, fullPage: false });
        } catch(e) {}
        console.log(`Step ${step}: children=${state.children} gameState=${state.gameState} player=${state.playerPos}`);

        if (state.isStarted && state.children > 50) {
            console.log('GAME LOADED SUCCESSFULLY!');
            break;
        }
    }

    // Get final state
    const finalState = await page.evaluate(() => {
        return {
            initialized: !!window.game?.initialized,
            isStarted: !!window.game?.isStarted,
            children: window.game?.scene?.children?.length || 0,
            spawnPads: window.game?.map?.getSpawnPads?.().length || 0,
            colliders: window.game?.map?.getColliders?.().length || 0,
            gameState: window.game?.gameState || 'N/A',
            playerPos: window.game?.player?.position ?
                `${window.game.player.position.x},${window.game.player.position.y},${window.game.player.position.z}` : 'none',
            rendererW: window.game?.renderer?.domElement?.offsetWidth || 0,
            rendererH: window.game?.renderer?.domElement?.offsetHeight || 0,
            bots: window.game?.bots?.length || 0,
            zone: window.game?.zone?.currentRadius || 0
        };
    });
    console.log('\n=== FINAL STATE ===');
    console.log(JSON.stringify(finalState, null, 2));

    await browser.close();
    console.log('Test complete.');
    process.exit(0);
})().catch(err => {
    console.error('Test failed:', err.message);
    process.exit(1);
});
