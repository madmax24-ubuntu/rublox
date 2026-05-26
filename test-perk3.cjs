const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
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
  
  // Deep check the perk panel
  const info = await page.evaluate(() => {
    const panel = document.getElementById('perkPanel');
    const backdrop = document.getElementById('perkBackdrop');
    if (!panel) return { error: 'no panel' };
    
    const buttons = panel.querySelectorAll('.perk-btn');
    const btnDetails = [];
    buttons.forEach((btn, i) => {
      btnDetails.push({
        idx: i,
        html: btn.outerHTML.substring(0, 100),
        dataPerk: btn.getAttribute('data-perk'),
        id: btn.id,
        classList: btn.className,
      });
    });
    
    return {
      panelDisplay: panel.style.display,
      panelInner: panel.innerHTML.substring(0, 200),
      buttonCount: buttons.length,
      buttons: btnDetails,
      hudObj: window.game?.hud ? {
        isMobile: window.game.hud?.isMobile,
        perkButtonCount: window.game.hud?.perkButtons?.length,
      } : null,
    };
  });
  console.log('Perk panel deep info:');
  console.log(JSON.stringify(info, null, 2));
  
  await browser.close();
})();
