import { test } from '@playwright/test';

test('debug game state transitions', async ({ page }) => {
	test.setTimeout(120000);
	
	await page.goto('http://localhost:3001');
	await page.waitForLoadState('domcontentloaded');
	await page.waitForTimeout(2000);
	
	// Click start button
	await page.getByRole('button', { name: /начать игру/i }).click({ force: true });
	await page.waitForTimeout(3000);
	
	// Select perk
	await page.getByRole('button', { name: /быстрые руки/i }).click({ force: true });
	
	// Wait for countdown to appear
	await page.waitForSelector('#countdown', { timeout: 10000 });
	console.log('Countdown appeared');
	
	// Wait for countdown to disappear
	await page.waitForSelector('#countdown', { state: 'hidden', timeout: 30000 });
	console.log('Countdown disappeared');
	
	// Log game state every 5 seconds for 60 seconds
	for (let i = 0; i < 12; i++) {
		await page.waitForTimeout(5000);
		const state = await page.evaluate(() => window.game?.gameState);
		const spawnInit = await page.evaluate(() => window.game?.spawnScatterInitialized);
		const spawnTimer = await page.evaluate(() => window.game?.spawnTimer);
		console.log(`Tick ${i}: state=${state}, spawnInit=${spawnInit}, spawnTimer=${spawnTimer}`);
		
		if (state === 'playing') {
			console.log('Game reached playing state!');
			break;
		}
	}
	
	// Final state check
	const finalState = await page.evaluate(() => window.game?.gameState);
	const finalSpawnInit = await page.evaluate(() => window.game?.spawnScatterInitialized);
	const finalSpawnTimer = await page.evaluate(() => window.game?.spawnTimer);
	console.log(`Final: state=${finalState}, spawnInit=${finalSpawnInit}, spawnTimer=${finalSpawnTimer}`);
});
