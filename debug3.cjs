const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Capture unhandled promise rejections
  page.on('pageerror', err => console.log(`PAGE_ERROR: ${err.message}`));
  
  // Capture all console
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 300) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  // Get the game state from JS
  const state = await page.evaluate(() => {
    return {
      game: typeof game !== 'undefined',
      THREE: typeof THREE !== 'undefined',
      renderer: typeof THREE !== 'undefined' ? (THREE?.renderer ? 'yes' : 'no') : 'no',
      mainModule: typeof mainModule !== 'undefined'
    };
  });
  console.log('JS state:', JSON.stringify(state));
  
  await browser.close();
})();
