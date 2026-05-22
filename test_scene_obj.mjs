import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log(`[ERR] ${t}`);
    else console.log(`[LOG] ${t}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(35000);

// Check scene contents - find the game's scene object
const sceneInfo = await page.evaluate(() => {
    // We need to find the THREE scene through the game instance
    // The game instance is local to DOMContentLoaded, but we can find it by looking at canvas._context or similar

    // Try to find scene from renderer
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };

    // The renderer owns the canvas. Can we access the renderer?
    // Try to find it through the canvas's parent element's data attributes

    // Alternative: check if there's a global reference
    const keys = Object.keys(window).filter(k => k.toLowerCase().includes('game') || k.toLowerCase().includes('three'));
    console.log(`[SCENE] potential globals: ${keys.slice(0, 10).join(', ')}`);

    // Check canvas._threejs or similar
    const canvasKeys = Object.getOwnPropertySymbols(canvas);
    console.log(`[SCENE] canvas symbols: ${canvasKeys.length}`);

    // Try to find the scene by looking for DOM elements that might have data attributes
    const allElements = document.querySelectorAll('*');
    let found = false;
    for (const el of allElements) {
        const keys2 = Object.keys(el).filter(k => k.startsWith('__react') || k.startsWith('$$') || k.startsWith('_react'));
        if (keys2.length > 0) {
            console.log(`[SCENE] element ${el.tagName} has keys: ${keys2.slice(0, 3).join(', ')}`);
        }
    }

    // The canvas is owned by THREE.WebGLRenderer. We can't access the renderer directly.
    // But we can check if the canvas has any texture data by looking at its size
    return {
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
    };
});

console.log('Scene info:', JSON.stringify(sceneInfo, null, 2));

// Alternative: inject a script that modifies THREE.WebGLRenderer to expose the scene
const sceneInfo2 = await page.evaluate(() => {
    // Patch WebGLRenderer to expose the scene
    const OriginalRenderer = window.THREE?.WebGLRenderer;
    if (OriginalRenderer) {
        const originalRender = OriginalRenderer.prototype.render;
        OriginalRenderer.prototype.render = function(scene, camera) {
            // Store scene reference
            window._renderedScene = scene;
            window._renderedCamera = camera;
            return originalRender.call(this, scene, camera);
        };
    }

    // Now manually traverse any scene we can find
    // Check if there's a scene on the canvas's renderer
    const canvas = document.querySelector('canvas');

    // Try to find renderer through canvas
    // In Three.js, canvas._renderer is sometimes set
    const renderer = canvas._renderer || canvas.__renderer;

    if (renderer) {
        console.log(`[SCENE] found renderer: ${Object.keys(renderer).filter(k => !k.startsWith('_')).slice(0, 10).join(',')}`);
    }

    return { found: !!renderer };
});

console.log('Scene info2:', JSON.stringify(sceneInfo2, null, 2));

// Screenshot
await page.screenshot({ path: './test_scene.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
