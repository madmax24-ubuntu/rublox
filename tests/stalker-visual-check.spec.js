import { test, expect } from '@playwright/test';

test('stalker visual check', async ({ page }) => {
    await page.goto('http://localhost:3001');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);

    const titleBtn = await page.$$('[class="start-btn"]');
    if (titleBtn.length > 0) {
        await page.click('[class="start-btn"]', { force: true });
    }
    await page.waitForTimeout(500);

    const perkButtons = await page.$$('[class="perk-btn"]');
    if (perkButtons.length > 0) {
        const pick = await page.$('button.perk-btn[data-perk]');
        if (pick) await pick.click({ force: true });
        else await perkButtons[0].click({ force: true });
    }
    await page.waitForTimeout(2000);

    const roundStarted = await page.evaluate(() => !!window.game?.hud?.hasOverlay);
    if (roundStarted) await page.waitForTimeout(3000);

    // Force spawn stalker
    const result = await page.evaluate(() => {
        const game = window.game;
        const zp = game?.zombiePool;
        const player = game?.player;
        if (!zp || !player) return { spawned: false };
        const pos = new (player.position.constructor)(player.position.x + 5, player.position.y + 0.5, player.position.z - 3);
        try { zp.acquire(pos, 'stalker'); return { spawned: true }; }
        catch(e) { return { spawned: false, reason: e?.message }; }
    });

    await page.waitForTimeout(1500);

    // Zoom in on stalker
    await page.mouse.move(600, 250);
    await page.mouse.wheel(0, -200);
    await page.waitForTimeout(500);

    await page.screenshot({ path: 'screenshots/stalker-living-visual.png' });

    if (result.spawned) {
        await page.addStyleTag({ content: 'body { outline: 2px solid lime; }' });
        // Wait a moment for stalker to become visible
        await page.waitForTimeout(500);
        
        // Kill stalker to check corpse
        await page.mouse.click(600, 250, { clickCount: 1 });
        await page.waitForTimeout(1500);
        
        // Zoom closer
        await page.mouse.move(500, 200);
        await page.mouse.wheel(0, -400);
        await page.waitForTimeout(500);
        
        await page.screenshot({ path: 'screenshots/stalker-corpse-visual.png' });
    }

    console.log('Spawned:', result);
    expect(result.spawned, 'Stalker should spawn').toBe(true);
});