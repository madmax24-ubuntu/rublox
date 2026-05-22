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

// Use addInitScript - runs before any page script
await page.addInitScript(() => {
    // Store original constructor
    const origWebGLRenderer = window.THREE?.WebGLRenderer;
    if (origWebGLRenderer) {
        const origRender = origWebGLRenderer.prototype.render;
        let count = 0;
        origWebGLRenderer.prototype.render = function(scene, camera) {
            count++;
            if (count <= 10) {
                let mc = 0;
                if (scene) scene.traverse(o => { if (o.isMesh) mc++; });
                console.log('[RENDER#' + count + '] scene=' + !!scene + ' meshes=' + mc + ' canvas=' + this.domElement?.width + 'x' + this.domElement?.height);
            }
            return origRender.call(this, scene, camera);
        };
        console.log('[INIT] WebGLRenderer.render patched');
    } else {
        console.log('[INIT] THREE not available yet');
        // Patch THREE when it becomes available
        const origDefineProperty = Object.defineProperty;
        let checkCount = 0;
        const checkThree = () => {
            if (window.THREE && window.THREE.WebGLRenderer) {
                const orig = window.THREE.WebGLRenderer.prototype.render;
                let count = 0;
                window.THREE.WebGLRenderer.prototype.render = function(scene, camera) {
                    count++;
                    if (count <= 10) {
                        let mc = 0;
                        if (scene) scene.traverse(o => { if (o.isMesh) mc++; });
                        console.log('[INIT-LATE] render#' + count + ' scene=' + !!scene + ' meshes=' + mc);
                    }
                    return orig.call(this, scene, camera);
                };
                console.log('[INIT] WebGLRenderer patched (late)');
                return true;
            }
            checkCount++;
            if (checkCount < 100) setTimeout(checkThree, 200);
        };
        checkThree();
    }
});

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(45000);

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

await page.screenshot({ path: './debug_render5.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
