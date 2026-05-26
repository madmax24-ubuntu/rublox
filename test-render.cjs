const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }});
  await page.goto('http://localhost:3001');
  await page.waitForSelector('#startBtn');
  await page.click('#startBtn');
  console.log('Start clicked');

  // Wait for game to initialize and reach playing state
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 1000));

    const state = await page.evaluate(() => {
      if (!window.game) return null;
      return {
        gameState: window.game.gameState,
        playerX: window.game.player?.position?.x,
        playerY: window.game.player?.position?.y,
        playerZ: window.game.player?.position?.z,
        camY: window.game.camera?.position?.y,
        meshes: window.game.scene?.children?.length || 0,
        botsAlive: window.game.bots?.filter?.(b => b.isAlive)?.length,
        entities: window.game.entityManager?.getEntities?.()?.length || 0,
        hasMap: !!window.game.map,
      };
    });

    if (state) {
      console.log(`[${i}s]`, JSON.stringify(state));
    }
  }

  await browser.close();
})();
