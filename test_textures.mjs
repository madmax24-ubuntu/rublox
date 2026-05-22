import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    const t = msg.text().substring(0, 500);
    const type = msg.type();
    if (type === 'error') console.log(`[ERR] ${t}`);
    else console.log(`[LOG] ${t}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(8000);

const btn = await page.$('#startButtonDesktop');
if (btn) await btn.click();
await page.waitForTimeout(35000);

// Check texture status on some meshes
const texInfo = await page.evaluate(() => {
    // Find the scene by patching the renderer
    let scene = null;
    let camera = null;

    // Patch THREE.WebGLRenderer to capture scene
    if (window.THREE && THREE.WebGLRenderer) {
        const origRender = THREE.WebGLRenderer.prototype.render;
        THREE.WebGLRenderer.prototype.render = function(s, c) {
            scene = s;
            camera = c;
            return origRender.call(this, s, c);
        };
    }

    if (!scene) return { error: 'scene not found via renderer patch' };

    // Sample some meshes and check their materials/textures
    const samples = [];
    let validMeshes = 0;
    let invalidMeshes = 0;
    let blackMaterials = 0;

    scene.traverse((obj) => {
        if (obj.isMesh && samples.length < 10) {
            const mat = obj.material;
            const hasTexture = mat && mat.map;
            const color = mat ? `rgb(${mat.color?.r||0},${mat.color?.g||0},${mat.color?.b||0})` : 'none';
            const metalness = mat?.metalness ?? 'N/A';
            const roughness = mat?.roughness ?? 'N/A';

            samples.push({
                name: obj.name || '(unnamed)',
                hasTexture,
                textureType: hasTexture ? (mat.map?.is ? mat.map.type : 'unknown') : 'N/A',
                color,
                metalness,
                roughness,
                position: { x: obj.position?.x || 0, y: obj.position?.y || 0, z: obj.position?.z || 0 },
                visible: obj.visible,
            });

            if (hasTexture) validMeshes++;
            else invalidMeshes++;
            if (mat && mat.color && mat.color.r < 0.1 && mat.color.g < 0.1 && mat.color.b < 0.1) blackMaterials++;
        }
    });

    // Check camera
    const camInfo = {
        position: { x: camera?.position?.x || 0, y: camera?.position?.y || 0, z: camera?.position?.z || 0 },
        fov: camera?.fov || 0,
        near: camera?.near || 0,
        far: camera?.far || 0,
    };

    // Check lights
    const lights = [];
    scene.traverse((obj) => {
        if (obj.isLight) {
            lights.push({
                type: obj.type,
                color: `rgb(${obj.color?.r||0},${obj.color?.g||0},${obj.color?.b||0})`,
                intensity: obj.intensity,
                position: { x: obj.position?.x || 0, y: obj.position?.y || 0, z: obj.position?.z || 0 },
            });
        }
    });

    return { samples, validMeshes, invalidMeshes, blackMaterials, camera: camInfo, lights };
});

console.log('Texture info:', JSON.stringify(texInfo, null, 2));

// Screenshot
await page.screenshot({ path: './test_textures.png', fullPage: false });
console.log('Screenshot saved');

await browser.close();
