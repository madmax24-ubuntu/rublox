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
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 30000 });

    // Click the start button
    console.log('Looking for start button...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) {
        console.log('Clicking start button...');
        await startBtn.click();
    }

    // Wait for async operations
    for (let i = 0; i < 45; i++) {
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
            console.log(`After 1s - ${logMsgs.length} logs:`);
            console.log(logMsgs.slice(-5).join('\n'));
        }
        if (globalError) {
            console.log(`FATAL ERROR: ${globalError}`);
            await browser.close();
            process.exit(1);
        }
    }

    const logs = await page.evaluate(() => window.getConsoleLogs?.(500) || []);
    const logMsgs = logs.map(l => l.msg || String(l));
    console.log(`\nTimeout after 45s - ${logMsgs.length} logs:`);
    console.log('\n--- All logs ---');
    console.log(logMsgs.join('\n'));

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
