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

  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');

  await page.waitForTimeout(3000);

  // Check player spawn
  const spawn = await page.evaluate(() => {
    const g = window.game;
    return {
      playerY: g?.player?.position?.y,
      playerX: g?.player?.position?.x,
      playerZ: g?.player?.position?.z,
      heightAtPos: g?.map?.getHeightAt?.(g?.player?.position?.x, g?.player?.position?.z),
      surfaceY: Math.max(1.54, 1.54 + (g?.map?.getHeightAt?.(0, 0) ?? 0.3)),
    };
  });
  console.log('Spawn position:', JSON.stringify(spawn, null, 2));

  // Dispatch selectPerk to unlock game
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'quickHands' }));
  });
  console.log('Perk dispatched');

  // Wait for countdown (~15s) + spawn phase (~10s)
  await page.waitForTimeout(28000);

  const playing = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      playerY: g?.player?.position?.y,
      playerX: g?.player?.position?.x,
      playerZ: g?.player?.position?.z,
      camY: g?.camera?.position?.y,
      roundFinished: g?.roundFinished,
      spawnPadsCount: g?.map?.getSpawnPads?.()?.length || 0,
    };
  });
  console.log('Playing state:', JSON.stringify(playing, null, 2));

  if (playing.gameState === 'playing') {
    console.log('SUCCESS: Game reached playing state');
    const surfaceY = Math.max(1.54, 1.54 + (playing.heightAtPos ?? 0.3));
    const feetY = playing.playerY - 2.2;
    const feetAboveGround = feetY - surfaceY;
    console.log(`Player feet at Y = ${feetY.toFixed(2)}, ground at Y = ${surfaceY.toFixed(2)}, offset = ${feetAboveGround.toFixed(2)}`);
    if (feetAboveGround > 0 && feetAboveGround < 3) {
      console.log('OK: Player feet are just above ground surface');
    } else {
      console.log('WARNING: Player position may still be incorrect');
    }
  } else {
    console.log('Game state:', playing.gameState);
  }

  const critErrors = errors.filter(e =>
    e.includes('TypeError') || e.includes('cannot read') || e.includes('THREE')
  );
  console.log(`Critical errors: ${critErrors.length}`);

  await browser.close();
  console.log('Test complete');
})();
