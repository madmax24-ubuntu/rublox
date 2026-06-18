import playwright from 'playwright';

const browser = await playwright.chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

let errors = [];
page.on('console', msg => {
    if (msg.type() === 'error') {
        errors.push(msg.text());
        console.log(`[Error] ${msg.text().substring(0, 200)}`);
    }
});
page.on('pageerror', err => {
    errors.push(err.message);
    console.log(`[PageError] ${err.message}`);
});

await page.goto('http://localhost:3001/', { waitUntil: 'domcontentloaded', timeout: 15000 });
console.log('Page loaded');

await page.waitForTimeout(2000);

// Click start
await page.click('.start-btn');
console.log('Clicked start');

// Wait and check
await page.waitForTimeout(10000);

const state = await page.evaluate(() => {
    const g = window.game;
    return {
        hasGame: !!g,
        isStarted: g?.isStarted,
        initialized: g?.initialized,
        startingGame: g?.startingGame,
        error: g?.error?.message || g?.error,
        scene: !!g?.scene,
        renderer: !!g?.renderer,
        logs: window._consoleLogs?.slice(-20)
    };
});

console.log('\nFinal state:', JSON.stringify(state, null, 2));
console.log('\nTotal errors:', errors.length);
errors.slice(0, 10).forEach(e => console.log(' -', e.substring(0, 200)));

await browser.close();
