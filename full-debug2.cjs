const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  
  page.on('pageerror', err => {
    const msg = err.message;
    if (msg && msg.length < 500) {
      errors.push({ type: 'error', msg });
      console.log(`PAGE_ERROR: ${msg}`);
    }
  });
  
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 500) {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        errors.push({ type: msg.type(), msg: text });
        console.log(`[${msg.type()}] ${text}`);
      }
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Click desktop start button
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) {
    await startBtn.click();
    console.log('Start button clicked');
  }
  
  // Wait for countdown to start
  await page.waitForTimeout(2000);
  
  // Check game state
  let s = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game obj' };
    return {
      gameState: g.gameState,
      countdownTimer: g.countdownTimer,
      countdownTime: g.countdownTime,
      isPaused: g.isPaused,
      isStarted: g.isStarted,
      initialized: g.initialized,
      gameLoopRunning: g.gameLoop?.isRunning,
      perkMenuOpen: g.perkMenuOpen,
      perkSelectionRequired: g.perkSelectionRequired,
    };
  });
  console.log('Game state after 2s:', JSON.stringify(s, null, 2));
  
  // Wait for countdown to finish (should be ~15s from start)
  await page.waitForTimeout(20000);
  
  s = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game obj' };
    return {
      gameState: g.gameState,
      countdownTimer: g.countdownTimer,
      isPaused: g.isPaused,
      gameLoopRunning: g.gameLoop?.isRunning,
    };
  });
  console.log('Game state after 22s:', JSON.stringify(s, null, 2));
  
  // Wait 30 more seconds for zone timer
  await page.waitForTimeout(35000);
  
  s = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game obj' };
    return {
      gameState: g.gameState,
      countdownTimer: g.countdownTimer,
      roundFinished: g.roundFinished,
      isPaused: g.isPaused,
      zonePhase: g.zonePhase,
      zonePhaseIndex: g.zonePhaseIndex,
      zonePhaseTimer: g.zonePhaseTimer,
      fogPhaseTimer: g.fogPhaseTimer,
      fogEnabled: g.fogPhaseEnabled,
      playerAlive: g.player?.isAlive,
    };
  });
  console.log('Game state after 57s:', JSON.stringify(s, null, 2));
  
  // Wait 5 more min to see what happens
  await page.waitForTimeout(60000);
  
  s = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game obj' };
    return {
      gameState: g.gameState,
      roundFinished: g.roundFinished,
      isPaused: g.isPaused,
      zonePhase: g.zonePhase,
      zonePhaseIndex: g.zonePhaseIndex,
      zonePhaseTimer: g.zonePhaseTimer,
      fogPhaseTimer: g.fogPhaseTimer,
      fogEnabled: g.fogPhaseEnabled,
      playerAlive: g.player?.isAlive,
      playerHp: g.player?.health,
      aliveCount: g.entityManager?.getAliveSurvivors?.()?.length || 0,
    };
  });
  console.log('Game state after 117s:', JSON.stringify(s, null, 2));
  
  console.log('\nTotal errors:', errors.length);
  if (errors.length > 0) {
    console.log('Last 10 errors:');
    errors.slice(-10).forEach(e => console.log(`  [${e.type}] ${e.msg}`));
  }
  
  await browser.close();
})();
