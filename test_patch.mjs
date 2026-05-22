import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Patch THREE before the page loads
await page.addInitScript(() => {
    if (window.THREE && THREE.WebGLRenderer) {
        const origRender = THREE.WebGLRenderer.prototype.render;
        THREE.WebGLRenderer.prototype.render = function(scene, camera) {
            window._patchedScene = scene;
            window._patchedCamera = camera;
            return origRender.call(this, scene, camera);
        };
        console.log('[PATCH] WebGLRenderer patched');
    }
});

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

// Check the patched scene
const info = await page.evaluate(() => {
    const scene = window._patchedScene;
    const camera = window._patchedCamera;

    if (!scene) return { error: 'no scene' };

    let meshCount = 0;
    let sampleMeshes = [];
    let lightCount = 0;

    scene.traverse((obj) => {
        if (obj.isMesh) {
            meshCount++;
            if (sampleMeshes.length < 8) {
                const mat = obj.material;
                sampleMeshes.push({
                    name: obj.name || '(unnamed)',
                    hasMat: !!mat,
                    hasMap: mat && !!mat.map,
                    color: mat ? { r: Math.round(mat.color?.r * 255), g: Math.round(mat.color?.g * 255), b: Math.round(mat.color?.b * 255) } : null,
                    metalness: mat?.metalness,
                    roughness: mat?.roughness,
                    y: obj.position?.y,
                });
            }
        }
        if (obj.isLight) {
            lightCount++;
        }
    });

    return {
        meshCount,
        lightCount,
        camera: {
            x: camera?.position?.x,
            y: camera?.position?.y,
            z: camera?.position?.z,
            fov: camera?.fov,
        },
        samples: sampleMeshes,
    };
});

console.log('Patched scene info:', JSON.stringify(info, null, 2));

// Screenshot
await page.screenshot({ path: './test_patch.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
