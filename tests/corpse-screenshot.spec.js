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
			console.log('Corpse children:', corpse.children.length);
			console.log('Camera before:', window.game.camera.position);

			// Pause game first to prevent camera from being overwritten
			if (window.game) {
				window.game.isPaused = true;
				if (window.game.gameLoop) {
					window.game.gameLoop.isRunning = false;
				}
			}

			// Set camera position directly (bypass camera controller clamping)
			const camera = window.game.camera;
			camera.position.set(
				corpseWorldPos.x + 2.5,
				corpseWorldPos.y + 1.5,
				corpseWorldPos.z + 2.5
			);
			camera.lookAt(corpseWorldPos);
			console.log('Camera after:', camera.position);
		}
	});

	// Wait a frame for the change to take effect
	await page.waitForTimeout(200);
	await page.screenshot({ path: 'screenshots/corpse-closeup.png' });
});
