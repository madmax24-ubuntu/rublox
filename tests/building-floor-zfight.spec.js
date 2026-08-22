import { test, expect } from '@playwright/test';

test('building floor polygonOffset is set (z-fighting fix)', async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(12000);

    const errors = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => errors.push(err.message));

    // Verify game initialized
    const init = await page.evaluate(() => ({
        gameExists: !!window.game,
        sceneExists: !!window.game?.scene,
        meshCount: window.game?.scene?.children?.filter(c => c.isMesh || c.isInstancedMesh).length || 0,
    }));

    expect(init.gameExists).toBe(true);
    expect(init.sceneExists).toBe(true);
    expect(init.meshCount).toBeGreaterThan(0, `Scene should have meshes (got ${init.meshCount})`);
    expect(errors.length).toBe(0, `No console errors. Got ${errors.length}: ${errors.join('; ')}`);

    console.log('=== Game initialized ===');
    console.log('Game:', init.gameExists, 'Scene:', init.sceneExists, 'Meshes:', init.meshCount);
    console.log('Errors:', errors.length);

    // Inspect polygonOffset on floor meshes
    const result = await page.evaluate(() => {
        const scene = window.game?.scene;
        if (!scene) return { error: 'No scene found' };

        const floors = [];
        scene.traverse(obj => {
            if (obj.isMesh && obj.material?.polygonOffset === true) {
                const geo = obj.geometry;
                const mat = obj.material;
                floors.push({
                    uuid: obj.uuid.slice(0, 6),
                    geoType: geo?.type,
                    posY: obj.position.y,
                    factor: mat.polygonOffsetFactor,
                    units: mat.polygonOffsetUnits,
                    color: mat.color?.getStyle?.() || mat.color?.getHex?.()?.toString(16),
                });
            }
        });

        return { total: floors.length, floors };
    });

    if (result.error) { expect.fail(result.error); return; }

    console.log(`=== PolygonOffset verification ===`);
    console.log('Floor meshes with polygonOffset:', result.total);

    // Assertions via expect()
    expect(result.total)
        .toBeGreaterThan(0, 'Building floors must have polygonOffset enabled');

    const invalid = result.floors.filter(f => {
        const factorOK = f.factor === 1 || f.factor === 2;
        return !factorOK || f.units !== 1;
    });
    expect(invalid.length)
        .toBe(0, 'Floor polygonOffset must be (factor:1-2, units:1). Bad: ' + JSON.stringify(invalid.slice(0, 3)));

    console.log('PASS: All building floors verified');
    await page.screenshot({ path: `test-results/building-floor-verified-${Date.now()}.png` });
});
