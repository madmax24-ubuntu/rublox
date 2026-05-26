const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('ERROR:', msg.text());
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: 'test-screenshot.png', fullPage: false });
  console.log('Screenshot saved');
  
  // Check canvas exists
  const canvasInfo = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas ? { width: canvas.width, height: canvas.height, exists: true } : { exists: false };
  });
  console.log('Canvas:', JSON.stringify(canvasInfo));
  
  await browser.close();
})();
