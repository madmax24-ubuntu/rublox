import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Fresh context with no stored testMode
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [{ origin: 'http://localhost:3001', localStorage: [] }] },
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[MapGenerator]') || text.includes('[MAIN]') || text.includes('ERROR') || text.includes('WARN') || text.includes('DEBUG')) {
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

  // Wait for HUD to appear (indicates game has started)
  try {
    await page.waitForSelector('#hud', { timeout: 15000 });
    console.log('✅ HUD visible');
  } catch {
    console.log('⚠️ HUD did not appear');
  }

  // If perk panel is visible, click a perk
  const panelVisible = await page.evaluate(() => {
    const panel = document.getElementById('perkPanel');
    return panel && panel.offsetParent !== null;
  }).catch(() => false);

  if (panelVisible) {
    await page.evaluate(() => {
      const perkPanel = document.getElementById('perkPanel');
      if (perkPanel) {
        const btn = perkPanel.querySelector('button[data-perk]');
        if (btn) btn.click();
      }
    });
    console.log('🖱️ Клик по перку');
  }

  console.log('⏳ Ожидание генерации карты...');
  await page.waitForFunction(() => {
    if (window.game && window.game.scene) {
      const count = window.game.scene.children?.length || 0;
      return count > 20;
    }
    return false;
  }, { timeout: 60000 });

  console.log('✅ Карта сгенерирована');

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

  const cameraPositions = [
    { name: 'overview_top', cam: { x: 0, y: 350, z: 0 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 80 },
    { name: 'overview_nw', cam: { x: -150, y: 280, z: -150 }, lookAt: { x: -158, y: 0, z: -158 }, fov: 80 },
    { name: 'overview_ne', cam: { x: 150, y: 280, z: -150 }, lookAt: { x: 158, y: 0, z: -158 }, fov: 80 },
    { name: 'overview_sw', cam: { x: -150, y: 280, z: 150 }, lookAt: { x: -158, y: 0, z: 158 }, fov: 80 },
    { name: 'overview_se', cam: { x: 150, y: 280, z: 150 }, lookAt: { x: 158, y: 0, z: 158 }, fov: 80 },
    { name: 'center_top', cam: { x: 0, y: 200, z: 0.01 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 90 },
    { name: 'center_angle1', cam: { x: 80, y: 100, z: 80 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 70 },
    { name: 'center_angle2', cam: { x: -80, y: 100, z: 80 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 70 },
    { name: 'center_angle3', cam: { x: 80, y: 100, z: -80 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 70 },
    { name: 'center_angle4', cam: { x: -80, y: 100, z: -80 }, lookAt: { x: 0, y: 0, z: 0 }, fov: 70 },
    { name: 'edge_north', cam: { x: 0, y: 30, z: -100 }, lookAt: { x: 0, y: 0, z: -60 }, fov: 60 },
    { name: 'edge_south', cam: { x: 0, y: 30, z: 100 }, lookAt: { x: 0, y: 0, z: 60 }, fov: 60 },
    { name: 'edge_west', cam: { x: -100, y: 30, z: 0 }, lookAt: { x: -60, y: 0, z: 0 }, fov: 60 },
    { name: 'edge_east', cam: { x: 100, y: 30, z: 0 }, lookAt: { x: 60, y: 0, z: 0 }, fov: 60 },
    { name: 'road_n', cam: { x: 0, y: 20, z: -120 }, lookAt: { x: 0, y: 0, z: -100 }, fov: 50 },
    { name: 'road_s', cam: { x: 0, y: 20, z: 120 }, lookAt: { x: 0, y: 0, z: 100 }, fov: 50 },
    { name: 'road_w', cam: { x: -100, y: 20, z: 0 }, lookAt: { x: -80, y: 0, z: 0 }, fov: 50 },
    { name: 'road_e', cam: { x: 100, y: 20, z: 0 }, lookAt: { x: 80, y: 0, z: 0 }, fov: 50 },
    { name: 'biome_nw_low', cam: { x: -158, y: 10, z: -158 }, lookAt: { x: -158, y: 0, z: -158 }, fov: 70 },
    { name: 'biome_ne_low', cam: { x: 158, y: 10, z: -158 }, lookAt: { x: 158, y: 0, z: -158 }, fov: 70 },
    { name: 'biome_sw_low', cam: { x: -158, y: 10, z: 158 }, lookAt: { x: -158, y: 0, z: 158 }, fov: 70 },
    { name: 'biome_se_low', cam: { x: 158, y: 10, z: 158 }, lookAt: { x: 158, y: 0, z: 158 }, fov: 70 },
    { name: 'corner_nw', cam: { x: -200, y: 40, z: -200 }, lookAt: { x: -158, y: 0, z: -158 }, fov: 60 },
    { name: 'corner_ne', cam: { x: 200, y: 40, z: -200 }, lookAt: { x: 158, y: 0, z: -158 }, fov: 60 },
    { name: 'corner_sw', cam: { x: -200, y: 40, z: 200 }, lookAt: { x: -158, y: 0, z: 158 }, fov: 60 },
    { name: 'corner_se', cam: { x: 200, y: 40, z: 200 }, lookAt: { x: 158, y: 0, z: 158 }, fov: 60 },
    { name: 'boundary_n', cam: { x: 0, y: 15, z: -180 }, lookAt: { x: 0, y: 0, z: -256 }, fov: 55 },
    { name: 'boundary_s', cam: { x: 0, y: 15, z: 180 }, lookAt: { x: 0, y: 0, z: 256 }, fov: 55 },
    { name: 'boundary_w', cam: { x: -180, y: 15, z: 0 }, lookAt: { x: -256, y: 0, z: 0 }, fov: 55 },
    { name: 'boundary_e', cam: { x: 180, y: 15, z: 0 }, lookAt: { x: 256, y: 0, z: 0 }, fov: 55 },
    { name: 'diag_sw_to_ne', cam: { x: -250, y: 200, z: -250 }, lookAt: { x: 200, y: 0, z: 200 }, fov: 80 },
    { name: 'diag_nw_to_se', cam: { x: 250, y: 200, z: 250 }, lookAt: { x: -200, y: 0, z: -200 }, fov: 80 },
  ];

  for (const pos of cameraPositions) {
    await page.evaluate((p) => {
      if (window.game) {
        window.game.camera.position.set(p.cam.x, p.cam.y, p.cam.z);
        window.game.camera.lookAt(p.lookAt.x, p.lookAt.y, p.lookAt.z);
        window.game.camera.fov = p.fov;
        window.game.camera.updateProjectionMatrix();
      }
    }, pos);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test/survey_${pos.name}.png`, type: 'png' });
    console.log(`📸 ${pos.name}: cam(${pos.cam.x},${pos.cam.y},${pos.cam.z}) look(${pos.lookAt.x},${pos.lookAt.y},${pos.lookAt.z}) fov=${pos.fov}`);
  }

  await browser.close();
  console.log('=== SURVEY ГОТОВО ===');
  process.exit(0);
})().catch(err => {
  console.error('❌ ОШИБКА:', err.message);
  process.exit(1);
});
