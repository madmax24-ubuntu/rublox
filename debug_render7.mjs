import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log('[C:' + msg.type() + '] ' + msg.text().substring(0, 500));
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(10000);

// Patch THREE via __THREE__ before clicking start
await page.evaluate(() => {
    if (window.__THREE__) {
        const THREE = window.__THREE__;
        console.log('[PATCH] Found __THREE__, version=' + THREE.version);
        const orig = THREE.WebGLRenderer.prototype.render;
        let count = 0;
        THREE.WebGLRenderer.prototype.render = function(scene, camera) {
            count++;
            if (count <= 10) {
                let mc = 0;
                if (scene) scene.traverse(o => { if (o.isMesh) mc++; });
                console.log('[RENDER#' + count + '] scene=' + !!scene + ' meshes=' + mc + ' cam=' + !!camera);
            }
            return orig.call(this, scene, camera);
        };
        console.log('[PATCH] WebGLRenderer.render patched!');
    } else {
        console.log('[PATCH] __THREE__ not found');
    }
});

console.log('Patch applied via __THREE__');

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
    return { nonBlack: nb, total: canvas.width * canvas.height };
});

console.log('Frame buffer: ' + JSON.stringify(fb, null, 2));

await page.screenshot({ path: './debug_render7.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
