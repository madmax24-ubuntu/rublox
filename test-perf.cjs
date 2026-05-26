const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => console.log(`PAGE_ERROR: ${err.message}`));
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 300) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Click start
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');
  
  await page.waitForTimeout(6000);
  
  // Check FPS and delta
  const perf1 = await page.evaluate(() => {
    const g = window.game;
    if (!g) return { error: 'no game' };
    
    // Manually dispatch selectPerk
    document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'quickHands' }));
    
    // Log actual delta values over time
    const initialCountdown = g.countdownTimer;
    const initialPerf = performance.now();
    
    return {
      initialCountdown,
      fps: g.gameLoop ? 'running' : 'stopped',
      clockDelta: g.gameLoop?.clock?.getDelta?.(),
    };
  });
  console.log('Perf check:', JSON.stringify(perf1, null, 2));
  
  // Check countdown every second
  for (let i = 1; i <= 5; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.game?.countdownTimer);
    console.log(`t=${i}s: countdownTimer=${s}`);
  }
  
  await browser.close();
})();
