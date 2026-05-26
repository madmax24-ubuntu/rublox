const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1920,1080'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }});
  await page.goto('http://localhost:3001');
  await page.waitForSelector('#startButtonDesktop', { timeout: 5000 });
  await page.click('#startButtonDesktop');

  // Wait for countdown
  await new Promise(r => setTimeout(r, 10000));

  // Take screenshot from player perspective (near camera)
  await page.evaluate(() => {
    if (window.game?.camera && window.game?.player?.position) {
      const p = window.game.player.position;
      window.game.camera.position.set(p.x, p.y + 1.6, p.z + 3);
      window.game.camera.lookAt(p.x, p.y + 0.5, p.z);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('./screenshots/01_player_view.png', Buffer.from(base64Data, 'base64'));
  console.log('Screenshot: 01_player_view.png');

  // Top-down view
  await page.evaluate(() => {
    if (window.game?.camera) {
      window.game.camera.position.set(0, 200, 0.01);
      window.game.camera.lookAt(0, 0, 0);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const dataUrl2 = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  const base64Data2 = dataUrl2.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('./screenshots/02_topdown.png', Buffer.from(base64Data2, 'base64'));
  console.log('Screenshot: 02_topdown.png');

  // State info
  const state = await page.evaluate(() => ({
    gameState: window.game?.gameState,
    meshes: window.game?.scene?.children?.length,
    playerPos: window.game?.player?.position?.toArray?.(),
    camPos: window.game?.camera?.position?.toArray?.(),
  }));
  console.log('State:', JSON.stringify(state));

  await browser.close();
  console.log('Done!');
})();
