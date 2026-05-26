const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  // Kill existing server
  require('child_process').execSync('pkill -f "node server"', { stdio: 'pipe' });
  await new Promise(r => setTimeout(r, 2000));

  // Start server fresh
  const server = spawn('node', ['server.js'], {
    cwd: 'C:/Users/maksk/Desktop/rublox',
    detached: false,
  });
  console.log('Server PID:', server.pid);
  await new Promise(r => setTimeout(r, 3000));

  // Launch visible browser with larger viewport
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }});
  await page.goto('http://localhost:3001');
  await page.waitForSelector('#startButtonDesktop', { timeout: 5000 });

  // Add JS error handler
  await page.evaluate(() => {
    window.__errors = [];
    window.__log = [];
    window.addEventListener('error', e => {
      window.__errors.push(e.message);
      console.error('PAGE ERROR:', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', e => {
      window.__errors.push('Unhandled rejection: ' + e.reason);
    });
    const origLog = console.log;
    const origWarn = console.warn;
    console.log = function(...a) {
      window.__log.push('LOG: ' + a.join(' '));
      origLog.apply(console, a);
    };
    console.warn = function(...a) {
      window.__log.push('WARN: ' + a.join(' '));
      origWarn.apply(console, a);
    };
  });

  await page.click('#startButtonDesktop');
  console.log('Game started');

  // Wait for game to progress
  await new Promise(r => setTimeout(r, 5000));
  let state = await page.evaluate(() => ({
    hasCanvas: !!document.querySelector('canvas'),
    game: !!window.game,
    errors: window.__errors?.slice(-10),
    log: window.__log?.slice(-10),
    meshes: window.game?.scene?.children?.length,
    gameState: window.game?.gameState,
    canvasEl: document.querySelector('canvas')?.getAttribute?.('style') || 'no canvas',
  }));
  console.log('After 5s:', JSON.stringify(state, null, 2));

  // Wait for countdown
  await new Promise(r => setTimeout(r, 10000));
  state = await page.evaluate(() => ({
    meshes: window.game?.scene?.children?.length,
    gameState: window.game?.gameState,
    player: window.game?.player?.position?.toArray?.(),
    camY: window.game?.camera?.position?.y,
    canvasStyle: document.querySelector('canvas')?.getAttribute?.('style'),
    errors: window.__errors?.slice(-10),
  }));
  console.log('After 15s:', JSON.stringify(state, null, 2));

  // Wait for playing state
  await new Promise(r => setTimeout(r, 15000));
  state = await page.evaluate(() => ({
    meshes: window.game?.scene?.children?.length,
    gameState: window.game?.gameState,
    player: window.game?.player?.position?.toArray?.(),
    camY: window.game?.camera?.position?.y,
    botsAlive: window.game?.bots?.filter?.(b => b.isAlive)?.length,
    canvasStyle: document.querySelector('canvas')?.getAttribute?.('style'),
    errors: window.__errors?.slice(-10),
    canvasCSS: document.querySelector('canvas') ? Array.from(document.querySelectorAll('canvas')).map(c => ({
      id: c.id, width: c.width, height: c.height,
      style: c.getAttribute('style'),
      computed: getComputedStyle(c).display + ' ' + getComputedStyle(c).width + 'x' + getComputedStyle(c).height,
    })) : [],
  }));
  console.log('After 30s:', JSON.stringify(state, null, 2));

  // Take screenshot in playing state
  await new Promise(r => setTimeout(r, 3000));
  await page.screenshot({ path: './screenshots/01-playing.png', fullPage: false });
  console.log('Screenshot: playing view');

  // Try camera orbit
  for (let angle = 0; angle <= 360; angle += 90) {
    await page.evaluate((a) => {
      if (window.game?.camera) {
        const r = 40;
        window.game.camera.position.set(
          Math.cos(a * Math.PI / 180) * r,
          30,
          Math.sin(a * Math.PI / 180) * r
        );
        window.game.camera.lookAt(0, 0, 0);
      }
    }, angle);
    await page.screenshot({ path: `./screenshots/cam_${angle}deg.png`, fullPage: false });
    console.log(`Screenshot: orbit ${angle}deg`);
  }

  // Top-down view
  await page.evaluate(() => {
    if (window.game?.camera) {
      window.game.camera.position.set(0, 150, 0.01);
      window.game.camera.lookAt(0, 0, 0);
    }
  });
  await page.screenshot({ path: './screenshots/02-topdown.png', fullPage: false });
  console.log('Screenshot: top-down');

  // Player perspective
  await page.evaluate(() => {
    if (window.game?.camera && window.game?.player?.position) {
      const pos = window.game.player.position;
      window.game.camera.position.set(pos.x, pos.y + 3, pos.z + 6);
      window.game.camera.lookAt(pos.x, pos.y, pos.z);
    }
  });
  await page.screenshot({ path: './screenshots/03-player.png', fullPage: false });
  console.log('Screenshot: player view');

  // Print all errors
  const allErrors = await page.evaluate(() => window.__errors);
  if (allErrors?.length) {
    console.log('\n=== ERRORS ===');
    allErrors.forEach(e => console.log(e));
  }

  await browser.close();
  console.log('\nDone!');
})();
