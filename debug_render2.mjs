import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log('[ERR] ' + t);
    else console.log('[LOG] ' + t);
});
page.on('pageerror', err => {
    console.log('[PAGEERR] ' + err.message.substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

// Check if start button exists and what's on the page
const pageState = await page.evaluate(() => {
    const btn = document.querySelector('#startButtonDesktop');
    const canvas = document.querySelector('canvas');
    const threeVersion = window.THREE?.version || 'none';
    const rendererExists = !!window.THREE?.WebGLRenderer;
    
    // Check if game instance exists
    const keys = Object.keys(window).filter(k => k.length > 2 && !k.startsWith('_') && !k.startsWith('__'));
    const potentialGame = keys.find(k => k.toLowerCase().includes('game') || k.toLowerCase().includes('app'));
    
    return {
        hasButton: !!btn,
        buttonText: btn?.textContent?.trim() || 'none',
        buttonDisabled: btn?.disabled,
        hasCanvas: !!canvas,
        canvasWidth: canvas?.width,
        canvasHeight: canvas?.height,
        threeVersion,
        rendererExists,
        potentialGameInstance: potentialGame,
        bodyStyle: document.body?.style?.display,
        bodyClass: document.body?.className,
    };
});

console.log('Page state: ' + JSON.stringify(pageState, null, 2));

// Now patch THREE before clicking start
await page.addInitScript(() => {
    if (window.THREE && THREE.WebGLRenderer) {
        const orig = THREE.WebGLRenderer.prototype.render;
        let count = 0;
        THREE.WebGLRenderer.prototype.render = function(scene, camera) {
            count++;
            console.log('[PATCHED-RENDER] call#' + count + ' scene=' + !!scene + ' cam=' + !!camera);
            return orig.call(this, scene, camera);
        };
        console.log('[PATCH] WebGLRenderer.render patched');
    } else {
        console.log('[PATCH] THREE not available yet at addInitScript time');
    }
});

// Re-navigate to apply patch properly
await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Check again
const afterState = await page.evaluate(() => {
    const btn = document.querySelector('#startButtonDesktop');
    const canvas = document.querySelector('canvas');
    return {
        hasButton: !!btn,
        buttonText: btn?.textContent?.trim() || 'none',
        hasCanvas: !!canvas,
        canvasW: canvas?.width,
        canvasH: canvas?.height,
    };
});

console.log('After reload: ' + JSON.stringify(afterState, null, 2));

// Click start
const btn2 = await page.$('#startButtonDesktop');
if (btn2) {
    console.log('Clicking start button...');
    await btn2.click();
}

// Watch for render calls
await page.waitForTimeout(45000);

// Check canvas
const finalCanvas = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
        const fb = new Uint8Array(4 * canvas.width * canvas.height);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, fb);
        let nonBlack = 0;
        for (let i = 0; i < fb.length; i += 4) {
            if (fb[i] > 0 || fb[i+1] > 0 || fb[i+2] > 0) nonBlack++;
        }
        return { nonBlack, total: canvas.width * canvas.height, pct: ((nonBlack / (canvas.width * canvas.height)) * 100).toFixed(2) + '%' };
    }
    return { error: 'no gl' };
});

console.log('Final canvas: ' + JSON.stringify(finalCanvas, null, 2));

await page.screenshot({ path: './debug_render2.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
