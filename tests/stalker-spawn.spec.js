import { test, expect } from '@playwright/test';

test('stalker variant spawning and death pose', async ({ page }) => {
    let consoleLogs = [];
    let consoleErrors = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push(text);
        if (msg.type() === 'error') {
            consoleErrors.push(text);
        }
    });

    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Wait for round to start - click start button if on title screen
    await page.waitForTimeout(1000);
    // Check if we're on a screen with buttons (title or perk)
    const titleBtn = await page.$$('[class="start-btn"]');
    if (titleBtn.length > 0) {
        await page.click('[class="start-btn"]', { force: true });
        await page.waitForTimeout(500);
    }

    // Wait for perk selection panel and click first perk option
    await page.waitForTimeout(500);
    const perkButtons = await page.$$('[class="perk-btn"]');
    if (perkButtons.length > 0) {
        // Click first perk button with data-perk attribute
        const pick = await page.$('button.perk-btn[data-perk]');
        if (pick) {
            await pick.click({ force: true });
            await page.waitForTimeout(1000);
        } else {
            // Try clicking the generic perk btn
            await perkButtons[0].click({ force: true });
            await page.waitForTimeout(1000);
        }
    }

    // Wait for round to start (overlay disappears, game enters RoundStatus.START status)
    const roundStarted = await page.evaluate(() => {
        return !!window.game?.hud?.hasOverlay;
    });

    // If we still have an overlay, wait a bit more for round to begin
    if (roundStarted) {
        await page.waitForTimeout(3000);
    }
    if (roundStarted) {
        // Round may have a "round X started" text - wait for it to clear
        await page.waitForTimeout(2000);
    }

    // Now round is playing - simulate a few kills to trigger stalker spawning/death
    // Walk forward to find zombies, then strafe to make them come to us
    await page.keyboard.press('q');  // Use medkit to warm up (skip if no medkit)

    // Wait ~15 seconds for waves to progress - stalkers spawn later in sequence
    await page.waitForTimeout(5000);

    // Move player to attract zombies
    await page.keyboard.down('w');
    await page.waitForTimeout(1000);
    await page.mouse.move(500, 300);  // Look down for floor zombies
    await page.waitForTimeout(500);

    // Strafe to make zombies approach
    await page.mouse.move(800, 350);
    await page.waitForTimeout(1500);

    // Shoot - left click
    await page.mouse.click(400, 300, { clickCount: 1 });
    await page.waitForTimeout(500);
    await page.mouse.move(700, 300);
    await page.mouse.click(700, 300, { clickCount: 1 });
    await page.waitForTimeout(1000);

    await page.mouse.move(200, 300);
    await page.mouse.click(200, 300, { clickCount: 1 });
    await page.waitForTimeout(500);

    await page.keyboard.up('w');
    await page.waitForTimeout(2000);

    // Strafe right
    await page.keyboard.down('a');
    await page.waitForTimeout(1500);
    await page.mouse.move(600, 300);
    await page.mouse.click(600, 300, { clickCount: 1 });
    await page.keyboard.up('a');
    await page.waitForTimeout(1000);

    // Second strafe
    await page.mouse.move(300, 300);
    await page.mouse.click(300, 300, { clickCount: 1 });
    await page.waitForTimeout(500);

    // Wait for waves to progress
    await page.waitForTimeout(10000);

    // Collect comprehensive game state
    const gameInspect = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        const zp = game?.zombiePool;
        const scene = game?.scene;
        const entities = em?.entities || [];
        const pool = zp?.pool || [];

        const zombies = entities.filter(e => typeof e?.variant === 'string');
        const poolZombies = pool.filter(z => typeof z?.variant === 'string');

        const variantCounts = {};
        for (const e of entities) {
            if (typeof e?.variant === 'string') {
                const key = e.variant;
                variantCounts[key] = (variantCounts[key] || 0) + 1;
            }
        }

        let sceneCorpseCount = 0;
        if (scene) {
            scene.traverse(c => {
                if (c.userData?.variant === 'stalker') sceneCorpseCount++;
            });
        }

        const aliveStalkers = zombies.filter(e => e.variant === 'stalker' && e.isAlive);
        const deadStalkers = zombies.filter(e => e.variant === 'stalker' && !e.isAlive);

        const aliveStalkerInfo = aliveStalkers.map(e => {
            const children = e.mesh?.children || [];
            const childTypes = children.map(c => c.type);
            const headGroup = children.find(c => c.isGroup && c.position?.y > 1.2);
            return {
                id: e.id,
                childCount: children.length,
                childTypes,
                headGroupPresent: !!headGroup,
                torsoIsBufferGeo: children[0]?.geometry?.type === 'BufferGeometry',
                position: e.position ? { x: e.position.x, y: e.position.y, z: e.position.z } : null,
                canPool: e._canPool
            };
        });

        const deadStalkerInfo = deadStalkers.map(e => ({
            id: e.id,
            isCorpsified: e._isCorpsified,
            canPool: e._canPool,
            hasCorpseGroup: !!e._corpseGroup,
            corpseGroupInScene: !!(e._corpseGroup && e._corpseGroup.parent),
            corpseChildCount: e._corpseGroup?.children?.length || 0
        }));

        const poolInfo = zp ? {
            poolLength: pool.length,
            nextId: zp.nextId,
            variantCursor: zp.variantCursor,
            pooledStalkers: pool.filter(z => z.variant === 'stalker').length,
            pooledStalkerIds: pool.filter(z => z.variant === 'stalker').map(z => z.id)
        } : null;

        // Dead stalkers: inspect corpse children
        const corpseStructures = deadStalkers.map(e => {
            if (e._corpseGroup && e._corpseGroup.parent) {
                const children = [];
                e._corpseGroup.children.forEach(c => {
                    children.push({ name: c.type, childCount: c.children ? c.children.length : 0 });
                });
                return { id: e.id, variant: e.variant, corpseStructure: children };
            }
            return null;
        }).filter(Boolean);

        return {
            gameExists: !!game,
            entityManagerExists: !!em,
            zombiePoolExists: !!zp,
            entitiesTotal: entities.length,
            zombieEntitiesInManager: zombies.length,
            zombiesInPool: poolZombies.length,
            variantCounts,
            aliveStalkersCount: aliveStalkers.length,
            deadStalkersCount: deadStalkers.length,
            sceneStalkerCorpseCount: sceneCorpseCount,
            aliveStalkerInfo,
            deadStalkerInfo,
            poolInfo,
            corpseStructures
        };
    });

    console.log('=== Game State ===');
    console.log('EntityManager:', gameInspect.entityManagerExists);
    console.log('ZombiePool:', gameInspect.zombiePoolExists);
    console.log('Entities:', gameInspect.entitiesTotal, '(zombies:', gameInspect.zombieEntitiesInManager + ')');
    console.log('Zombies in pool:', gameInspect.zombiesInPool);
    console.log('Variants:', JSON.stringify(gameInspect.variantCounts));
    console.log('Alive stalkers:', gameInspect.aliveStalkersCount, JSON.stringify(gameInspect.aliveStalkerInfo));
    console.log('Dead stalkers:', gameInspect.deadStalkersCount, JSON.stringify(gameInspect.deadStalkerInfo));
    console.log('Pool:', JSON.stringify(gameInspect.poolInfo));
    console.log('Scene stalker corpses:', gameInspect.sceneStalkerCorpseCount);
    console.log('Corpse structures:', JSON.stringify(gameInspect.corpseStructures));

    // STALKER PROBE logs
    const stalkerProbes = consoleLogs.filter(l => l.includes('STALKER_PROBE'));
    console.log('STALKER PROBE LOGS:', stalkerProbes);

    // BAZOOKA PROBE logs
    const bazookaProbes = consoleLogs.filter(l => l.includes('BAZOOKA_PROBE'));
    console.log('BAZOOKA PROBE LOGS:', bazookaProbes);

    // Console errors
    console.log('CONSOLE ERRORS:', consoleErrors);

    // Screenshot for visual verification
    await page.screenshot({ path: `test-results/stalker-debug-${Date.now()}.png` });

    // ASSERTIONS
    // 1. Basic game state
    expect(gameInspect.entityManagerExists, 'EntityManager exists').toBe(true);
    expect(gameInspect.zombiePoolExists, 'ZombiePool exists').toBe(true);

    // 2. Stalkers were spawned (at least 1 stalker exists across all states)
    const totalStalkers = gameInspect.aliveStalkersCount + gameInspect.deadStalkersCount + (gameInspect.poolInfo?.pooledStalkers || 0);
    expect(totalStalkers, `Stalker(s) should be spawned (alive+dead+pooled=${totalStalkers})`).toBeGreaterThan(0);

    // 3. No stalker-related errors (crash was caused by uninitialized materials)
    const stalkerErrors = consoleErrors.filter(e => e.includes('STALKER') || e.includes('stalker') || e.includes('Stalker'));
    expect(stalkerErrors.length, 'No stalker-related errors').toBe(0);

    // 4. Alive stalker mesh has 20 children (new geometry-based structure)
    if (gameInspect.aliveStalkersCount > 0) {
        for (const s of gameInspect.aliveStalkerInfo) {
            expect(s.childCount, `Stalker #${s.id} running mesh should have 20 children (has ${s.childCount})`).toBe(20);
            expect(s.headGroupPresent, `Stalker #${s.id} must have headGroup`).toBe(true);
            expect(s.torsoIsBufferGeo, `Stalker #${s.id} torso must use BufferGeometry (not BoxGeometry)`).toBe(true);
        }
    }

    // 5. Dead stalker corpse has nested Groups (not flat lying mesh)
    const deadStalkersWithCorpses = gameInspect.deadStalkerInfo.filter(s => s.hasCorpseGroup && s.corpseGroupInScene);
    if (deadStalkersWithCorpses.length > 0) {
        expect(deadStalkersWithCorpses.length, 'At least 1 dead stalker has corpse in scene').toBeGreaterThan(0);
        for (const s of deadStalkersWithCorpses) {
            const cs = gameInspect.corpseStructures.find(c => c.id === s.id);
            const hasNestedGroups = cs && cs.corpseStructure.some(c => c.type === 'Group');
            expect(hasNestedGroups, `Stalker #${s.id} corpse should have nested groups`).toBe(true);
        }
    }

    // 6. Bazooka explosion probe fired (if bazooka was used) - this is soft check
    //    Bazooka requires player to own it, may not be present in this test
    //    Stalker spawn/crash fix is the main thing we're verifying

    // 7. No general console errors
    expect(consoleErrors.length, 'No console errors').toBe(0);
});
