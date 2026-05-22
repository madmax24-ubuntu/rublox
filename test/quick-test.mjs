import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[MapGenerator]') || text.includes('[MAIN]') || text.includes('ERROR') || text.includes('scene')) {
      console.log(`BROWSER: ${text}`);
    }
  });
  page.on('pageerror', err => console.log(`ERROR: ${err.message}`));

  console.log('=== ОТКРЫВАЮ ИГРУ ===');
  await page.goto('http://localhost:3001', { waitUntil: 'networkidle', timeout: 30000 });
  console.log('✅ Страница загружена');

  // Скриншот
  await page.screenshot({ path: 'test/screenshot1.png' });
  console.log('📸 Скриншот 1');

  // Кликаю старт
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) {
    await startBtn.click();
    console.log('🖱️ Клик по старту');
  }

  // Ждем
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test/screenshot2.png' });
  console.log('📸 Скриншот 2 (5 сек)');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test/screenshot3.png' });
  console.log('📸 Скриншот 3 (10 сек)');

  // Проверка объектов в сцене
  const objCount = await page.evaluate(() => {
    if (window.game && window.game.scene) {
      return window.game.scene.children.length;
    }
    return 0;
  });
  console.log(`📊 Объектов в сцене: ${objCount}`);

  // Скриншот 4 (15 сек)
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test/screenshot4.png' });
  console.log('📸 Скриншот 4 (15 сек)');

  await browser.close();
  console.log('=== ГОТОВО ===');
  process.exit(0);
})().catch(err => {
  console.error('❌ ОШИБКА:', err.message);
  process.exit(1);
});
