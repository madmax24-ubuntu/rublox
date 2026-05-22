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
await page.waitForTimeout(8000);

await page.addInitScript(() => {
    const orig = window.THREE?.WebGLRenderer?.prototype?.render;
    if (orig) {
        let count = 0;
        window.THREE.WebGLRenderer.prototype.render = function(scene, camera) {
            count++;
            if (count <= 5 || count % 60 === 0) {
                let meshCount = 0;
                if (scene) {
                    scene.traverse(o => { if (o.isMesh) meshCount++; });
                }
                console.log('[RENDER] call#' + count + ' scene=' + !!scene + ' meshes=' + meshCount + ' canvas=' + (this.domElement?.width) + 'x' + (this.domElement?.height));
            }
            return orig.call(this, scene, camera);
        };
        console.log('[RENDER] patched');
    }
});

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();

await page.waitForTimeout(40000);

const canvasData = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'no canvas' };
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (gl) {
        const fb = new Uint8Array(4 * canvas.width * canvas.height);
        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, fb);
        let nonBlack = 0;
        let zeroBlocks = 0;
        for (let i = 0; i < fb.length; i += 4) {
            if (fb[i] > 0 || fb[i+1] > 0 || fb[i+2] > 0) nonBlack++;
            if (fb[i] === 0 && fb[i+1] === 0 && fb[i+2] === 0) zeroBlocks++;
        }
        return { fbSize: fb.length, nonBlackPixels: nonBlack, zeroBlocks, totalPixels: canvas.width * canvas.height, blackPct: ((zeroBlocks / (canvas.width * canvas.height)) * 100).toFixed(1) + '%' };
    }
    return { error: 'no gl context' };
});

console.log('Frame buffer: ' + JSON.stringify(canvasData, null, 2));

await page.screenshot({ path: './debug_render.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
