import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Capture ALL console output
    page.on('console', msg => {
        const text = msg.text();
        process.stdout.write(`[browser] ${text}\n`);
    });
    page.on('pageerror', error => {
        console.log(`PAGE ERROR: ${error.message}`);
    });

    console.log('Loading game...');
    const start = Date.now();
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 60000 });

    // Wait for async operations
    for (let i = 0; i < 30; i++) {
        await page.waitForTimeout(1000);
        const logs = await page.evaluate(() => window.getConsoleLogs?.(200) || []);
        const logMsgs = logs.map(l => l.msg || String(l));
        const mapReady = logMsgs.some(l => l.includes('ready resolved'));
        if (mapReady) {
            console.log(`\nMapGen ready after ${i}s!`);
            console.log(`Total logs: ${logMsgs.length}`);
            console.log('\n--- Last 30 logs ---');
            console.log(logMsgs.slice(-30).join('\n'));
            await browser.close();
            process.exit(0);
            return;
        }
        if (logMsgs.length > 0 && i === 0) {
            console.log(`\nAfter 1s - ${logMsgs.length} logs:`);
            console.log(logMsgs.slice(-10).join('\n'));
        }
    }

    // Timeout - show what we got
    const logs = await page.evaluate(() => window.getConsoleLogs?.(200) || []);
    const logMsgs = logs.map(l => l.msg || String(l));
    console.log(`\nTimeout after 30s - ${logMsgs.length} logs:`);
    console.log('\n--- Last 30 logs ---');
    console.log(logMsgs.slice(-30).join('\n'));

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
