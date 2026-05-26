const { chromium } = require('playwright');

(async () => {
  // Launch with headless=false to avoid rAF throttling
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  
  page.on('pageerror', err => console.log(`PAGE_ERROR: ${err.message}`));
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');
  
  await page.waitForTimeout(6000);
  
  // Dispatch selectPerk
  await page.evaluate(() => {
    document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'quickHands' }));
  });
  console.log('Perk selected');
  
  // Check every second
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(1000);
    const s = await page.evaluate(() => window.game?.countdownTimer);
    console.log(`t=${i}s: countdownTimer=${s}`);
  }
  
  await browser.close();
})();
