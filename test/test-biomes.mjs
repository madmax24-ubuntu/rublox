import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[MapGenerator]') || text.includes('[MAIN]') || text.includes('ERROR') || text.includes('scene') || text.includes('WARN') || text.includes('DEBUG')) {
      console.log(`BROWSER: ${text}`);
    }
  });
  page.on('pageerror', err => console.log(`ERROR: ${err.message}`));

  console.log('=== ОТКРЫВАЮ ИГРУ ===');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('✅ Страница загружена');

  await page.waitForSelector('#startButtonDesktop', { timeout: 10000 });
  await page.click('#startButtonDesktop');
  console.log('🖱️ Клик по старту');

  await page.waitForFunction(() => {
    const panel = document.getElementById('perkPanel');
    return panel && panel.offsetParent !== null;
  }, { timeout: 15000 });
  await page.evaluate(() => {
    const perkPanel = document.getElementById('perkPanel');
    if (perkPanel) {
      const btn = perkPanel.querySelector('button[data-perk]');
      if (btn) btn.click();
    }
  });
  console.log('🖱️ Клик по перку');

  await page.waitForTimeout(3000);

  // Позиции в открытых пространствах биомов
  const positions = [
    { name: 'NW_лес', x: -100, z: -100 },
    { name: 'NE_камень', x: 100, z: -100 },
    { name: 'SW_военка', x: -100, z: 100 },
    { name: 'SE_снег', x: 100, z: 100 },
    { name: 'top_NW', x: -100, y: 250, z: -100, top: true },
    { name: 'top_NE', x: 100, y: 250, z: -100, top: true },
    { name: 'top_SW', x: -100, y: 250, z: 100, top: true },
    { name: 'top_SE', x: 100, y: 250, z: 100, top: true },
    { name: 'top_center', x: 0, y: 300, z: 150, top: true },
  ];

  for (const pos of positions) {
    await page.evaluate((p) => {
      if (window.game && window.game.player) {
        window.game.player.position.set(p.x, 3, p.z);
      }
      if (window.game && window.game.camera && p.top) {
        window.game.camera.position.set(p.x, p.y, p.z);
        window.game.camera.lookAt(p.x, 0, p.z);
      }
    }, pos);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `test/scan_${pos.name}.png` });
    console.log(`📸 ${pos.name}`);
  }

  // Объекты в сцене
  const objCount = await page.evaluate(() => {
    if (window.game && window.game.scene) {
      let count = 0;
      function countChildren(obj) {
        count++;
        obj.children.forEach(c => countChildren(c));
      }
      countChildren(window.game.scene);
      return count;
    }
    return 0;
  });
  console.log(`📊 Всего объектов в сцене: ${objCount}`);

  await browser.close();
  console.log('=== ГОТОВО ===');
  process.exit(0);
})().catch(err => {
  console.error('❌ ОШИБКА:', err.message);
  process.exit(1);
});
