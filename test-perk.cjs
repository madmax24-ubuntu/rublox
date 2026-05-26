const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => console.log(`PAGE_ERROR: ${err.message}`));
  page.on('console', msg => {
    const text = msg.text();
    if (text && text.length > 0 && text.length < 500) {
      if (msg.type() === 'error' || text.includes('perk') || text.includes('PERK') || text.includes('menu')) {
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
  
  // Wait for perk menu to show
  await page.waitForTimeout(5000);
  
  // Check perk panel
  const perkInfo = await page.evaluate(() => {
    const panel = document.getElementById('perkPanel');
    const buttons = document.querySelectorAll('.perk-button, [class*="perkBtn"], [class*="perk-btn"]');
    const perkBackdrops = document.querySelectorAll('[class*="perkBackdrop"], [class*="perk-backdrop"]');
    const gameMessage = document.getElementById('gameMessage');
    return {
      perkPanel: !!panel,
      perkPanelVisible: panel ? panel.style.display !== 'none' && panel.style.display !== 'hidden' : false,
      perkPanelDisplay: panel ? panel.style.display : 'null',
      perkBackdrop: perkBackdrops.length,
      perkButtons: buttons.length,
      gameMessage: gameMessage ? gameMessage.textContent : 'null',
    };
  });
  console.log('Perk panel info:', JSON.stringify(perkInfo, null, 2));
  
  // Try clicking a perk button
  const perkButtons = await page.$$('.perk-button, [class*="perkBtn"], [class*="perk-btn"], .perk-option');
  console.log(`Found ${perkButtons.length} perk buttons`);
  
  if (perkButtons.length > 0) {
    // Select first perk
    await perkButtons[0].click();
    console.log('Clicked first perk button');
    await page.waitForTimeout(2000);
    
    const afterClick = await page.evaluate(() => {
      const g = window.game;
      return {
        gameState: g?.gameState,
        perkMenuOpen: g?.perkMenuOpen,
        perkLocked: g?.perkLocked,
        countdownTimer: g?.countdownTimer,
      };
    });
    console.log('After perk click:', JSON.stringify(afterClick, null, 2));
  } else {
    console.log('No perk buttons found, trying keyboard');
    // Try pressing E to select
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(2000);
    
    const afterE = await page.evaluate(() => {
      const g = window.game;
      return {
        gameState: g?.gameState,
        perkMenuOpen: g?.perkMenuOpen,
        perkLocked: g?.perkLocked,
        countdownTimer: g?.countdownTimer,
      };
    });
    console.log('After E press:', JSON.stringify(afterE, null, 2));
  }
  
  // Now wait 20 seconds to see if countdown works
  await page.waitForTimeout(20000);
  
  const final = await page.evaluate(() => {
    const g = window.game;
    return {
      gameState: g?.gameState,
      perkMenuOpen: g?.perkMenuOpen,
      perkLocked: g?.perkLocked,
      countdownTimer: g?.countdownTimer,
      roundFinished: g?.roundFinished,
      isStarted: g?.isStarted,
    };
  });
  console.log('Final state:', JSON.stringify(final, null, 2));
  
  await browser.close();
})();
