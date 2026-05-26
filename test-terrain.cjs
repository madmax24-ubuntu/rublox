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

    // Sample pixels from different areas
    const samples = [];
    const testPoints = [
      { x: 0, y: 0, name: 'center' },
      { x: -300, y: -300, name: 'NW' },
      { x: 300, y: -300, name: 'NE' },
      { x: -300, y: 300, name: 'SW' },
      { x: 300, y: 300, name: 'SE' },
    ];

    for (const pt of testPoints) {
      const px = (pt.x + 1920) / 2;
      const py = (pt.y + 1080) / 2;
      const pixel = new Uint8Array(4);
      try {
        gl.readPixels(Math.floor(px), Math.floor(py), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        samples.push({ point: pt.name, r: pixel[0], g: pixel[1], b: pixel[2] });
      } catch(e) {}
    }

    // Check terrain material type
    let terrainType = 'unknown';
    let terrainUniforms = 'none';
    let terrainMeshes = 0;
    if (window.game?.scene) {
      window.game.scene.traverse(obj => {
        if (obj.isMesh && obj.userData?.isGround) {
          terrainMeshes++;
          terrainType = obj.material?.constructor?.name;
          if (obj.material?.uniforms) {
            terrainUniforms = Object.keys(obj.material.uniforms).join(', ');
          }
        }
      });
    }

    return {
      gameState: window.game?.gameState,
      meshes: window.game?.scene?.children?.length,
      terrainType,
      terrainUniforms,
      terrainMeshes,
      samples,
      hasFog: !!window.game?.scene?.fog,
      bgColor: window.game?.scene?.background?.getHex?.(),
    };
  });

  console.log('Terrain test:', JSON.stringify(info, null, 2));

  // Take screenshot from above
  await page.evaluate(() => {
    if (window.game?.camera) {
      window.game.camera.position.set(0, 250, 0.01);
      window.game.camera.lookAt(0, 0, 0);
    }
  });
  await new Promise(r => setTimeout(r, 500));

  const dataUrl = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync('./screenshots/01_terrain_new.png', Buffer.from(base64Data, 'base64'));
  console.log('Screenshot saved: 01_terrain_new.png');

  // Orbit views
  for (let angle = 0; angle <= 270; angle += 45) {
    await page.evaluate((a) => {
      if (window.game?.camera) {
        const r = 100;
        window.game.camera.position.set(
          Math.cos(a * Math.PI / 180) * r,
          80,
          Math.sin(a * Math.PI / 180) * r
        );
        window.game.camera.lookAt(0, 0, 0);
      }
    }, angle);
    await new Promise(r => setTimeout(r, 300));

    const url = await page.evaluate(() => document.querySelector('canvas').toDataURL('image/png'));
    const b64 = url.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(`./screenshots/terrain_orbit_${angle}deg.png`, Buffer.from(b64, 'base64'));
    console.log(`Screenshot: terrain_orbit_${angle}deg.png`);
  }

  await browser.close();
  console.log('All tests complete!');
})();
