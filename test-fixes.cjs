const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const consoleLogs = [];
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'log') { consoleLogs.push(msg.text()); }
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.error('[ERR]', msg.text().slice(0, 120));
    }
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });

  // Wait for game instance to be available
  console.log('Waiting for game instance...');
  await page.waitForFunction(() => typeof window.game !== 'undefined' && window.game, { timeout: 10000 });
  console.log('Game instance found!');

  // Wait for game to show start screen or start automatically
  await page.waitForTimeout(3000);

  // Click start button if present
  let started = await page.evaluate(() => {
    // Try to click start button
    const btn = document.querySelector('.start-btn, #startBtn, button');
    if (btn) {
      // Find buttons that say "Start" or similar
      const allBtns = Array.from(document.querySelectorAll('button, .start-btn, [class*="start"], [class*="Start"]'));
      for (const b of allBtns) {
        const t = b.textContent.toLowerCase();
        if (t.includes('start') || t.includes('играть') || t.includes('старт') || t.includes('play')) {
          b.click();
          return true;
        }
      }
    }
    // Check if game already running
    const g = window.game;
    if (g && g.gameState && g.gameState !== 'idle') return 'running';
    return false;
  });
  console.log('Start clicked:', started);

  if (!started) {
    // Check current state
    const state = await page.evaluate(() => {
      const g = window.game;
      return { gameState: g?.gameState, startingGame: g?.startingGame };
    });
    console.log('Game state:', JSON.stringify(state));

    // Try clicking anywhere
    if (!state.startingGame && state.gameState !== 'countdown') {
      await page.click('body');
      await page.waitForTimeout(1000);
    }
  }

  // Poll for countdown to start
  console.log('Waiting for countdown to start...');
  await page.waitForFunction(async () => {
    const g = window.game;
    return g?.gameState === 'countdown' || g?.gameState === 'playing';
  }, { timeout: 15000 }).catch(() => console.log('Countdown did not start in 15s'));

  // Check state
  let state = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      countdownTimer: g?.countdownTimer,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked,
      roundFinished: g?.roundFinished
    };
  });
  console.log('Initial state:', JSON.stringify(state));

  // If in countdown, wait for it to complete
  if (state.gameState === 'countdown') {
    const countdownEnd = state.countdownTimer || 15;
    console.log(`Countdown at ${countdownEnd}s, waiting ${Math.ceil(countdownEnd) * 1000 + 3000}ms...`);
    await page.waitForTimeout(Math.ceil(countdownEnd) * 1000 + 3000);
  }

  state = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      countdownTimer: g?.countdownTimer,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked
    };
  });
  console.log('After countdown:', JSON.stringify(state));

  // Wait for spawn phase
  if (state.gameState === 'spawn') {
    console.log('Waiting for spawn phase...');
    await page.waitForTimeout(15000);
  }

  state = await page.evaluate(() => {
    const g = window.game;
    return { gameState: g?.gameState };
  });
  console.log('Final state:', JSON.stringify(state));

  if (state.gameState === 'playing') {
    console.log('SUCCESS: Game is in playing state!');
  } else if (state.gameState === 'ended') {
    console.log('Round ended');
  } else {
    console.log('WARNING: Game state is', state.gameState);
  }

  // Check errors
  const critErrors = errors.filter(e =>
    e.includes('TypeError') || e.includes('cannot read') || e.includes('THREE.')
  );
  console.log(`Critical errors: ${critErrors.length}`);
  if (critErrors.length > 0) {
    critErrors.slice(0, 3).forEach(e => console.log('  -', e.slice(0, 120)));
  }

  await browser.close();
  console.log('Test complete');
})();
