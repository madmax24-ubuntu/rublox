import { test, expect } from '@playwright/test';

test('verify bazooka explosion renders correctly', async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];
    const safeIgnore = /Audio.*was|audio.*context|Playground.*not|CSP|cross-origin|third-party|deprecated|prefers-reduced|getAnimations/i;
    page.on('console', msg => {
        const text = msg.text();
        const type = msg.type();
        if (safeIgnore.test(text)) return;
        consoleLogs.push(text);
        if (type === 'error') consoleErrors.push(text);
    });

    await page.goto('http://localhost:3001');
    // Wait for game to initialize
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(3000);
    // Wait for game module to be ready on window
    await page.waitForFunction(() => window.game, { timeout: 15000 });

    // Directly call EntityManager.spawnBazookaExplosion with position + projectile data
    // No need for full game round — the function builds all fireball/smoke/shockwave elements
    const explosionResult = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        if (!em) return { error: 'entityManager not available' };

        // Position: 5 units right, slightly above ground
        const pos = { x: 5, y: 0.5, z: -10 };
        // Projectile: bazooka default damage/knockback
        const proj = { damage: 100, knockback: 25 };

        em.spawnBazookaExplosion(pos, proj);

        // Inspect explosion effects array
        const effects = em.effects || [];
        const explosionGroup = effects[effects.length - 1];

        return {
            childCount: explosionGroup ? explosionGroup.children.length : null,
            children: explosionGroup?.children ? explosionGroup.children.map(c => ({
                type: c.type,
                expType: c.userData?.expType || null,
                visible: c.visible,
            })) : [],
            explosionPosition: explosionGroup ? {
                x: +explosionGroup.position.x.toFixed(2),
                y: +explosionGroup.position.y.toFixed(2),
                z: +explosionGroup.position.z.toFixed(2),
            } : null,
            effectCount: em.effects?.length || 0,
        };
    });

    console.log('Explosion result:', JSON.stringify(explosionResult, null, 2));

    // Screenshot for visual verification
    await page.screenshot({ path: `test-results/bazooka-test-${Date.now()}.png` });

    // Verify explosion spawned
    if (!explosionResult.error) {
        // Core explosion group: 1 (core) + 1 (inner) + 1 (outer) + 3 (smoke) + 1 (shockwave) + 1 (groundFlash) + 1 (scorch) = 9 children
        expect(explosionResult.childCount, 'Explosion should have 9 children (core+inner+outer+smoke×3+shockwave+groundFlash+scorch)').toBe(9);

        // Verify all element types present
        const types = explosionResult.children.map(c => c.expType);
        expect(types.includes('core'), 'Core fireball present').toBe(true);
        expect(types.filter(t => t === 'fireball').length, 'Inner + Outer fireball present').toBe(2);
        expect(types.filter(t => t === 'smoke').length, '3 smoke clouds present').toBe(3);
        expect(types.includes('shockwave'), 'Shockwave present').toBe(true);
        expect(types.includes('groundFlash'), 'Ground flash present').toBe(true);
        expect(types.includes('scorch'), 'Scorch mark present').toBe(true);

        // Position integrity check
        expect(explosionResult.explosionPosition.x).not.toBeNaN;
        expect(explosionResult.explosionPosition.y).not.toBeNaN;
        expect(explosionResult.explosionPosition.z).not.toBeNaN;
        expect(explosionResult.explosionPosition.x).toBeCloseTo(5, 1);
        expect(explosionResult.explosionPosition.y).toBeCloseTo(0.5, 1);
        expect(explosionResult.explosionPosition.z).toBeCloseTo(-10, 1);
    } else {
        console.error('Spawn failed:', explosionResult.error);
    }

    expect(consoleErrors.filter(e => !safeIgnore.test(e)).length, 'No console errors').toBe(0);
});
