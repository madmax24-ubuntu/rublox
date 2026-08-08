import { test, expect } from '@playwright/test';

test('debug: find corpse', async ({ page }) => {
	test.setTimeout(120000);
	
	// Set test mode BEFORE page loads (game initializes on page load)
	await page.addInitScript(() => { window.__kilo_test__ = true; });
	
	// Collect console messages
	const logs = [];
	page.on('console', msg => logs.push(msg.text()));
	
	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(2000);

	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForSelector('#countdown', { timeout: 10000 });
	await page.waitForSelector('#countdown', { state: 'hidden', timeout: 120000 });
	await page.waitForTimeout(2000);

	// Wait for game state to be 'playing'
	await page.waitForFunction(() => {
		return window.game?.gameState === 'playing';
	}, { timeout: 120000 });

	// Find the stalker corpse
	const result = await page.evaluate(() => {
		let corpse = null;
		let hangar = null;
		const scene = window.game?.scene;
		if (!scene) return { error: 'no scene' };

		scene.traverse((child) => {
			if (child.userData?.isStalkerCorpse) corpse = child;
			if (child.userData?.mapGenerated && child.userData.isStalkerCorpse) corpse = child;
			if (child.userData?.isHangar) hangar = child;
		});

		return {
			corpseFound: !!corpse,
			hangarFound: !!hangar,
			gameState: window.game?.gameState,
			corpsePos: corpse ? { x: corpse.position.x, y: corpse.position.y, z: corpse.position.z } : null,
			corpseChildren: corpse ? corpse.children.length : 0,
		};
	});

	console.log('Result:', result);
	console.log('Console logs:', logs.filter(l => l.includes('hangar') || l.includes('corpse')));
	
	expect(result.corpseFound).toBe(true);
});
