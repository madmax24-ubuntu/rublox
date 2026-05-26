const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage();

  const consoleLogs = [];
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'log') consoleLogs.push(msg.text());
    if (msg.type() === 'error') {
      errors.push(msg.text());
      console.error('[ERROR]', msg.text());
    }
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });

  // Wait for game to initialize
  await page.waitForTimeout(3000);

  // Evaluate game state
  let state = await page.evaluate(() => {
    const game = window.game;
    return {
      gameState: game?.gameState || 'unknown',
      countdownTimer: game?.countdownTimer ?? -1,
      perkMenuOpen: game?.perkMenuOpen,
      perkLocked: game?.perkLocked,
      roundFinished: game?.roundFinished
    };
  });

  console.log('State after init:', JSON.stringify(state));

  // Wait for countdown to complete (~15 seconds)
  console.log('Waiting for countdown to finish (15s)...');
  await page.waitForTimeout(18000);

  state = await page.evaluate(() => {
    const game = window.game;
    return {
      gameState: game?.gameState || 'unknown',
      countdownTimer: game?.countdownTimer ?? -1,
      perkMenuOpen: game?.perkMenuOpen,
      perkLocked: game?.perkLocked,
      roundFinished: game?.roundFinished
    };
  });

  console.log('State after countdown:', JSON.stringify(state));

  // Wait for spawn phase (~10s) + some playing
  console.log('Waiting for spawn phase...');
  await page.waitForTimeout(15000);

  state = await page.evaluate(() => {
    const game = window.game;
    return {
      gameState: game?.gameState || 'unknown',
      roundFinished: game?.roundFinished
    };
  });

  console.log('State after spawn:', JSON.stringify(state));

  if (state.gameState === 'playing') {
    console.log('SUCCESS: Game transitioned from countdown -> spawn -> playing');
  } else if (state.gameState === 'ended') {
    console.log('GAME ENDED - round finished');
  } else {
    console.log('State is:', state.gameState);
  }

  // Check for critical errors
  const criticalErrors = errors.filter(e =>
    e.includes('TypeError') || e.includes('cannot read') || e.includes('THREE.')
  );
  if (criticalErrors.length > 0) {
    console.log('CRITICAL ERRORS:', criticalErrors.length);
    criticalErrors.slice(0, 5).forEach(e => console.log('  -', e));
  } else {
    console.log('No critical errors found');
  }

  await page.waitForTimeout(2000);
  await browser.close();
  console.log('Test complete');
})();
