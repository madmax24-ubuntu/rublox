const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

  const errors = [];
  page.on('pageerror', err => { errors.push(err.message); console.log(`PAGE_ERROR: ${err.message.slice(0, 100)}`); });
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`CONSOLE_ERR: ${msg.text().slice(0, 100)}`);
  });

  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);

  // Click start
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');

  // Wait for countdown to start
  await page.waitForTimeout(3000);

  // Dispatch selectPerk to unlock
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'quickHands' }));
  });
  console.log('Perk dispatched');

  // Wait for countdown (15s) + spawn phase (~10s) + some playing time
  const phases = [
    { label: 'countdown', delay: 18000 },
    { label: 'spawn', delay: 15000 },
    { label: 'playing_check', delay: 5000 },
  ];

  for (const phase of phases) {
    console.log(`Waiting for ${phase.label} (${phase.delay}ms)...`);
    await page.waitForTimeout(phase.delay);

    const state = await page.evaluate(() => {
      const g = window.game;
      return {
        gameState: g?.gameState,
        countdownTimer: g?.countdownTimer,
        spawnTimer: g?.spawnTimer,
        roundFinished: g?.roundFinished,
        perkLocked: g?.perkLocked,
        perkMenuOpen: g?.perkMenuOpen
      };
    });
    console.log(`  [${phase.label}]`, JSON.stringify(state));
  }

  // Check final state
  const final = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      roundFinished: g?.roundFinished,
      zonePhase: g?.zonePhase
    };
  });
  console.log('Final state:', JSON.stringify(final));

  if (final.gameState === 'playing') {
    console.log('SUCCESS: Game reached playing state!');
  } else if (final.gameState === 'spawn') {
    console.log('Game is in spawn phase (may still be transitioning)');
  } else if (final.gameState === 'ended') {
    console.log('Round ended');
  }

  const critErrors = errors.filter(e =>
    e.includes('TypeError') || e.includes('cannot read') || e.includes('THREE')
  );
  console.log(`Critical errors: ${critErrors.length}`);
  if (critErrors.length > 0) {
    critErrors.slice(0, 5).forEach(e => console.log('  -', e.slice(0, 120)));
  }

  await browser.close();
  console.log('Test complete');
})();
