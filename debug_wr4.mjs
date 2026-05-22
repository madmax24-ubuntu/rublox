import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(25000);

// Patch the game instance's render method directly
const patchResult = await page.evaluate(() => {
    // Find the game instance
    // Check if there's a global reference
    let game = window.game;
    
    if (!game || typeof game.render !== 'function') {
        return 'no-game-ref';
    }
    
    const origRender = game.render;
    let count = 0;
    game.render = function() {
        count++;
        if (count <= 20) {
            console.log('[GAME-RENDER#' + count + ']');
        }
        return origRender.call(this);
    };
    console.log('[PATCH] game.render patched');
    return 'patched';
});

console.log('Patch result: ' + patchResult);

await page.waitForTimeout(25000);

const fb = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return 'no-canvas';
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'no-gl';
    const data = new Uint8Array(4 * canvas.width * canvas.height);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
    let nb = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i] > 0 || data[i+1] > 0 || data[i+2] > 0) nb++;
    }
    return { nonBlack: nb, total: canvas.width * canvas.height };
});

console.log('Frame buffer: ' + JSON.stringify(fb, null, 2));

await page.screenshot({ path: './debug_wr4.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
