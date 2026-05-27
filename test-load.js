import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    let globalError = null;
    let crashDetected = false;
    page.on('pageerror', error => {
        globalError = error.message;
        console.log(`PAGE ERROR: ${error.message}`);
    });
    page.on('close', () => {
        crashDetected = true;
        console.log('PAGE CLOSED');
    });

    console.log('Loading game...');
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 30000 });

    console.log('Clicking start button...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) await startBtn.click();

    // Quick poll every 500ms
    const startTime = Date.now();
    while (Date.now() - startTime < 55000) {
        if (crashDetected) {
            console.log('Page crashed!');
            break;
        }
        if (globalError) {
            console.log(`FATAL: ${globalError}`);
            break;
        }

        try {
            const logs = await page.evaluate(() => window.getConsoleLogs?.(500) || []);
            const logMsgs = logs.map(l => l.msg || String(l));
            const mapReady = logMsgs.some(l => l.includes('ready resolved'));
            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            if (mapReady) {
                console.log(`\nSUCCESS: MapGen ready after ${elapsed}s!`);
                console.log(`Total logs: ${logMsgs.length}`);
                console.log('\n--- Last 40 logs ---');
                console.log(logMsgs.slice(-40).join('\n'));
                await browser.close();
                process.exit(0);
            }

            if (elapsed % 5 === 0) {
                console.log(`[${elapsed}s] ${logMsgs.length} logs`);
            }
            await page.waitForTimeout(500);
        } catch (e) {
            if (e.message.includes('closed')) {
                crashDetected = true;
                break;
            }
            await page.waitForTimeout(500);
        }
    }

    if (!crashDetected && !globalError) {
        try {
            const logs = await page.evaluate(() => window.getConsoleLogs?.(500) || []);
            const logMsgs = logs.map(l => l.msg || String(l));
            console.log(`\nTimeout - ${logMsgs.length} logs, last: ${logMsgs.slice(-5).join(' | ')}`);
        } catch {}
    }

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
