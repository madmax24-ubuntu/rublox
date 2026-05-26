const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    if (err.message && err.message.length < 500) {
      errors.push(err.message);
      console.log(`PAGE_ERROR: ${err.message}`);
    }
  });
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 500 && (msg.type() === 'error' || text.includes('countdown'))) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Click start
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');
  
  // Wait for perk panel
  await page.waitForTimeout(6000);
  
  // Use JS to click a perk button directly
  const clickResult = await page.evaluate(() => {
    const btns = document.querySelectorAll('.perk-btn');
    if (btns.length === 0) return 'no buttons';
    // Click the first perk button
    btns[0].click();
    return `clicked btn at index 0, perk=${btns[0].getAttribute('data-perk')}`;
  });
  console.log('Click result:', clickResult);
  
  // Wait for perk selection to process
  await page.waitForTimeout(3000);
  
  // Check state
  const s = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      countdownTimer: g?.countdownTimer,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked,
      isStarted: g?.isStarted,
    };
  });
  console.log('After perk select:', JSON.stringify(s, null, 2));
  
  // Wait for countdown to tick
  await page.waitForTimeout(10000);
  
  const s2 = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      countdownTimer: g?.countdownTimer,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked,
      spawnTimer: g?.spawnTimer,
    };
  });
  console.log('After 10s:', JSON.stringify(s2, null, 2));
  
  // Wait 30 more seconds for zone cycle
  await page.waitForTimeout(35000);
  
  const s3 = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      roundFinished: g?.roundFinished,
      zonePhase: g?.zonePhase,
      zonePhaseIndex: g?.zonePhaseIndex,
      zonePhaseTimer: g?.zonePhaseTimer,
      playerAlive: g?.player?.isAlive,
      playerHp: g?.player?.health,
      aliveCount: g?.entityManager?.getAliveSurvivors?.()?.length || 0,
    };
  });
  console.log('After 35s more:', JSON.stringify(s3, null, 2));
  
  console.log('\nErrors:', errors.length);
  errors.forEach(e => console.log('  ', e));
  
  await browser.close();
})();
