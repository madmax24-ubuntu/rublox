import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text()}`);
});
page.on('pageerror', err => {
    console.log(`[ERROR] ${err.message}`);
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(5000);

// Check what three exports
const threeResult = await page.evaluate(async () => {
    try {
        const three = await import('./node_modules/three/build/three.module.js');
        const keys = Object.keys(three);
        return {
            keys: keys.slice(0, 20),
            keysCount: keys.length,
            default: three.default,
            defaultType: typeof three.default,
            hasTHREE: !!three.THREE,
            hasObject3D: !!three.Object3D,
            hasVector3: !!three.Vector3,
            hasMesh: !!three.Mesh,
            hasCylinderGeometry: !!three.CylinderGeometry,
            hasMeshStandardMaterial: !!three.MeshStandardMaterial
        };
    } catch (err) {
        return { error: err.message };
    }
});
console.log('Three export check:', JSON.stringify(threeResult, null, 2));

// Check if three.module.js has a different export pattern
const threeModule = await page.evaluate(async () => {
    try {
        const three = await import('./node_modules/three/build/three.module.js');
        const defaultVal = three.default;
        if (defaultVal) {
            const dk = Object.keys(defaultVal).slice(0, 20);
            return {
                hasDefault: true,
                defaultKeys: dk,
                defaultKeysCount: Object.keys(defaultVal).length,
                hasObject3D: !!defaultVal.Object3D,
                hasVector3: !!defaultVal.Vector3,
                hasMesh: !!defaultVal.Mesh
            };
        }
        return { hasDefault: false };
    } catch (err) {
        return { error: err.message };
    }
});
console.log('Three default check:', JSON.stringify(threeModule, null, 2));

await browser.close();
