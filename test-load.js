import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('Loading game...');
    const start = Date.now();
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'networkidle', timeout: 60000 });

    const elapsed = Date.now() - start;
    console.log(`Page loaded in ${elapsed}ms`);

    // Wait a bit for async operations
    await page.waitForTimeout(5000);

    // Get logs from the page
    const logs = await page.evaluate(() => {
        return window.getConsoleLogs?.(100) || [];
    });

    console.log(`Total logs: ${logs.length}`);

    // Check for key milestones
    const logMsgs = logs.map(l => l.msg || String(l));
    const mapReady = logMsgs.some(l => l.includes('ready resolved'));
    const playing = logMsgs.some(l => l.includes('playing') || l.includes('Игра запущена'));
    const error = logMsgs.some(l => l.includes('ERROR'));

    console.log(`MapGen ready: ${mapReady}`);
    console.log(`Playing state: ${playing}`);
    console.log(`Errors: ${error}`);

    if (logMsgs.length > 0) {
        console.log('\n--- Last 30 logs ---');
        console.log(logMsgs.slice(-30).join('\n'));
    }

    await browser.close();

    process.exit(mapReady || playing ? 0 : 1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
