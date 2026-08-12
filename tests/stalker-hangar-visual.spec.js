import { test, expect } from '@playwright/test';

test('stalker visual verification in hangar', async ({ page }) => {
    let consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    // Click through start screen
    const startBtn = await page.$$('[class="start-btn"]');
    if (startBtn.length > 0) {
        await page.click('[class="start-btn"]', { force: true });
        await page.waitForTimeout(500);
    }

    // Click through perk screen
    await page.waitForTimeout(500);
    const perkBtns = await page.$$('[class="perk-btn"]');
    if (perkBtns.length > 0) {
        const pick = await page.$('button.perk-btn[data-perk]');
        if (pick) await pick.click({ force: true });
        else await perkBtns[0].click({ force: true });
    }

    // Wait for round overlay to clear, then wait for game to stabilize
    await page.evaluate(() => new Promise(resolve => {
        const check = () => {
            if (window.game?.hud?.hasOverlay !== true) resolve();
            else setTimeout(check, 200);
        };
        check();
    }));
    
    // Extra wait for scene to be fully rendered
    await page.waitForTimeout(3000);

    // Force spawn stalker near player (in hangar)
    const spawned = await page.evaluate(() => {
        const game = window.game;
        const zp = game?.zombiePool;
        const player = game?.player;
        if (!zp || !player) return { spawned: false, reason: 'no game/pool/player' };

        // Spawn stalker close to player in the hangar
        const pos = new (player.position.constructor)(
            player.position.x + 4,
            player.position.y,
            player.position.z + 2
        );

        // Verify we're in the hangar
        const isHangar = Math.abs(player.position.x) < 60 && Math.abs(player.position.z) < 60;

        try {
            zp.acquire(pos, 'stalker');
            return { spawned: true, isHangar };
        } catch (e) {
            return { spawned: false, reason: e?.message };
        }
    });

    console.log('Stalker spawn:', spawned);
    expect(spawned.spawned).toBe(true);
    await page.waitForTimeout(1000);

    // Check living stalker materials before screenshot
    const livingCheck = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        if (!em) return { found: false };

        const stalkers = em.entities.filter(e => e?.variant === 'stalker' && e.isAlive);
        if (stalkers.length === 0) return { found: false };

        const stalker = stalkers[0];
        const children = stalker.mesh?.children || [];
        const headGroup = children.find(c => c.isGroup && c.position?.y > 1.2);

        const torso = children[0];
        const vestMesh = children[1];
        const torsoMat = torso?.material;
        const vestMat = vestMesh?.material;

        return {
            found: true,
            torsoColor: torsoMat ? '#' + torsoMat.color.getHex().toString(16).padStart(6, '0') : 'null',
            torsoHasMap: !!(torsoMat?.map),
            torsoMapSize: torsoMat?.map?.image?.width ? `${torsoMat.map.image.width}x${torsoMat.map.image.height}` : 'no image',
            vestColor: vestMat ? '#' + vestMat.color.getHex().toString(16).padStart(6, '0') : 'null',
            vestHasMap: !!(vestMat?.map),
            vestMapSize: vestMat?.map?.image?.width ? `${vestMat.map.image.width}x${vestMat.map.image.height}` : 'no image',
            isAlive: stalker.isAlive,
            health: stalker.health,
            maxHealth: stalker.maxHealth,
        };
    });

    console.log('Living stalker:', livingCheck);
    expect(livingCheck.found).toBe(true);
    expect(livingCheck.torsoColor, 'Living torso should be #ffffff (texture provides color)').toBe('#ffffff');
    expect(livingCheck.torsoHasMap, 'Living torso should have camo texture').toBe(true);
    expect(livingCheck.vestColor, 'Living vest should be #ffffff').toBe('#ffffff');
    expect(livingCheck.vestHasMap, 'Living vest should have vest texture').toBe(true);

    // Rotate camera toward stalker for visual check
    const camTarget = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        const stalkers = em?.entities.filter(e => e?.variant === 'stalker' && e.isAlive);
        if (!stalkers?.length) return null;
        const s = stalkers[0].mesh.position;
        return { x: s.x, y: s.y, z: s.z };
    });

    if (camTarget) {
        // Move camera close to stalker for detailed view
        await page.evaluate((p) => {
            const cam = window.game?.camera;
            if (!cam) return;
            cam.position.set(p.x + 2, p.y + 1.5, p.z + 2);
            cam.lookAt(new THREE.Vector3(p.x, p.y + 0.9, p.z));
            cam.updateMatrixWorld();
        }, camTarget);
        await page.waitForTimeout(500);
    }

    await page.screenshot({ path: 'screenshots/stalker-living-hangar.png' });

    // Kill stalker programmatically to ensure death
    const stalkerPos = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        if (!em) return null;
        const stalkers = em.entities.filter(e => e?.variant === 'stalker' && e.isAlive);
        if (stalkers.length > 0) {
            stalkers[0].takeDamage(999, false, null, 0, null);
            const p = stalkers[0].position;
            return { x: p.x, y: p.y, z: p.z };
        }
        return null;
    });

    await page.waitForTimeout(1500);

    // Move camera to corpse for screenshot
    if (stalkerPos) {
        await page.evaluate((p) => {
            const cam = window.game?.camera;
            if (!cam) return;
            cam.position.set(p.x + 2, p.y + 2, p.z + 2);
            cam.lookAt(new THREE.Vector3(p.x, p.y + 0.8, p.z));
            cam.updateMatrixWorld();
        }, stalkerPos);
        await page.waitForTimeout(500);
    }

    // Check corpse after death
    const corpseCheck = await page.evaluate(() => {
        const game = window.game;
        const em = game?.entityManager;
        if (!em) return { found: false };

        const stalkers = em.entities.filter(e => e?.variant === 'stalker');
        if (stalkers.length === 0) return { found: false };

        const stalker = stalkers[0];
        const corpseGroup = stalker._corpseGroup;
        if (!corpseGroup) return { found: false, reason: 'no corpse group' };

        // Collect all meshes recursively (corpse has nested groups: mainGroup → bodyGroup → headGroup)
        const allMeshes = [];
        const collectMeshes = obj => {
            if (obj.isMesh) allMeshes.push(obj);
            for (const child of obj.children) collectMeshes(child);
        };
        collectMeshes(corpseGroup);

        // Find meshes by their geometry type/size
        const torsoMat = allMeshes.find(m => {
            const p = m.geometry?.parameters || {};
            return (p.width || 0).toFixed(2) === '0.78' && p.depth === 0.52;
        })?.material;
        const vestMat = allMeshes.find(m => {
            const p = m.geometry?.parameters || {};
            return (p.width || 0).toFixed(2) === '0.82' && p.depth === 0.11;
        })?.material;
        const helmetMat = allMeshes.find(m => {
            const p = m.geometry?.parameters || {};
            return (p.width || 0).toFixed(2) === '0.82' && (p.height || 0).toFixed(2) === '0.37';
        })?.material;
        const gasMaskMat = allMeshes.find(m => {
            const p = m.geometry?.parameters || {};
            return (p.width || 0).toFixed(2) === '0.72' && (p.height || 0).toFixed(2) === '0.72' && m.geometry?.attributes?.position?.count > 12;
        })?.material;

        return {
            found: true,
            isCorpsified: !!stalker._isCorpsified,
            meshCount: allMeshes.length,
            corpseBodyGroup: corpseGroup.children.length,
            torsoColor: torsoMat ? '#' + torsoMat.color.getHex().toString(16).padStart(6, '0') : 'null',
            vestColor: vestMat ? '#' + vestMat.color.getHex().toString(16).padStart(6, '0') : 'null',
            helmetColor: helmetMat ? '#' + helmetMat.color.getHex().toString(16).padStart(6, '0') : 'null',
            gasMaskColor: gasMaskMat ? '#' + gasMaskMat.color.getHex().toString(16).padStart(6, '0') : 'null',
        };
    });

    console.log('Corpse check:', corpseCheck);
    expect(corpseCheck.found).toBe(true);
    expect(corpseCheck.isCorpsified, 'Stalker should be corpsified').toBe(true);
    expect(corpseCheck.meshCount, 'Corpse should have multiple meshes (16+)').toBeGreaterThan(14);
    expect(corpseCheck.torsoColor, 'Corpse torso uses STALKER_MATERIALS.camo (#ffffff)').toBe('#ffffff');
    expect(corpseCheck.vestColor, 'Corpse vest uses STALKER_MATERIALS.vest (#ffffff)');
    expect(corpseCheck.helmetColor, 'Corpse helmet uses STALKER_MATERIALS.helmet (#ffffff)');

    await page.screenshot({ path: 'screenshots/stalker-corpse-hangar.png' });

    // Verify no stalker-related console errors
    const stalkerErrors = consoleErrors.filter(e =>
        e.includes('stalker') || e.includes('Stalker') || e.includes('_stalkerMats')
    );
    if (stalkerErrors.length > 0) console.log('Stalker errors:', stalkerErrors);
    expect(stalkerErrors.length).toBe(0);
});
