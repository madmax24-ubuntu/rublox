import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('pageerror', error => console.log(`PAGE ERROR: ${error.message}`));
    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`CONSOLE ERROR: ${msg.text()}`);
    });

    console.log('Loading game...');
    await page.goto('http://127.0.0.1:3001/', { waitUntil: 'load', timeout: 30000 });

    console.log('Clicking start...');
    const startBtn = await page.$('.start-btn, #startBtn, button');
    if (startBtn) await startBtn.click();

    // Quick check at 2s
    await page.waitForTimeout(2000);
    const logs = await page.evaluate(() => window.getConsoleLogs?.(100) || []);
    const logMsgs = logs.map(l => l.msg || String(l));
    console.log(`\n[2s] ${logMsgs.length} logs:`);
    console.log('Last 10:', logMsgs.slice(-10).join('\n'));

    const mapReady = logMsgs.some(l => l.includes('ready resolved'));
    if (mapReady) {
        console.log('SUCCESS: MapGen ready!');
        await browser.close();
        process.exit(0);
    }

    // Continue polling
    for (let i = 0; i < 55; i++) {
        await page.waitForTimeout(1000);
        try {
            const logs2 = await page.evaluate(() => window.getConsoleLogs?.(100) || []);
            const logMsgs2 = logs2.map(l => l.msg || String(l));
            const mapReady2 = logMsgs2.some(l => l.includes('ready resolved'));
            if (mapReady2) {
                console.log(`\nSUCCESS: MapGen ready after ${i+2}s!`);
                console.log('Last 40 logs:');
                console.log(logMsgs2.slice(-40).join('\n'));
                await browser.close();
                process.exit(0);
            }
            console.log(`[${i+2}s] ${logMsgs2.length} logs`);
        } catch (e) {
            console.log(`Poll error at ${i+2}s: ${e.message}`);
            break;
        }
    }

    await browser.close();
    process.exit(1);
})().catch(e => {
    console.error(e);
    process.exit(1);
});
