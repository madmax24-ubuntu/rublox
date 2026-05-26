const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1920,1080'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }});
  await page.goto('http://localhost:3001');
  await page.waitForSelector('#startButtonDesktop', { timeout: 5000 });
  await page.click('#startButtonDesktop');

  // Wait for game to initialize
  await new Promise(r => setTimeout(r, 15000));

  // Check game state
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { error: 'no canvas' };
    const gl = c.getContext('webgl2');
    if (!gl) return { error: 'no webgl' };

    // Check canvas content
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    return {
      gameState: window.game?.gameState,
      meshes: window.game?.scene?.children?.length,
      playerPos: window.game?.player?.position?.toArray?.(),
      camPos: window.game?.camera?.position?.toArray?.(),
      hasFog: !!window.game?.scene?.fog,
      fogColor: window.game?.scene?.fog?.color?.getHex?.(),
      fogDensity: window.game?.scene?.fog?.density,
      bgColor: window.game?.scene?.background?.getHex?.(),
      canvasSize: { w: c.width, h: c.height },
      firstPixel: { r: pixel[0], g: pixel[1], b: pixel[2] },
    };
  });

  console.log('Game state:', JSON.stringify(info, null, 2));

  // Take screenshot with top-down view
  await page.evaluate(() => {
    if (window.game?.camera) {
      window.game.camera.position.set(0, 200, 0.01);
      window.game.camera.lookAt(0, 0, 0);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('./screenshots/01_improved.png', Buffer.from(base64Data, 'base64'));
  console.log('Screenshot saved: 01_improved.png');

  // Orbit views
  for (let angle = 0; angle <= 270; angle += 90) {
    await page.evaluate((a) => {
      if (window.game?.camera) {
        const r = 80;
        window.game.camera.position.set(
          Math.cos(a * Math.PI / 180) * r,
          50,
          Math.sin(a * Math.PI / 180) * r
        );
        window.game.camera.lookAt(0, 0, 0);
      }
    }, angle);
    await new Promise(r => setTimeout(r, 300));

    const url = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    const b64 = url.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(`./screenshots/cam_${angle}deg_improved.png`, Buffer.from(b64, 'base64'));
    console.log(`Screenshot: cam_${angle}deg_improved.png`);
  }

  await browser.close();
  console.log('All tests complete!');
})();
