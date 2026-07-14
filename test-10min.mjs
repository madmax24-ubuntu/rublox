import { chromium } from 'playwright';
import fs from 'fs';

const pageErrors = [];
const consoleErrors = [];
const events = [];
const fpsSamples = [];
const gateStates = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', error => pageErrors.push(error.message));
page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
});

try {
    await page.goto('http://127.0.0.1:3001');
    await page.waitForFunction(() => window.game?.initialized && window.game?.map && window.game?.player, null, { timeout: 60000 });
    await page.click('#startButtonDesktop');
    await page.waitForFunction(() => window.game?.gameState === 'countdown', null, { timeout: 20000 });
    await page.evaluate(() => document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'fastRun' })));
    await page.evaluate(() => {
        game.countdownTimer = 0.05;
        game.spawnTimer = 0.05;
    });
    await page.waitForFunction(() => window.game?.gameState === 'playing', null, { timeout: 15000 });
    const hazard = await page.evaluate(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        game.player.setInvulnerable(false);
        game.player.health = 200;
        game.player.position.set(0, 2.1, 0);
        await wait(1100);
        const centerHealth = game.player.health;
        game.player.health = 200;
        game.player.position.set(-120, 2.1, -120);
        await wait(1100);
        const outsideHealth = game.player.health;
        game.player.setInvulnerable(true);
        const survivor = game.bots.find(bot => bot?.isAlive);
        survivor?.setInvulnerable?.(true);
        game._testEndRoundMessages = [];
        game.endRound = message => game._testEndRoundMessages.push(message);
        game._invalidCapture = null;
        game._eventCapture = [];
        game._lastCapturedEvent = null;
        game._invalidWatch = setInterval(() => {
            if (game._invalidCapture) return;
            game.scene.traverse(object => {
                if (!object.position || [object.position.x, object.position.y, object.position.z].every(Number.isFinite)) return;
                game._invalidCapture = { type: object.type, name: object.name, userData: Object.keys(object.userData || {}) };
            });
        }, 16);
        game._eventWatch = setInterval(() => {
            const type = game.activeEvent?.type || null;
            if (!type || type === game._lastCapturedEvent) return;
            game._lastCapturedEvent = type;
            game._eventCapture.push({ type, elapsed: performance.now() * 0.001 - game.roundStartTime });
        }, 100);
        return {
            centerHealth,
            outsideHealth,
            gatesClosed: game.map._biomeGateColliders.every(collider => collider.enabled),
            domeVisible: !!game.laserDome?.visible
        };
    });
    const startedAt = Date.now();
    let previousEvent = null;
    while (Date.now() - startedAt < 600000) {
        const sample = await page.evaluate(async () => {
            game.player.isAlive = true;
            game.player.isFrozen = false;
            game.player.health = game.player.maxHealth;
            game.player.setInvulnerable(true);
            const survivor = game.bots[0];
            if (survivor) {
                survivor.isAlive = true;
                survivor.isFrozen = false;
                survivor.health = survivor.maxHealth;
                survivor.setInvulnerable(true);
            }
            const activeEvent = game.activeEvent?.type || null;
            let frames = 0;
            const start = performance.now();
            await new Promise(resolve => {
                const tick = now => {
                    frames++;
                    if (now - start >= 1000) resolve();
                    else requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            });
            const invalid = [];
            game.scene.traverse(object => {
                if (!object.position) return;
                if (![object.position.x, object.position.y, object.position.z].every(Number.isFinite)) invalid.push(object.name || object.type);
            });
            return {
                activeEvent,
                fps: frames,
                state: game.gameState,
                elapsed: performance.now() * 0.001 - game.roundStartTime,
                aliveBots: game.bots.filter(bot => bot?.isAlive).length,
                aliveZombies: game.zombies.filter(zombie => zombie?.isAlive).length,
                gatesOpen: game.map._biomeGateColliders.every(collider => !collider.enabled),
                invalid,
                capturedInvalid: game._invalidCapture
            };
        });
        fpsSamples.push(sample.fps);
        gateStates.push({ elapsed: sample.elapsed, open: sample.gatesOpen });
        if (sample.activeEvent && sample.activeEvent !== previousEvent) events.push({ type: sample.activeEvent, elapsed: sample.elapsed });
        previousEvent = sample.activeEvent;
        if (sample.invalid.length || sample.capturedInvalid) throw new Error(`Invalid scene positions: ${JSON.stringify(sample.capturedInvalid || sample.invalid)}`);
        if (sample.state !== 'playing') throw new Error(`Game stopped early: ${sample.state} at ${sample.elapsed.toFixed(1)}s`);
        await page.waitForTimeout(9000);
    }
    const final = await page.evaluate(() => ({
        state: game.gameState,
        elapsed: performance.now() * 0.001 - game.roundStartTime,
        aliveBots: game.bots.filter(bot => bot?.isAlive).length,
        aliveZombies: game.zombies.filter(zombie => zombie?.isAlive).length,
        gatesOpen: game.map._biomeGateColliders.every(collider => !collider.enabled),
        attemptedRoundEnds: game._testEndRoundMessages.length,
        capturedEvents: game._eventCapture
    }));
    events.length = 0;
    events.push(...final.capturedEvents);
    const report = {
        durationSeconds: (Date.now() - startedAt) / 1000,
        hazard,
        final,
        events,
        gateStates,
        fps: {
            min: Math.min(...fpsSamples),
            max: Math.max(...fpsSamples),
            average: fpsSamples.reduce((sum, value) => sum + value, 0) / fpsSamples.length
        },
        pageErrors,
        consoleErrors
    };
    fs.writeFileSync('test-10min-report.json', JSON.stringify(report, null, 2));
    if (hazard.centerHealth >= 190 || hazard.outsideHealth < 195 || !hazard.gatesClosed || !hazard.domeVisible) throw new Error(`Hazard validation failed: ${JSON.stringify(hazard)}`);
    if (pageErrors.length || consoleErrors.length) throw new Error(`Runtime errors: ${JSON.stringify({ pageErrors, consoleErrors })}`);
    const expectedEvents = ['supplyDrop', 'platformOpen', 'night', 'blindness', 'radiationRain', 'storm', 'zombieRush'];
    if (expectedEvents.some(type => !events.some(event => event.type === type))) throw new Error(`Missing events: ${expectedEvents.filter(type => !events.some(event => event.type === type)).join(', ')}`);
    console.log(JSON.stringify(report, null, 2));
} finally {
    await browser.close();
}
