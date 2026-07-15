import { chromium, devices } from 'playwright';

const url = 'http://127.0.0.1:3001';
const run = async (mobile = false) => {
    const browser = await chromium.launch();
    const context = await browser.newContext(mobile ? { ...devices['Pixel 7'], viewport: { width: 915, height: 412 }, screen: { width: 915, height: 412 } } : { viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Ignored attempt to cancel a touchstart')) errors.push(m.text()); });
    await page.goto(url);
    await page.waitForFunction(() => window.game?.map && window.game?.player, null, { timeout: 30000 });
    await page.click(mobile ? '#startButtonMobile' : '#startButtonDesktop');
    await page.waitForFunction(() => window.game?.gameState === 'countdown', null, { timeout: 15000 });
    await page.click('#perkPanel [data-perk="fastRun"]');
    await page.evaluate(() => {
        window.game.countdownTimer = 0.05;
    });
    await page.waitForFunction(() => window.game?.gameState === 'spawn', null, { timeout: 10000 });
    const transition = await page.evaluate(() => {
        const before = game.camera.getWorldQuaternion(new THREE.Quaternion());
        const hud = getComputedStyle(document.getElementById('hud'));
        return {
            participants: game.bots.filter(bot => bot?.isAlive).length + 1,
            hudVisible: hud.display !== 'none' && hud.visibility !== 'hidden',
            pointerEvents: getComputedStyle(game.renderer.domElement).pointerEvents,
            camera: before.toArray()
        };
    });
    await page.mouse.move(640, 360);
    await page.mouse.move(760, 410, { steps: 5 });
    if (mobile) await page.evaluate(() => { game.input._lookDx = 120; game.input._lookDy = 35; });
    await page.evaluate(() => {
        game.player.position.set(82, 2, 82);
        game.bots.forEach((bot, i) => {
            const angle = i / Math.max(1, game.bots.length) * Math.PI * 2;
            const radius = 95 + i % 5 * 22;
            bot.position.set(Math.cos(angle) * radius, 2, Math.sin(angle) * radius);
            bot.group?.position.copy(bot.position);
        });
        game.spawnTimer = 0.05;
    });
    await page.waitForFunction(() => window.game?.gameState === 'playing', null, { timeout: 10000 });
    if (mobile) {
        await page.evaluate(() => {
            game.input.yaw += 0.4;
            game.input.pitch += 0.15;
        });
        await page.waitForTimeout(100);
    }
    const earlyZombies = await page.evaluate(() => game.zombies.filter(z => z?.isAlive).length);
    await page.evaluate(() => { game.roundStartTime = performance.now() * 0.001 - 46; });
    await page.waitForTimeout(1800);
    const before = await page.evaluate(() => ({ x: game.player.position.x, z: game.player.position.z }));
    if (mobile) {
        const canvas = page.locator('canvas').first();
        const box = await canvas.boundingBox();
        await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.65);
        await page.evaluate(() => {
            const input = game.input;
            input.joystick.active = true;
            input.joystick.dx = 0;
            input.joystick.dy = 1;
        });
        await page.waitForTimeout(1200);
        await page.evaluate(() => {
            const input = game.input;
            input.joystick.active = false;
            input.joystick.dy = 0;
        });
    } else {
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(1200);
        await page.keyboard.up('KeyW');
    }
    const fps = await page.evaluate(() => new Promise(resolve => {
        let frames = 0;
        const start = performance.now();
        const tick = now => {
            frames++;
            if (now - start >= 1000) resolve(frames * 1000 / (now - start));
            else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    }));
    const result = await page.evaluate(({ before, earlyZombies, fps, transition }) => {
        const after = { x: game.player.position.x, z: game.player.position.z };
        const zombies = game.entityManager.entities.filter(e => e.constructor?.name === 'Zombie' && e.isAlive);
        const bots = game.entityManager.entities.filter(e => e.constructor?.name === 'Bot' && e.isAlive);
        const chestSpots = game.map.getChestSpots?.() || [];
        const chests = game.lootManager?.chests || [];
        const unregisteredChests = chests.filter(chest => !chestSpots.some(spot => Math.hypot(spot.x - chest.position.x, spot.z - chest.position.z) < 1)).length;
        const invalidObjects = [];
        const biomeAssignments = Object.fromEntries(['forest', 'maze', 'military', 'ice'].map(name => [name, bots.filter(bot => bot.assignedBiome === name).length]));
        const biomePositions = {
            forest: bots.filter(bot => bot.position.x < 0 && bot.position.z < 0).length,
            maze: bots.filter(bot => bot.position.x > 0 && bot.position.z < 0).length,
            military: bots.filter(bot => bot.position.x < 0 && bot.position.z > 0).length,
            ice: bots.filter(bot => bot.position.x > 0 && bot.position.z > 0).length
        };
        game.scene.traverse(o => {
            if (!o.position) return;
            if (![o.position.x, o.position.y, o.position.z].every(Number.isFinite)) invalidObjects.push({ name: o.name, type: o.type, p: [o.position.x, o.position.y, o.position.z], userData: Object.keys(o.userData || {}), parent: o.parent?.type });
        });
        return {
            state: game.gameState,
            moved: Math.hypot(after.x - before.x, after.z - before.z),
            fps,
            transition,
            cameraChanged: transition.camera.some((v, i) => Math.abs(v - game.camera.getWorldQuaternion(new THREE.Quaternion()).toArray()[i]) > 1e-5),
            participants: bots.length + 1,
            earlyZombies,
            pads: game.map.spawnPads.length,
            zombies: zombies.length,
            variants: [...new Set(zombies.map(z => z.zombieType || z.variant || z.type))],
            biomeAssignments,
            biomePositions,
            chests: chests.length,
            unregisteredChests,
            invalid: invalidObjects.length,
            invalidObjects
        };
    }, { before, earlyZombies, fps, transition });
    await browser.close();
    if (errors.length || result.state !== 'playing' || result.moved < 0.5 || result.invalid || result.transition.participants !== 100 || !result.transition.hudVisible || result.transition.pointerEvents !== 'auto' || !result.cameraChanged || result.pads !== 100 || result.earlyZombies !== 0 || result.variants.length < 3 || result.chests < 60 || result.unregisteredChests !== 0) {
        throw new Error(JSON.stringify({ mobile, result, errors }));
    }
    return { mobile, result, errors };
};

console.log(JSON.stringify([await run(false), await run(true)], null, 2));
