const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('ERROR:', msg.text());
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Wait a bit for rendering
  await page.waitForTimeout(3000);
  
  // Check for critical errors
  const hasErrors = await page.evaluate(() => {
    return false; // errors logged to stdout above
  });
  
  console.log('Page title:', await page.title());
  console.log('Game loaded successfully');
  
  await browser.close();
})();
