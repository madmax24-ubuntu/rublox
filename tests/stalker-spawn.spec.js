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

    // Check game state
    const gameExists = await page.evaluate(() => !!window.game);
    console.log('Game exists:', gameExists);

    if (!gameExists) {
        console.error('Game not loaded');
        expect(gameExists).toBe(true);
        return;
    }

    // Wait for zombies to spawn - stalker is 11th variant, need at least 11 spawns
    await page.waitForTimeout(15000);

    // Check zombie pool
    const poolState = await page.evaluate(() => {
        const mgr = window.game?.entityManager;
        if (!mgr) return null;
        const entities = mgr.entities || mgr._entities || [];
        const zombies = [];
        for (const e of entities) {
            if (e && e.isAlive !== undefined) {
                zombies.push({ id: e.id, variant: e.variant, isAlive: e.isAlive, health: e.health, maxHealth: e.maxHealth, isCorpsified: e._isCorpsified });
            }
        }
        const aliveZombies = zombies.filter(z => z.isAlive);
        const deadZombies = zombies.filter(z => !z.isAlive);
        const stalkers = zombies.filter(z => z.variant === 'stalker');
        const pool = mgr.zombiePool;
        const poolData = pool ? { poolCount: pool?.pool?.length || 0, nextId: pool?.nextId || 0, cursor: pool?.variantCursor || 0 } : null;
        return { total: zombies.length, alive: aliveZombies.length, dead: deadZombies.length, stalkersTotal: stalkers.length, stalkersData: stalkers, pool: poolData, variants: [...new Set(zombies.map(z => z.variant))] };
    });

    console.log('=== Zombie Pool State ===');
    console.log(JSON.stringify(poolState, null, 2));

    // Check for stalker console errors
    const stalkerErrors = consoleErrors.filter(e => e.includes('stalker') || e.includes('STALKER'));
    if (stalkerErrors.length > 0) {
        console.log('STALKER ERRORS:', stalkerErrors);
    }

    // Verify stalker variant exists in pool
    expect(poolState.stalkersTotal, 'Stalker zombie should be spawned').toBeGreaterThan(0);

    // For each stalker, check mesh structure
    const stalkerMeshData = await page.evaluate(() => {
        const mgr = window.game?.entityManager;
        if (!mgr) return [];
        const entities = mgr.entities || mgr._entities || [];
        const results = [];
        for (const e of entities) {
            if (e && e.variant === 'stalker') {
                const mesh = e.mesh;
                const children = mesh ? [...mesh.children] : [];
                const corpseGroup = e._corpseGroup;
                const isCorpsified = e._isCorpsified;
                results.push({
                    id: e.id,
                    variant: e.variant,
                    isAlive: e.isAlive,
                    isCorpsified,
                    childCount: children.length,
                    corpseGroupChildren: corpseGroup ? [...corpseGroup.children].map(c => ({
                        type: c.type,
                        children: c.children ? [...c.children].map(gc => gc.type) : []
                    })) : null
                });
            }
        }
        return results;
    });

    console.log('=== Stalker Mesh Data ===');
    console.log(JSON.stringify(stalkerMeshData, null, 2));

    if (stalkerMeshData.length > 0) {
        // Check running mesh child count (should be 18)
        const runningStalkers = stalkerMeshData.filter(s => s.isAlive);
        if (runningStalkers.length > 0) {
            for (const s of runningStalkers) {
                expect(s.childCount, `Stalker #${s.id} should have 18 children (has ${s.childCount})`).toBe(18);
            }
        }

        // Check death pose structure for dead stalkers
        const deadStalkers = stalkerMeshData.filter(s => s.isCorpsified);
        if (deadStalkers.length > 0) {
            for (const s of deadStalkers) {
                if (s.corpseGroupChildren) {
                    // Check for nested structure: bodyGroup, akGroup, bpGroup, ammoGroup, bloodMesh
                    const corpseTypes = s.corpseGroupChildren.map(c => c.type);
                    expect(corpseTypes.includes('Group'), `Stalker #${s.id} corpse should have nested groups`).toBe(true);
                    // Check for bloodMesh (PlaneGeometry)
                    const hasBlood = s.corpseGroupChildren.some(c => {
                        if (c.type === 'Mesh' && c.children.length === 0) return true;
                        return false;
                    });
                    expect(hasBlood, `Stalker #${s.id} corpse should have blood pool`).toBe(true);
                }
            }
        }
    }

    // Take screenshot for visual verification
    const screenshotPath = `screen-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });
    console.log('Screenshot saved:', screenshotPath);

    // Summary
    console.log('\n=== RESULTS ===');
    console.log('Console errors:', consoleErrors.length);
    console.log('Stalkers spawned:', poolState.stalkersTotal);
    console.log('Console stalker errors:', stalkerErrors.length);

    if (stalkerErrors.length > 0) {
        console.error('FAIL: Stalker spawning errors detected');
    }

    // Final checks
    expect(consoleErrors.length, 'No console errors during game').toBe(0);
});
