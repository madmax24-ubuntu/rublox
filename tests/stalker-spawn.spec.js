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
    await page.waitForTimeout(3000);

    // Click start button
    await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
    await page.waitForTimeout(3000);

    const gameExists = await page.evaluate(() => !!window.game);
    if (!gameExists) { expect(true).toBe(false); return; }

    // Wait 25s for many zombie waves to spawn (stalker is 11th in sequence)
    await page.waitForTimeout(25000);

    // Comprehensive game state inspection
    const gameInspect = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        const zp = game?.zombiePool;
        const scene = game?.scene;
        const entities = em?.entities || [];
        const pool = zp?.pool || [];

        console.log('entities array length:', entities.length);
        console.log('pool array length:', pool.length);

        const zombies = entities.filter(e => typeof e?.variant === 'string');
        const poolZombies = pool.filter(z => typeof z?.variant === 'string');

        // Count variants
        const variantCounts = {};
        for (const e of entities) {
            if (typeof e?.variant === 'string') {
                const key = e.variant;
                const alive = e.isAlive ? 'alive' : 'dead';
                variantCounts[`${key}(${alive})`] = (variantCounts[`${key}(${alive})`] || 0) + 1;
            }
        }

        // Find stalker corpses in scene
        let sceneCorpseCount = 0;
        if (scene) {
            scene.traverse(c => {
                if (c.userData?.variant === 'stalker') sceneCorpseCount++;
            });
        }

        // Stalker zombies
        const aliveStalkers = zombies.filter(e => e.variant === 'stalker' && e.isAlive);
        const deadStalkers = zombies.filter(e => e.variant === 'stalker' && !e.isAlive);

        // Check stalker running mesh info
        const aliveStalkerInfo = aliveStalkers.map(e => ({
            id: e.id,
            childCount: e.mesh?.children?.length || 0,
            position: e.position ? { x: e.position.x, y: e.position.y, z: e.position.z } : null
        }));

        // Check stalker corpse info (dead in entities array with _corpseGroup)
        const deadStalkerInfo = deadStalkers.map(e => ({
            id: e.id,
            isCorpsified: e._isCorpsified,
            canPool: e._canPool,
            hasCorpseGroup: !!e._corpseGroup,
            corpseGroupInScene: !!(e._corpseGroup && e._corpseGroup.parent)
        }));

        // Pool info
        const poolInfo = zp ? {
            poolLength: pool.length,
            nextId: zp.nextId,
            variantCursor: zp.variantCursor,
            pooledStalkers: pool.filter(z => z.variant === 'stalker').length,
            pooledStalkerIds: pool.filter(z => z.variant === 'stalker').map(z => z.id)
        } : null;

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
            poolInfo
        };
    });

    console.log('=== Game State Inspection ===');
    console.log('EntityManager:', gameInspect.entityManagerExists);
    console.log('ZombiePool:', gameInspect.zombiePoolExists);
    console.log('Entities in manager:', gameInspect.entitiesTotal, '(zombies:', gameInspect.zombieEntitiesInManager + ')');
    console.log('Zombies in pool:', gameInspect.zombiesInPool);
    console.log('Variant breakdown:', JSON.stringify(gameInspect.variantCounts));
    console.log('Alive stalkers:', gameInspect.aliveStalkersCount, JSON.stringify(gameInspect.aliveStalkerInfo));
    console.log('Dead stalkers:', gameInspect.deadStalkersCount, JSON.stringify(gameInspect.deadStalkerInfo));
    console.log('Pool:', JSON.stringify(gameInspect.poolInfo));
    console.log('Scene stalker corpses:', gameInspect.sceneStalkerCorpseCount);

    // STALKER PROBE logs
    const stalkerProbes = consoleLogs.filter(l => l.includes('STALKER_PROBE'));
    console.log('STALKER PROBE LOGS:', stalkerProbes);

    // BAZOOKA PROBE logs
    const bazookaProbes = consoleLogs.filter(l => l.includes('BAZOOKA_PROBE'));
    console.log('BAZOOKA PROBE LOGS:', bazookaProbes);

    // Console errors
    if (consoleErrors.length > 0) {
        console.log('ALL CONSOLE ERRORS:', consoleErrors);
    }

    // Screenshot
    await page.screenshot({ path: `test-results/stalker-debug-${Date.now()}.png` });

    // Assertions
    expect(gameInspect.entityManagerExists, 'EntityManager exists').toBe(true);
    expect(gameInspect.zombiePoolExists, 'ZombiePool exists').toBe(true);
    expect(gameInspect.zombieEntitiesInManager + gameInspect.zombiesInPool, 'At least 11 zombies should exist (alive+pool)').toBeGreaterThanOrEqual(11);
    expect(gameInspect.aliveStalkersCount + gameInspect.deadStalkersCount + gameInspect.sceneStalkerCorpseCount, `At least 1 stalker should exist (got ${gameInspect.aliveStalkersCount} alive + ${gameInspect.deadStalkersCount} dead + ${gameInspect.sceneStalkerCorpseCount} corpses)`).toBeGreaterThan(0);

    // If no stalker errors, the lazy material fix is working
    const stalkerErrors = consoleErrors.filter(e => e.includes('STALKER') || e.includes('stalker') || e.includes('Stalker'));
    if (stalkerErrors.length > 0) {
        console.error('STALKER ERRORS:', stalkerErrors);
        expect(stalkerErrors.length, 'No stalker-related errors').toBe(0);
    }

    // Check running stalker has 18 children
    if (gameInspect.aliveStalkersCount > 0) {
        for (const s of gameInspect.aliveStalkerInfo) {
            expect(s.childCount, `Stalker #${s.id} running mesh should have 18 children (has ${s.childCount})`).toBe(18);
        }
    }

    // Check dead stalker corpse structure
    if (gameInspect.deadStalkersCount > 0) {
        const corpsesInScene = gameInspect.deadStalkerInfo.filter(s => s.hasCorpseGroup && s.corpseGroupInScene);
        console.log('Dead stalkers with corpse in scene:', corpsesInScene.length);

        // Verify corpse structure - should have nested groups (bodyGroup, akGroup, bpGroup, ammoGroup)
        const corpseStructures = await page.evaluate(() => {
            const game = window.game;
            const em = game?.entityManager;
            const entities = em?.entities || [];
            const results = [];
            for (const e of entities) {
                if (e && e._isCorpsified && e._corpseGroup && e._corpseGroup.parent) {
                    const corpseTypes = [...e._corpseGroup.children].map(c => ({
                        type: c.type,
                        childCount: c.children ? c.children.length : 0
                    }));
                    results.push({ id: e.id, variant: e.variant, corpseStructure: corpseTypes });
                }
            }
            return results;
        });

        for (const cs of corpseStructures) {
            if (cs.variant === 'stalker') {
                // Stalker corpse should have nested Group children
                const hasNestedGroups = cs.corpseStructure.some(c => c.type === 'Group');
                expect(hasNestedGroups, `Stalker #${cs.id} corpse should have nested groups`).toBe(true);
            }
        }
    }

    expect(consoleErrors.length, 'No console errors').toBe(0);
});
