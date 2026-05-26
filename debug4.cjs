const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => console.log(`PAGE_ERROR: ${err.message}`));
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 500) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Click start button
  await page.waitForSelector('[id="startButton"], [id="startButtonDesktop"], [id="startButtonMobile"]', { timeout: 5000 });
  const startBtn = await page.$('[id="startButton"], [id="startButtonDesktop"], [id="startButtonMobile"]');
  if (startBtn) {
    console.log('Clicking start button...');
    await startBtn.click();
  }
  
  // Wait for game to initialize
  await page.waitForTimeout(15000);
  
  const state = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const loading = document.querySelector('[class*="Loading"]');
    return {
      hasCanvas: !!canvas,
      canvasDims: canvas ? `${canvas.width}x${canvas.height}` : null,
      hasLoading: !!loading,
      gameType: typeof game
    };
  });
  console.log('Final state:', JSON.stringify(state));
  
  await browser.close();
})();
