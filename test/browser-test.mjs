import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';

const startTime = Date.now();
const screenshots = [];

function log(msg) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[${elapsed}s] ${msg}`);
}

mkdirSync('test', { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-gpu', '--no-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  // Capture console logs
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('generation') || text.includes('loading') || text.includes('ms') || text.includes('ready') || text.includes('map')) {
      log(`CONSOLE: ${text}`);
    }
  });

  // Capture JS errors
  page.on('pageerror', err => {
    log(`ERROR: ${err.message}`);
  });

  log('Opening game at http://localhost:3001');
  await page.goto('http://localhost:3001', { waitUntil: 'domcontentloaded', timeout: 30000 });
  screenshots.push({ step: 'page_loaded', time: Date.now() - startTime });

  // Wait for start screen to appear
  await page.waitForSelector('#startScreen', { timeout: 10000 });
  log('Start screen visible');
  screenshots.push({ step: 'start_screen', time: Date.now() - startTime });

  // Take screenshot of start screen
  await page.screenshot({ path: 'test/screenshot_start.png', fullPage: true });
  log('Screenshot: start screen');

  // Click "Начать игру" button
  log('Clicking "Начать игру" button');
  const startBtn = await page.$('#startButtonDesktop');
  if (startBtn) {
    await startBtn.click();
    log('Button clicked');
  } else {
    log('ERROR: Could not find start button');
    await browser.close();
    const summary = [
      '=== MAP GENERATION PERFORMANCE TEST ===',
      '',
      ...screenshots.map(s => `${s.step}: ${s.time}ms`),
      `Total: ${Date.now() - startTime}ms`,
      'ERROR: Start button not found'
    ].join('\n');
    writeFileSync('test/performance-summary.txt', summary);
    process.exit(0);
  }

  screenshots.push({ step: 'button_clicked', time: Date.now() - startTime });

  // Wait for loading overlay to appear
  try {
    await page.waitForSelector('#loadingOverlay', { timeout: 15000 });
    log('Loading overlay appeared');
    screenshots.push({ step: 'loading_overlay', time: Date.now() - startTime });
  } catch {
    log('WARNING: Loading overlay not found');
  }

  // Wait for start screen to disappear
  try {
    await page.waitForSelector('#startScreen', { state: 'detached', timeout: 60000 });
    log('Start screen disappeared - game is loading');
    screenshots.push({ step: 'game_started', time: Date.now() - startTime });
  } catch {
    log('WARNING: Start screen still visible after 60s');
  }

  // Monitor for canvas appearing
  try {
    await page.waitForSelector('canvas', { timeout: 60000 });
    log('Game canvas appeared');
    screenshots.push({ step: 'canvas_visible', time: Date.now() - startTime });
  } catch {
    log('WARNING: No canvas found after 60s');
  }

  // Take periodic screenshots
  const screenshotTimes = [3000, 8000, 15000, 30000, 45000];
  for (const delay of screenshotTimes) {
    const elapsed = Date.now() - startTime;
    if (elapsed < delay) {
      await page.waitForTimeout(delay - elapsed);
    }
    const timeLabel = Math.floor(elapsed / 1000);
    try {
      await page.screenshot({ path: `test/screenshot_${timeLabel}s.png` });
      log(`Screenshot: ${timeLabel}s`);
      screenshots.push({ step: `screenshot_${timeLabel}s`, time: elapsed });
    } catch {
      log(`Screenshot ${timeLabel}s failed`);
    }
  }

  // Wait up to 90s total
  const remaining = 90000 - (Date.now() - startTime);
  if (remaining > 0) {
    await page.waitForTimeout(remaining);
  }

  const totalTime = Date.now() - startTime;
  log(`TOTAL TIME: ${totalTime}ms (${(totalTime / 1000).toFixed(2)}s)`);

  // Final screenshot
  await page.screenshot({ path: 'test/screenshot_final.png', fullPage: true });
  log('Final screenshot taken');

  // Check for error elements
  const errorCount = await page.evaluate(() => {
    const errors = document.querySelectorAll('[id*="error"], [class*="error"]');
    return errors.length;
  });
  log(`Error elements found: ${errorCount}`);

  // Check MapGenerator state
  const mapState = await page.evaluate(() => {
    if (window.mapGenerator) return 'MapGenerator exists';
    if (window.game) return 'Game exists';
    return 'No game object found';
  });
  log(`Game state: ${mapState}`);

  await browser.close();
  log('Browser closed');

  // Write summary
  const summary = [
    '=== MAP GENERATION PERFORMANCE TEST ===',
    '',
    ...screenshots.map(s => `${s.step}: ${s.time}ms`),
    '',
    `Total: ${totalTime}ms`,
    `Errors found: ${errorCount}`,
    `Game state: ${mapState}`,
    '',
    'Screenshots: test/screenshot_*.png'
  ].join('\n');

  writeFileSync('test/performance-summary.txt', summary);
  log('Summary written to test/performance-summary.txt');
  process.exit(0);
})().catch(err => {
  log(`FATAL ERROR: ${err.message}`);
  console.error(err);
  process.exit(1);
});
