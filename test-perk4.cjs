const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log(`PAGE_ERROR: ${err.message}`);
  });
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 300) {
      if (msg.type() === 'error' || text.includes('selectPerk') || text.includes('PERK') || text.includes('apply')) {
        console.log(`[${msg.type()}] ${text}`);
      }
    }
  });
  
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);
  
  // Click start
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) await startBtn.click();
  console.log('Start clicked');
  
  await page.waitForTimeout(6000);
  
  // Check event listeners on the first perk button
  const listenersInfo = await page.evaluate(() => {
    const btn = document.querySelector('.perk-btn');
    if (!btn) return 'no button found';
    // Check if dispatchEvent works
    let eventFired = false;
    const testHandler = (e) => { eventFired = true; console.log('selectPerk caught!'); };
    document.addEventListener('selectPerk', testHandler);
    
    btn.click(); // Native click
    const nativeResult = eventFired;
    
    eventFired = false;
    const dispatchEvent = new CustomEvent('selectPerk', { detail: 'test' });
    document.dispatchEvent(dispatchEvent);
    const dispatchResult = eventFired;
    
    document.removeEventListener('selectPerk', testHandler);
    
    return {
      btnHTML: btn.outerHTML.substring(0, 80),
      nativeClickWorks: nativeResult,
      dispatchEventWorks: dispatchResult,
    };
  });
  console.log('Click test:', JSON.stringify(listenersInfo, null, 2));
  
  // Now try using evaluate to dispatch the event directly
  const dispatchResult = await page.evaluate(() => {
    const g = window.game;
    if (!g) return 'no game obj';
    
    // Manually dispatch selectPerk
    document.dispatchEvent(new CustomEvent('selectPerk', { detail: 'quickHands' }));
    
    return {
      afterPerk: {
        gameState: g?.gameState,
        perkMenuOpen: g?.perkMenuOpen,
        perkLocked: g?.perkLocked,
        countdownTimer: g?.countdownTimer,
      }
    };
  });
  console.log('Direct dispatch result:', JSON.stringify(dispatchResult, null, 2));
  
  await page.waitForTimeout(5000);
  
  const final = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked,
      countdownTimer: g?.countdownTimer,
    };
  });
  console.log('Final state:', JSON.stringify(final, null, 2));
  
  console.log('\nErrors:', errors.length);
  errors.forEach(e => console.log(' ', e));
  
  await browser.close();
})();
