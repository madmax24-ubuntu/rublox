import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('screenshot stalker corpse close-up', async ({ page }) => {
	test.setTimeout(240000);

	await page.addInitScript(() => { window.__kilo_test__ = true; });

	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(2000);

	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForTimeout(3000);
	await page.getByRole('button', { name: /быстрые руки/i }).click({ force: true });
	await page.waitForSelector('#countdown', { timeout: 10000 });
	await page.waitForSelector('#countdown', { state: 'hidden', timeout: 120000 });
	await page.waitForTimeout(2000);

	await page.waitForFunction(() => {
		return window.game?.gameState === 'playing';
	}, { timeout: 120000 });

	// Use game's renderer directly - textures are already in WebGL context
	const result = await page.evaluate(() => {
		const THREE = window.THREE;
		const scene = window.game?.scene;
		const camera = window.game?.camera;
		const renderer = window.game?.renderer;
		if (!scene || !camera || !renderer) return { error: 'missing game objects' };

		// Stop game loop
		if (window.game?.gameLoop) window.game.gameLoop.stop();

		// Find corpse
		let corpse = null;
		scene.traverse((child) => {
			if (child.userData?.isStalkerCorpse) {
				corpse = child;
			}
		});
		if (!corpse) return { error: 'corpse not found' };

		// Save state
		const origParent = corpse.parent;
		const origCamParent = camera.parent;
		const origBackground = scene.background;

		// Move corpse to scene root (so it renders even if parent is hidden)
		if (origParent) origParent.remove(corpse);
		scene.add(corpse);

		// Hide everything else in scene (including player mesh which contains weapon)
		const origVisibility = new Map();
		scene.children.forEach(child => {
			if (child !== corpse && child !== camera) {
				origVisibility.set(child, child.visible);
				child.visible = false;
			}
		});
		// Also hide player mesh to hide attached weapon
		const player = window.game?.player;
		const origPlayerVisible = player?.mesh?.visible;
		if (player?.mesh) player.mesh.visible = false;

		// Add lights
		const lights = [];
		const ambient = new THREE.AmbientLight(0xffffff, 0.6);
		lights.push(ambient);
		const dir = new THREE.DirectionalLight(0xffffff, 0.8);
		dir.position.set(3, 5, 4);
		lights.push(dir);
		lights.forEach(l => scene.add(l));

		// Detach camera from player, add to scene
		if (origCamParent && origCamParent !== scene) {
			origCamParent.remove(camera);
			scene.add(camera);
		}

		// Get corpse world position
		const corpseWorldPos = new THREE.Vector3();
		corpse.getWorldPosition(corpseWorldPos);

		// Position camera: side-view of corpse (closer for smaller realistic corpse)
		camera.position.set(
			corpseWorldPos.x + 3.5,
			corpseWorldPos.y + 1.2,
			corpseWorldPos.z
		);
		camera.lookAt(new THREE.Vector3(corpseWorldPos.x, corpseWorldPos.y + 0.5, corpseWorldPos.z));

		// Set background
		scene.background = new THREE.Color(0x1a1a1a);

		// Render scene (twice to ensure frame swap)
		renderer.render(scene, camera);
		renderer.render(scene, camera);

		// Capture canvas
		const dataUrl = renderer.domElement.toDataURL('image/png');

		// Restore state
		scene.remove(corpse);
		if (origParent) origParent.add(corpse);
		scene.children.forEach(child => {
			if (origVisibility.has(child)) child.visible = origVisibility.get(child);
		});
		lights.forEach(l => scene.remove(l));
		scene.remove(camera);
		if (origCamParent) origCamParent.add(camera);
		scene.background = origBackground;
		if (player?.mesh) player.mesh.visible = origPlayerVisible;

		// Restart game loop
		if (window.game?.gameLoop) window.game.gameLoop.start();

		return { dataUrl };
	});

	if (result.error) {
		console.error('Corpse render failed:', result.error);
		return;
	}

	const base64 = result.dataUrl.split(',')[1];
	const buf = Buffer.from(base64, 'base64');
	const outPath = path.join(process.cwd(), 'screenshots', 'corpse-closeup.png');
	fs.writeFileSync(outPath, buf);
	console.log('Corpse screenshot saved to:', outPath);
});
