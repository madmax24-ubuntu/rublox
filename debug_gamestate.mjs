import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log('[C:' + msg.type() + '] ' + msg.text().substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Patch THREE and inject game reference
await page.evaluate(() => {
    const THREE = window.THREE;
    const orig = THREE.WebGLRenderer.prototype.render;
    let count = 0;
    THREE.WebGLRenderer.prototype.render = function(scene, camera) {
        count++;
        if (count <= 20) {
            let mc = 0;
            if (scene) scene.traverse(o => { if (o.isMesh) mc++; });
            console.log('[RENDER#' + count + '] scene=' + !!scene + ' meshes=' + mc);
        }
        return orig.call(this, scene, camera);
    };
    
    // Patch GameLoop.start too
    // Find GameLoop class - it's in module scope, but we can try to find it
    console.log('[PATCH] WebGLRenderer patched');
});

// Click start
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

// Wait for map generation
await page.waitForTimeout(20000);

// Check game state
const gameState = await page.evaluate(() => {
    // Try to find the game instance
    // Check common patterns
    let game = null;
    
    // Check if there's a global game reference
    const keys = Object.keys(window);
    for (const k of keys) {
        if (k.length < 20) continue; // skip long keys
        const val = window[k];
        if (val && typeof val === 'object' && !val.nodeType && !val instanceof window.HTMLCanvasElement) {
            const proto = Object.getPrototypeOf(val);
            const ctor = proto?.constructor?.name;
            if (ctor && (ctor.includes('Game') || ctor.includes('APP'))) {
                game = { key: k, constructor: ctor };
                break;
            }
        }
    }
    
    // Check canvas for renderer
    const canvas = document.querySelector('canvas');
    const renderer = canvas?._renderer || canvas?.renderer || canvas?.__renderer;
    
    // Check body class
    const bodyClass = document.body?.className;
    
    // Check if gameLoop exists
    const gameLoopKeys = keys.filter(k => k.toLowerCase().includes('loop') || k.toLowerCase().includes('game'));
    
    return {
        gameInstance: game,
        hasCanvas: !!canvas,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
        bodyClass,
        potentialGameKeys: gameLoopKeys.slice(0, 10),
        rendererOnCanvas: !!renderer,
        hasWindowGame: !!window.game,
        hasWindowApp: !!window.app,
    };
});

console.log('Game state: ' + JSON.stringify(gameState, null, 2));

await browser.close();
