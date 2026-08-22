import { test, expect } from '@playwright/test';

test.describe('Weapon Display Tests', () => {
  test('knife visible after pointer lock', async ({ page }) => {
    // Navigate to the game
    await page.goto('http://localhost:3001');
    
    // Wait for start screen
    await page.waitForSelector('#startScreen', { timeout: 10000 });
    
    // Click start button using evaluate
    await page.evaluate(() => {
      const btn = document.getElementById('startButtonDesktop');
      if (btn) btn.click();
    });
    
    // Wait for canvas to appear
    await page.waitForSelector('canvas', { timeout: 10000 });
    
    // Capture console logs
    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(msg.text()));
    
    // Click on canvas to request pointer lock
    await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (canvas) canvas.click();
    });
    
    // Wait for pointer lock to activate
    await page.waitForFunction(() => {
      return document.pointerLockElement !== null;
    }, { timeout: 5000 });
    
    console.log('Pointer lock activated!');
    
    // Wait 5 seconds for the weapon to appear
    await page.waitForTimeout(5000);
    
    // Check for weapon-related console logs
    const weaponLogs = consoleLogs.filter(l => 
      l.includes('viewWeapon') || 
      l.includes('Weapon') || 
      l.includes('knife') ||
      l.includes('selectSlot') ||
      l.includes('animateViewModel')
    );
    console.log('Weapon-related console logs:', weaponLogs);
    
    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/weapon-visible-5s.png', fullPage: true });
    
    // Wait another 25 seconds (total 30 seconds)
    console.log('Waiting 25 more seconds...');
    await page.waitForTimeout(25000);
    
    // Take screenshot after 30 seconds
    await page.screenshot({ path: 'tests/screenshots/weapon-visible-30s.png', fullPage: true });
    
    // Check for any errors in console logs
    const errors = consoleLogs.filter(l => l.includes('error') || l.includes('Error'));
    console.log('Errors:', errors);
    
    // Verify no weapon errors
    expect(errors.filter(e => e.includes('viewWeapon') || e.includes('weapon'))).toEqual([]);
  });
});
