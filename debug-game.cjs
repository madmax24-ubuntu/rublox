const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0) console.log(`[${msg.type()}] ${text}`);
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(8000);
  
  // Check for loading screen
  const loadingInfo = await page.evaluate(() => {
    const els = document.querySelectorAll('[class*="load"], [class*="progress"], [class*="loader"]');
    const loadingEls = document.querySelectorAll('[class*="Loading"], [class*="loading"]');
    return {
      loadingVisible: document.querySelector('[class*="Loading"]') !== null,
      elementsWithLoad: els.length,
      loadingElements: loadingEls.length,
      bodyChildren: document.body.children.length,
      scripts: document.querySelectorAll('script').length
    };
  });
  console.log('DOM info:', JSON.stringify(loadingInfo, null, 2));
  
  // Check for JS errors specifically
  const errors = await page.evaluate(() => {
    return { errorEvents: window.__errors ? window.__errors.length : 0 };
  });
  console.log('Error info:', JSON.stringify(errors));
  
  await browser.close();
})();
