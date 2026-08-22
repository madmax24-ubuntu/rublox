import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test('screenshot stalker corpse close-up', async ({ browser }) => {
	test.setTimeout(240000);

	// Create fresh context to bypass browser ES module cache
	const freshContext = await browser.newContext();
	const page = await freshContext.newPage();

	await page.addInitScript(() => { window.__kilo_test__ = true; });

	// Read fresh modified code from disk
	const projectRoot = process.cwd();
	const zombieContent = fs.readFileSync(path.join(projectRoot, 'entities', 'Zombie.js'), 'utf8');
	const zombiePoolContent = fs.readFileSync(path.join(projectRoot, 'entities', 'ZombiePool.js'), 'utf8');
	const lootContent = fs.readFileSync(path.join(projectRoot, 'items', 'LootManager.js'), 'utf8');
	const meshPoolContent = fs.readFileSync(path.join(projectRoot, 'world', 'MeshPool.js'), 'utf8');

	// Intercept ALL JS requests to serve fresh code from disk
	const mapGenContent = fs.readFileSync(path.join(projectRoot, 'world', 'MapGenerator.js'), 'utf8');
	const instMeshContent = fs.readFileSync(path.join(projectRoot, 'world', 'InstancedMeshSystem.js'), 'utf8');
	const mainContent = fs.readFileSync(path.join(projectRoot, 'main.js'), 'utf8');

	const contentMap = {
		'main.js': mainContent,
		'entities/Zombie.js': zombieContent,
		'entities/ZombiePool.js': zombiePoolContent,
		'items/LootManager.js': lootContent,
		'world/MeshPool.js': meshPoolContent,
		'world/MapGenerator.js': mapGenContent,
		'world/InstancedMeshSystem.js': instMeshContent,
	};

	await page.route('**/*.js', async route => {
		const reqUrl = route.request().url();
		const reqPath = reqUrl.replace(/^http:\/\/localhost:3001\//, '');
		const cleanPath = reqPath.split('?')[0];
		const content = contentMap[cleanPath];
		if (content) {
			console.log('[TEST] Intercepting:', cleanPath);
			await route.fulfill({ body: content, contentType: 'text/javascript' });
		} else {
			await route.continue();
		}
	});

	await page.goto('http://localhost:3001/');
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(3000);

	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForTimeout(3000);
	await page.getByRole('button', { name: /быстрые руки/i }).click({ force: true });
	await page.waitForSelector('#countdown', { timeout: 10000 });
	await page.waitForSelector('#countdown', { state: 'hidden', timeout: 120000 });
	await page.waitForTimeout(2000);

	await page.waitForFunction(() => {
		return window.game?.gameState === 'playing';
	}, { timeout: 120000 });

	// Wait for fresh round to spawn new zombies built with new code
	await page.waitForTimeout(5000);

	// Clear any existing corpses from previous rounds
	const cleaned = await page.evaluate(() => {
		const scene = window.game?.scene;
		if (!scene) return 0;
		const toRemove = [];
		scene.traverse(c => {
			if (c.userData?.isStalkerCorpse) toRemove.push(c);
		});
		toRemove.forEach(c => {
			if (c.parent) c.parent.remove(c);
		});
		return toRemove.length;
	});
	if (cleaned) console.log('[TEST] Removed', cleaned, 'existing corpses');

	// Kill a stalker zombie by shooting it - ensures fresh corpse with new code
	const killResult = await page.evaluate(async () => {
		const game = window.game;
		if (!game) return { killed: false, reason: 'no game' };
		const entities = game.entityManager?.entities || game.zombiePool?.entityManager?.entities || [];
		const stalkers = entities.filter(e => e.variant === 'stalker' && e.isAlive);
		if (stalkers.length === 0) return { killed: false, reason: 'no stalker' };
		const zombie = stalkers[0];
		const wasAlive = zombie.isAlive;
		const healthBefore = zombie.health;
		zombie.takeDamage(99999, true, game.player, 10, 'bullet');
		const isAliveAfter = zombie.isAlive;
		const isCorpsified = zombie._isCorpsified;
		const hasCorpseGroup = !!zombie._corpseGroup;
		return { killed: !isAliveAfter, wasAlive, healthBefore, isCorpsified, hasCorpseGroup };
	});
	if (killResult.killed) console.log('[TEST] Killed stalker:', killResult);
	else console.error('[TEST] Failed to kill stalker:', killResult);

	// Corpse timer is ~2.2s - check immediately before it's disposed
	await page.waitForTimeout(500);

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

		// Update world matrices before rendering
		corpse.updateMatrixWorld(true);

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
		await freshContext.close();
		return;
	}

	const base64 = result.dataUrl.split(',')[1];
	const buf = Buffer.from(base64, 'base64');
	const outPath = path.join(process.cwd(), 'screenshots', 'corpse-closeup.png');
	fs.writeFileSync(outPath, buf);
	console.log('Corpse screenshot saved to:', outPath);

	await freshContext.close();
});
