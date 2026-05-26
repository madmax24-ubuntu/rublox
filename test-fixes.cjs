const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') { errors.push(msg.text()); console.error('[ERR]', msg.text().slice(0, 120)); }
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });

  // Wait for game instance
  await page.waitForFunction(() => typeof window.game !== 'undefined', { timeout: 10000 });

  // Check what's on window.game
  let info = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game' };
    // Get prototype constructor name
    const proto = Object.getPrototypeOf(g);
    return {
      type: typeof g,
      ctor: g.constructor?.name,
      protoCtor: proto?.constructor?.name,
      keys: Object.keys(g).slice(0, 20),
      hasGameState: 'gameState' in g,
      hasUpdate: typeof g.update === 'function',
      hasStart: typeof g.start === 'function' || typeof g.startGame === 'function',
      raw: g
    };
  });
  console.log('Game object:', JSON.stringify(info, null, 2).slice(0, 500));

  // Click start
  await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('button, .start-btn, [class*="Start"], [class*="start"]'));
    for (const b of all) {
      const t = b.textContent.toLowerCase();
      if (t.includes('start') || t.includes('играть') || t.includes('старт') || t.includes('play')) {
        b.click();
        console.log('Clicked:', b.textContent.trim());
      }
    }
  });

  await page.waitForTimeout(2000);

  // Check state again
  info = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game' };
    return {
      gameState: g?.gameState,
      startingGame: g?.startingGame,
      isStarted: g?.isStarted,
      keys: Object.keys(g).filter(k => k.startsWith('game') || k.startsWith('start') || k.startsWith('is')).slice(0, 10)
    };
  });
  console.log('After start:', JSON.stringify(info));

  await browser.close();
})();
