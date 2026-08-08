import { test, expect } from '@playwright/test';

test('screenshot stalker corpse close-up', async ({ page }) => {
	test.setTimeout(240000);
	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(2000);

	// Enable test mode (reduces countdown to 5s, speeds up spawn)
	await page.evaluate(() => { window.__kilo_test__ = true; });

	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForTimeout(3000);
	await page.getByRole('button', { name: /быстрые руки/i }).click({ force: true });
	await page.waitForSelector('#countdown', { timeout: 10000 });
	await page.waitForSelector('#countdown', { state: 'hidden', timeout: 120000 });
	await page.waitForTimeout(2000);

	// Wait for game state to be 'playing' (game actually started)
	await page.waitForFunction(() => {
		return window.game?.gameState === 'playing';
	}, { timeout: 120000 });

	// Find the stalker corpse and set camera close to it
	await page.evaluate(() => {
		let corpse = null;
		const scene = window.game?.scene;
		if (!scene) return;

		scene.traverse((child) => {
			if (child.userData?.isStalkerCorpse) {
				corpse = child;
			}
		});

		if (corpse) {
			const corpseWorldPos = new window.THREE.Vector3();
			corpse.getWorldPosition(corpseWorldPos);
			console.log('Corpse found at:', corpseWorldPos);

			// Pause game first to prevent camera from being overwritten
			if (window.game?.gameLoop) {
				window.game.gameLoop.paused = true;
			}

			// Set camera position directly (bypass camera controller clamping)
			const camera = window.game.camera;
			camera.position.set(
				corpseWorldPos.x + 1.5,
				corpseWorldPos.y + 1.0,
				corpseWorldPos.z + 1.5
			);
			camera.lookAt(corpseWorldPos);
		}
	});

	// Wait a frame for the change to take effect
	await page.waitForTimeout(200);
	await page.screenshot({ path: 'screenshots/corpse-closeup.png' });
});
