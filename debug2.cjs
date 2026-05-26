const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Track all console messages
  let allConsole = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 200) {
      allConsole.push({ type: msg.type(), text });
      if (msg.type() === 'error') console.log(`ERROR: ${text}`);
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  
  // Check at 2s, 5s, 10s
  for (const delay of [2000, 5000, 10000, 20000]) {
    await page.waitForTimeout(1500);
    const info = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      const loading = document.querySelector('[class*="Loading"]');
      return {
        hasCanvas: !!canvas,
        hasLoading: !!loading,
        bodyChildren: document.body.children.length
      };
    });
    console.log(`After ${delay}ms:`, JSON.stringify(info));
  }
  
  await browser.close();
})();
