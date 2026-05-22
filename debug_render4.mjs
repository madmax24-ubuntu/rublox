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

// Inject a script that will patch THREE after the module loads
await page.evaluate(() => {
    // Create a script tag that patches THREE.WebGLRenderer
    const s = document.createElement('script');
    s.textContent = `
        // Wait for THREE to be available (it's in the module scope, but let's check globals)
        function tryPatch() {
            // Check if THREE is accessible
            if (window.THREE) {
                const orig = window.THREE.WebGLRenderer.prototype.render;
                let count = 0;
                window.THREE.WebGLRenderer.prototype.render = function(scene, camera) {
                    count++;
                    if (count <= 10) {
                        console.log('[RENDER#' + count + '] scene=' + !!scene + ' cam=' + !!camera);
                    }
                    return orig.call(this, scene, camera);
                };
                console.log('[PATCH] WebGLRenderer patched via injected script');
                return true;
            }
            return false;
        }
        if (!tryPatch()) {
            // Retry every 500ms for 10 seconds
            let retries = 0;
            const interval = setInterval(() => {
                retries++;
                if (tryPatch() || retries > 20) clearInterval(interval);
            }, 500);
        }
    `;
    document.head.appendChild(s);
    s.remove();
});

await page.waitForTimeout(3000);

// Check if patch was applied
const patchCheck = await page.evaluate(() => {
    // Check if there's a global THREE
    const hasThree = !!window.THREE;
    // Check canvas
    const canvas = document.querySelector('canvas');
    const bodyClass = document.body?.className;
    return { hasThree, hasCanvas: !!canvas, canvasW: canvas?.width, canvasH: canvas?.height, bodyClass };
});

console.log('Pre-start state: ' + JSON.stringify(patchCheck, null, 2));

// Click start
const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(45000);

// Final canvas check
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
    return { nonBlack: nb, total: canvas.width * canvas.height, pct: ((nb / (canvas.width * canvas.height)) * 100).toFixed(2) + '%' };
});

console.log('Frame buffer: ' + JSON.stringify(fb, null, 2));

await page.screenshot({ path: './debug_render4.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
