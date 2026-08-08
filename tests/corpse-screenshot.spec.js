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
				const corpseParent = corpse.parent;
				console.log('Corpse found at:', corpseWorldPos, 'parent:', corpseParent?.name);

				// Stop game loop FIRST to prevent camera from being overwritten
				if (window.game?.gameLoop) {
					window.game.gameLoop.stop();
				}

				// Position camera close to corpse inside hangar (2m away)
				const camera = window.game.camera;
				const hangarCenter = new window.THREE.Vector3();
				if (corpseParent) {
					corpseParent.getWorldPosition(hangarCenter);
				}
				// Camera between hangar center and corpse, 2m away from corpse
				const dir = new window.THREE.Vector3().subVectors(hangarCenter, corpseWorldPos).normalize();
				camera.position.set(
					corpseWorldPos.x + dir.x * 2,
					corpseWorldPos.y + 1.2,
					corpseWorldPos.z + dir.z * 2
				);
				console.log('Camera positioned at:', camera.position);
				const lookTarget = new window.THREE.Vector3(corpseWorldPos.x, corpseWorldPos.y + 0.6, corpseWorldPos.z);
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
