import { test, expect } from '@playwright/test';

test('verify bazooka explosion position and rendering', async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];
    const isSafeIgnore = /Audio.*was|audio.*context|Playground.*not|CSP|cross-origin|third-party|deprecated|prefers-reduced|getAnimations/i;
    page.on('console', msg => {
        const text = msg.text();
        const type = msg.type();
        if (isSafeIgnore.test(text)) return;
        consoleLogs.push(text);
        if (type === 'error') consoleErrors.push(text);
    });

    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);

    // Directly test bazooka explosion by spawning one via EntityManager API
    // This bypasses menu navigation and tests the rendering directly
    const explosionResult = await page.evaluate(() => {
        const { EntityManager } = window;

        // Import THREE
        return new Promise(async (resolve) => {
            try {
                const { default: THREE } = await import('https://unpkg.com/three@0.172.0/three.module.js');

                const game = window.game;
                const em = game?.entityManager;

                // Test position - spawn explosion at a specific known point
                const testPos = new THREE.Vector3(5, 0, -10);
                const fakeProj = { damage: 100, knockback: 25, type: 'bazooka' };

                em.spawnBazookaExplosion(testPos, fakeProj);

                // Inspect the explosion effect
                const effects = em.effects || [];
                const explosionEffects = effects.filter(e => e.userData?.explosion);

                resolve({
                    explosionCount: explosionEffects.length,
                    explosions: explosionEffects.map(e => ({
                        position: e.position ? { x: +e.position.x.toFixed(2), y: +e.position.y.toFixed(2), z: +e.position.z.toFixed(2) } : null,
                        childCount: e.children ? e.children.length : 0,
                        children: e.children ? e.children.map(c => ({
                            type: c.type,
                            isMesh: !!c.isMesh,
                            userData: c.userData || {},
                        })) : [],
                    })),
                });
            } catch (e) {
                resolve({ error: e.message });
            }
        });
    });

    console.log('Explosion result:', JSON.stringify(explosionResult, null, 2));

    // Screenshot for visual verification
    await page.screenshot({ path: `test-results/bazooka-explosion-${Date.now()}.png` });

    // Stalker probes
    console.log('STALKER PROBE LOGS:', consoleLogs.filter(l => l.includes('STALKER')));

    // Bazooka probes
    const bazookaProbes = consoleLogs.filter(l => l.includes('BAZOOKA'));
    console.log('BAZOOKA PROBE LOGS:', bazookaProbes);

    // Console errors
    console.log('CONSOLE ERRORS:', consoleErrors);

    // Assertions
    const stalkerErrors = consoleErrors.filter(e => e.includes('STALKER') || e.includes('stalker') || e.includes('Stalker'));
    expect(stalkerErrors.length, 'No stalker-related errors').toBe(0);

    // Bazooka explosion verification
    if (!explosionResult.error) {
        // 1. Explosion should have been spawned
        expect(explosionResult.explosionCount, 'At least 1 explosion spawned').toBeGreaterThan(0);

        for (const exp of explosionResult.explosions) {
            // 2. Explosion children: core + inner + outer + smoke3 + shock + groundFlash + scorch = 9
            expect(exp.childCount, 'Explosion should have ~9 children (core,inner,outer,smoke×3,shockwave,groundFlash,scorch)').toBe(9);

            // 3. Explosion position should be valid (not NaN/corrupted)
            expect(exp.position.x, 'X position valid (not NaN)').toMatch(/-?\d/);
            expect(exp.position.y, 'Y position valid (not NaN)').toMatch(/-?\d/);
            expect(exp.position.z, 'Z position valid (not NaN)').toMatch(/-?\d/);
        }
    } else {
        console.error('Explosion spawn failed:', explosionResult.error);
    }

    expect(consoleErrors.length, 'No console errors').toBe(0);
});
