import playwright from 'playwright';
import fs from 'fs';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Error') || text.includes('error')) console.log(`[Error] ${text.substring(0, 200)}`);
});
page.on('pageerror', err => console.log(`[PageError] ${err.message}`));

// Set test mode BEFORE page loads
await page.addInitScript(() => {
    window.testMode = true;
    localStorage.setItem('testMode', 'true');
    window.gameConfig = { testMode: true };
});

await page.goto('http://localhost:3001/', { waitUntil: 'load', timeout: 15000 });
await page.waitForTimeout(5000);

// Start game and disable camera sync
await page.evaluate(async () => {
    if (window.game && !window.game.isStarted) {
        await window.game.startGame();
    }
    
    const g = window.game;
    if (g && g.camera && g.scene && g.player) {
        // Disable camera sync
        g.syncCameraToPlayer = () => {};
        if (g.cameraController) g.cameraController.update = () => {};
        
        // Disable Player.updateCamera
        g.player.updateCamera = () => {};
        
        // Detach camera from player pitch
        if (g.player?.pitch && g.player.pitch.children.includes(g.camera)) {
            g.player.pitch.remove(g.camera);
        }
        if (g.camera.parent && g.camera.parent !== g.scene) {
            g.camera.parent.remove(g.camera);
        }
        g.scene.add(g.camera);
        
        // Set top-down camera
        g.camera.position.set(0, 400, 0);
        g.camera.up.set(0, 0, -1);
        g.camera.far = 5000;
        g.camera.lookAt(0, 0, 0);
        g.camera.updateProjectionMatrix();
        
        // Hide player
        g.player.position.set(0, 0, 0);
        g.player.visible = false;
        
        // Render scene
        g.renderer.render(g.scene, g.camera);
    }
});

// Wait for map to render
for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
        const g = window.game;
        if (g && g.camera && g.scene) {
            g.syncCameraToPlayer = () => {};
            if (g.cameraController) g.cameraController.update = () => {};
            if (g.player?.updateCamera) g.player.updateCamera = () => {};
            
            if (g.player?.pitch && g.player.pitch.children.includes(g.camera)) {
                g.player.pitch.remove(g.camera);
            }
            if (g.camera.parent && g.camera.parent !== g.scene) {
                g.camera.parent.remove(g.camera);
            }
            g.scene.add(g.camera);
            g.camera.position.set(0, 400, 0);
            g.camera.up.set(0, 0, -1);
            g.camera.far = 5000;
            g.camera.lookAt(0, 0, 0);
            g.camera.updateProjectionMatrix();
            if (g.player) {
                g.player.position.set(0, 0, 0);
                g.player.visible = false;
            }
            g.renderer.render(g.scene, g.camera);
        }
    });
    const state = await page.evaluate(() => {
        const g = window.game;
        return {
            isStarted: g?.isStarted,
            renderFrameCount: g?.renderFrameCount,
            sceneChildren: g?.scene?.children?.length || 0,
            cameraPos: g?.camera?.position ? `${g.camera.position.x},${g.camera.position.y},${g.camera.position.z}` : 'none',
            cameraRot: g?.camera?.rotation ? `${g.camera.rotation.x.toFixed(2)},${g.camera.rotation.y.toFixed(2)},${g.camera.rotation.z.toFixed(2)}` : 'none',
            cameraParent: g?.camera?.parent?.type || 'none',
            playerVisible: g?.player?.visible
        };
    });
    console.log(`[${i*3}s]`, JSON.stringify(state));
    if (state.isStarted && state.renderFrameCount > 30) break;
}

// Hide all UI
await page.evaluate(() => {
    document.querySelectorAll('#perkPanel, .hud-container, .perk-select-overlay, #loadingOverlay, #startScreen, .minimap-container, .crosshair, .hotbar, .health-bar, .stamina-bar, .action-buttons, .start-btn, [class*="perk"], [class*="hud"], [class*="overlay"], [class*="crosshair"], [class*="hotbar"], [class*="health"], [class*="stamina"], [class*="action"], .hud-top, .hud-bottom, .hud-left, .hud-right').forEach(el => el.style.display = 'none');
});

await page.waitForTimeout(2000);

// Take screenshot from canvas
const screenshot = await page.evaluate(() => {
    const g = window.game;
    if (g && g.renderer) {
        g.renderer.render(g.scene, g.camera);
        const canvas = g.renderer.domElement;
        return canvas.toDataURL('image/png');
    }
    return null;
});

if (screenshot) {
    const buffer = Buffer.from(screenshot.split(',')[1], 'base64');
    fs.writeFileSync('test-results/map-topdown-final.png', buffer);
    console.log('Screenshot saved from canvas');
} else {
    await page.screenshot({ path: 'test-results/map-topdown-final.png', fullPage: false });
    console.log('Screenshot saved from page');
}

await browser.close();
