import { test } from '@playwright/test';

test('debug game loading', async ({ page }) => {
	const errors = [];
	const logs = [];
	
	page.on('console', msg => {
		if (msg.type() === 'error') {
			errors.push(msg.text());
		} else {
			logs.push(msg.text());
		}
	});

	page.on('pageerror', err => {
		errors.push(err.message);
	});

	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(5000);

	console.log('=== Console errors ===');
	console.log(errors.join('\n'));
	console.log('=== Console logs ===');
	console.log(logs.join('\n'));
	
	// Check if game object exists
	const gameExists = await page.evaluate(() => !!window.game);
	console.log('Game exists:', gameExists);
	
	// Check if game.map exists
	const mapExists = await page.evaluate(() => !!window.game?.map);
	console.log('Game.map exists:', mapExists);
	
	// Check game state
	const state = await page.evaluate(() => window.game?.gameState);
	console.log('Game state:', state);
});
