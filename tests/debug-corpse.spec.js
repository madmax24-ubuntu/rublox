import { test } from '@playwright/test';

test('debug corpse test flow', async ({ page }) => {
	test.setTimeout(180000);
	
	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(2000);
	
	// Enable test mode
	await page.evaluate(() => { window.__kilo_test__ = true; });
	
	// Click start button
	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForTimeout(3000);
	
	// Select perk
	await page.getByRole('button', { name: /быстрые руки/i }).click({ force: true });
	
	// Wait for countdown to appear
	await page.waitForSelector('#countdown', { timeout: 10000 });
	console.log('Countdown appeared');
	
	// Wait for countdown to disappear
	await page.waitForSelector('#countdown', { state: 'hidden', timeout: 60000 });
	console.log('Countdown disappeared');
	
	// Wait for game state to be 'playing'
	await page.waitForFunction(() => {
		return window.game?.gameState === 'playing';
	}, { timeout: 120000 });
	console.log('Game state is now playing');
	
	// Log game state
	const state = await page.evaluate(() => window.game?.gameState);
	console.log('Current game state:', state);
	
	// Find corpse
	const corpseInfo = await page.evaluate(() => {
		let corpse = null;
		const scene = window.game?.scene;
		if (!scene) return null;
		
		scene.traverse((child) => {
			if (child.userData?.isStalkerCorpse) {
				corpse = child;
			}
		});
		
		if (corpse) {
			const pos = new window.THREE.Vector3();
			corpse.getWorldPosition(pos);
			return { found: true, x: pos.x, y: pos.y, z: pos.z };
		}
		return { found: false };
	});
	console.log('Corpse info:', corpseInfo);
});
