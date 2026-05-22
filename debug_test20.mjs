import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, slowMo: 200 });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Set up listeners early
page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text().substring(0, 300)}`);
});
page.on('pageerror', err => {
    console.log(`[PAGEERROR] ${err.message.substring(0, 500)}`);
});

await page.goto('http://localhost:3001/');

// Wait 3 seconds then check
await page.waitForTimeout(3000);

// Check what's happening
const result = await page.evaluate(() => {
    const checks = {};

    // Check if any script has loaded
    checks.scripts = Array.from(document.querySelectorAll('script')).map(s => ({
        type: s.type,
        src: s.src?.substring(s.src?.indexOf('/rublox') || 0),
        async: s.async,
        defer: s.defer
    }));

    // Check body
    checks.bodyStyle = document.body?.style?.cssText?.substring(0, 200);
    checks.bodyClass = document.body?.className;
    checks.gameStarted = document.body?.classList?.contains('game-started');

    // Check loading overlay
    const lo = document.getElementById('loadingOverlay');
    checks.loadingOverlay = lo ? {
        display: lo.style.display,
        visibility: lo.style.visibility,
        opacity: lo.style.opacity
    } : 'not found';

    // Check start screen
    const ss = document.getElementById('startScreen');
    checks.startScreen = ss ? {
        display: ss.style.display,
        visibility: ss.style.visibility
    } : 'not found';

    // Check canvas
    checks.canvas = !!document.querySelector('canvas');

    // Check for any error elements
    checks.errors = document.querySelectorAll('.error').length;

    return checks;
});

console.log('\n=== Page State ===');
console.log(JSON.stringify(result, null, 2));

await browser.close();
