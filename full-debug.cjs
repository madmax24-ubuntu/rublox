const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  const logs = [];
  
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
      logs.push({ type: msg.type(), text: text.substring(0, 200) });
    }
  });
  
  // Listen for any unhandled rejections
  page.on('console', msg => {
    if (msg.text().toLowerCase().includes('unhandled') || msg.text().toLowerCase().includes('uncaught')) {
      console.log(`UNHANDLED: [${msg.type()}] ${msg.text()}`);
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait for load
  await page.waitForTimeout(3000);
  
  // Click start
  const startBtn = await page.$('[id="startButton"], [id="startButtonDesktop"]');
  if (startBtn) {
    await startBtn.click();
    console.log('Start button clicked');
  }
  
  // Wait 3s for countdown
  await page.waitForTimeout(4000);
  console.log('After countdown...');
  
  // Check game state
  let state = await page.evaluate(() => {
    return {
      gameState: window.game?.gameState,
      isPaused: window.game?.isPaused,
      roundFinished: window.game?.roundFinished,
      deathHandled: window.game?.deathHandled,
      playerAlive: window.game?.player?.isAlive,
      aliveCount: window.game?.entityManager?.getAliveSurvivors?.().length,
      zonePhase: window.game?.zonePhase,
      zonePhaseIndex: window.game?.zonePhaseIndex,
      zoneTimer: window.game?.zonePhaseTimer,
      botsAlive: window.game?.bots?.filter?.(b => b?.isAlive).length,
    };
  });
  console.log('Game state after 4s:', JSON.stringify(state, null, 2));
  
  // Wait 30s to see zone timer issues
  await page.waitForTimeout(30000);
  
  state = await page.evaluate(() => {
    return {
      gameState: window.game?.gameState,
      isPaused: window.game?.isPaused,
      roundFinished: window.game?.roundFinished,
      deathHandled: window.game?.deathHandled,
      playerAlive: window.game?.player?.isAlive,
      aliveCount: window.game?.entityManager?.getAliveSurvivors?.().length,
      zonePhase: window.game?.zonePhase,
      zonePhaseIndex: window.game?.zonePhaseIndex,
      zoneTimer: window.game?.zonePhaseTimer,
      botsAlive: window.game?.bots?.filter?.(b => b?.isAlive).length,
      fogEnabled: window.game?.fogPhaseEnabled,
    };
  });
  console.log('Game state after 34s:', JSON.stringify(state, null, 2));
  console.log('Total errors:', errors.length);
  
  // Show last 20 errors
  if (errors.length > 0) {
    console.log('\nLast 20 errors:');
    errors.slice(-20).forEach(e => console.log(`  [${e.type}] ${e.msg}`));
  }
  
  await browser.close();
})();
