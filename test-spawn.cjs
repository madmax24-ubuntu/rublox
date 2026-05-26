const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log(`ERR: ${err.message.slice(0,100)}`); });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`CONSOLE_ERR: ${msg.text().slice(0,100)}`);
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Click start
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');

  await page.waitForTimeout(3000);

  // Check player position
  const pos = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game' };
    return {
      playerY: g?.player?.position?.y,
      playerX: g?.player?.position?.x,
      playerZ: g?.player?.position?.z,
      spawnPadsCount: g?.map?.getSpawnPads?.()?.length || 0,
      firstPad: g?.map?.getSpawnPads?.()[0],
      groundHeight: g?.map?.getHeightAt?.(0, 0),
      surfaceY: Math.max(1.54, 1.54 + (g?.map?.getHeightAt?.(0, 0) ?? 0.3)),
    };
  });
  console.log('Player position:', JSON.stringify(pos, null, 2));

  // Wait for physics to settle
  await page.waitForTimeout(3000);

  const settled = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game' };
    return {
      playerY: g?.player?.position?.y,
      playerX: g?.player?.position?.x,
      playerZ: g?.player?.position?.z,
      physicsY: g?.player?.physics?.y,
      heightAtPos: g?.map?.getHeightAt?.(g?.player?.position?.x, g?.player?.position?.z),
    };
  });
  console.log('After physics:', JSON.stringify(settled, null, 2));

  // Check camera position
  const cam = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game' };
    return {
      camX: g?.camera?.position?.x,
      camY: g?.camera?.position?.y,
      camZ: g?.camera?.position?.z,
    };
  });
  console.log('Camera:', JSON.stringify(cam, null, 2));

  const critErrors = errors.filter(e =>
    e.includes('TypeError') || e.includes('cannot read') || e.includes('THREE')
  );
  console.log(`Critical errors: ${critErrors.length}`);

  await browser.close();
  console.log('Test complete');
})();
