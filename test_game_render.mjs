import { chromium } from 'playwright';

const browser = await chromium.launch({
    headless: true,
    args: ['--headless=new', '--no-sandbox', '--use-gl=swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    if (msg.type() === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});
page.on('pageerror', err => {
    console.log('[PAGEERR] ' + err.message.substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

// Click start button
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
console.log('[Test] Start button clicked');

// Wait for map generation (takes ~15-20s for 8500+ meshes)
await page.waitForTimeout(30000);
console.log('[Test] 30s elapsed, checking state...');

// Detailed canvas/scene info
const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
    const canvasStyle = canvas ? getComputedStyle(canvas) : null;

    // Count meshes via console.log from game
    let meshCount = 0;
    let lightCount = 0;
    let sceneChildren = 0;
    // Access via window.THREE scene if available
    const gameRoot = document.getElementById('gameRoot');
    if (gameRoot) {
        // Check for any canvas children
        const canvases = gameRoot.querySelectorAll('canvas');
        console.log('[Test] Canvas count in gameRoot: ' + canvases.length);
    }

    // WebGL info
    let glInfo = {};
    if (gl) {
        const dbg = gl.getExtension('WEBGL_debug_renderer_info');
        glInfo = {
            renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(37438),
            vendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : gl.getParameter(37485),
            version: gl.getParameter(37479),
            glError: null,
        };
    }

    // Sample center pixel via readPixels
    let pixelSample = null;
    if (gl) {
        try {
            const buf = new Uint8Array(4);
            gl.readPixels(640, 360, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
            pixelSample = { r: buf[0], g: buf[1], b: buf[2], a: buf[3] };
        } catch(e) {
            pixelSample = { error: e.message };
        }
    }

    return {
        canvas: {
            exists: !!canvas,
            width: canvas?.width,
            height: canvas?.height,
            rect: canvas?.getBoundingClientRect?.().toJSON(),
            display: canvasStyle?.display,
            bg: canvasStyle?.backgroundColor,
            opacity: canvasStyle?.opacity,
            zIndex: canvasStyle?.zIndex,
            visible: canvas ? canvas.offsetParent !== null : false,
        },
        gl: glInfo,
        pixelSample,
        gameStarted: document.body?.classList?.contains('game-started'),
    };
});

console.log('Game Info: ' + JSON.stringify(info, null, 2));

// Screenshot
await page.screenshot({ path: './test_game_render.png', fullPage: false });
console.log('Screenshot saved to test_game_render.png');

await browser.close();
