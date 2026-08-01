import { test, expect } from '@playwright/test';

test('Yandex build boots, reports ready and preserves loot-phase rules', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => { window.__kilo_test__ = true; });
  await page.route('**/sdk.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.__ygCalls=[];window.YaGames={init:async()=>({environment:{i18n:{lang:'ru'}},features:{LoadingAPI:{ready(){window.__ygCalls.push('ready')}},GameplayAPI:{start(){window.__ygCalls.push('start')},stop(){window.__ygCalls.push('stop')}}}})}`
  }));
  await page.goto('http://localhost:3001/yandex-game/index.html?yandex=1');
  await page.waitForFunction(() => window.game?.initialized === true, null, { timeout: 60000 });
  await expect.poll(() => page.evaluate(() => window.__ygCalls.filter(call => call === 'ready').length)).toBe(1);
  await expect(page).toHaveTitle('Rubo Arena: Голодные игры');
  const state = await page.evaluate(async () => {
    const game = window.game;
    const first = game.bots[0];
    const second = game.bots[1];
    const initialVitality = first.health + first.armor;
    first.noCombatUntil = performance.now() + 10000;
    first.takeDamage(20, false, second);
    const lootVitality = first.health + first.armor;
    first.noCombatUntil = performance.now() - 1;
    first.takeDamage(20, false, second);
    const combatVitality = first.health + first.armor;
    await game.lootManager.generateChestsAsync();
    return {
      bots: game.bots.length,
      scaleStable: game.bots.every(bot => Math.abs(bot.mesh.scale.x - bot.baseModelScale) < 0.0001),
      lootVitality,
      initialVitality,
      combatVitality,
      chestCount: game.lootManager.chests.length,
      maxChestY: Math.max(...game.lootManager.chests.filter(chest => !chest.userData.isSupplyDrop).map(chest => chest.position.y), -Infinity)
    };
  });
  expect(state.bots).toBeGreaterThanOrEqual(99);
  expect(state.scaleStable).toBe(true);
  expect(state.lootVitality).toBe(state.initialVitality);
  expect(state.combatVitality).toBeLessThan(state.lootVitality);
  expect(state.chestCount).toBeGreaterThan(0);
  expect(state.maxChestY).toBeLessThanOrEqual(0.05);
  await page.click('#startButtonDesktop', { force: true });
  await page.waitForFunction(() => window.game?.isStarted === true);
  await page.locator('[data-perk]').first().click({ force: true });
  await page.waitForFunction(() => window.game?.perkLocked === true);
  await expect.poll(() => page.evaluate(() => window.__ygCalls.filter(call => call === 'start').length)).toBeGreaterThan(0);
  const spawnProfile = await page.evaluate(async () => {
    window.game.gameState = 'playing';
    window.game.isPaused = true;
    window.game.queueZombieBurst(false, 1, 104, 24, 6, null, true);
    const slices = [];
    while (window.game.pendingZombieBursts.length) {
      window.game.spawnBurstCooldown = 0;
      const started = performance.now();
      window.game.processDeferredSpawns(0.02);
      slices.push(performance.now() - started);
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    window.game.isPaused = false;
    return {
      maxSlice: Math.max(...slices),
      zombies: window.game.zombies.filter(zombie => zombie.isAlive).length
    };
  });
  expect(spawnProfile.zombies).toBe(24);
  expect(spawnProfile.maxSlice).toBeLessThan(20);
  expect(errors).toEqual([]);
});
