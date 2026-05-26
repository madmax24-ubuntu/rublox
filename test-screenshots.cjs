const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,720'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }});
  await page.goto('http://localhost:3001');

  // Click start button
  await page.waitForSelector('#startButtonDesktop', { timeout: 5000 });
  await page.click('#startButtonDesktop');

  // Wait for game to initialize
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: './screenshots/01-render.png', fullPage: false });
  console.log('Screenshot 1: Initial render at 2s');

  // Wait for countdown to start
  await new Promise(r => setTimeout(r, 5000));
  const state1 = await page.evaluate(() => ({
    gameState: window.game?.gameState,
    meshes: window.game?.scene?.children?.length,
    player: window.game?.player?.position?.toArray?.(),
  }));
  console.log('State at 7s:', JSON.stringify(state1));
  await page.screenshot({ path: './screenshots/02-countdown.png', fullPage: false });

  // Wait for spawn phase
  await new Promise(r => setTimeout(r, 5000));
  const state2 = await page.evaluate(() => ({
    gameState: window.game?.gameState,
    meshes: window.game?.scene?.children?.length,
    player: window.game?.player?.position?.toArray?.(),
    camY: window.game?.camera?.position?.y,
    botsAlive: window.game?.bots?.filter?.(b => b.isAlive)?.length,
  }));
  console.log('State at 12s:', JSON.stringify(state2));
  await page.screenshot({ path: './screenshots/03-spawn.png', fullPage: false });

  // Wait for playing state
  await new Promise(r => setTimeout(r, 5000));
  const state3 = await page.evaluate(() => ({
    gameState: window.game?.gameState,
    meshes: window.game?.scene?.children?.length,
    player: window.game?.player?.position?.toArray?.(),
    camY: window.game?.camera?.position?.y,
    camDir: window.game?.camera?.worldDirection?.(new (require('three')?.Vector3 || Object)())?.toArray?.(),
  }));
  console.log('State at 17s:', JSON.stringify(state3));
  await page.screenshot({ path: './screenshots/04-playing.png', fullPage: false });

  // Camera orbit screenshots - look around
  await new Promise(r => setTimeout(r, 3000));
  for (let angle = 0; angle < 360; angle += 60) {
    await page.evaluate((a) => {
      if (window.game?.camera) {
        const r = 25;
        window.game.camera.position.set(
          Math.cos(a * Math.PI / 180) * r,
          15,
          Math.sin(a * Math.PI / 180) * r
        );
        window.game.camera.lookAt(0, 0, 0);
      }
    }, angle);
    await page.screenshot({ path: `./screenshots/cam_${angle}deg.png`, fullPage: false });
    console.log(`Screenshot: orbit ${angle}deg`);
  }

  // Player perspective
  await page.evaluate(() => {
    if (window.game?.camera) {
      const pos = window.game.player?.position;
      window.game.camera.position.set(pos.x, pos.y + 2, pos.z + 5);
      window.game.camera.lookAt(pos.x, pos.y, pos.z);
    }
  });
  await page.screenshot({ path: './screenshots/05-player-view.png', fullPage: false });
  console.log('Screenshot: player view');

  // High angle overview
  await page.evaluate(() => {
    if (window.game?.camera) {
      window.game.camera.position.set(0, 100, 0);
      window.game.camera.lookAt(0, 0, 0);
    }
  });
  await page.screenshot({ path: './screenshots/06-top-down.png', fullPage: false });
  console.log('Screenshot: top-down overview');

  await browser.close();
  console.log('Done! Check screenshots/ folder');
})();
