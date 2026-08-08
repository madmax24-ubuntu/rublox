import { test } from '@playwright/test';

test('debug game state', async ({ page }) => {
	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(3000);

	// Collect console errors
	const errors = [];
	page.on('console', msg => {
		if (msg.type() === 'error') {
			errors.push(msg.text());
		}
	});

	// Click start button
	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForTimeout(5000);

	// Check game state
	const state = await page.evaluate(() => window.game?.gameState);
	console.log('Game state:', state);
	console.log('Errors:', errors);

	// Check if game object exists
	const gameExists = await page.evaluate(() => !!window.game);
	console.log('Game exists:', gameExists);

	// Check if MapGenerator exists
	const mgExists = await page.evaluate(() => !!window.game?.mapGenerator);
	console.log('MapGenerator exists:', mgExists);
});
