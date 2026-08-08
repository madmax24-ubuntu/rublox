import { test, expect } from '@playwright/test';

test('screenshot stalker corpse close-up', async ({ page }) => {
	test.setTimeout(240000);
	
	// Set test mode BEFORE page loads (game initializes on page load)
	await page.addInitScript(() => { window.__kilo_test__ = true; });
	
	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(2000);

	// Enable test mode (reduces countdown to 5s, speeds up spawn)

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

		// Find the stalker corpse and set camera close to it inside hangar
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

				// Stop game loop FIRST to prevent camera from being overwritten
				if (window.game?.gameLoop) {
					window.game.gameLoop.stop();
				}

				// Position camera above and to side of lying corpse (bird's-eye view)
				const camera = window.game.camera;
				camera.position.set(
					corpseWorldPos.x + 3,
					corpseWorldPos.y + 4,
					corpseWorldPos.z + 3
				);
				console.log('Camera positioned at:', camera.position);
				const lookTarget = new window.THREE.Vector3(corpseWorldPos.x, corpseWorldPos.y + 0.5, corpseWorldPos.z);
				camera.lookAt(lookTarget);

				// Manually render the scene after camera is set
				if (window.game?.renderer) {
					window.game.renderer.render(scene, camera);
				}
			}
		});

	// Take screenshot immediately after render
	await page.screenshot({ path: 'screenshots/corpse-closeup.png' });
});
