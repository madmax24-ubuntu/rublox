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
    console.log('Clicking start button...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) await startBtn.click();

    // Poll for logs more frequently
    for (let i = 0; i < 60; i++) {
        try {
            await page.waitForTimeout(1000);
            const logs = await page.evaluate(() => window.getConsoleLogs?.(500) || []);
            const logMsgs = logs.map(l => l.msg || String(l));

            const mapReady = logMsgs.some(l => l.includes('ready resolved'));
            if (mapReady) {
                console.log(`\nSUCCESS: MapGen ready after ${i}s!`);
                console.log(`Total logs: ${logMsgs.length}`);
                console.log('\n--- Last 40 logs ---');
                console.log(logMsgs.slice(-40).join('\n'));
                await browser.close();
                process.exit(0);
            }
            if (i % 10 === 0) {
                console.log(`[${i}s] ${logMsgs.length} logs, last: ${logMsgs.slice(-3).join(' | ')}`);
            }
            if (globalError) {
                console.log(`FATAL: ${globalError}`);
                await browser.close();
                process.exit(1);
            }
        } catch (e) {
            console.log(`Poll error at ${i}s: ${e.message}`);
            // Try to re-navigate
            try {
                await page.reload();
            } catch {}
        }
    }

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
