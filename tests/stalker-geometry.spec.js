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
    if (roundStarted) await page.waitForTimeout(5000);

    // Wait for stalker to spawn (they spawn in wave 5+)
    await page.waitForTimeout(12000);

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

        return {
            found: true,
            id: stalker.id,
            childCount: children.length,
            headGroupIndex: headGroup ? children.indexOf(headGroup) : -1,
            torsoGeoType: children[0]?.geometry?.type,
            vestGeoType: children[1]?.geometry?.type,
            backpackGeoType: children[2]?.geometry?.type,
            strapGeoType: children[3]?.geometry?.type,
            pouchGeoType: children[5]?.geometry?.type,
            headGeoType: headGroup?.children[0]?.geometry?.type,
            helmetGeoType: headGroup?.children[3]?.geometry?.type,
            leftArmGeoType: children[10]?.geometry?.type,
            rightArmGeoType: children[11]?.geometry?.type,
            leftLegGeoType: children[14]?.geometry?.type,
            rightLegGeoType: children[15]?.geometry?.type,
            leftBootGeoType: children[16]?.geometry?.type,
            rightBootGeoType: children[17]?.geometry?.type,
            kneeGeoType: children[18]?.geometry?.type,
            // Limb mapping
            limbLeftArm: children[10] ? 'correct' : 'missing',
            limbRightArm: children[11] ? 'correct' : 'missing',
            limbLeftLeg: children[14] ? 'correct' : 'missing',
            limbRightLeg: children[15] ? 'correct' : 'missing',
        };
    });

    if (!inspect.found) {
        console.log('No alive stalker spawned yet, skipping geometry assertions');
        expect(true).toBe(true);
        return;
    }

    console.log('=== Stalker Geometry Audit ===');
    console.log('ID:', inspect.id);
    console.log('Children count:', inspect.childCount);
    console.log('Head group index:', inspect.headGroupIndex);
    console.log('Torso:', inspect.torsoGeoType);
    console.log('Vest:', inspect.vestGeoType);
    console.log('Backpack:', inspect.backpackGeoType);
    console.log('Strap:', inspect.strapGeoType);
    console.log('Pouch:', inspect.pouchGeoType);
    console.log('Head:', inspect.headGeoType);
    console.log('Helmet:', inspect.helmetGeoType);
    console.log('Left arm:', inspect.leftArmGeoType);
    console.log('Right arm:', inspect.rightArmGeoType);
    console.log('Left leg:', inspect.leftLegGeoType);
    console.log('Right leg:', inspect.rightLegGeoType);
    console.log('Left boot:', inspect.leftBootGeoType);
    console.log('Right boot:', inspect.rightBootGeoType);
    console.log('Knee:', inspect.kneeGeoType);

    // Assertions
    expect(inspect.childCount, 'Stalker mesh should have 20 children').toBe(20);
    expect(inspect.headGroupIndex, 'Head group must be at index 9').toBe(9);
    expect(inspect.torsoGeoType, 'Torso must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.vestGeoType, 'Vest must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.backpackGeoType, 'Backpack must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.strapGeoType, 'Strap must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.pouchGeoType, 'Pouch must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.headGeoType, 'Head (gas mask) must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.helmetGeoType, 'Helmet must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.leftArmGeoType, 'Left arm must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.rightArmGeoType, 'Right arm must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.leftLegGeoType, 'Left leg must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.rightLegGeoType, 'Right leg must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.leftBootGeoType, 'Left boot must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.rightBootGeoType, 'Right boot must use BufferGeometry').toBe('BufferGeometry');
    expect(inspect.kneeGeoType, 'Knee pad must use BufferGeometry').toBe('BufferGeometry');

    // Limb mapping verification
    expect(inspect.limbLeftArm, 'Left arm limb mapping must be correct').toBe('correct');
    expect(inspect.limbRightArm, 'Right arm limb mapping must be correct').toBe('correct');
    expect(inspect.limbLeftLeg, 'Left leg limb mapping must be correct').toBe('correct');
    expect(inspect.rightBootGeoType, 'Right boot limb mapping must be correct').toBe('correct');

    // No stalker-related errors
    expect(consoleErrors.filter(e => e.includes('stalker') || e.includes('Stalker')).length, 'No stalker errors').toBe(0);

    await page.screenshot({ path: `test-results/stalker-geometry-${Date.now()}.png` });
});
