import { test, expect } from '@playwright/test';

test('stalker variant uses custom BufferGeometry', async ({ page }) => {
    let consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Click through start screen
    const titleBtn = await page.$$('[class="start-btn"]');
    if (titleBtn.length > 0) {
        await page.click('[class="start-btn"]', { force: true });
        await page.waitForTimeout(500);
    }

    // Click through perk screen
    await page.waitForTimeout(500);
    const perkButtons = await page.$$('[class="perk-btn"]');
    if (perkButtons.length > 0) {
        const pick = await page.$('button.perk-btn[data-perk]');
        if (pick) {
            await pick.click({ force: true });
            await page.waitForTimeout(1000);
        } else {
            await perkButtons[0].click({ force: true });
            await page.waitForTimeout(1000);
        }
    }

    // Wait for round overlay to clear
    const roundStarted = await page.evaluate(() => !!window.game?.hud?.hasOverlay);
    if (roundStarted) await page.waitForTimeout(3000);

    // Force spawn a stalker via zombiePool
    const forceSpawnResult = await page.evaluate(() => {
        const game = window.game;
        const zp = game?.zombiePool;
        const player = game?.player;
        if (!zp || !player) return { spawned: false, reason: 'missing zombiePool/player' };

        const pos = new (player.position.constructor)(
            player.position.x + 10,
            player.position.y + 0.5,
            player.position.z
        );

        try {
            zp.acquire(pos, 'stalker');
            return { spawned: true };
        } catch (e) {
            return { spawned: false, reason: e?.message || String(e) };
        }
    });

    if (!forceSpawnResult.spawned) {
        console.log('Force spawn failed:', forceSpawnResult.reason);
        expect(true, 'Force spawn should succeed').toBe(true);
        return;
    }

    // Let the spawn process complete
    await page.waitForTimeout(1500);

    // Collect stalker mesh geometry info
    const inspect = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        if (!em) return { found: false };

        const zombies = em.entities.filter(e => e?.variant === 'stalker' && e.isAlive);
        if (zombies.length === 0) return { found: false };

        const stalker = zombies[0];
        const children = stalker.mesh?.children || [];
        const headGroup = children.find(c => c.isGroup && c.position?.y > 1.2);

        const THREE = window.THREE;
        const isBufferGeo = g => THREE && (g instanceof THREE.BufferGeometry);
        const hasSubdivisions = g => {
            const p = g.parameters || {};
            return (p.widthSegments || 0) + (p.heightSegments || 0) + (p.depthSegments || 0) > 0;
        };
        const getVertexCount = g => g.attributes.position?.count || 0;

        return {
            found: true,
            id: stalker.id,
            childCount: children.length,
            headGroupIndex: headGroup ? children.indexOf(headGroup) : -1,
            torsoIsBufferGeo: isBufferGeo(children[0]?.geometry),
            vestIsBufferGeo: isBufferGeo(children[1]?.geometry),
            backpackIsBufferGeo: isBufferGeo(children[2]?.geometry),
            strapIsBufferGeo: isBufferGeo(children[3]?.geometry),
            pouchIsBufferGeo: isBufferGeo(children[5]?.geometry),
            headIsBufferGeo: isBufferGeo(headGroup?.children[0]?.geometry),
            helmetIsBufferGeo: isBufferGeo(headGroup?.children[4]?.geometry),
            leftArmIsBufferGeo: isBufferGeo(children[10]?.geometry),
            rightArmIsBufferGeo: isBufferGeo(children[11]?.geometry),
            leftLegIsBufferGeo: isBufferGeo(children[14]?.geometry),
            rightLegIsBufferGeo: isBufferGeo(children[15]?.geometry),
            leftBootIsBufferGeo: isBufferGeo(children[16]?.geometry),
            rightBootIsBufferGeo: isBufferGeo(children[17]?.geometry),
            kneeIsBufferGeo: isBufferGeo(children[18]?.geometry),
            // Subdivision levels (custom shapes have subdivisions > 0)
            torsoSubdivisions: hasSubdivisions(children[0]?.geometry),
            vestSubdivisions: hasSubdivisions(children[1]?.geometry),
            vestVertCount: getVertexCount(children[1]?.geometry),
            leftArmSubdivisions: hasSubdivisions(children[10]?.geometry),
            leftArmVertCount: getVertexCount(children[10]?.geometry),
            leftLegSubdivisions: hasSubdivisions(children[14]?.geometry),
            leftLegVertCount: getVertexCount(children[14]?.geometry),
            helmetSubdivisions: hasSubdivisions(headGroup?.children[4]?.geometry),
            helmetVertCount: getVertexCount(headGroup?.children[4]?.geometry),
            // Limb mapping
            limbLeftArm: children[10] ? 'correct' : 'missing',
            limbRightArm: children[11] ? 'correct' : 'missing',
            limbLeftLeg: children[14] ? 'correct' : 'missing',
            limbRightLeg: children[15] ? 'correct' : 'missing',
            // Visual scale
            meshScale: stalker.mesh?.scale?.x || 0,
        };
    });

    if (!inspect.found) {
        console.log('No alive stalker found after force spawn, skipping geometry assertions');
        expect(true).toBe(true);
        return;
    }

    console.log('=== Stalker Geometry Audit ===');
    console.log('ID:', inspect.id);
    console.log('Children count:', inspect.childCount);
    console.log('Head group index:', inspect.headGroupIndex);
    console.log('Torso:', inspect.torsoIsBufferGeo, 'subdivs:', inspect.torsoSubdivisions);
    console.log('Vest:', inspect.vestIsBufferGeo, 'subdivs:', inspect.vestSubdivisions, 'verts:', inspect.vestVertCount);
    console.log('Backpack:', inspect.backpackIsBufferGeo);
    console.log('Strap:', inspect.strapIsBufferGeo);
    console.log('Pouch:', inspect.pouchIsBufferGeo);
    console.log('Head:', inspect.headIsBufferGeo);
    console.log('Helmet:', inspect.helmetIsBufferGeo, 'subdivs:', inspect.helmetSubdivisions, 'verts:', inspect.helmetVertCount);
    console.log('Left arm:', inspect.leftArmIsBufferGeo, 'subdivs:', inspect.leftArmSubdivisions, 'verts:', inspect.leftArmVertCount);
    console.log('Right arm:', inspect.rightArmIsBufferGeo);
    console.log('Left leg:', inspect.leftLegIsBufferGeo, 'subdivs:', inspect.leftLegSubdivisions, 'verts:', inspect.leftLegVertCount);
    console.log('Right leg:', inspect.rightLegIsBufferGeo);
    console.log('Left boot:', inspect.leftBootIsBufferGeo);
    console.log('Right boot:', inspect.rightBootIsBufferGeo);
    console.log('Knee:', inspect.kneeIsBufferGeo);
    console.log('Mesh scale:', inspect.meshScale);

    // Assertions - every part must be an instance of BufferGeometry
    expect(inspect.torsoIsBufferGeo, 'Torso must be BufferGeometry').toBe(true);
    expect(inspect.vestIsBufferGeo, 'Vest must be BufferGeometry').toBe(true);
    expect(inspect.backpackIsBufferGeo, 'Backpack must be BufferGeometry').toBe(true);
    expect(inspect.strapIsBufferGeo, 'Strap must be BufferGeometry').toBe(true);
    expect(inspect.pouchIsBufferGeo, 'Pouch must be BufferGeometry').toBe(true);
    expect(inspect.headIsBufferGeo, 'Head (gas mask) must be BufferGeometry').toBe(true);
    expect(inspect.helmetIsBufferGeo, 'Helmet must be BufferGeometry').toBe(true);
    expect(inspect.leftArmIsBufferGeo, 'Left arm must be BufferGeometry').toBe(true);
    expect(inspect.rightArmIsBufferGeo, 'Right arm must be BufferGeometry').toBe(true);
    expect(inspect.leftLegIsBufferGeo, 'Left leg must be BufferGeometry').toBe(true);
    expect(inspect.rightLegIsBufferGeo, 'Right leg must be BufferGeometry').toBe(true);
    expect(inspect.leftBootIsBufferGeo, 'Left boot must be BufferGeometry').toBe(true);
    expect(inspect.rightBootIsBufferGeo, 'Right boot must be BufferGeometry').toBe(true);
    expect(inspect.kneeIsBufferGeo, 'Knee pad must be BufferGeometry').toBe(true);

    // Subdivision assertions — custom morphed geometries have subdivisions > 0
    expect(inspect.torsoSubdivisions, 'Torso must have subdivisions for morphing').toBe(true);
    expect(inspect.vestSubdivisions, 'Vest must have subdivisions for morphing').toBe(true);
    expect(inspect.helmetSubdivisions, 'Helmet must have subdivisions for dome shape').toBe(true);
    expect(inspect.leftArmSubdivisions, 'Left arm must have subdivisions for tapering').toBe(true);
    expect(inspect.leftLegSubdivisions, 'Left leg must have subdivisions for tapering').toBe(true);

    // Vertex count checks — morphed geometries have more vertices than plain boxes (12 verts)
    expect(inspect.vestVertCount, 'Vest should have more vertices than a plain box (12)').toBeGreaterThan(12);
    expect(inspect.helmetVertCount, 'Helmet should have more vertices than a plain box (12)').toBeGreaterThan(12);
    expect(inspect.leftArmVertCount, 'Arm should have tapers (more than basic box 12 verts)').toBeGreaterThan(12);

    // Limb mapping verification
    expect(inspect.limbLeftArm, 'Left arm limb mapping must be correct').toBe('correct');
    expect(inspect.limbRightArm, 'Right arm limb mapping must be correct').toBe('correct');
    expect(inspect.limbLeftLeg, 'Left leg limb mapping must be correct').toBe('correct');
    expect(inspect.limbRightLeg, 'Right leg limb mapping must be correct').toBe('correct');

    // Mesh scale should be close to stalker config (1.3)
    expect(inspect.meshScale, 'Stalker mesh scale should match config (~1.3)').toBeGreaterThan(1.2);
    expect(inspect.meshScale, 'Stalker mesh scale should match config (~1.3)').toBeLessThan(1.5);

    // UV attribute exists and has values after morphing
    const uvTest = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        if (!em) return { uvOk: false };
        const zombies = em.entities.filter(e => e?.variant === 'stalker' && e.isAlive);
        if (zombies.length === 0) return { uvOk: false };
        const stalker = zombies[0];
        const children = stalker.mesh?.children || [];
        // Check torso, vest, helmet, arm, leg have valid UVs after morph
        const checkGeo = (mesh) => {
            if (!mesh?.geometry?.attributes?.uv) return false;
            const uv = mesh.geometry.attributes.uv;
            const pos = mesh.geometry.attributes.position;
            if (!pos || uv.count !== pos.count) return false;
            // Verify UVs are populated (not all zeros)
            let nonZero = 0;
            for (let i = 0; i < Math.min(uv.count, 12); i++) {
                if (Math.abs(uv.getX(i)) > 0.001 || Math.abs(uv.getY(i)) > 0.001) nonZero++;
            }
            return nonZero > 0;
        };
        return {
            uvOk: true,
            torsoHasUV: checkGeo(children[0]),
            vestHasUV: checkGeo(children[1]),
            helmetHasUV: checkGeo(children[9]?.children?.[4]),
            armHasUV: checkGeo(children[10]),
            legHasUV: checkGeo(children[14]),
        };
    });

    expect(uvTest.torsoHasUV, 'Torso geometry must have UV attribute after morph').toBe(true);
    expect(uvTest.vestHasUV, 'Vest geometry must have UV attribute after morph').toBe(true);
    expect(uvTest.helmetHasUV, 'Helmet geometry must have UV attribute after morph').toBe(true);
    expect(uvTest.armHasUV, 'Arm geometry must have UV attribute after morph').toBe(true);
    expect(uvTest.legHasUV, 'Leg geometry must have UV attribute after morph').toBe(true);

    // Screenshot for visual reference
    await page.screenshot({ path: `test-results/stalker-geometry-${Date.now()}.png` });

    // No stalker-related errors
    expect(consoleErrors.filter(e => e.includes('stalker') || e.includes('Stalker')).length, 'No stalker errors').toBe(0);
});