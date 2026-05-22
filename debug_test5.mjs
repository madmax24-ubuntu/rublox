import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Set up listeners BEFORE navigation
page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.text()}`);
});
page.on('pageerror', err => {
    console.log(`[ERROR] ${err.message}`);
});

// Evaluate before navigation to set up unhandledrejection
await page.evaluate(() => {
    window.addEventListener('unhandledrejection', e => {
        console.log(`[UNHANDLED REJECTION] ${e.reason}`);
    });
});

await page.goto('http://localhost:3001/');
await page.waitForTimeout(5000);

const check = await page.evaluate(() => {
    return {
        THREE: typeof THREE,
        MapGenerator: typeof window.MapGenerator,
        loadingOverlay: !!document.getElementById('loadingOverlay'),
        gameRoot: !!document.getElementById('gameRoot'),
        startScreen: !!document.getElementById('startScreen'),
        bodyClass: document.body?.className,
        gameStarted: document.body?.classList?.contains('game-started'),
        canvasCount: document.querySelectorAll('canvas').length,
        childrenCount: document.getElementById('gameRoot')?.children?.length
    };
});

console.log('=== Check results ===');
console.log(JSON.stringify(check, null, 2));

await browser.close();
