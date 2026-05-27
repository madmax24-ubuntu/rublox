import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let globalError = null;
    page.on('pageerror', error => {
        globalError = error.message;
        console.log(`PAGE ERROR: ${error.message}`);
    });

    console.log('Loading game...');
    const start = Date.now();
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 60000 });

    // Check for errors
    if (globalError) {
        console.log(`FATAL: ${globalError}`);
        await browser.close();
        process.exit(1);
    }

    // Wait for async operations
    for (let i = 0; i < 40; i++) {
        await page.waitForTimeout(1000);
        const logs = await page.evaluate(() => window.getConsoleLogs?.(500) || []);
        const logMsgs = logs.map(l => l.msg || String(l));
        const mapReady = logMsgs.some(l => l.includes('ready resolved'));
        if (mapReady) {
            console.log(`\nMapGen ready after ${i}s! Logs: ${logMsgs.length}`);
            console.log('\n--- Last 40 logs ---');
            console.log(logMsgs.slice(-40).join('\n'));
            await browser.close();
            process.exit(0);
        }
        if (i === 0) {
            console.log(`\nAfter 1s - ${logMsgs.length} logs:`);
            console.log(logMsgs.join('\n'));
        }
        if (i === 10 && logMsgs.length <= 3) {
            // Check what's on the page
            const title = await page.title();
            const bodyContent = await page.evaluate(() => document.querySelector('.loading-status')?.textContent || '');
            console.log(`\nAfter 10s - title: ${title}`);
            console.log(`Loading status: ${bodyContent}`);
        }
    }

    // Timeout
    const logs = await page.evaluate(() => window.getConsoleLogs?.(500) || []);
    const logMsgs = logs.map(l => l.msg || String(l));
    console.log(`\nTimeout after 40s - ${logMsgs.length} logs:`);
    console.log('\n--- All logs ---');
    console.log(logMsgs.join('\n'));

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
