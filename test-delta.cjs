const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => console.log(`PAGE_ERROR: ${err.message}`));
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1000);
  
  // Click start
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked at t=0');
  
  await page.waitForTimeout(5000);
  
  // Inject a script that logs delta every frame for 3 seconds
  const deltaLog = await page.evaluate(() => {
    return new Promise(async (resolve) => {
      const g = window.game;
      const deltas = [];
      const startT = performance.now();
      let frames = 0;
      let totalDelta = 0;
      let lastCountdown = g.countdownTimer;
      
      function check() {
        if (performance.now() - startT > 3000) {
          // Dispatch selectPerk to start countdown
          document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'quickHands' }));
          resolve({
            frames,
            avgDelta: totalDelta / frames,
            totalDelta,
            lastCountdown,
            elapsed: performance.now() - startT,
          });
          return;
        }
        
        // Capture the actual delta being used
        const currentDelta = g.gameLoop?.clock?.getDelta?.() || 0;
        deltas.push({
          t: performance.now() - startT,
          clockDelta: currentDelta,
          countdown: g.countdownTimer,
          frames: frames,
        });
        
        frames++;
        totalDelta += currentDelta;
        lastCountdown = g.countdownTimer;
        
        requestAnimationFrame(check);
      }
      check();
    });
  });
  console.log('Delta log:', JSON.stringify(deltaLog, null, 2));
  
  // Check after 3 more seconds
  await page.waitForTimeout(3000);
  const final = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked,
      countdownTimer: g?.countdownTimer,
      isStarted: g?.isStarted,
    };
  });
  console.log('Final:', JSON.stringify(final, null, 2));
  
  await browser.close();
})();
